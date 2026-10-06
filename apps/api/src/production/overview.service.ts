import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AminoSummaryResult,
  DetailedWorkshopCode,
  DetailedWorkshopResult,
  WorkshopMetricDefinition,
  WorkshopStockDefinition,
  EnergyResult,
  FinishedProductItem,
  FormData,
  FormField,
  FenglianSummaryResult,
  InternalFlowItem,
  MaterialsResult,
  RawMaterialStockItem,
  TankLevelItem,
  TankLevelsResult,
  TankMaterialGroup,
  ThermalDaySummary,
  ThermalMeterValue,
  ThermalOutletDefinition,
  ThermalSummaryResult,
  WorkshopOverviewResult,
  WorkshopSeries,
} from '@hgxt/shared';
import { PrismaService } from '../database/prisma.service';
import { primaryDateField } from '../forms/forms.service';
import { ProductionService } from './production.service';

/**
 * 车间版面 / 能源中心 / 物料与库存 —— 三张看板的现算服务。
 * 口径与倍率全部对照 b2（参照/dashboard-b2-source）：
 *   车间产量：硫酸=差值法折98；热电=十路供汽表差合计；其余车间=表单直接上报字段
 *   电：读数差 × 倍率（硫酸 4 表用 Meter 档案；氨基二期 2000 / 镁一期 200 二期 4000 为 b2 代码常量）
 *   汽/水：热电与各车间表单的流量计/水表读数差（倍率 1）
 *   物料：仓库、产成品、蒽醌、丰联表的出入与库存字段；可用天数=库存÷近7条有效日均耗用
 */
const CODE = {
  sulfuric: 'sulfuric_daily',
  thermal: 'thermal_daily',
  amino: 'aminosulfonic_daily',
  magnesium: 'magnesium_daily',
  hydrotalcite: 'hydrotalcite_daily',
  anthraquinone: 'anthraquinone_daily',
  fenglian: 'fenglian_daily',
  warehouse: 'warehouse_daily',
  finished: 'finished_products_daily',
} as const;

const AMINO_PHASE2_ELECTRICITY_MULTIPLIER = 2000;
const MAGNESIUM_PHASE1_ELECTRICITY_MULTIPLIER = 200;
const MAGNESIUM_PHASE2_ELECTRICITY_MULTIPLIER = 4000;
const THERMAL_OUTLETS: Array<ThermalOutletDefinition & { field: string }> = [
  { key: 'jianheng', name: '建衡', group: 'external', field: 'field_jianheng_steam' },
  { key: 'xuguang', name: '旭光', group: 'external', field: 'field_xuguang_steam' },
  { key: 'xinkesi', name: '鑫科思', group: 'external', field: 'field_xinkesi_steam' },
  { key: 'lihong', name: '力泓', group: 'external', field: 'field_lihong_steam' },
  { key: 'xiangshuo', name: '湘硕', group: 'external', field: 'field_xiangshuo_steam' },
  { key: 'fenglian', name: '丰联', group: 'external', field: 'field_fenglian_steam' },
  { key: 'amino', name: '氨基磺酸', group: 'internal', field: 'field_amino_steam' },
  { key: 'magnesium', name: '硫酸镁', group: 'internal', field: 'field_mgso4_steam' },
  { key: 'hydrotalcite', name: '水滑石', group: 'internal', field: 'field_hydrotalcite_steam' },
  { key: 'anthraquinone', name: '二乙基蒽醌', group: 'internal', field: 'field_deaq_steam' },
];

export type ByDate = Map<string, FormData>;
type MetricSpec = WorkshopMetricDefinition & {
  field?: string;
  factor?: number;
  meter?: Array<{ field: string; multiplier: number; reverse?: boolean; maxDelta?: number }>;
};
type StockSpec = WorkshopStockDefinition & {
  source: 'main' | 'warehouse' | 'finished' | 'sulfuric';
  incomingField?: string;
  outgoingField?: string;
  outgoingFields?: string[];
  closingField?: string;
  outgoingMetric?: string;
};

