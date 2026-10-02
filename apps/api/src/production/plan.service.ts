import { Injectable } from '@nestjs/common';
import type {
  FormData,
  FormField,
  PlanCompletionRow,
  PlanConsumptionRow,
  PlanSalesRow,
  PlanSettingsResult,
  PlanSettingsSaveBody,
  PlanTargetRow,
  PlanTargetSaveBody,
  PlanTask,
  PlanWorkshopRow,
  ProductionPlanBoardResult,
} from '@hgxt/shared';
import { PrismaService } from '../database/prisma.service';
import { OverviewService } from './overview.service';

/**
 * 生产计划与完成 —— 计划值入库（ProductionPlan / ConsumptionTarget），
 * 实际值全部从表单现算（复用 Overview 的车间产量序列与能源序列）。
 * 口径（design/plan/02）：
 *   时间进度 = 已过天数 ÷ 全年天数；按进度应完成 = 年度计划 × 时间进度
 *   达成 = 累计完成率 ≥ 时间进度（±2 个百分点显示「持平」）
 *   月度自动拆分 = 年度计划 × 当月天数 ÷ 全年天数；手工值覆盖
 */
const PLAN_WORKSHOPS: Array<{ workshop: string; basis: string; code: string }> = [
  { workshop: '硫酸', basis: '折 98% 硫酸', code: 'sulfuric' },
  { workshop: '氨基磺酸', basis: '单日汇总', code: 'aminosulfonic' },
  { workshop: '硫酸镁', basis: '单日汇总', code: 'magnesium' },
  { workshop: '水滑石', basis: '4 牌号合计', code: 'hydrotalcite' },
  { workshop: '二乙基蒽醌', basis: '精品', code: 'anthraquinone' },
  { workshop: '丰联', basis: '焦磷酸哌嗪', code: 'fenglian' },
];

/** 单耗目标默认行（design/plan/02；库里无记录时展示，保存后以库为准） */
const DEFAULT_TARGETS: PlanTargetRow[] = [
  { workshop: '硫酸', material: '电', unit: 'kWh/t', target: '85 – 95' },
  { workshop: '硫酸', material: '硫铁矿', unit: 't/t', target: '1.55 – 1.62' },
  { workshop: '氨基磺酸', material: '尿素', unit: 't/t', target: '≤ 0.660' },
  { workshop: '氨基磺酸', material: '蒸汽', unit: 't/t', target: '1.35 – 1.55' },
  { workshop: '硫酸镁', material: '氧化镁', unit: 't/t', target: '≤ 0.200' },
  { workshop: '水滑石', material: '蒸汽', unit: 't/t', target: '≤ 2.20' },
  { workshop: '二乙基蒽醌', material: '苯酐', unit: 't/t', target: '≤ 1.10' },
  { workshop: '丰联', material: '85%磷酸', unit: 't/t', target: '≤ 0.95' },
];

const CODE_MATTERS = 'matters_2026';
const CODE_SALES = 'sales_daily';
const CODE_FINISHED = 'finished_products_daily';

const daysInYear = (year: number): number => ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365);
const daysInMonth = (year: number, month: number): number => new Date(year, month, 0).getDate();
const monthKey = (date: string): string => date.slice(0, 7);

