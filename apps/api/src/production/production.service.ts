import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  FormData,
  MeterUsage,
  SulfuricDaySummary,
  SulfuricFlow,
  SulfuricInventory,
  SulfuricProduction,
  SulfuricSummaryResult,
} from '@hgxt/shared';
import { PrismaService } from '../database/prisma.service';
import { primaryDateField } from '../forms/forms.service';

/**
 * 硫酸车间生产指标 —— 口径参照 b2 production.service（差值法）：
 *   库存(D)   = Σ 储罐(液位% × 罐容 × 密度)           [快照；任一罐缺数据 → null]
 *   产量(D)   = 库存(D) − 库存(D−1) + 流出(D)         [流出按四酸独立读销售表]
 *   折98      = 98酸 + 93酸 + 试剂酸 + 发烟酸×105/98
 *   电耗(D)   = Σ 电表(读数(D) − 读数(D−1)) × 倍率     [负值归 0（回零/换表保护）]
 *
 * 数据完整性原则：不把缺罐当 0%——前后日任一用于差值的罐缺数据，该指标为 null。
 * 断天标注：D−1 与 D 之间有断天时 gapDays > 0，此时产量是多天累计差值。
 */
const CODE_SULFURIC = 'sulfuric_daily';
const CODE_SALES = 'sales_daily';

/** 销售表字段 → 四酸 */
const SALES_FIELD_MAP: Record<keyof SulfuricFlow, string> = {
  acid98: 'field_acid98_sales',
  acid93: 'field_acid93_sales',
  reagent: 'field_reagent_acid_sales',
  fuming: 'field_fuming_acid_sales',
};

@Injectable()
export class ProductionService {
  constructor(private readonly prisma: PrismaService) {}

  async sulfuricSummary(days = 30): Promise<SulfuricSummaryResult> {
    const sulfuricForm = await this.prisma.form.findUnique({ where: { code: CODE_SULFURIC } });
    if (!sulfuricForm) throw new NotFoundException('未找到硫酸车间表单（code=sulfuric_daily）');
    const dateField = primaryDateField(sulfuricForm.schema as never);
    if (!dateField) throw new NotFoundException('硫酸表单缺少日期字段');

    const [tanks, meters, submissions, salesForm] = await Promise.all([
      // Tank/Meter 按 formCode 归属过滤——只查硫酸的罐和表，其他车间的设备互不干扰
      this.prisma.tank.findMany({ where: { formCode: CODE_SULFURIC } }),
      this.prisma.meter.findMany({ where: { formCode: CODE_SULFURIC } }),
      this.prisma.formSubmission.findMany({
        where: { formId: sulfuricForm.id },
        orderBy: { createdAt: 'asc' },
        select: { data: true, createdAt: true },
      }),
      this.prisma.form.findUnique({ where: { code: CODE_SALES } }),
    ]);

    // 销售表按归属日的流出数据（同日多条取最新）
    const salesByDate = new Map<string, FormData>();
    if (salesForm) {
      const salesDateField = primaryDateField(salesForm.schema as never);
      if (salesDateField) {
        const salesSubs = await this.prisma.formSubmission.findMany({
          where: { formId: salesForm.id },
          orderBy: { createdAt: 'asc' },
          select: { data: true, createdAt: true },
        });
        for (const s of salesSubs) {
          const date = (s.data as FormData)[salesDateField.id];
          if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
            salesByDate.set(date, s.data as FormData);
          }
        }
      }
    }

