import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  FormData,
  MeterUsage,
  SulfuricDaySummary,
  SulfuricControlDay,
  SulfuricControlMetricKey,
  SulfuricControlResult,
  SulfuricFlow,
  SulfuricInventory,
  SulfuricProduction,
  SulfuricTankCalculation,
  SulfuricSummaryResult,
} from '@hgxt/shared';
import { PrismaService } from '../database/prisma.service';
import { primaryDateField } from '../forms/forms.service';

/**
 * 硫酸车间生产指标 —— 口径参照 b2 production.service（差值法）：
 *   库存(D)   = Σ 储罐(液位% × 罐容 × 密度)           [快照；任一罐缺数据 → null]
 *   产量(D−1) = 库存(D) − 库存(D−1) + 外销(D) + 内部领用(D)
 *   折98      = 98酸 + 93酸 + 试剂酸 + 发烟酸×105/98
 *   电耗(D−1) = 硫酸4块表 + 热电3台变压器的读数差×倍率
 *
 * 数据完整性原则：不把缺罐当 0%——前后日任一用于差值的罐缺数据，该指标为 null。
 * 填报日 D 的生产归属日为 D−1；断天时 gapDays > 0，产量为多天累计差值。
 */
const CODE_SULFURIC = 'sulfuric_daily';
const CODE_SULFURIC_CONTROL = 'sulfuric_control';
const SULFURIC_CONTROL_PARTS = [
  'sulfuric_control_assay', 'sulfuric_control_washing', 'sulfuric_control_acid', 'sulfuric_control_notes',
] as const;
const CODE_SALES = 'sales_daily';
const CODE_AMINO = 'aminosulfonic_daily';
const CODE_ANTHRAQUINONE = 'anthraquinone_daily';
const CODE_THERMAL = 'thermal_daily';
const CODE_WAREHOUSE = 'warehouse_daily';
const FUMING_DENSITY = 1.92;
const SULFURIC_ELECTRIC_FIELDS = ['meter_3', 'meter_4', 'meter_5', 'meter_6'];
const THERMAL_TRANSFORMERS = [
  { fieldId: 'field_transformer1', name: '热电1#变压器', multiplier: 2000 },
  { fieldId: 'field_transformer2', name: '热电2#变压器', multiplier: 2000 },
  { fieldId: 'field_transformer3', name: '热电3#变压器', multiplier: 2000 },
];

const dayBefore = (date: string): string => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
};
const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};

