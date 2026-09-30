import { Injectable } from '@nestjs/common';
import type {
  EnergyResult,
  FinishedProductItem,
  FormData,
  FormField,
  InternalFlowItem,
  MaterialsResult,
  RawMaterialStockItem,
  WorkshopOverviewResult,
  WorkshopSeries,
} from '@hgxt/shared';
import { PrismaService } from '../database/prisma.service';
import { primaryDateField } from '../forms/forms.service';
import { ProductionService } from './production.service';

/**
 * 车间版面 / 能源中心 / 物料与库存 —— 三张看板的现算服务。
 * 口径与倍率全部对照 b2（参照/dashboard-b2-source）：
 *   车间产量：硫酸=差值法折98（复用 ProductionService）；其余车间=表单直接上报字段
 *   电：读数差 × 倍率（硫酸 4 表用 Meter 档案；氨基二期 2000 / 镁一期 200 二期 4000 为 b2 代码常量）
 *   汽/水：热电与各车间表单的流量计/水表读数差（倍率 1）
 *   物料：仓库表与产成品表的「三件套」字段；可用天数=库存÷近7日平均耗用
 */
const CODE = {
  sulfuric: 'sulfuric_daily',
  thermal: 'thermal_daily',
  amino: 'aminosulfonic_daily',
  magnesium: 'magnesium_daily',
  hydrotalcite: 'hydrotalcite_daily',
  anthraquinone: 'anthraquinone_daily',
  warehouse: 'warehouse_daily',
  finished: 'finished_products_daily',
} as const;

const AMINO_PHASE2_ELECTRICITY_MULTIPLIER = 2000;
const MAGNESIUM_PHASE1_ELECTRICITY_MULTIPLIER = 200;
const MAGNESIUM_PHASE2_ELECTRICITY_MULTIPLIER = 4000;

type ByDate = Map<string, FormData>;