@Injectable()
export class OverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly production: ProductionService,
  ) {}

  /** 产成品/仓库日报：填报日 D 的产销或购耗归 D−1，库存快照归 D。 */
  async byDate(code: string): Promise<ByDate> {
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
    const splitStockDate = code === CODE.finished || code === CODE.warehouse;
    const fields = form.schema as unknown as FormField[];
    for (const s of submissions) {
      const date = (s.data as FormData)[dateField.id];
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const data = s.data as FormData;
        if (splitStockDate) {
          for (const field of fields) {
            if (field.id === dateField.id || !Object.prototype.hasOwnProperty.call(data, field.id)) continue;
            const businessDate = field.title.endsWith('库存') ? date : this.dayBefore(date);
            const merged = map.get(businessDate) ?? { [dateField.id]: businessDate };
            merged[field.id] = data[field.id];
            map.set(businessDate, merged);
          }
          continue;
        }
        const directDate = code === CODE.anthraquinone || (code === CODE.fenglian && date >= '2026-09-01');
        map.set(directDate ? date : this.dayBefore(date), data);
      }
    }
    return map;
  }

  /** 全部日期并集取最后 N 天；0 表示全部历史。 */
  private windowOf(sources: Array<Map<string, unknown>>, days: number): string[] {
    const all = new Set<string>();
    for (const s of sources) for (const d of s.keys()) all.add(d);
    const dates = [...all].sort();
    return days === 0 ? dates : dates.slice(-days);
  }

  private dayBefore(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  /** 旧系统迁入的数据把数字存成字符串（"56"），读取时兼容两种形态 */
  private static toNum(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
  }

  /** 仪表读数差 × 倍率的日序列（跨断天为 null，不把多天用量拆成日值；负差归 0） */
  private meterSeries(
    source: ByDate,
    dates: string[],
    fields: Array<{ field: string; multiplier: number; reverse?: boolean; maxDelta?: number }>,
  ): Array<number | null> {
    return dates.map((date) => {
      const current = source.get(date);
      const prev = source.get(this.dayBefore(date));
      if (!current || !prev) return null;
      let total = 0;
      let seen = false;
      for (const { field, multiplier, reverse, maxDelta } of fields) {
        const a = OverviewService.toNum(prev[field]);
        const b = OverviewService.toNum(current[field]);
        if (a === null || b === null) continue;
        seen = true;
        const delta = (b - a) * (reverse ? -1 : 1);
        total += maxDelta !== undefined && delta > maxDelta ? 0 : Math.max(0, delta * multiplier);
      }
      return seen ? +total.toFixed(2) : null;
    });
  }

  /** 直接上报字段的日序列（多字段求和；全部缺失为 null） */
  reportedSeries(source: ByDate, dates: string[], fields: string[]): Array<number | null> {
    return dates.map((date) => {
      const data = source.get(date);
      if (!data) return null;
      let total = 0;
      let seen = false;
      for (const field of fields) {
        const v = OverviewService.toNum(data[field]);
        if (v !== null) {
          seen = true;
          total += v;
        }
      }
      return seen ? total : null;
    });
  }

  private sumReportedFields(data: FormData | undefined, fields: string[]): number | null {
    if (!data) return null;
    const values = fields.map((field) => OverviewService.toNum(data[field])).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }

  private anthraquinoneGasUsage(source: ByDate, date: string): number | null {
    const current = source.get(date);
    const reported = OverviewService.toNum(current?.field_gas_consumption);
    if (reported !== null) return reported;
    const stock = OverviewService.toNum(current?.field_gas_meter);
    const previous = OverviewService.toNum(source.get(this.dayBefore(date))?.field_gas_meter);
    if (stock === null || previous === null) return null;
    const purchase = OverviewService.toNum(current?.field_gas_recharge) ?? 0;
    const usage = previous + purchase - stock;
    return usage >= 0 ? +usage.toFixed(3) : null;
  }

  private static sumOrNull(...values: Array<number | null>): number | null {
    if (values.every((v) => v === null)) return null;
    return +values.reduce<number>((s, v) => s + (v ?? 0), 0).toFixed(2);
  }

  private thermalDay(date: string, source: ByDate): ThermalDaySummary {
    const current = source.get(date);
    const previous = source.get(this.dayBefore(date));
    const meter = (field: string, multiplier = 1, adjustment = 0): ThermalMeterValue => {
      const previousReading = previous ? OverviewService.toNum(previous[field]) : null;
      const currentReading = current ? OverviewService.toNum(current[field]) : null;
      const reset = previousReading !== null && currentReading !== null && currentReading < previousReading;
      const delta = previousReading !== null && currentReading !== null
        ? reset ? currentReading : currentReading - previousReading : null;
      return {
        previousReading, currentReading, delta,
        value: delta === null ? null : +(delta * multiplier + adjustment).toFixed(3),
        ...(reset ? { reset: true } : {}),
        ...(adjustment ? { adjustment } : {}),
      };
    };
    const outlets = Object.fromEntries(THERMAL_OUTLETS.map((outlet) => [
      outlet.key,
      // b2 源系统对 2026-08-03 建衡蒸汽有一次已知的 −51.97 t 修正。
      meter(outlet.field, 1, outlet.key === 'jianheng' && date === '2026-08-03' ? -51.97 : 0),
    ])) as Record<string, ThermalMeterValue>;
    const totalOf = (group: 'external' | 'internal') => {
      const values = THERMAL_OUTLETS.filter((outlet) => outlet.group === group).map((outlet) => outlets[outlet.key].value);
      return values.every((value): value is number => value !== null)
        ? +values.reduce<number>((sum, value) => sum + value!, 0).toFixed(3) : null;
    };
    const externalTotal = totalOf('external');
    const internalTotal = totalOf('internal');
    return {
      date, outlets, externalTotal, internalTotal,
      totalSupply: externalTotal !== null && internalTotal !== null ? +(externalTotal + internalTotal).toFixed(3) : null,
      generation: meter('field_condenser_gen_active', 12000),
      water: meter('field_water_meter'),
      steamMeter: meter('field_steam_meter'),
    };
  }

  /** 热电：分路供汽、发电、总水表与蒸汽总表，均归属填报前一日。 */
  async thermalSummary(days = 30): Promise<ThermalSummaryResult> {
    const thermal = await this.byDate(CODE.thermal);
    const dates = this.windowOf([thermal], days);
    return {
      outlets: THERMAL_OUTLETS.map(({ key, name, group }) => ({ key, name, group })),
      days: dates.map((date) => this.thermalDay(date, thermal)),
    };
  }

  // ── 车间版面 ─────────────────────────────────────────────

  async workshopOverview(days = 30): Promise<WorkshopOverviewResult> {
    const [sulfuric, amino, magnesium, anthraquinone, fenglian, thermal, finished] = await Promise.all([
      this.production.sulfuricSummary(days),
      this.byDate(CODE.amino),
      this.byDate(CODE.magnesium),
      this.byDate(CODE.anthraquinone),
      this.byDate(CODE.fenglian),
      this.byDate(CODE.thermal),
      this.byDate(CODE.finished),
    ]);

    const sulfuricByDate = new Map<string, unknown>(
      sulfuric.days.map((d) => [d.productionDate, d.production?.total98Equivalent ?? null]),
    );
    const dates = this.windowOf(
      [sulfuricByDate, amino, magnesium, finished, anthraquinone, fenglian, thermal],
      days,
    );
    const aminoReported = this.reportedSeries(amino, dates, ['field_production']);
    const aminoFinished = this.reportedSeries(finished, dates, ['field_001']);
    const magnesiumReported = this.reportedSeries(magnesium, dates, ['field_mgso4_production']);
    const magnesiumFinished = this.reportedSeries(finished, dates, ['field_004']);

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
        values: aminoFinished.map((value, index) => value ?? aminoReported[index]),
      },
      {
        code: 'magnesium',
        name: '硫酸镁',
        unit: 't',
        values: magnesiumFinished.map((value, index) => value ?? magnesiumReported[index]),
      },
      {
        code: 'hydrotalcite',
        name: '水滑石',
        unit: 't',
        values: this.reportedSeries(finished, dates, ['field_007', 'field_hg200a_production', 'field_010', 'field_013', 'field_016']),
      },
      {
        code: 'anthraquinone',
        name: '蒽醌',
        unit: 't',
        values: this.reportedSeries(anthraquinone, dates, ['field_crude_output', 'field_fine_output']),
      },
      {
        code: 'fenglian',
        name: '丰联',
        unit: 't',
        values: this.reportedSeries(fenglian, dates, ['field_204']),
      },
      {
        code: 'thermal',
        name: '热电',
        unit: 't',
        values: dates.map((date) => thermal.has(date) ? this.thermalDay(date, thermal).totalSupply : null),
      },
    ];
    return { dates, workshops };
  }

  /** 氨基磺酸车间：能耗表差值、原料日报耗用与三项期末库存。 */
  async aminoSummary(days = 30): Promise<AminoSummaryResult> {
    const [amino, sulfuric, warehouse, finished, meters, sulfuricSummary] = await Promise.all([
      this.byDate(CODE.amino),
      this.byDate(CODE.sulfuric),
      this.byDate(CODE.warehouse),
      this.byDate(CODE.finished),
      this.prisma.meter.findMany({ where: { formCode: CODE.sulfuric, fieldId: 'meter_amino' } }),
      this.production.sulfuricSummary(days),
    ]);
    const dates = this.windowOf([amino, finished, warehouse], days);
    const phase1 = this.meterSeries(sulfuric, dates, [
      { field: 'meter_amino', multiplier: meters[0]?.multiplier ?? 3000 },
    ]);
    const phase2 = this.meterSeries(amino, dates, [
      { field: 'field_electricity_meter', multiplier: AMINO_PHASE2_ELECTRICITY_MULTIPLIER },
    ]);
    const steam = this.meterSeries(amino, dates, [
      { field: 'field_steam_1', multiplier: 1 },
      { field: 'field_steam_2', multiplier: 1 },
      { field: 'field_steam_phase2', multiplier: 1 },
    ]);
    const water = this.meterSeries(amino, dates, [{ field: 'field_water_meter', multiplier: 1 }]);
    const sulfuricByDate = new Map(sulfuricSummary.days.map((d) => [d.productionDate, d]));
    const read = (data: FormData | undefined, field: string) => data ? OverviewService.toNum(data[field]) : null;
    return {
      days: dates.map((date, i) => {
        const acidVolume = read(amino.get(date), 'field_nitric_acid');
        return {
          date,
          production: read(finished.get(date), 'field_001') ?? read(amino.get(date), 'field_production'),
          electricity: phase1[i] === null && phase2[i] === null ? null : OverviewService.sumOrNull(phase1[i], phase2[i]),
          steam: steam[i],
          water: water[i],
          urea: read(warehouse.get(date), 'field_017') ?? read(amino.get(date), 'field_urea'),
          fuming: acidVolume === null ? null : +(acidVolume * 1.92).toFixed(3),
          finishedProduction: read(finished.get(date), 'field_001'),
          finishedSales: read(finished.get(date), 'field_002'),
          finishedStock: read(finished.get(date), 'field_003'),
          ureaPurchase: read(warehouse.get(date), 'field_016'),
          ureaWarehouseConsumption: read(warehouse.get(date), 'field_017'),
          ureaStock: read(warehouse.get(date), 'field_018'),
          fumingStock: sulfuricByDate.get(date)?.inventory?.fuming ?? null,
        };
      }),
    };
  }

  /** 丰联三车间与标准厂房的日报原值，保留 Excel 的空白和日期。 */
  async fenglianSummary(days = 30): Promise<FenglianSummaryResult> {
    const [form, reports] = await Promise.all([
      this.prisma.form.findUnique({ where: { code: CODE.fenglian } }),
      this.byDate(CODE.fenglian),
    ]);
    const fields = ((form?.schema ?? []) as never as FormField[]).filter((field) => field.type === 'number');
    const dates = this.windowOf([reports], days);
    return {
      fields,
      days: dates.map((date) => ({
        date,
        values: Object.fromEntries(fields.map((field) => [field.id, OverviewService.toNum(reports.get(date)?.[field.id])])),
      })),
    };
  }

  /** 三个车间的统一明细；蒽醌按附件日期直接归属。 */
  async detailedWorkshop(code: DetailedWorkshopCode, days = 30): Promise<DetailedWorkshopResult> {
    if (code !== 'magnesium' && code !== 'hydrotalcite' && code !== 'anthraquinone') {
      throw new BadRequestException('不支持的车间');
    }
    const formCode = CODE[code];
    const [main, warehouse, finished, sulfuricSummary] = await Promise.all([
      this.byDate(formCode), this.byDate(CODE.warehouse), this.byDate(CODE.finished),
      this.production.sulfuricSummary(days),
    ]);
    const dates = this.windowOf([main, warehouse, finished], days);
    const sulfuricByDate = new Map(sulfuricSummary.days.map((day) => [day.productionDate, day]));
    const read = (data: FormData | undefined, field?: string): number | null =>
      data && field ? OverviewService.toNum(data[field]) : null;
    const finishedStock = (key: string, name: string, incomingField: string, outgoingField: string, closingField: string): StockSpec =>
      ({ key, name, kind: 'finished', incomingLabel: '产量', outgoingLabel: '销量', unit: 't', source: 'finished', incomingField, outgoingField, closingField });
    const rawStock = (key: string, name: string, incomingField: string, outgoingField: string, closingField: string): StockSpec =>
      ({ key, name, kind: 'raw', incomingLabel: '购入', outgoingLabel: '耗用', unit: 't', source: 'warehouse', incomingField, outgoingField, closingField });

    let productionFields: string[];
    let productionLabel: string;
    let metrics: MetricSpec[];
    let stocks: StockSpec[];

    if (code === 'magnesium') {
      productionFields = ['field_mgso4_production'];
      productionLabel = '硫酸镁产量';
      metrics = [
        { key: 'electricity', name: '用电', unit: 'kWh', category: 'energy', featured: true, meter: [
          { field: 'field_electricity_phase1', multiplier: MAGNESIUM_PHASE1_ELECTRICITY_MULTIPLIER },
          { field: 'field_electricity_phase2', multiplier: MAGNESIUM_PHASE2_ELECTRICITY_MULTIPLIER },
        ] },
        { key: 'steam', name: '蒸汽', unit: 't', category: 'energy', featured: true, meter: [{ field: 'field_steam_flow', multiplier: 1 }] },
        { key: 'water', name: '水', unit: 'm³', category: 'energy', featured: true, meter: [{ field: 'field_water_meter', multiplier: 1 }] },
        { key: 'mgo', name: '氧化镁', unit: 't', category: 'raw', featured: true, field: 'field_mgo_consumption' },
        { key: 'sulfuric93', name: '93% 酸', unit: 'm³', category: 'raw', featured: true, field: 'field_sulfuric_93' },
        { key: 'aminoDilute', name: '氨基磺酸稀酸', unit: 'm³', category: 'raw', featured: false, field: 'field_amino_dilute_acid' },
        { key: 'anthraDilute', name: '蒽醌稀酸', unit: 'm³', category: 'raw', featured: false, field: 'field_anthraquinone_dilute_acid' },
      ];
      stocks = [
        finishedStock('magnesium', '硫酸镁', 'field_004', 'field_005', 'field_006'),
        rawStock('mgo', '氧化镁', 'field_019', 'field_020', 'field_021'),
        ...[
          ['sulfuric93', '93% 酸', 'field_sulfuric_93'],
          ['aminoDilute', '氨基磺酸稀酸', 'field_amino_dilute_acid'],
          ['anthraDilute', '蒽醌稀酸', 'field_anthraquinone_dilute_acid'],
        ].map(([key, name, outgoingField]): StockSpec => ({
          key, name, kind: 'raw', incomingLabel: '领入', outgoingLabel: '耗用', unit: 'm³', source: 'main', outgoingField,
          note: '日报未单列领入和库存',
        })),
      ];
    } else if (code === 'hydrotalcite') {
      productionFields = ['field_hg200_output', 'field_hg201_output', 'field_hg300_output', 'field_hg205_output'];
      productionLabel = '水滑石合计产量';
      metrics = [
        { key: 'mediumSteam', name: '中压蒸汽', unit: 't', category: 'energy', featured: true, meter: [{ field: 'field_medium_pressure_steam', multiplier: 0.001 }] },
        { key: 'lowSteam', name: '低压蒸汽', unit: 't', category: 'energy', featured: true, meter: [{ field: 'field_low_pressure_steam', multiplier: 0.001 }] },
        { key: 'mgo', name: '高活性氧化镁', unit: 't', category: 'raw', featured: true, field: 'field_mgo' },
        { key: 'aluminum', name: '氢氧化铝', unit: 't', category: 'raw', featured: true, field: 'field_aluminum_hydroxide' },
        { key: 'soda', name: '纯碱', unit: 't', category: 'raw', featured: true, field: 'field_soda_ash' },
      ];
      stocks = [
        finishedStock('hg200', 'HG-200', 'field_007', 'field_008', 'field_009'),
        finishedStock('hg200a', 'HG-200A', 'field_hg200a_production', 'field_hg200a_sales', 'field_hg200a_stock'),
        finishedStock('hg201', 'HG-201', 'field_010', 'field_011', 'field_012'),
        finishedStock('hg300', 'HG-300', 'field_013', 'field_014', 'field_015'),
        finishedStock('hg205', 'HG-205', 'field_016', 'field_017', 'field_018'),
        rawStock('soda', '纯碱', 'field_022', 'field_023', 'field_024'),
        rawStock('mgo', '高活性氧化镁', 'field_025', 'field_026', 'field_027'),
        rawStock('aluminum', '氢氧化铝', 'field_028', 'field_029', 'field_030'),
      ];
    } else {
      productionFields = ['field_crude_output', 'field_fine_output'];
      productionLabel = '粗品 + 精品产量';
      metrics = [
        { key: 'electricity', name: '用电', unit: 'kWh', category: 'energy', featured: true, meter: [{ field: 'field_electricity_meter', multiplier: 600, maxDelta: 500 }] },
        { key: 'steam', name: '蒸汽', unit: 't', category: 'energy', featured: true, meter: [{ field: 'field_steam_meter', multiplier: 1 }] },
        { key: 'water', name: '水', unit: 'm³', category: 'energy', featured: true, meter: [{ field: 'field_water_meter', multiplier: 1 }] },
        { key: 'gas', name: '天然气', unit: 'm³', category: 'energy', featured: true, meter: [{ field: 'field_gas_meter', multiplier: 1, reverse: true }] },
        { key: 'fuming', name: '发烟硫酸', unit: 't', category: 'raw', featured: true, meter: [{ field: 'field_fuming_sulfuric_flow', multiplier: 1.92 }] },
        ...[
          ['toluene', '甲苯', 'field_toluene_consumption'],
          ['ethylbenzene', '乙苯', 'field_ethylbenzene_consumption'],
          ['chlorobenzene', '氯苯', 'field_chlorobenzene_consumption'],
          ['phthalic', '苯酐', 'field_phthalic_anhydride_consumption'],
          ['alcl3', '无水三氯化铝', 'field_alcl3_consumption'],
          ['carbon', '活性炭', 'field_carbon_consumption'],
          ['lye', '液碱', 'field_lye_consumption'],
          ['flake', '片碱', 'field_flake_caustic_consumption'],
          ['granular', '粒碱', 'field_granular_caustic_consumption'],
        ].map(([key, name, field]): MetricSpec => ({ key, name, field, unit: 't', category: 'raw', featured: false })),
      ];
      stocks = [
        { key: 'crude', name: '蒽醌粗品', kind: 'finished', incomingLabel: '产量', outgoingLabel: '销量', unit: 't', source: 'main', incomingField: 'field_crude_output', outgoingField: 'field_crude_sales', closingField: 'field_crude_stock' },
        { key: 'fine', name: '蒽醌精品', kind: 'finished', incomingLabel: '产量', outgoingLabel: '销量', unit: 't', source: 'main', incomingField: 'field_fine_output', outgoingField: 'field_fine_sales', closingField: 'field_fine_stock' },
        { key: 'dilute', name: '蒽醌稀酸', kind: 'finished', incomingLabel: '产量', outgoingLabel: '出库', unit: 't', source: 'main', incomingField: 'field_dilute_output', outgoingFields: ['field_dilute_out_v2006', 'field_dilute_out_v2009b'], closingField: 'field_dilute_stock' },
        ...[
          ['toluene', '甲苯', 'field_toluene'], ['ethylbenzene', '乙苯', 'field_ethylbenzene'],
          ['chlorobenzene', '氯苯', 'field_chlorobenzene'], ['phthalic', '苯酐', 'field_phthalic_anhydride'],
          ['alcl3', '无水三氯化铝', 'field_alcl3'], ['carbon', '活性炭', 'field_carbon'],
          ['lye', '液碱', 'field_lye'], ['flake', '片碱', 'field_flake_caustic'],
          ['granular', '粒碱', 'field_granular_caustic'],
        ].map(([key, name, prefix]): StockSpec => ({
          key, name, kind: 'raw', incomingLabel: '购入', outgoingLabel: '耗用', unit: 't', source: 'main',
          incomingField: `${prefix}_purchase`, outgoingField: `${prefix}_consumption`, closingField: `${prefix}_stock`,
        })),
        { key: 'fuming', name: '发烟硫酸', kind: 'raw', incomingLabel: '领入', outgoingLabel: '耗用', unit: 't', source: 'sulfuric', outgoingMetric: 'fuming', note: '硫酸罐区库存；无独立领入记录' },
      ];
    }

    const metricSeries = new Map(metrics.map((metric) => [metric.key, metric.meter
      ? this.meterSeries(main, dates, metric.meter)
      : dates.map((date) => {
        const warehouseField = code === 'hydrotalcite'
          ? { mgo: 'field_026', aluminum: 'field_029', soda: 'field_023' }[metric.key]
          : code === 'magnesium' && metric.key === 'mgo' ? 'field_020' : undefined;
        const value = read(warehouse.get(date), warehouseField) ?? read(main.get(date), metric.field);
        return value === null ? null : value * (metric.factor ?? 1);
      }),
    ]));
    if (code === 'anthraquinone') {
      metricSeries.set('gas', dates.map((date) => this.anthraquinoneGasUsage(main, date)));
    }
    return {
      code, productionLabel,
      metrics: metrics.map(({ key, name, unit, category, featured }) => ({ key, name, unit, category, featured })),
      stockItems: stocks.map(({ key, name, kind, incomingLabel, outgoingLabel, unit, note }) => ({ key, name, kind, incomingLabel, outgoingLabel, unit, note })),
      days: dates.map((date, index) => {
        const productionValues = code === 'hydrotalcite'
          ? ['field_007', 'field_hg200a_production', 'field_010', 'field_013', 'field_016'].map((field) => read(finished.get(date), field))
          : code === 'magnesium'
            ? [read(finished.get(date), 'field_004') ?? read(main.get(date), productionFields[0])]
            : productionFields.map((field) => read(main.get(date), field));
        const present = productionValues.filter((value): value is number => value !== null);
        const values = Object.fromEntries(metrics.map((metric) => [metric.key, metricSeries.get(metric.key)?.[index] ?? null]));
        const stockValues = Object.fromEntries(stocks.map((stock) => {
          const data = stock.source === 'warehouse' ? warehouse.get(date) : stock.source === 'finished' ? finished.get(date) : main.get(date);
          return [stock.key, {
            incoming: read(data, stock.incomingField),
            outgoing: stock.outgoingMetric ? values[stock.outgoingMetric]
              : stock.outgoingFields ? this.sumReportedFields(data, stock.outgoingFields)
                : read(data, stock.outgoingField),
            closing: stock.source === 'sulfuric' ? sulfuricByDate.get(date)?.inventory?.fuming ?? null : read(data, stock.closingField),
          }];
        }));
        return {
          date,
          production: present.length ? present.reduce((sum, value) => sum + value, 0) : null,
          metrics: values,
          stocks: stockValues,
        };
      }),
    };
  }

  // ── 能源中心 ─────────────────────────────────────────────

  async energy(days = 30): Promise<EnergyResult> {
    const [sulfuric, amino, magnesium, anthraquinone, thermal, meters, sulfuricSummary] = await Promise.all([
      this.byDate(CODE.sulfuric),
      this.byDate(CODE.amino),
      this.byDate(CODE.magnesium),
      this.byDate(CODE.anthraquinone),
      this.byDate(CODE.thermal),
      this.prisma.meter.findMany({ where: { formCode: CODE.sulfuric } }),
      this.production.sulfuricSummary(days),
    ]);
    const multiplierOf = (fieldId: string): number =>
      meters.find((m) => m.fieldId === fieldId)?.multiplier ?? 1;

    const dates = this.windowOf([sulfuric, amino, magnesium, anthraquinone, thermal], days);
    const sulfuricElectricity = new Map(sulfuricSummary.days.map((day) => [day.productionDate, day.electricity?.total ?? null]));

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
            values: dates.map((date) => sulfuricElectricity.get(date) ?? null),
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
            values: this.meterSeries(anthraquinone, dates, [{ field: 'field_electricity_meter', multiplier: 600, maxDelta: 500 }]),
          },
        ],
        // b2 thermal.service 仅对 1# 冷凝机发电表使用 12000 倍率；2# 进线未参与原热电计算。
        generation: this.meterSeries(thermal, dates, [{ field: 'field_condenser_gen_active', multiplier: 12000 }]),
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
  ): Array<{ name: string; group: string; unit: string; a?: string; b?: string; c?: string }> {
    const byName = new Map<string, { name: string; group: string; unit: string; a?: string; b?: string; c?: string }>();
    for (const field of schema) {
      const title = field.title ?? '';
      for (const [suffix, slot] of Object.entries(suffixes)) {
        if (title.endsWith(suffix) && title !== suffix) {
          const name = title.slice(0, -suffix.length);
          const key = `${field.group ?? ''}\u0000${name}`;
          const entry = byName.get(key) ?? { name, group: field.group ?? '', unit: field.unit ?? 't' };
          if (slot === 'c') entry.unit = field.unit ?? 't';
          entry[slot] = field.id;
          byName.set(key, entry);
        }
      }
    }
    return [...byName.values()];
  }

  async materials(): Promise<MaterialsResult> {
    const [warehouse, finished, magnesium, amino, anthraquinone, fenglian, sulfuric, warehouseForm, finishedForm, anthraquinoneForm, fenglianForm] =
      await Promise.all([
        this.byDate(CODE.warehouse),
        this.byDate(CODE.finished),
        this.byDate(CODE.magnesium),
        this.byDate(CODE.amino),
        this.byDate(CODE.anthraquinone),
        this.byDate(CODE.fenglian),
        this.production.sulfuricSummary(2),
        this.prisma.form.findUnique({ where: { code: CODE.warehouse } }),
        this.prisma.form.findUnique({ where: { code: CODE.finished } }),
        this.prisma.form.findUnique({ where: { code: CODE.anthraquinone } }),
        this.prisma.form.findUnique({ where: { code: CODE.fenglian } }),
      ]);

    const latestOf = (m: ByDate): { date: string; data: FormData } | null => {
      const dates = [...m.keys()].sort();
      const date = dates[dates.length - 1];
      return date ? { date, data: m.get(date)! } : null;
    };
    const pick = (data: FormData, field?: string): number | null =>
      field ? OverviewService.toNum(data[field]) : null;
    const latestRecorded = (rows: ByDate, field?: string): { date: string; value: number } | null => {
      if (!field) return null;
      for (const date of [...rows.keys()].sort().reverse()) {
        const value = OverviewService.toNum(rows.get(date)?.[field]);
        if (value !== null) return { date, value };
      }
      return null;
    };

    // 每张来源表独立取最新记录；填报日 D 的仓库/产成品库存归 D，流量归 D−1。
    // 蒽醌和丰联的历史表已按业务日入库，继续使用各自的原日期。
    const rawMaterials: RawMaterialStockItem[] = [];
    const rawSources = [
      { code: CODE.warehouse, form: warehouseForm, rows: warehouse, workshop: '', split: true },
      { code: CODE.anthraquinone, form: anthraquinoneForm, rows: anthraquinone, workshop: '蒽醌', split: false },
      { code: CODE.fenglian, form: fenglianForm, rows: fenglian, workshop: '丰联', split: false },
    ];
    for (const source of rawSources) {
      const latest = latestOf(source.rows);
      if (!source.form || !latest) continue;
      const activityDate = source.split ? this.dayBefore(latest.date) : latest.date;
      const activity = source.rows.get(activityDate) ?? {};
      const triplets = OverviewService.fieldTriplets(source.form.schema as never as FormField[], {
        购入: 'a', 入库: 'a', 耗用: 'b', 消耗: 'b', 库存: 'c', 剩余: 'c',
      }).filter((t) => {
        if (!t.c || (!t.a && !t.b)) return false;
        if (source.code === CODE.anthraquinone) return ['原辅料', '包材', '天然气', '干化'].includes(t.group);
        if (source.code === CODE.fenglian) return !t.name.startsWith('焦磷酸哌嗪呆滞品');
        return true;
      });
      const recentDates = [...source.rows.keys()].filter((d) => d <= activityDate).sort().slice(-7);
      for (const t of triplets) {
        const recordedStock = latestRecorded(source.rows, t.c);
        const stock = recordedStock?.value ?? null;
        const recent = recentDates
          .map((d) => OverviewService.toNum(source.rows.get(d)![t.b ?? '']))
          .filter((v): v is number => v !== null);
        const avg = recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : 0;
        const daysOfUse = stock !== null && avg > 0 ? +(stock / avg).toFixed(1) : null;
        rawMaterials.push({
          name: t.name,
          workshop: source.workshop ? `${source.workshop}·${t.group}` : t.group,
          unit: t.unit,
          stockDate: recordedStock?.date ?? '',
          activityDate,
          stock,
          purchase: pick(activity, t.a),
          consumption: pick(activity, t.b),
          daysOfUse,
          alert: daysOfUse === null ? null : daysOfUse < 3 ? 'low3' : daysOfUse < 7 ? 'low7' : null,
        });
      }
    }

    // 产成品表、硫酸差值法、蒽醌与丰联表各自保留来源日期和完整品种。
    const finishedProducts: FinishedProductItem[] = [];
    const productItem = (
      name: string,
      workshop: string,
      activityDate: string,
      stockDate: string,
      activity: FormData,
      stockData: FormData,
      fields: { production?: string; sales?: string[]; stock?: string },
      stockRows?: ByDate,
    ): FinishedProductItem => {
      const production = pick(activity, fields.production);
      const salesValues = (fields.sales ?? []).map((field) => pick(activity, field)).filter((value): value is number => value !== null);
      const sales = salesValues.length ? +salesValues.reduce((sum, value) => sum + value, 0).toFixed(3) : null;
      const recordedStock = stockRows ? latestRecorded(stockRows, fields.stock) : null;
      const stock = recordedStock?.value ?? pick(stockData, fields.stock);
      return {
        name, workshop, activityDate, stockDate: recordedStock?.date ?? (stock === null ? '' : stockDate),
        production,
        sales,
        stock,
        salesRatio: production && production > 0 && sales !== null ? +(sales / production).toFixed(2) : null,
        stockDays: stock !== null && sales && sales > 0 ? +(stock / sales).toFixed(1) : null,
      };
    };
    const finishedLatest = latestOf(finished);
    if (finishedForm && finishedLatest) {
      const activityDate = this.dayBefore(finishedLatest.date);
      const activity = finished.get(activityDate) ?? {};
      const triplets = OverviewService.fieldTriplets(finishedForm.schema as never as FormField[], {
        产量: 'a',
        销量: 'b',
        库存: 'c',
      });
      for (const t of triplets) {
        finishedProducts.push(
          productItem(t.name, t.group, activityDate, finishedLatest.date, activity, finishedLatest.data,
            { production: t.a, sales: t.b ? [t.b] : [], stock: t.c }, finished),
        );
      }
    }
    const sulfuricToday = sulfuric.days[sulfuric.days.length - 1];
    if (sulfuricToday) {
      const production = sulfuricToday.production;
      const flow = production?.flow;
      const sales = flow
        ? +(flow.acid98 + flow.acid93 + flow.reagent + flow.fuming).toFixed(3)
        : null;
      finishedProducts.unshift({
        name: '硫酸（四酸合计·折98）',
        workshop: '硫酸',
        activityDate: sulfuricToday.productionDate,
        stockDate: sulfuricToday.date,
        production: sulfuricToday.production?.total98Equivalent ?? null,
        sales,
        stock: sulfuricToday.inventory?.total ?? null,
        salesRatio: null,
        stockDays: null,
      });
      const acids = [
        { name: '98%硫酸', production: production?.acid98, sales: flow?.acid98, stock: sulfuricToday.inventory?.acid98 },
        { name: '93%硫酸', production: production?.acid93, sales: flow?.acid93, stock: null },
        { name: '试剂酸', production: production?.reagent, sales: flow?.reagent, stock: sulfuricToday.inventory?.reagent },
        { name: '发烟硫酸', production: production?.fuming, sales: flow?.fuming, stock: sulfuricToday.inventory?.fuming },
      ];
      finishedProducts.splice(1, 0, ...acids.map((acid) => ({
        name: acid.name, workshop: '硫酸', activityDate: sulfuricToday.productionDate, stockDate: acid.stock == null ? '' : sulfuricToday.date,
        production: acid.production ?? null, sales: acid.sales ?? null, stock: acid.stock ?? null,
        salesRatio: null, stockDays: null,
      })));
    }
    const anthraquinoneLatest = latestOf(anthraquinone);
    if (anthraquinoneForm && anthraquinoneLatest) {
      const triplets = OverviewService.fieldTriplets(anthraquinoneForm.schema as never as FormField[], {
        产量: 'a', 销量: 'b', 库存: 'c',
      }).filter((t) => t.group === '产成品');
      for (const t of triplets) {
        finishedProducts.push(productItem(t.name, '蒽醌', anthraquinoneLatest.date, anthraquinoneLatest.date,
          anthraquinoneLatest.data, anthraquinoneLatest.data, { production: t.a, sales: t.b ? [t.b] : [], stock: t.c }, anthraquinone));
      }
      finishedProducts.push(productItem('稀酸', '蒽醌', anthraquinoneLatest.date, anthraquinoneLatest.date,
        anthraquinoneLatest.data, anthraquinoneLatest.data,
        { production: 'field_dilute_output', sales: ['field_dilute_out_v2006', 'field_dilute_out_v2009b'], stock: 'field_dilute_stock' }, anthraquinone));
    }
    const fenglianLatest = latestOf(fenglian);
    if (fenglianForm && fenglianLatest) {
      const triplets = OverviewService.fieldTriplets(fenglianForm.schema as never as FormField[], {
        产量: 'a', 销量: 'b', 出库: 'b', 库存: 'c',
      }).filter((t) => t.a && t.c);
      for (const t of triplets) {
        finishedProducts.push(productItem(t.name, `丰联·${t.group}`, fenglianLatest.date, fenglianLatest.date,
          fenglianLatest.data, fenglianLatest.data, { production: t.a, sales: t.b ? [t.b] : [], stock: t.c }, fenglian));
      }
      finishedProducts.push(productItem('焦磷酸哌嗪成品', '丰联·标准厂房', fenglianLatest.date, fenglianLatest.date,
        fenglianLatest.data, fenglianLatest.data, { production: 'field_204', sales: ['field_205'], stock: 'field_206' }, fenglian));
      finishedProducts.push(productItem('焦磷酸哌嗪呆滞品', '丰联·标准厂房', fenglianLatest.date, fenglianLatest.date,
        fenglianLatest.data, fenglianLatest.data,
        { production: 'field_dry_sluggish_output', stock: 'field_dry_sluggish_stock' }, fenglian));
    }

    // 车间间物料往来（当日值；酸的体积量 ×密度 折吨）
    const internalFlows: InternalFlowItem[] = [];
    const flowQty = (data: FormData | undefined, field: string, times = 1): number | null => {
      if (!data) return null;
      const v = OverviewService.toNum(data[field]);
      return v === null ? null : +(v * times).toFixed(3);
    };
    const aminoLatest = latestOf(amino);
    const mgLatest = latestOf(magnesium);
    if (aminoLatest) {
      internalFlows.push({ from: '硫酸', to: '氨基磺酸', material: '发烟硫酸', date: aminoLatest.date, quantity: flowQty(aminoLatest.data, 'field_nitric_acid', 1.92) });
    }
    if (anthraquinoneLatest) {
      const current = OverviewService.toNum(anthraquinoneLatest.data.field_fuming_sulfuric_flow);
      const previous = OverviewService.toNum(anthraquinone.get(this.dayBefore(anthraquinoneLatest.date))?.field_fuming_sulfuric_flow);
      internalFlows.push({
        from: '硫酸', to: '蒽醌', material: '发烟硫酸',
        date: anthraquinoneLatest.date,
        quantity: current !== null && previous !== null && current >= previous
          ? +((current - previous) * 1.92).toFixed(3) : null,
      });
    }
    if (mgLatest) {
      internalFlows.push({ from: '硫酸', to: '硫酸镁', material: '93%酸', date: mgLatest.date, quantity: flowQty(mgLatest.data, 'field_sulfuric_93', 1.84) });
      internalFlows.push({ from: '氨基磺酸', to: '硫酸镁', material: '稀酸', date: mgLatest.date, quantity: flowQty(mgLatest.data, 'field_amino_dilute_acid') });
      internalFlows.push({ from: '蒽醌', to: '硫酸镁', material: '稀酸', date: mgLatest.date, quantity: flowQty(mgLatest.data, 'field_anthraquinone_dilute_acid') });
    }

    const date = [latestOf(warehouse)?.date, finishedLatest?.date, sulfuricToday?.date, anthraquinoneLatest?.date, fenglianLatest?.date]
      .filter((value): value is string => !!value).sort().at(-1) ?? '';
    return { date, rawMaterials, finishedProducts, internalFlows };
  }