@Injectable()
export class PlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly overview: OverviewService,
  ) {}

  /** 兼容旧库字符串数字 */
  private static toNum(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
  }

  // ── 设置页 ───────────────────────────────────────────────

  private buildPlanRow(
    workshop: string,
    basis: string,
    plan: { annual: number; months: unknown } | undefined,
    year: number,
  ): PlanWorkshopRow {
    const annual = plan?.annual ?? 0;
    const monthsRaw = (plan?.months as Record<string, number | null> | null) ?? {};
    const total = daysInYear(year);
    const months = Array.from({ length: 12 }, (_, i) => {
      const manual = monthsRaw[String(i + 1)] != null;
      const value = manual
        ? Number(monthsRaw[String(i + 1)])
        : +(annual * (daysInMonth(year, i + 1) / total)).toFixed(0);
      return { value, manual };
    });
    return { workshop, basis, annual, months, monthTotal: months.reduce((s, m) => s + m.value, 0) };
  }

  async getSettings(year: number): Promise<PlanSettingsResult> {
    const [plans, targets] = await Promise.all([
      this.prisma.productionPlan.findMany({ where: { year } }),
      this.prisma.consumptionTarget.findMany(),
    ]);
    const rows = PLAN_WORKSHOPS.map((w) => {
      const plan = plans.find((p) => p.workshop === w.workshop);
      return this.buildPlanRow(w.workshop, w.basis, plan, year);
    });
    const targetRows: PlanTargetRow[] = targets.length
      ? targets.map((t) => ({ workshop: t.workshop, material: t.material, unit: t.unit, target: t.target }))
      : DEFAULT_TARGETS;
    return { year, rows, targets: targetRows };
  }

  async saveSettings(body: PlanSettingsSaveBody): Promise<PlanSettingsResult> {
    for (const row of body.rows) {
      const months: Record<string, number | null> = {};
      row.months.forEach((v, i) => {
        months[String(i + 1)] = v;
      });
      await this.prisma.productionPlan.upsert({
        where: { year_workshop: { year: body.year, workshop: row.workshop } },
        create: { year: body.year, workshop: row.workshop, annual: row.annual, months },
        update: { annual: row.annual, months },
      });
    }
    return this.getSettings(body.year);
  }

  async saveTargets(body: PlanTargetSaveBody): Promise<PlanTargetRow[]> {
    for (const t of body.targets) {
      await this.prisma.consumptionTarget.upsert({
        where: { workshop_material: { workshop: t.workshop, material: t.material } },
        create: { workshop: t.workshop, material: t.material, unit: t.unit, target: t.target },
        update: { unit: t.unit, target: t.target },
      });
    }
    return body.targets;
  }

  // ── 看板 ─────────────────────────────────────────────────

  /** 读某表单全部提交（不做归属日偏移，按主日期字段原值归组；同日取最新） */
  private async rawByDate(code: string): Promise<Map<string, FormData>> {
    const form = await this.prisma.form.findUnique({ where: { code } });
    if (!form) return new Map();
    const dateField = (form.schema as unknown as FormField[]).find((f) => f.type === 'date');
    if (!dateField) return new Map();
    const submissions = await this.prisma.formSubmission.findMany({
      where: { formId: form.id },
      orderBy: { createdAt: 'asc' },
      select: { data: true },
    });
    const map = new Map<string, FormData>();
    for (const s of submissions) {
      const date = (s.data as FormData)[dateField.id];
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) map.set(date, s.data as FormData);
    }
    return map;
  }

  /** 按月求和：日序列 → Map<'YYYY-MM', number> */
  private static sumByMonth(dates: string[], values: Array<number | null>): Map<string, number> {
    const map = new Map<string, number>();
    dates.forEach((d, i) => {
      const v = values[i];
      if (v === null || v === undefined) return;
      map.set(monthKey(d), (map.get(monthKey(d)) ?? 0) + v);
    });
    return map;
  }

  /** 区间/上限文本解析出目标上限（"85 – 95"→95、"≤ 0.660"→0.66） */
  private static targetMax(target: string | null | undefined): number | null {
    if (!target) return null;
    const match = target.match(/(\d+(?:\.\d+)?)\s*$/);
    return match ? Number(match[1]) : null;
  }

  async board(year: number): Promise<ProductionPlanBoardResult> {
    const [overview, energy, settings, salesForm, finishedForm, aminoForm, magnesiumForm, hydrotalciteForm, anthraquinoneForm, fenglianForm] =
      await Promise.all([
        this.overview.workshopOverview(0),
        this.overview.energy(0),
        this.getSettings(year),
        this.rawByDate(CODE_SALES),
        this.rawByDate(CODE_FINISHED),
        this.rawByDate('aminosulfonic_daily'),
        this.rawByDate('magnesium_daily'),
        this.rawByDate('hydrotalcite_daily'),
        this.rawByDate('anthraquinone_daily'),
        this.rawByDate('fenglian_daily'),
      ]);

    const dates = overview.dates;
    const asOf = dates[dates.length - 1] ?? null;
    const now = asOf ? new Date(`${asOf}T00:00:00Z`) : null;
    const dayOfYear = now
      ? Math.round((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86400000) + 1
      : null;
    const timeProgress = dayOfYear
      ? { pct: +((dayOfYear / daysInYear(year)) * 100).toFixed(1), dayOfYear, daysInYear: daysInYear(year) }
      : null;

    // 各车间月度实际产量
    const productionByCode = new Map<string, Map<string, number>>();
    for (const w of overview.workshops) {
      if (w.code === 'thermal') continue;
      productionByCode.set(w.code, PlanService.sumByMonth(dates, w.values));
    }
    const currentMonth = asOf ? monthKey(asOf) : '';

    // 销量日序列（硫酸=四酸销售表；其余=产成品表/车间表按字段）
    const finishedSchema = await this.schemaOf(CODE_FINISHED);
    const finishedWarehouseSchema = await this.schemaOf('warehouse_daily');
    const salesOfDay = new Map<string, Map<string, number>>(); // code → date → t
    const pushSales = (code: string, date: string, value: number) => {
      const m = salesOfDay.get(code) ?? new Map();
      m.set(date, (m.get(date) ?? 0) + value);
      salesOfDay.set(code, m);
    };
    for (const [date, data] of salesForm) {
      const sum =
        ['field_acid98_sales', 'field_acid93_sales', 'field_reagent_acid_sales', 'field_fuming_acid_sales']
          .map((f) => PlanService.toNum(data[f]))
          .reduce<number>((s, v) => s + (v ?? 0), 0);
      if (sum > 0) pushSales('sulfuric', date, sum);
    }
    const fieldByTitle = (title: string): string | undefined =>
      finishedSchema?.find((f) => (f.title ?? '') === title)?.id;
    const productSales: Record<string, string[]> = {
      aminosulfonic: [fieldByTitle('氨基磺酸销量')].filter((x): x is string => !!x),
      magnesium: [fieldByTitle('硫酸镁销量')].filter((x): x is string => !!x),
      hydrotalcite: ['HG-200销量', 'HG-201销量', 'HG-300销量', 'HG-205销量']
        .map(fieldByTitle)
        .filter((x): x is string => !!x),
      anthraquinone: ['field_fine_sales'],
      fenglian: ['field_205'],
    };
    for (const [date, data] of finishedForm) {
      for (const [code, fields] of Object.entries(productSales)) {
        for (const f of fields) {
          const v = PlanService.toNum(data[f]);
          if (v !== null) pushSales(code, date, v);
        }
      }
    }

    // ── 计划完成 + 月度趋势 ──
    const planByWorkshop = new Map(settings.rows.map((r) => [r.workshop, r]));
    const completion: PlanCompletionRow[] = PLAN_WORKSHOPS.map((w) => {
      const plan = planByWorkshop.get(w.workshop)!;
      const monthly = productionByCode.get(w.code) ?? new Map();
      const monthActual = +(monthly.get(currentMonth) ?? 0).toFixed(1);
      const yearActual = +[...monthly.entries()]
        .filter(([k]) => k.startsWith(String(year)))
        .reduce((s, [, v]) => s + v, 0)
        .toFixed(1);
      const monthPlan = plan.annual > 0 ? plan.months[Number(currentMonth.slice(5)) - 1]?.value ?? null : null;
      const yearRate = plan.annual > 0 ? +((yearActual / plan.annual) * 100).toFixed(1) : null;
      const expected = plan.annual > 0 && timeProgress ? +((plan.annual * timeProgress.pct) / 100).toFixed(1) : null;
      const statusPoints = yearRate !== null && timeProgress
        ? +(yearRate - timeProgress.pct).toFixed(1)
        : null;
      const months = Array.from({ length: 12 }, (_, i) => {
        const key = `${year}-${String(i + 1).padStart(2, '0')}`;
        const planValue = plan.annual > 0 ? plan.months[i].value : null;
        const actual = monthly.has(key) ? +(monthly.get(key)!).toFixed(1) : null;
        return {
          month: i + 1,
          plan: planValue,
          actual,
          met: actual !== null && planValue !== null && planValue > 0 ? actual >= planValue : null,
        };
      });
      return {
        workshop: w.workshop,
        basis: w.basis,
        monthPlan,
        monthActual,
        monthRate: monthPlan && monthPlan > 0 ? +((monthActual / monthPlan) * 100).toFixed(1) : null,
        yearPlan: plan.annual,
        yearActual,
        yearRate,
        expectedByProgress: expected,
        aheadOfProgress: expected !== null ? +(yearActual - expected).toFixed(1) : null,
        status: statusPoints === null ? null : statusPoints > 2 ? 'ahead' : statusPoints < -2 ? 'behind' : 'onTrack',
        statusPoints,
        months,
      };
    });

    // ── 本周 vs 上周（以 asOf 所在周的周一为界） ──
    const week = PLAN_WORKSHOPS.map((w) => {
      const series = overview.workshops.find((s) => s.code === w.code);
      const sumRange = (from: string, to: string, seriesValues?: Array<number | null>): number => {
        if (!seriesValues) return 0;
        let sum = 0;
        dates.forEach((d, i) => {
          if (d >= from && d <= to && seriesValues[i] !== null) sum += seriesValues[i] ?? 0;
        });
        return sum;
      };
      const shift = (date: string, days: number): string => {
        const dt = new Date(`${date}T00:00:00Z`);
        dt.setUTCDate(dt.getUTCDate() + days);
        return dt.toISOString().slice(0, 10);
      };
      const salesSumRange = (code: string, from: string, to: string): number => {
        let sum = 0;
        for (const [d, v] of salesOfDay.get(code) ?? []) if (d >= from && d <= to) sum += v;
        return sum;
      };
      if (!asOf) {
        return { workshop: w.workshop, productionThis: 0, productionLast: null, productionDelta: null, salesThis: 0, salesLast: null, salesDelta: null, productionLastFullWeek: null };
      }
      const weekday = new Date(`${asOf}T00:00:00Z`).getUTCDay();
      const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
      const monday = shift(asOf, mondayOffset);
      const lastMonday = shift(monday, -7);
      const lastSunday = shift(monday, -1);
      const values = series?.values;
      const productionThis = +sumRange(monday, asOf, values).toFixed(1);
      const productionLast = +sumRange(lastMonday, shift(asOf, -7), values).toFixed(1);
      const salesThis = +salesSumRange(w.code, monday, asOf).toFixed(1);
      const salesLast = +salesSumRange(w.code, lastMonday, shift(asOf, -7)).toFixed(1);
      const delta = (a: number, b: number): number | null => (b > 0 ? +(((a - b) / b) * 100).toFixed(1) : null);
      return {
        workshop: w.workshop,
        productionThis,
        productionLast,
        productionDelta: delta(productionThis, productionLast),
        salesThis,
        salesLast,
        salesDelta: delta(salesThis, salesLast),
        productionLastFullWeek: +sumRange(lastMonday, lastSunday, values).toFixed(1),
      };
    });

    // ── 产销视图 ──
    const inventoryOf = new Map<string, number>();
    {
      const materials = await this.overview.materials();
      for (const p of materials.finishedProducts) {
        if (p.name.startsWith('硫酸')) inventoryOf.set('sulfuric', p.stock ?? 0);
        if (p.name === '氨基磺酸') inventoryOf.set('aminosulfonic', p.stock ?? 0);
        if (p.name === '硫酸镁') inventoryOf.set('magnesium', p.stock ?? 0);
        if (p.name === '蒽醌·精品') inventoryOf.set('anthraquinone', p.stock ?? 0);
      }
      const hydrotalciteStock = materials.finishedProducts
        .filter((p) => /^HG-/.test(p.name))
        .reduce((s, p) => s + (p.stock ?? 0), 0);
      inventoryOf.set('hydrotalcite', +hydrotalciteStock.toFixed(1));
      const fenglianLatest = [...fenglianForm.keys()].sort().pop();
      if (fenglianLatest) inventoryOf.set('fenglian', PlanService.toNum(fenglianForm.get(fenglianLatest)!.field_206) ?? 0);
    }
    const lastMonthKey = (() => {
      if (!currentMonth) return '';
      const [y, m] = currentMonth.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 2, 1));
      return dt.toISOString().slice(0, 7);
    })();
    const sales: PlanSalesRow[] = PLAN_WORKSHOPS.map((w) => {
      const monthly = productionByCode.get(w.code) ?? new Map();
      const production = monthly.get(currentMonth) ?? 0;
      const lastMonthProduction = monthly.get(lastMonthKey) ?? null;
      let salesSum = 0;
      for (const [d, v] of salesOfDay.get(w.code) ?? []) if (monthKey(d) === currentMonth) salesSum += v;
      salesSum = +salesSum.toFixed(1);
      return {
        workshop: w.workshop,
        production: +production.toFixed(1),
        sales: salesSum,
        salesRatio: production > 0 ? Math.round((salesSum / production) * 100) : null,
        inventory: inventoryOf.get(w.code) ?? null,
        inventoryDays: salesSum > 0 ? +((inventoryOf.get(w.code) ?? 0) / (salesSum / 30)).toFixed(1) : null,
        lastMonthProduction: lastMonthProduction !== null ? +lastMonthProduction.toFixed(1) : null,
        productionDelta:
          production !== null && lastMonthProduction && lastMonthProduction > 0
            ? +(((production - lastMonthProduction) / lastMonthProduction) * 100).toFixed(1)
            : null,
      };
    });

    // ── 单耗（能源 / 原辅料）──
    const targetOf = new Map(settings.targets.map((t) => [`${t.workshop}|${t.material}`, t]));
    const energyDates = energy.dates;
    const consumptionOf = (
      workshop: string,
      material: string,
      usageUnit: string,
      unit: string,
      usageByMonth: Map<string, number>,
    ): PlanConsumptionRow => {
      const production = productionByCode.get(PLAN_WORKSHOPS.find((w) => w.workshop === workshop)!.code) ?? new Map();
      const prodThis = production.get(currentMonth) ?? 0;
      const prodLast = production.get(lastMonthKey) ?? 0;
      const useThis = usageByMonth.get(currentMonth) ?? null;
      const useLast = usageByMonth.get(lastMonthKey) ?? null;
      const current = useThis !== null && prodThis > 0 ? +(useThis / prodThis).toFixed(3) : null;
      const lastMonth = useLast !== null && prodLast > 0 ? +(useLast / prodLast).toFixed(3) : null;
      const target = targetOf.get(`${workshop}|${material}`)?.target ?? null;
      const targetMax = PlanService.targetMax(target);
      return {
        workshop,
        material,
        usageUnit,
        unit,
        monthUsage: current !== null && prodThis > 0 ? +(current * prodThis).toFixed(1) : useThis !== null ? +useThis.toFixed(1) : null,
        current,
        lastMonth,
        target,
        targetMax,
        deviationPct: current !== null && targetMax !== null && targetMax > 0 ? +(((current / targetMax - 1) * 100)).toFixed(1) : null,
      };
    };
    const seriesUsageByMonth = (values: Array<number | null>): Map<string, number> =>
      PlanService.sumByMonth(energyDates, values);

    const energyConsumption: PlanConsumptionRow[] = [];
    for (const s of energy.electricity.workshops) {
      const workshop = s.name === '蒽醌' ? '二乙基蒽醌' : s.name;
      energyConsumption.push(consumptionOf(workshop, '电', 'kWh', 'kWh/t', seriesUsageByMonth(s.values)));
    }
    for (const s of energy.steam.internal) {
      const workshop = s.name === '蒽醌' ? '二乙基蒽醌' : s.name;
      energyConsumption.push(consumptionOf(workshop, '蒸汽', 't', 't/t', seriesUsageByMonth(s.values)));
    }
    for (const s of energy.water.workshops) {
      const workshop = s.name.replace('·总水表', '') === '蒽醌' ? '二乙基蒽醌' : s.name.replace('·总水表', '');
      energyConsumption.push(consumptionOf(workshop, '水', 't', 't/t', seriesUsageByMonth(s.values)));
    }
    // 蒽醌天然气（表差 ×1）
    {
      const usage = new Map<string, number>();
      const sorted = [...anthraquinoneForm.keys()].sort();
      for (const date of sorted) {
        const prev = sorted[sorted.indexOf(date) - 1];
        if (!prev) continue;
        const a = PlanService.toNum(anthraquinoneForm.get(prev)!.field_gas_meter);
        const b = PlanService.toNum(anthraquinoneForm.get(date)!.field_gas_meter);
        if (a !== null && b !== null && b >= a) {
          usage.set(monthKey(date), (usage.get(monthKey(date)) ?? 0) + (b - a));
        }
      }
      energyConsumption.push(consumptionOf('二乙基蒽醌', '天然气', 'm³', 'm³/t', usage));
    }

    // 原辅料：仓库三件套 + 各车间表单消耗字段（体积量按密度折吨）
    const materialConsumption: PlanConsumptionRow[] = [];
    const warehouse = await this.rawByDate('warehouse_daily');
    const warehouseUsageByTitle = (title: string): Map<string, number> => {
      const map = new Map<string, number>();
      const schema = finishedWarehouseSchema;
      const field = schema?.find((f) => (f.title ?? '') === title);
      if (!field) return map;
      for (const [date, data] of warehouse) {
        const v = PlanService.toNum(data[field.id]);
        if (v !== null) map.set(monthKey(date), (map.get(monthKey(date)) ?? 0) + v);
      }
      return map;
    };
    materialConsumption.push(consumptionOf('硫酸', '硫铁矿', 't', 't/t', warehouseUsageByTitle('硫铁矿耗用')));
    materialConsumption.push(consumptionOf('硫酸', '双氧水', 't', 't/t', warehouseUsageByTitle('双氧水耗用')));
    const formFieldUsage = (
      workshop: string,
      materialName: string,
      unit: string,
      source: Map<string, FormData>,
      fieldId: string,
      factor = 1,
    ): void => {
      const map = new Map<string, number>();
      for (const [date, data] of source) {
        const v = PlanService.toNum(data[fieldId]);
        if (v !== null) map.set(monthKey(date), (map.get(monthKey(date)) ?? 0) + v * factor);
      }
      materialConsumption.push(consumptionOf(workshop, materialName, 't', unit, map));
    };
    formFieldUsage('氨基磺酸', '尿素', 't/t', aminoForm, 'field_urea');
    formFieldUsage('氨基磺酸', '发烟硫酸', 't/t', aminoForm, 'field_nitric_acid', 1.92);
    formFieldUsage('硫酸镁', '氧化镁', 't/t', magnesiumForm, 'field_mgo_consumption');
    formFieldUsage('硫酸镁', '93%酸+稀酸', 't/t', magnesiumForm, 'field_sulfuric_93', 1.84);
    formFieldUsage('水滑石', '氢氧化铝', 't/t', hydrotalciteForm, 'field_aluminum_hydroxide');
    formFieldUsage('水滑石', '纯碱', 't/t', hydrotalciteForm, 'field_soda_ash');
    formFieldUsage('二乙基蒽醌', '苯酐', 't/t', anthraquinoneForm, 'field_phthalic_anhydride_consumption');
    formFieldUsage('二乙基蒽醌', '无水三氯化铝', 't/t', anthraquinoneForm, 'field_alcl3_consumption');
    formFieldUsage('二乙基蒽醌', '甲苯', 't/t', anthraquinoneForm, 'field_toluene_consumption');
    formFieldUsage('丰联', '85%磷酸', 't/t', fenglianForm, 'field_005');
    formFieldUsage('丰联', '68哌嗪', 't/t', fenglianForm, 'field_008');

    // ── 事项（matters-2026 表单提交推导，按看板年度过滤） ──
    const tasks = await this.loadTasks(asOf, year);

    return { year, asOf, timeProgress, completion, week, sales, energyConsumption, materialConsumption, tasks };
  }

  private async schemaOf(code: string): Promise<FormField[] | null> {
    const form = await this.prisma.form.findUnique({ where: { code } });
    return (form?.schema as unknown as FormField[]) ?? null;
  }

  private async loadTasks(asOf: string | null, year: number): Promise<PlanTask[]> {
    const form = await this.prisma.form.findUnique({ where: { code: CODE_MATTERS } });
    if (!form) return [];
    const submissions = await this.prisma.formSubmission.findMany({
      where: { formId: form.id },
      orderBy: { createdAt: 'desc' },
      select: { data: true },
    });
    const today = asOf ?? new Date().toISOString().slice(0, 10);
    const weekOf = (date: string): number => {
      const dt = new Date(`${date}T00:00:00Z`);
      const weekday = dt.getUTCDay();
      const monday = new Date(dt);
      monday.setUTCDate(dt.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
      return Math.floor(monday.getTime() / (7 * 86400000));
    };
    const tasks: PlanTask[] = [];
    for (const s of submissions) {
      const data = s.data as FormData;
      const due = typeof data.dueDate === 'string' ? data.dueDate : null;
      // 事项表跨多年（2024-2026 全量），只取看板年度；无完成时间的无法推导周期，跳过
      if (!due || !due.startsWith(String(year))) continue;
      const progress = typeof data.progress === 'string' ? data.progress : '';
      const done = progress === '已完成' || progress === '延期完成';
      // 周期只标注本周/下个自然周；其余（历史、远期）归「其他」
      let period: PlanTask['period'] = '其他';
      if (due) {
        const weekGap = weekOf(due) - weekOf(today);
        if (weekGap === 0) period = '本周';
        else if (weekGap === 1) period = '下周';
      }
      let status: PlanTask['status'] = 'todo';
      if (done) status = 'done';
      else if (due && due < today) status = 'late';
      else if (progress === '进行中') status = 'doing';
      tasks.push({
        period,
        status,
        matter: typeof data.matter === 'string' ? data.matter : '',
        department: typeof data.department === 'string' ? data.department : Array.isArray(data.department) ? (data.department as string[]).join('、') : '',
        owner: typeof data.owner === 'string' ? data.owner : '',
        importance: typeof data.importance === 'string' ? data.importance : '',
        dueDate: due,
        progress,
        completionNote: typeof data.completionNote === 'string' ? data.completionNote : '',
      });
    }
    return tasks;
  }
}