    // 硫酸表按归属日聚合（同日多条取最新）
    const byDate = new Map<string, FormData>();
    for (const s of submissions) {
      const date = (s.data as FormData)[dateField.id];
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        byDate.set(date, s.data as FormData);
      }
    }
    const sortedDates = [...byDate.keys()].sort();

    const window = sortedDates.slice(Math.max(0, sortedDates.length - days));
    const prevDateOf = (date: string): string | null => {
      const idx = sortedDates.indexOf(date);
      return idx > 0 ? sortedDates[idx - 1] : null;
    };
    /** 真实断天数：连续=0，断了 1 天=1（=日期差−1） */
    const gapDaysBetween = (a: string, b: string): number => {
      const ms = new Date(b).getTime() - new Date(a).getTime();
      return Math.round(ms / 86400000) - 1;
    };

    const result: SulfuricDaySummary[] = window.map((date) => {
      const current = byDate.get(date)!;
      const prevDate = prevDateOf(date);
      const prev = prevDate ? byDate.get(prevDate) : undefined;
      const isConsecutive = prevDate ? gapDaysBetween(prevDate, date) === 0 : false;

      const inventory = this.inventoryOf(current, tanks);
      const production = prev
        ? this.productionOf(date, current, prev, tanks, salesByDate, prevDate, gapDaysBetween)
        : null;
      // 断天日电耗返 null：多天读数差无法拆成日值，不给出误导性的"日电耗"
      const electricity = prev && isConsecutive ? this.electricityOf(current, prev, meters) : null;

      return { date, inventory, production, electricity };
    });

    return { days: result };
  }

  /** 参与硫酸产量计算的物料（双氧水罐是监控性质，不阻断产量计算） */
  private static readonly PRODUCTION_MATERIALS = ['98酸', '发烟硫酸', '试剂酸'];

  /** 库存快照：产量相关罐必须全部有数据，缺任一 → null（不把空当 0%）；监控罐不阻断 */
  private inventoryOf(
    data: FormData,
    tanks: Array<{ fieldId: string; material: string; capacity: number; density: number }>,
  ): SulfuricInventory | null {
    const acc: Record<string, number> = {};
    for (const tank of tanks) {
      const level = data[tank.fieldId];
      // 只有参与产量计算的三种酸要求完整性；双氧水等监控罐缺数据不阻断
      if (ProductionService.PRODUCTION_MATERIALS.includes(tank.material)) {
        if (typeof level !== 'number' || Number.isNaN(level)) return null;
      }
      if (typeof level === 'number' && !Number.isNaN(level)) {
        acc[tank.material] = (acc[tank.material] ?? 0) + (level / 100) * tank.capacity * tank.density;
      }
    }
    const acid98 = +(acc['98酸'] ?? 0).toFixed(3);
    const fuming = +(acc['发烟硫酸'] ?? 0).toFixed(3);
    const reagent = +(acc['试剂酸'] ?? 0).toFixed(3);
    return { acid98, fuming, reagent, total: +(acid98 + fuming + reagent).toFixed(3) };
  }

  /**
   * 差值产量：库存(D) − 库存(D−1) + 流出(D)。
   * 前后日任一产量罐缺数据 → null（监控罐不阻断）。
   * 流出按四酸独立读销售表；库存差跨 N 天 → 流出也累计 N 天（断天销售不漏算）。
   */
  private productionOf(
    date: string,
    current: FormData,
    prev: FormData,
    tanks: Array<{ fieldId: string; material: string; capacity: number; density: number }>,
    salesByDate: Map<string, FormData>,
    prevDate: string | null,
    gapDaysBetween: (a: string, b: string) => number,
  ): SulfuricProduction | null {
    // 前后日都要求全部罐有数据
    if (!this.inventoryOf(current, tanks) || !this.inventoryOf(prev, tanks)) return null;

    // 逐罐差值（同物料各罐的密度和罐容可能不同）
    const materialDelta = (material: string): number => {
      let delta = 0;
      for (const t of tanks.filter((t) => t.material === material)) {
        const cur = current[t.fieldId] as number;
        const prv = prev[t.fieldId] as number;
        delta += ((cur - prv) / 100) * t.capacity * t.density;
      }
      return delta;
    };

    // 销售流出：库存差跨了 N 天 → 流出也必须把 (prevDate, date] 全部天的销售累计
    // gapDaysBetween 已改为断天数（连续=0），这里用 dateDiff = gapDays + 1 控制循环次数
    const flow: SulfuricFlow = { acid98: 0, acid93: 0, reagent: 0, fuming: 0 };
    if (prevDate) {
      const gapDays = gapDaysBetween(prevDate, date);
      const dateDiff = gapDays + 1; // 连续日=1（只算当天），断 1 天=2（算 2 天）
      for (let i = 1; i <= dateDiff; i++) {
        const d = new Date(prevDate);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        const salesData = salesByDate.get(key);
        if (!salesData) continue;
        for (const [k, fieldId] of Object.entries(SALES_FIELD_MAP) as Array<[keyof SulfuricFlow, string]>) {
          const v = salesData[fieldId];
          if (typeof v === 'number' && Number.isFinite(v)) flow[k] = +(flow[k] + v).toFixed(3);
        }
      }
    }

    const gapDays = prevDate ? gapDaysBetween(prevDate, date) : 0;
    const d98 = materialDelta('98酸');
    const dFuming = materialDelta('发烟硫酸');
    const dReagent = materialDelta('试剂酸');

    return {
      acid98: +(d98 + flow.acid98).toFixed(3),
      acid93: flow.acid93,
      reagent: +(dReagent + flow.reagent).toFixed(3),
      fuming: +(dFuming + flow.fuming).toFixed(3),
      total98Equivalent: +(
        (d98 + flow.acid98) +
        flow.acid93 +
        (dReagent + flow.reagent) +
        (dFuming + flow.fuming) * (105 / 98)
      ).toFixed(3),
      flow,
      gapDays,
    };
  }

  /** 电耗：读数差 × 倍率，负值归 0（回零/换表保护） */
  private electricityOf(
    current: FormData,
    prev: FormData,
    meters: Array<{ fieldId: string; name: string; multiplier: number }>,
  ): { meters: MeterUsage[]; total: number } | null {
    const usages: MeterUsage[] = [];
    let seen = false;
    for (const meter of meters) {
      const a = prev[meter.fieldId];
      const b = current[meter.fieldId];
      if (typeof a !== 'number' || typeof b !== 'number') continue;
      seen = true;
      const delta = (b - a) * meter.multiplier;
      usages.push({ fieldId: meter.fieldId, name: meter.name, usage: Math.max(0, +delta.toFixed(2)) });
    }
    if (!seen) return null;
    return { meters: usages, total: +usages.reduce((sum, m) => sum + m.usage, 0).toFixed(2) };
  }
}