const CONTROL_COLUMNS: Record<SulfuricControlMetricKey, string> = {
  s_raw: 'field_B', s_feed: 'field_F', h2o: 'field_G', s_cyc: 'field_P',
  s_belt: 'field_Q', s_slag: 'field_J', dry: 'field_AK', a1: 'field_AL',
  a2: 'field_AM', fum: 'field_AN', tail: 'field_AV', h2o2: 'field_AW',
  reag: 'field_AX', so2: 'field_BB',
};

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

  /** 旧合表按归属日作历史底稿，四张拆分表的同日字段逐一覆盖。 */
  async sulfuricControl(month?: string): Promise<SulfuricControlResult> {
    const [form, legacyForm, legacyByDate, partMaps] = await Promise.all([
      this.prisma.form.findUnique({ where: { code: SULFURIC_CONTROL_PARTS[0] }, select: { id: true } }),
      this.prisma.form.findUnique({ where: { code: CODE_SULFURIC_CONTROL }, select: { id: true } }),
      this.formDataByDate(CODE_SULFURIC_CONTROL),
      Promise.all(SULFURIC_CONTROL_PARTS.map((code) => this.formDataByDate(code))),
    ]);
    const byDate = new Map<string, FormData>(legacyByDate);
    for (const part of partMaps) {
      for (const [date, data] of part) byDate.set(date, { ...byDate.get(date), ...data });
    }
    const dates = [...byDate.keys()].sort();
    const latestDate = dates.at(-1) ?? null;
    const selectedMonth = month ?? latestDate?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
    const keys = Object.keys(CONTROL_COLUMNS) as SulfuricControlMetricKey[];
    const days: SulfuricControlDay[] = dates.filter((date) => date.startsWith(`${selectedMonth}-`)).map((date) => {
      const data = byDate.get(date)!;
      const values = Object.fromEntries(keys.map((key) => [key, toNumber(data[CONTROL_COLUMNS[key]])])) as SulfuricControlDay['values'];
      const notes = typeof data.field_notes === 'string' ? data.field_notes.split(/\r?\n/).map((note) => note.trim()).filter(Boolean) : [];
      return { date, values, notes };
    });
    return { formId: form?.id ?? legacyForm?.id ?? null, month: selectedMonth, latestDate, availableMonths: [...new Set(dates.map((date) => date.slice(0, 7)))], days };
  }

  /** 按填报日保留最后一次提交；原始表单数据不改写。 */
  private async formDataByDate(code: string): Promise<Map<string, FormData>> {
    const form = await this.prisma.form.findUnique({ where: { code } });
    if (!form) return new Map();
    const dateField = primaryDateField(form.schema as never);
    if (!dateField) return new Map();
    const submissions = await this.prisma.formSubmission.findMany({
      where: { formId: form.id },
      orderBy: { createdAt: 'asc' },
      select: { data: true },
    });
    const byDate = new Map<string, FormData>();
    for (const submission of submissions) {
      const data = submission.data as FormData;
      const date = data[dateField.id];
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) byDate.set(date, data);
    }
    return byDate;
  }

  async sulfuricSummary(days = 30): Promise<SulfuricSummaryResult> {
    const sulfuricForm = await this.prisma.form.findUnique({ where: { code: CODE_SULFURIC } });
    if (!sulfuricForm) throw new NotFoundException('未找到硫酸车间表单（code=sulfuric_daily）');
    const dateField = primaryDateField(sulfuricForm.schema as never);
    if (!dateField) throw new NotFoundException('硫酸表单缺少日期字段');

    const [tanks, meters, submissions, salesByDate, aminoByDate, anthraquinoneByDate, thermalByDate, warehouseByDate] = await Promise.all([
      // Tank/Meter 按 formCode 归属过滤——只查硫酸的罐和表，其他车间的设备互不干扰
      this.prisma.tank.findMany({ where: { formCode: CODE_SULFURIC }, orderBy: { fieldId: 'asc' } }),
      this.prisma.meter.findMany({ where: { formCode: CODE_SULFURIC } }),
      this.prisma.formSubmission.findMany({
        where: { formId: sulfuricForm.id },
        orderBy: { createdAt: 'asc' },
        select: { data: true, createdAt: true },
      }),
      this.formDataByDate(CODE_SALES),
      this.formDataByDate(CODE_AMINO),
      this.formDataByDate(CODE_ANTHRAQUINONE),
      this.formDataByDate(CODE_THERMAL),
      this.formDataByDate(CODE_WAREHOUSE),
    ]);
    const sulfuricMeters = SULFURIC_ELECTRIC_FIELDS.flatMap((fieldId) =>
      meters.filter((meter) => meter.fieldId === fieldId),
    );

    // 硫酸表按归属日聚合（同日多条取最新）
    const byDate = new Map<string, FormData>();
    for (const s of submissions) {
      const date = (s.data as FormData)[dateField.id];
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        byDate.set(date, s.data as FormData);
      }
    }
    const sortedDates = [...byDate.keys()].sort();

    const window = days === 0 ? sortedDates : sortedDates.slice(Math.max(0, sortedDates.length - days));
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
      const levels = tanks.map((tank) => ({
        fieldId: tank.fieldId,
        name: tank.name,
        material: tank.material,
        levelPercent: toNumber(current[tank.fieldId]),
      }));
      const production = prev
        ? this.productionOf(date, current, prev, tanks, salesByDate, aminoByDate, anthraquinoneByDate, prevDate, gapDaysBetween)
        : null;
      // 断天日电耗返 null：多天读数差无法拆成日值，不给出误导性的"日电耗"
      const thermalCurrent = thermalByDate.get(date);
      const thermalPrev = prevDate ? thermalByDate.get(prevDate) : undefined;
      const electricity = prev && isConsecutive
        ? this.electricityOf(current, prev, sulfuricMeters, thermalCurrent, thermalPrev, thermalByDate.size > 0)
        : null;
      const peroxide = toNumber(warehouseByDate.get(date)?.field_002);
      const currentWater = toNumber(thermalCurrent?.field_water_meter);
      const previousWater = toNumber(thermalPrev?.field_water_meter);
      const water = isConsecutive && currentWater !== null && previousWater !== null
        ? +Math.max(0, currentWater - previousWater).toFixed(2) : null;

      return { date, productionDate: dayBefore(date), inventory, levels, production, electricity, peroxide, water };
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
      // 旧系统迁入的数据把液位存成字符串（"9.05"），toNumber 统一兼容
      const level = toNumber(data[tank.fieldId]);
      // 只有参与产量计算的三种酸要求完整性；双氧水等监控罐缺数据不阻断
      if (ProductionService.PRODUCTION_MATERIALS.includes(tank.material)) {
        if (level === null) return null;
      }
      if (level !== null) {
        acc[tank.material] = (acc[tank.material] ?? 0) + (level / 100) * tank.capacity * tank.density;
      }
    }
    const acid98 = +(acc['98酸'] ?? 0).toFixed(3);
    const fuming = +(acc['发烟硫酸'] ?? 0).toFixed(3);
    const reagent = +(acc['试剂酸'] ?? 0).toFixed(3);
    return { acid98, fuming, reagent, total: +(acid98 + fuming + reagent).toFixed(3) };
  }

  /**
   * 差值产量：库存(D) − 库存(D−1) + 外销(D) + 发烟酸内部领用(D)。
   * 前后日任一产量罐缺数据 → null（监控罐不阻断）。
   * 流出按四酸独立读销售表；库存差跨 N 天 → 流出也累计 N 天（断天销售不漏算）。
   */
  private productionOf(
    date: string,
    current: FormData,
    prev: FormData,
    tanks: Array<{ fieldId: string; name: string; material: string; capacity: number; density: number }>,
    salesByDate: Map<string, FormData>,
    aminoByDate: Map<string, FormData>,
    anthraquinoneByDate: Map<string, FormData>,
    prevDate: string | null,
    gapDaysBetween: (a: string, b: string) => number,
  ): SulfuricProduction | null {
    // 前后日都要求全部罐有数据
    if (!this.inventoryOf(current, tanks) || !this.inventoryOf(prev, tanks)) return null;

    // 与产量使用同一组逐罐原始计算值，供点击合计时逐项追溯。
    const tankCalculations: SulfuricTankCalculation[] = tanks
      .filter((tank) => ProductionService.PRODUCTION_MATERIALS.includes(tank.material))
      .map((tank) => {
        const previousLevelPercent = toNumber(prev[tank.fieldId])!;
        const currentLevelPercent = toNumber(current[tank.fieldId])!;
        return {
          fieldId: tank.fieldId,
          name: tank.name,
          material: tank.material,
          capacity: tank.capacity,
          density: tank.density,
          previousLevelPercent,
          currentLevelPercent,
          previousTons: (previousLevelPercent / 100) * tank.capacity * tank.density,
          currentTons: (currentLevelPercent / 100) * tank.capacity * tank.density,
          deltaTons: ((currentLevelPercent - previousLevelPercent) / 100) * tank.capacity * tank.density,
        };
      });
    const materialDelta = (material: string): number =>
      tankCalculations.filter((tank) => tank.material === material).reduce((sum, tank) => sum + tank.deltaTons, 0);

    // 销售流出：库存差跨了 N 天 → 流出也必须把 (prevDate, date] 全部天的销售累计
    // gapDaysBetween 已改为断天数（连续=0），这里用 dateDiff = gapDays + 1 控制循环次数
    const flow: SulfuricFlow = { acid98: 0, acid93: 0, reagent: 0, fuming: 0 };
    const sales: Array<{ date: string; values: Record<keyof SulfuricFlow, number | null> }> = [];
    const reportDates: string[] = [];
    if (prevDate) {
      const dateDiff = gapDaysBetween(prevDate, date) + 1;
      for (let i = 1; i <= dateDiff; i++) {
        const d = new Date(`${prevDate}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + i);
        reportDates.push(d.toISOString().slice(0, 10));
      }
    }
    for (const reportDate of reportDates) {
      const salesData = salesByDate.get(reportDate);
      const values: Record<keyof SulfuricFlow, number | null> = { acid98: null, acid93: null, reagent: null, fuming: null };
      for (const [key, fieldId] of Object.entries(SALES_FIELD_MAP) as Array<[keyof SulfuricFlow, string]>) {
        const value = toNumber(salesData?.[fieldId]);
        values[key] = value;
        if (value !== null) flow[key] = +(flow[key] + value).toFixed(3);
      }
      sales.push({ date: reportDate, values });
    }

    const gapDays = prevDate ? gapDaysBetween(prevDate, date) : 0;
    const d98 = materialDelta('98酸');
    const dFuming = materialDelta('发烟硫酸');
    const dReagent = materialDelta('试剂酸');

    // 氨基磺酸沿用次日填报口径；蒽醌 Excel 读数按行日期归属生产日。
    let aminoVolume = 0;
    let aminoSeen = false;
    const aminosulfonic: Array<{ date: string; volumeM3: number | null }> = [];
    for (const reportDate of reportDates) {
      const volume = toNumber(aminoByDate.get(reportDate)?.field_nitric_acid);
      aminosulfonic.push({ date: reportDate, volumeM3: volume });
      if (volume !== null) { aminoVolume += volume; aminoSeen = true; }
    }
    const aminoTons = aminoSeen ? +(aminoVolume * FUMING_DENSITY).toFixed(3) : null;
    const anthraquinoneDate = dayBefore(date);
    const anthraquinonePreviousDate = prevDate ? dayBefore(prevDate) : null;
    const meterCurrent = anthraquinoneByDate.get(anthraquinoneDate)?.field_fuming_sulfuric_flow;
    const meterPrevious = anthraquinonePreviousDate
      ? anthraquinoneByDate.get(anthraquinonePreviousDate)?.field_fuming_sulfuric_flow : undefined;
    const currentMeter = toNumber(meterCurrent);
    const previousMeter = toNumber(meterPrevious);
    const anthraquinoneVolume = currentMeter !== null && previousMeter !== null && currentMeter >= previousMeter
      ? currentMeter - previousMeter : null;
    const anthraquinoneTons = anthraquinoneVolume === null ? null : +(anthraquinoneVolume * FUMING_DENSITY).toFixed(3);
    const internalFuming = { aminosulfonic: aminoTons, anthraquinone: anthraquinoneTons };
    const fumingProduction = dFuming + flow.fuming + (aminoTons ?? 0) + (anthraquinoneTons ?? 0);

    return {
      acid98: +(d98 + flow.acid98).toFixed(3),
      acid93: flow.acid93,
      reagent: +(dReagent + flow.reagent).toFixed(3),
      fuming: +fumingProduction.toFixed(3),
      total98Equivalent: +(
        (d98 + flow.acid98) +
        flow.acid93 +
        (dReagent + flow.reagent) +
        fumingProduction * (105 / 98)
      ).toFixed(3),
      flow,
      internalFuming,
      gapDays,
      calculation: {
        previousReportDate: prevDate ?? date,
        tanks: tankCalculations,
        sales,
        aminosulfonic,
        anthraquinone: { previousReadingM3: previousMeter, currentReadingM3: currentMeter, volumeM3: anthraquinoneVolume },
        fumingDensity: FUMING_DENSITY,
      },
    };
  }

  /** 电耗：硫酸四表 + 热电三台变压器；缺热电报表时不把不完整的和当总电耗 */
  private electricityOf(
    current: FormData,
    prev: FormData,
    meters: Array<{ fieldId: string; name: string; multiplier: number }>,
    thermalCurrent?: FormData,
    thermalPrev?: FormData,
    thermalExpected = false,
  ): { meters: MeterUsage[]; total: number } | null {
    if (thermalExpected && (!thermalCurrent || !thermalPrev)) return null;
    const usages: MeterUsage[] = [];
    let seen = false;
    for (const meter of [...meters, ...(thermalExpected ? THERMAL_TRANSFORMERS : [])]) {
      const sourceCurrent = meter.fieldId.startsWith('field_transformer') ? thermalCurrent : current;
      const sourcePrev = meter.fieldId.startsWith('field_transformer') ? thermalPrev : prev;
      const a = toNumber(sourcePrev?.[meter.fieldId]);
      const b = toNumber(sourceCurrent?.[meter.fieldId]);
      if (a === null || b === null) return null;
      seen = true;
      const delta = (b - a) * meter.multiplier;
      usages.push({ fieldId: meter.fieldId, name: meter.name, usage: Math.max(0, +delta.toFixed(2)) });
    }
    if (!seen) return null;
    return { meters: usages, total: +usages.reduce((sum, m) => sum + m.usage, 0).toFixed(2) };
  }
}