@Injectable()
export class OverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly production: ProductionService,
  ) {}

  /** 某表单按归属日聚合的提交（同日多条取最新） */
  private async byDate(code: string): Promise<ByDate> {
    const form = await this.prisma.form.findUnique({ where: { code } });
    if (!form) return new Map();
    const dateField = primaryDateField(form.schema as never);
    if (!dateField) return new Map();
    const submissions = await this.prisma.formSubmission.findMany({
      where: { formId: form.id },
      orderBy: { createdAt: 'asc' },
      select: { data: true },
    });
    const map: ByDate = new Map();
    for (const s of submissions) {
      const date = (s.data as FormData)[dateField.id];
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        map.set(date, s.data as FormData);
      }
    }
    return map;
  }

  /** 全部日期并集取最后 N 天 */
  private windowOf(sources: Array<Map<string, unknown>>, days: number): string[] {
    const all = new Set<string>();
    for (const s of sources) for (const d of s.keys()) all.add(d);
    return [...all].sort().slice(-days);
  }

  private dayBefore(date: string): string {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  /** 仪表读数差 × 倍率的日序列（跨断天为 null，不把多天用量拆成日值；负差归 0） */
  private meterSeries(
    source: ByDate,
    dates: string[],
    fields: Array<{ field: string; multiplier: number }>,
  ): Array<number | null> {
    return dates.map((date) => {
      const current = source.get(date);
      const prev = source.get(this.dayBefore(date));
      if (!current || !prev) return null;
      let total = 0;
      let seen = false;
      for (const { field, multiplier } of fields) {
        const a = prev[field];
        const b = current[field];
        if (typeof a !== 'number' || typeof b !== 'number') continue;
        seen = true;
        total += Math.max(0, (b - a) * multiplier);
      }
      return seen ? +total.toFixed(2) : null;
    });
  }

  /** 直接上报字段的日序列（多字段求和；全部缺失为 null） */
  private reportedSeries(source: ByDate, dates: string[], fields: string[]): Array<number | null> {
    return dates.map((date) => {
      const data = source.get(date);
      if (!data) return null;
      let total = 0;
      let seen = false;
      for (const field of fields) {
        const v = data[field];
        if (typeof v === 'number' && Number.isFinite(v)) {
          seen = true;
          total += v;
        }
      }
      return seen ? +total.toFixed(3) : null;
    });
  }

  private static sumOrNull(...values: Array<number | null>): number | null {
    if (values.every((v) => v === null)) return null;
    return +values.reduce<number>((s, v) => s + (v ?? 0), 0).toFixed(2);
  }

  // ── 车间版面 ─────────────────────────────────────────────

  async workshopOverview(days = 30): Promise<WorkshopOverviewResult> {
    const [sulfuric, amino, magnesium, hydrotalcite, anthraquinone] = await Promise.all([
      this.production.sulfuricSummary(days),
      this.byDate(CODE.amino),
      this.byDate(CODE.magnesium),
      this.byDate(CODE.hydrotalcite),
      this.byDate(CODE.anthraquinone),
    ]);

    const sulfuricByDate = new Map<string, unknown>(
      sulfuric.days.map((d) => [d.date, d.production?.total98Equivalent ?? null]),
    );
    const dates = this.windowOf(
      [sulfuricByDate, amino, magnesium, hydrotalcite, anthraquinone],
      days,
    );

    const workshops: WorkshopSeries[] = [
      {
        code: 'sulfuric',
        name: '硫酸',
        unit: 't·折98',
        values: dates.map((d) => (sulfuricByDate.get(d) as number | undefined) ?? null),
      },
      {
        code: 'aminosulfonic',
        name: '氨基磺酸',
        unit: 't',
        values: this.reportedSeries(amino, dates, ['field_production']),
      },
      {
        code: 'magnesium',
        name: '硫酸镁',
        unit: 't',
        values: this.reportedSeries(magnesium, dates, ['field_mgso4_production']),
      },
      {
        code: 'hydrotalcite',
        name: '水滑石',
        unit: 't',
        values: this.reportedSeries(hydrotalcite, dates, [
          'field_hg200_output',
          'field_hg201_output',
          'field_hg300_output',
          'field_hg205_output',
        ]),
      },
      {
        code: 'anthraquinone',
        name: '蒽醌',
        unit: 't·精品',
        values: this.reportedSeries(anthraquinone, dates, ['field_fine_output']),
      },
    ];
    return { dates, workshops };
  }

  // ── 能源中心 ─────────────────────────────────────────────

  async energy(days = 30): Promise<EnergyResult> {
    const [sulfuric, amino, magnesium, anthraquinone, thermal, meters] = await Promise.all([
      this.byDate(CODE.sulfuric),
      this.byDate(CODE.amino),
      this.byDate(CODE.magnesium),
      this.byDate(CODE.anthraquinone),
      this.byDate(CODE.thermal),
      this.prisma.meter.findMany({ where: { formCode: CODE.sulfuric } }),
    ]);
    const multiplierOf = (fieldId: string): number =>
      meters.find((m) => m.fieldId === fieldId)?.multiplier ?? 1;

    const dates = this.windowOf([sulfuric, amino, magnesium, anthraquinone, thermal], days);

    const aminoPhase1 = this.meterSeries(sulfuric, dates, [
      { field: 'meter_amino', multiplier: multiplierOf('meter_amino') },
    ]);
    const aminoPhase2 = this.meterSeries(amino, dates, [
      { field: 'field_electricity_meter', multiplier: AMINO_PHASE2_ELECTRICITY_MULTIPLIER },
    ]);

    return {
      dates,
      electricity: {
        workshops: [
          {
            name: '硫酸',
            values: this.meterSeries(sulfuric, dates, ['meter_3', 'meter_4', 'meter_5', 'meter_6'].map((f) => ({ field: f, multiplier: multiplierOf(f) }))),
          },
          {
            name: '氨基磺酸',
            values: dates.map((_, i) => OverviewService.sumOrNull(aminoPhase1[i], aminoPhase2[i])),
          },
          {
            name: '硫酸镁',
            values: this.meterSeries(magnesium, dates, [
              { field: 'field_electricity_phase1', multiplier: MAGNESIUM_PHASE1_ELECTRICITY_MULTIPLIER },
              { field: 'field_electricity_phase2', multiplier: MAGNESIUM_PHASE2_ELECTRICITY_MULTIPLIER },
            ]),
          },
          {
            name: '蒽醌',
            values: this.meterSeries(anthraquinone, dates, [{ field: 'field_electricity_meter', multiplier: 1 }]),
          },
        ],
        generation: this.meterSeries(thermal, dates, [{ field: 'field_condenser_gen_active', multiplier: 1 }]),
        purchase: this.meterSeries(thermal, dates, [{ field: 'field_line2_active', multiplier: 1 }]),
      },
      steam: {
        internal: [
          { name: '氨基磺酸', values: this.meterSeries(thermal, dates, [{ field: 'field_amino_steam', multiplier: 1 }]) },
          { name: '硫酸镁', values: this.meterSeries(thermal, dates, [{ field: 'field_mgso4_steam', multiplier: 1 }]) },
          { name: '水滑石', values: this.meterSeries(thermal, dates, [{ field: 'field_hydrotalcite_steam', multiplier: 1 }]) },
          { name: '丰联', values: this.meterSeries(thermal, dates, [{ field: 'field_fenglian_steam', multiplier: 1 }]) },
          { name: '蒽醌', values: this.meterSeries(thermal, dates, [{ field: 'field_deaq_steam', multiplier: 1 }]) },
        ],
        external: [
          { name: '建衡', values: this.meterSeries(thermal, dates, [{ field: 'field_jianheng_steam', multiplier: 1 }]) },
          { name: '旭光', values: this.meterSeries(thermal, dates, [{ field: 'field_xuguang_steam', multiplier: 1 }]) },
          { name: '鑫科思', values: this.meterSeries(thermal, dates, [{ field: 'field_xinkesi_steam', multiplier: 1 }]) },
          { name: '力泓', values: this.meterSeries(thermal, dates, [{ field: 'field_lihong_steam', multiplier: 1 }]) },
          { name: '湘硕', values: this.meterSeries(thermal, dates, [{ field: 'field_xiangshuo_steam', multiplier: 1 }]) },
        ],
      },
      water: {
        workshops: [
          { name: '硫酸·总水表', values: this.meterSeries(thermal, dates, [{ field: 'field_water_meter', multiplier: 1 }]) },
          { name: '氨基磺酸', values: this.meterSeries(amino, dates, [{ field: 'field_water_meter', multiplier: 1 }]) },
          { name: '硫酸镁', values: this.meterSeries(magnesium, dates, [{ field: 'field_water_meter', multiplier: 1 }]) },
          { name: '蒽醌', values: this.meterSeries(anthraquinone, dates, [{ field: 'field_water_meter', multiplier: 1 }]) },
        ],
      },
    };
  }

  // ── 物料与库存 ───────────────────────────────────────────

  /** schema 里按标题后缀配对的三件套（如 X购入/X耗用/X库存 或 X产量/X销量/X库存） */
  private static fieldTriplets(
    schema: FormField[],
    suffixes: Readonly<Record<string, 'a' | 'b' | 'c'>>,
  ): Array<{ name: string; group: string; a?: string; b?: string; c?: string }> {
    const byName = new Map<string, { name: string; group: string; a?: string; b?: string; c?: string }>();
    for (const field of schema) {
      const title = field.title ?? '';
      for (const [suffix, slot] of Object.entries(suffixes)) {
        if (title.endsWith(suffix) && title !== suffix) {
          const name = title.slice(0, -suffix.length);
          const entry = byName.get(name) ?? { name, group: field.group ?? '' };
          entry[slot] = field.id;
          byName.set(name, entry);
        }
      }
    }
    return [...byName.values()];
  }

  async materials(): Promise<MaterialsResult> {
    const [warehouse, finished, magnesium, amino, anthraquinone, sulfuric, warehouseForm, finishedForm] =
      await Promise.all([
        this.byDate(CODE.warehouse),
        this.byDate(CODE.finished),
        this.byDate(CODE.magnesium),
        this.byDate(CODE.amino),
        this.byDate(CODE.anthraquinone),
        this.production.sulfuricSummary(2),
        this.prisma.form.findUnique({ where: { code: CODE.warehouse } }),
        this.prisma.form.findUnique({ where: { code: CODE.finished } }),
      ]);

    const latestOf = (m: ByDate): { date: string; data: FormData } | null => {
      const dates = [...m.keys()].sort();
      const date = dates[dates.length - 1];
      return date ? { date, data: m.get(date)! } : null;
    };
    const pick = (data: FormData, field?: string): number | null =>
      field && typeof data[field] === 'number' ? (data[field] as number) : null;

    // 原辅料：最新库存 + 近 7 日平均耗用 → 可用天数与预警
    const rawMaterials: RawMaterialStockItem[] = [];
    const warehouseLatest = latestOf(warehouse);
    if (warehouseForm && warehouseLatest) {
      const triplets = OverviewService.fieldTriplets(warehouseForm.schema as never as FormField[], {
        购入: 'a',
        耗用: 'b',
        消耗: 'b',
        库存: 'c',
      }).filter((t) => t.c || t.b);
      const recentDates = [...warehouse.keys()].sort().slice(-7);
      for (const t of triplets) {
        const stock = pick(warehouseLatest.data, t.c);
        const recent = recentDates
          .map((d) => warehouse.get(d)![t.b ?? ''])
          .filter((v): v is number => typeof v === 'number');
        const avg = recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : 0;
        const daysOfUse = stock !== null && avg > 0 ? +(stock / avg).toFixed(1) : null;
        rawMaterials.push({
          name: t.name,
          workshop: t.group,
          stock,
          purchase: pick(warehouseLatest.data, t.a),
          consumption: pick(warehouseLatest.data, t.b),
          daysOfUse,
          alert: daysOfUse === null ? null : daysOfUse < 3 ? 'low3' : daysOfUse < 7 ? 'low7' : null,
        });
      }
    }

    // 产成品：产成品表三件套 + 硫酸（差值法现算）+ 蒽醌精品（蒽醌表）
    const finishedProducts: FinishedProductItem[] = [];
    const productItem = (
      name: string,
      data: FormData,
      fields: { production?: string; sales?: string; stock?: string },
    ): FinishedProductItem => {
      const production = pick(data, fields.production);
      const sales = pick(data, fields.sales);
      const stock = pick(data, fields.stock);
      return {
        name,
        production,
        sales,
        stock,
        salesRatio: production && production > 0 && sales !== null ? +(sales / production).toFixed(2) : null,
        stockDays: stock !== null && sales && sales > 0 ? +(stock / sales).toFixed(1) : null,
      };
    };
    const finishedLatest = latestOf(finished);
    if (finishedForm && finishedLatest) {
      const triplets = OverviewService.fieldTriplets(finishedForm.schema as never as FormField[], {
        产量: 'a',
        销量: 'b',
        库存: 'c',
      });
      for (const t of triplets) {
        finishedProducts.push(
          productItem(t.name, finishedLatest.data, { production: t.a, sales: t.b, stock: t.c }),
        );
      }
    }
    const sulfuricToday = sulfuric.days[sulfuric.days.length - 1];
    if (sulfuricToday) {
      const flow = sulfuricToday.production?.flow;
      const sales = flow
        ? +(flow.acid98 + flow.acid93 + flow.reagent + flow.fuming).toFixed(3)
        : null;
      finishedProducts.unshift({
        name: '硫酸（四酸合计·折98）',
        production: sulfuricToday.production?.total98Equivalent ?? null,
        sales,
        stock: sulfuricToday.inventory?.total ?? null,
        salesRatio: null,
        stockDays: null,
      });
    }
    const anthraquinoneLatest = latestOf(anthraquinone);
    if (anthraquinoneLatest) {
      finishedProducts.push(
        productItem('蒽醌·精品', anthraquinoneLatest.data, {
          production: 'field_fine_output',
          sales: 'field_fine_sales',
          stock: 'field_fine_stock',
        }),
      );
    }

    // 车间间物料往来（当日值；酸的体积量 ×密度 折吨）
    const internalFlows: InternalFlowItem[] = [];
    const flowQty = (data: FormData | undefined, field: string, times = 1): number | null => {
      if (!data) return null;
      const v = data[field];
      return typeof v === 'number' && Number.isFinite(v) ? +(v * times).toFixed(3) : null;
    };
    const aminoLatest = latestOf(amino);
    const mgLatest = latestOf(magnesium);
    if (aminoLatest) {
      internalFlows.push({ from: '硫酸', to: '氨基磺酸', material: '发烟硫酸', quantity: flowQty(aminoLatest.data, 'field_nitric_acid', 1.92) });
    }
    if (mgLatest) {
      internalFlows.push({ from: '硫酸', to: '硫酸镁', material: '93%酸', quantity: flowQty(mgLatest.data, 'field_sulfuric_93', 1.84) });
      internalFlows.push({ from: '氨基磺酸', to: '硫酸镁', material: '稀酸', quantity: flowQty(mgLatest.data, 'field_amino_dilute_acid') });
      internalFlows.push({ from: '蒽醌', to: '硫酸镁', material: '稀酸', quantity: flowQty(mgLatest.data, 'field_anthraquinone_dilute_acid') });
    }

    const date = warehouseLatest?.date ?? finishedLatest?.date ?? sulfuricToday?.date ?? '';
    return { date, rawMaterials, finishedProducts, internalFlows };
  }
}