// ── 车间版面·库存卡片 ─────────────────────────────────────

  /** 硫酸系统指定生产归属日的期末液位；不指定时取最新。 */
  async tankLevels(requestedDate?: string): Promise<TankLevelsResult> {
    const [sulfuric, tanks] = await Promise.all([
      this.byDate(CODE.sulfuric),
      this.prisma.tank.findMany({ where: { formCode: CODE.sulfuric }, orderBy: { fieldId: 'asc' } }),
    ]);
    const dates = [...sulfuric.keys()].sort();
    const date = requestedDate ?? dates[dates.length - 1] ?? '';
    const data = date ? sulfuric.get(date)! : undefined;

    const byMaterial = new Map<string, TankLevelItem[]>();
    for (const tank of tanks) {
      const level = data ? OverviewService.toNum(data[tank.fieldId]) : null;
      const item: TankLevelItem = {
        fieldId: tank.fieldId,
        name: tank.name,
        levelPercent: level,
        tons: level === null ? null : +((level / 100) * tank.capacity * tank.density).toFixed(1),
        capacity: tank.capacity,
        density: tank.density,
      };
      const list = byMaterial.get(tank.material) ?? [];
      list.push(item);
      byMaterial.set(tank.material, list);
    }
    const groups: TankMaterialGroup[] = [...byMaterial.entries()].map(([material, list]) => ({
      material,
      totalTons: +list.reduce((s, t) => s + (t.tons ?? 0), 0).toFixed(1),
      tanks: list,
    }));
    return { date, groups };
  }
}
