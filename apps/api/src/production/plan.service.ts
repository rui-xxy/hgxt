import { BadRequestException, Injectable } from '@nestjs/common';
import { daysInYear, parsePlanUpperLimit, PLAN_TARGET_CATALOG } from '@hgxt/shared';
import type {
  FormData,
  FormField,
  PlanCompletionRow,
  PlanConsumptionRow,
  PlanSalesRow,
  PlanSettingsResult,
  PlanSettingsSaveBody,
  PlanTargetRow,
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
 *   时间进度 = 已过天数 ÷ 全年天数（已结束年度恒为 100%）；按进度应完成 = 年度计划 × 时间进度
 *   达成 = 累计完成率 ≥ 时间进度（±2 个百分点显示「持平」）
 *   年度与月度计划分别录入；未填写的月份没有计划值
 *   单耗目标只设置上限；旧区间数据沿用其上限
 */
const PLAN_WORKSHOPS: Array<{ workshop: string; basis: string; code: string }> = [
  { workshop: '硫酸', basis: '折 98% 硫酸', code: 'sulfuric' },
  { workshop: '氨基磺酸', basis: '单日汇总', code: 'aminosulfonic' },
  { workshop: '硫酸镁', basis: '单日汇总', code: 'magnesium' },
  { workshop: '水滑石', basis: '4 牌号合计', code: 'hydrotalcite' },
  { workshop: '二乙基蒽醌', basis: '精品', code: 'anthraquinone' },
  { workshop: '丰联', basis: '焦磷酸哌嗪', code: 'fenglian' },
];

const CODE_MATTERS = 'matters_2026';
const CODE_SALES = 'sales_daily';
const CODE_FINISHED = 'finished_products_daily';

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
  ): PlanWorkshopRow {
    const annual = plan?.annual ?? 0;
    const monthsRaw = (plan?.months as Record<string, number | null> | null) ?? {};
    const months = Array.from({ length: 12 }, (_, i) => PlanService.toNum(monthsRaw[String(i + 1)]));
    return { workshop, basis, annual, months, monthTotal: months.reduce<number>((s, m) => s + (m ?? 0), 0) };
  }

  async getSettings(year: number): Promise<PlanSettingsResult> {
    const [plans, targets] = await Promise.all([
      this.prisma.productionPlan.findMany({ where: { year } }),
      this.prisma.consumptionTarget.findMany(),
    ]);
    const rows = PLAN_WORKSHOPS.map((w) => {
      const plan = plans.find((p) => p.workshop === w.workshop);
      return this.buildPlanRow(w.workshop, w.basis, plan);
    });
    const savedTargets = new Map(targets.map((t) => [`${t.workshop}|${t.material}`, t.target]));
    const targetRows: PlanTargetRow[] = PLAN_TARGET_CATALOG.map((metric) => {
      const saved = savedTargets.get(`${metric.workshop}|${metric.material}`);
      const upper = parsePlanUpperLimit(saved ?? metric.defaultLimit ?? '');
      return {
        workshop: metric.workshop,
        material: metric.material,
        unit: metric.unit,
        target: upper !== null && upper > 0 ? String(upper) : '',
      };
    });
    return { year, rows, targets: targetRows };
  }

  /** 运行时校验：workshop 白名单、annual 非负、months 恰好 12 项且为 null 或非负数 */
  private static validateSaveBody(body: PlanSettingsSaveBody): void {
    const known = new Set(PLAN_WORKSHOPS.map((w) => w.workshop));
    for (const row of body.rows) {
      if (!known.has(row.workshop)) {
        throw new BadRequestException(`未知车间：${row.workshop}`);
      }
      if (!Number.isInteger(row.annual) || row.annual < 0) {
        throw new BadRequestException(`${row.workshop} 年度计划必须是非负整数吨`);
      }
      if (!Array.isArray(row.months) || row.months.length !== 12) {
        throw new BadRequestException(`${row.workshop} months 必须是长度 12 的数组`);
      }
      for (const m of row.months) {
        if (m !== null && (!Number.isFinite(m) || m < 0)) {
          throw new BadRequestException(`${row.workshop} 月度计划必须是非负数字或 null`);
        }
      }
    }
    const targetKeys = new Set<string>();
    for (const t of body.targets ?? []) {
      const key = `${t.workshop}|${t.material}`;
      const metric = PLAN_TARGET_CATALOG.find((item) => item.workshop === t.workshop && item.material === t.material);
      const value = typeof t.target === 'string' ? t.target.trim() : '';
      if (!metric || metric.unit !== t.unit || targetKeys.has(key) || typeof t.target !== 'string' || t.target.length > 40 ||
        (value !== '' && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || Number(value) <= 0 || !Number.isFinite(Number(value))))) {
        throw new BadRequestException('单耗上限必须是对应指标的正数，留空表示不设置');
      }
      targetKeys.add(key);
    }
  }

  /** 保存：计划与单耗目标在同一个事务里落库，任何一行失败整体回滚 */
  async saveSettings(body: PlanSettingsSaveBody): Promise<PlanSettingsResult> {
    PlanService.validateSaveBody(body);
    await this.prisma.$transaction(async (tx) => {
      for (const row of body.rows) {
        const months: Record<string, number | null> = {};
        row.months.forEach((v, i) => {
          months[String(i + 1)] = v;
        });
        await tx.productionPlan.upsert({
          where: { year_workshop: { year: body.year, workshop: row.workshop } },
          create: { year: body.year, workshop: row.workshop, annual: row.annual, months },
          update: { annual: row.annual, months },
        });
      }
      for (const t of body.targets ?? []) {
        await tx.consumptionTarget.upsert({
          where: { workshop_material: { workshop: t.workshop, material: t.material } },
          create: { workshop: t.workshop, material: t.material, unit: t.unit, target: t.target.trim() === '' ? '' : String(Number(t.target)) },
          update: { unit: t.unit, target: t.target.trim() === '' ? '' : String(Number(t.target)) },
        });
      }
    });
    return this.getSettings(body.year);
  }

  // ── 看板 ─────────────────────────────────────────────────

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

  async board(year: number): Promise<ProductionPlanBoardResult> {
    const [overview, energy, settings, salesForm, finishedForm, aminoForm, magnesiumForm, hydrotalciteForm, anthraquinoneForm, fenglianForm] =
      await Promise.all([
        this.overview.workshopOverview(0),
        this.overview.energy(0),
        this.getSettings(year),
        this.overview.byDate(CODE_SALES),
        this.overview.byDate(CODE_FINISHED),
        this.overview.byDate('aminosulfonic_daily'),
        this.overview.byDate('magnesium_daily'),
        this.overview.byDate('hydrotalcite_daily'),
        this.overview.byDate('anthraquinone_daily'),
        this.overview.byDate('fenglian_daily'),
      ]);

    // 年度坐标系：asOf 必须取「选中年度内」的最后一个归属日——
    // 直接取全史最后一天会把历史年度看板混入当前最新月/周的数据。
    // 序列聚合（sumByMonth/周区间）仍用全量日期对齐 values 下标，按月键过滤年度。
    const allDates = overview.dates;
    const dates = allDates.filter((d) => d.startsWith(String(year)));
    const asOf = dates[dates.length - 1] ?? null;
    const yearClosed = year < new Date().getFullYear();
    const dayOfYear = yearClosed
      ? daysInYear(year)
      : asOf
        ? Math.round((new Date(`${asOf}T00:00:00Z`).getTime() - Date.UTC(year, 0, 1)) / 86400000) + 1
        : null;
    const timeProgress = dayOfYear
      ? { pct: +((dayOfYear / daysInYear(year)) * 100).toFixed(1), dayOfYear, daysInYear: daysInYear(year) }
      : null;

    // 各车间月度实际产量
    const productionByCode = new Map<string, Map<string, number>>();
    for (const w of overview.workshops) {
      if (w.code === 'thermal') continue;
      productionByCode.set(w.code, PlanService.sumByMonth(allDates, w.values));
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
      const currentMonthPlan = currentMonth ? plan.months[Number(currentMonth.slice(5)) - 1] : undefined;
      const monthPlan = currentMonthPlan ?? null;
      const yearRate = plan.annual > 0 ? +((yearActual / plan.annual) * 100).toFixed(1) : null;
      const expected = plan.annual > 0 && timeProgress ? +((plan.annual * timeProgress.pct) / 100).toFixed(1) : null;
      const statusPoints = yearRate !== null && timeProgress
        ? +(yearRate - timeProgress.pct).toFixed(1)
        : null;
      const months = Array.from({ length: 12 }, (_, i) => {
        const key = `${year}-${String(i + 1).padStart(2, '0')}`;
        const planValue = plan.months[i];
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

    // ── 本周 vs 上周（以 asOf 所在周的周一为界；逐日数据供新版卡片图使用） ──
    const shiftDate = (date: string, days: number): string => {
      const dt = new Date(`${date}T00:00:00Z`);
      dt.setUTCDate(dt.getUTCDate() + days);
      return dt.toISOString().slice(0, 10);
    };
    const dateIndex = new Map(allDates.map((d, i) => [d, i]));
    const week = PLAN_WORKSHOPS.map((w) => {
      const series = overview.workshops.find((s) => s.code === w.code);
      const productionAt = (date: string): number => {
        const i = dateIndex.get(date);
        return i === undefined ? 0 : +(series?.values[i] ?? 0).toFixed(1);
      };
      const salesAt = (date: string): number => +(salesOfDay.get(w.code)?.get(date) ?? 0).toFixed(1);
      const sum = (values: Array<number | null>): number => +values.reduce<number>((s, v) => s + (v ?? 0), 0).toFixed(1);
      if (!asOf) {
        return {
          workshop: w.workshop,
          productionThis: 0,
          productionLast: null,
          productionDelta: null,
          productionDailyThis: Array.from({ length: 7 }, () => null),
          productionDailyLast: Array.from({ length: 7 }, () => 0),
          salesThis: 0,
          salesLast: null,
          salesDelta: null,
          salesDailyThis: Array.from({ length: 7 }, () => null),
          salesDailyLast: Array.from({ length: 7 }, () => 0),
          productionLastFullWeek: null,
          salesLastFullWeek: null,
        };
      }
      const weekday = new Date(`${asOf}T00:00:00Z`).getUTCDay();
      const elapsedDays = weekday === 0 ? 7 : weekday;
      const monday = shiftDate(asOf, weekday === 0 ? -6 : 1 - weekday);
      const lastMonday = shiftDate(monday, -7);
      const productionDailyThis = Array.from({ length: 7 }, (_, i) => i < elapsedDays ? productionAt(shiftDate(monday, i)) : null);
      const productionDailyLast = Array.from({ length: 7 }, (_, i) => productionAt(shiftDate(lastMonday, i)));
      const salesDailyThis = Array.from({ length: 7 }, (_, i) => i < elapsedDays ? salesAt(shiftDate(monday, i)) : null);
      const salesDailyLast = Array.from({ length: 7 }, (_, i) => salesAt(shiftDate(lastMonday, i)));
      const productionThis = sum(productionDailyThis);
      const productionLast = sum(productionDailyLast.slice(0, elapsedDays));
      const salesThis = sum(salesDailyThis);
      const salesLast = sum(salesDailyLast.slice(0, elapsedDays));
      const delta = (a: number, b: number): number | null => (b > 0 ? +(((a - b) / b) * 100).toFixed(1) : null);
      return {
        workshop: w.workshop,
        productionThis,
        productionLast,
        productionDelta: delta(productionThis, productionLast),
        productionDailyThis,
        productionDailyLast,
        salesThis,
        salesLast,
        salesDelta: delta(salesThis, salesLast),
        salesDailyThis,
        salesDailyLast,
        productionLastFullWeek: sum(productionDailyLast),
        salesLastFullWeek: sum(salesDailyLast),
      };
    });

    // ── 产销视图 ──
    // 库存必须与看板 asOf 同一天；历史年度绝不混用“当前最新库存”。
    const inventoryOf = new Map<string, number>();
    if (asOf) {
      const finishedAt = finishedForm.get(asOf);
      const stockByTitle = (title: string): number | null => {
        const field = fieldByTitle(title);
        return field && finishedAt ? PlanService.toNum(finishedAt[field]) : null;
      };
      const setIfNumber = (code: string, value: number | null): void => {
        if (value !== null) inventoryOf.set(code, value);
      };
      setIfNumber('aminosulfonic', stockByTitle('氨基磺酸库存'));
      setIfNumber('magnesium', stockByTitle('硫酸镁库存'));
      const hydrotalciteStocks = ['HG-200库存', 'HG-201库存', 'HG-300库存', 'HG-205库存']
        .map(stockByTitle)
        .filter((v): v is number => v !== null);
      if (hydrotalciteStocks.length) inventoryOf.set('hydrotalcite', +hydrotalciteStocks.reduce((s, v) => s + v, 0).toFixed(1));
      setIfNumber('anthraquinone', PlanService.toNum(anthraquinoneForm.get(asOf)?.field_fine_stock));
      setIfNumber('fenglian', PlanService.toNum(fenglianForm.get(asOf)?.field_206));

      // 硫酸库存来自汇总服务的最新罐区快照；只有它与当前看板 asOf 完全一致时才展示。
      if (year === new Date().getFullYear()) {
        const materials = await this.overview.materials();
        if (materials.date === asOf) {
          const sulfuric = materials.finishedProducts.find((p) => p.name.startsWith('硫酸'));
          if (sulfuric?.stock !== null && sulfuric?.stock !== undefined) inventoryOf.set('sulfuric', sulfuric.stock);
        }
      }
    }
    const elapsedDaysInMonth = asOf ? Number(asOf.slice(8, 10)) : 0;
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
      const inventory = inventoryOf.get(w.code) ?? null;
      return {
        workshop: w.workshop,
        production: +production.toFixed(1),
        sales: salesSum,
        salesRatio: production > 0 ? Math.round((salesSum / production) * 100) : null,
        inventory,
        inventoryDays: inventory !== null && salesSum > 0 && elapsedDaysInMonth > 0
          ? +(inventory / (salesSum / elapsedDaysInMonth)).toFixed(1)
          : null,
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
      const targetValue = targetOf.get(`${workshop}|${material}`)?.target ?? '';
      const targetMaxNumber = parsePlanUpperLimit(targetValue);
      return {
        workshop,
        material,
        usageUnit,
        unit,
        monthUsage: current !== null && prodThis > 0 ? +(current * prodThis).toFixed(1) : useThis !== null ? +useThis.toFixed(1) : null,
        current,
        lastMonth,
        target: targetMaxNumber !== null ? `≤ ${targetValue}` : null,
        targetMax: targetMaxNumber,
        deviationPct: current !== null && targetMaxNumber !== null
          ? +(((current / targetMaxNumber) - 1) * 100).toFixed(1)
          : null,
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
      energyConsumption.push(consumptionOf(workshop, '水', 'm³', 'm³/t', seriesUsageByMonth(s.values)));
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
    const warehouse = await this.overview.byDate('warehouse_daily');
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
