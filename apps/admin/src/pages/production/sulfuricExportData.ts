import type { SulfuricDaySummary, SulfuricParkingRecord } from '@hgxt/shared';
import { averageRecorded } from './workshopMonthly';
import { parkingDurationMinutes } from './SulfuricParkingTable';

export type SulfuricExportSection = 'prod' | 'levels' | 'consumption' | 'parking';
export type SulfuricExportPeriod = { type: 'month' | 'year'; value: string } | { type: 'all' };
export type ExportCell = string | number | null;
export interface ExportColumn {
  label: string;
  group: string;
  tone: 'brand' | 'fuming' | 'reagent' | 'acid93' | 'gray';
  format?: 'number' | 'percent' | 'duration' | 'text' | 'date' | 'datetime';
  width?: number;
}
export interface ExportRow {
  kind: 'total' | 'average' | 'month' | 'day' | 'empty';
  cells: ExportCell[];
}
export interface ExportSheet {
  key: SulfuricExportSection;
  name: string;
  basis: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}

export const SULFURIC_EXPORT_OPTIONS: Array<{ value: SulfuricExportSection; label: string }> = [
  { value: 'prod', label: '产量' },
  { value: 'levels', label: '液位' },
  { value: 'consumption', label: '消耗数据' },
  { value: 'parking', label: '停车记录' },
];

const sumRecorded = (values: Array<number | null | undefined>): number | null => {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) : null;
};

const inPeriod = (date: string, period: SulfuricExportPeriod) =>
  period.type === 'all' || date.startsWith(period.value);

const monthsOf = <T,>(items: T[], dateOf: (item: T) => string) =>
  [...new Set(items.map((item) => dateOf(item).slice(0, 7)))].sort().reverse();

const labelOf = (date: string) => `${date.slice(0, 4)} 年 ${Number(date.slice(5, 7))} 月`;

function withMonths<T>(
  items: T[],
  dateOf: (item: T) => string,
  period: SulfuricExportPeriod,
  summary: (subset: T[], kind: 'total' | 'average') => ExportCell[],
  daily: (item: T) => ExportCell[],
  includeAverage: boolean,
): ExportRow[] {
  if (!items.length) return [{ kind: 'empty', cells: ['所选范围暂无记录'] }];
  const rows: ExportRow[] = [{ kind: 'total', cells: summary(items, 'total') }];
  if (includeAverage) rows.push({ kind: 'average', cells: summary(items, 'average') });
  for (const month of monthsOf(items, dateOf)) {
    const monthItems = items.filter((item) => dateOf(item).startsWith(month));
    if (period.type !== 'month') {
      rows.push({ kind: 'month', cells: [labelOf(month)] });
      rows.push({ kind: 'total', cells: summary(monthItems, 'total') });
      if (includeAverage) rows.push({ kind: 'average', cells: summary(monthItems, 'average') });
    }
    for (const item of [...monthItems].sort((a, b) => dateOf(b).localeCompare(dateOf(a)))) {
      rows.push({ kind: 'day', cells: daily(item) });
    }
  }
  return rows;
}

const column = (label: string, group: string, tone: ExportColumn['tone'], format: ExportColumn['format'] = 'number', width?: number): ExportColumn =>
  ({ label, group, tone, format, width });

function productionSheet(days: SulfuricDaySummary[], period: SulfuricExportPeriod): ExportSheet {
  const columns = [
    column('生产日期', '日期', 'gray', 'date', 16),
    column('折 98% 合计 t', '总产量', 'gray'),
    column('产量 t', '98% 酸', 'brand'), column('外销 t', '98% 酸', 'brand'), column('期末库存 t', '98% 酸', 'brand'),
    column('产量 t', '发烟硫酸', 'fuming'), column('外销 t', '发烟硫酸', 'fuming'),
    column('内部·氨基磺酸 t', '发烟硫酸', 'fuming'), column('内部·蒽醌 t', '发烟硫酸', 'fuming'), column('期末库存 t', '发烟硫酸', 'fuming'),
    column('产量 t', '试剂酸', 'reagent'), column('外销 t', '试剂酸', 'reagent'), column('期末库存 t', '试剂酸', 'reagent'),
    column('产量 t', '93% 酸', 'acid93'), column('外销 t', '93% 酸', 'acid93'),
  ];
  const selected = days.filter((day) => inPeriod(day.productionDate, period));
  const metrics: Array<{ get: (day: SulfuricDaySummary) => number | null | undefined; stock?: boolean }> = [
    { get: (d) => d.production?.total98Equivalent },
    { get: (d) => d.production?.acid98 }, { get: (d) => d.production?.flow.acid98 }, { get: (d) => d.inventory?.acid98, stock: true },
    { get: (d) => d.production?.fuming }, { get: (d) => d.production?.flow.fuming },
    { get: (d) => d.production?.internalFuming.aminosulfonic }, { get: (d) => d.production?.internalFuming.anthraquinone }, { get: (d) => d.inventory?.fuming, stock: true },
    { get: (d) => d.production?.reagent }, { get: (d) => d.production?.flow.reagent }, { get: (d) => d.inventory?.reagent, stock: true },
    { get: (d) => d.production?.acid93 }, { get: (d) => d.production?.flow.acid93 },
  ];
  // 期末库存取该期间最后一次实录；库存不求和、不计算日均。
  const summaryRows = (subset: SulfuricDaySummary[], kind: 'total' | 'average'): ExportCell[] => [
    kind === 'total' ? '合计 / 期末' : '平均',
    ...metrics.map(({ get, stock }) => stock
      ? kind === 'average' ? null : [...subset].sort((a, b) => b.productionDate.localeCompare(a.productionDate)).map(get).find((value) => value !== null && value !== undefined) ?? null
      : kind === 'average' ? averageRecorded(subset.map(get)) : sumRecorded(subset.map(get))),
  ];
  return {
    key: 'prod', name: '产量', basis: '生产归属日；产量、外销与内部领用按日累计，期末库存取范围内最近一次实录。', columns,
    rows: withMonths(selected, (d) => d.productionDate, period, summaryRows,
      (d) => [d.productionDate, ...metrics.map(({ get }) => get(d) ?? null)], true),
  };
}

function levelsSheet(days: SulfuricDaySummary[], period: SulfuricExportPeriod): ExportSheet {
  const fields = [...new Map(days.flatMap((day) => day.levels).map((level) => [level.fieldId, level])).values()]
    .sort((a, b) => {
      const order = ['98酸', '发烟硫酸', '试剂酸', '双氧水'];
      return order.indexOf(a.material) - order.indexOf(b.material) || a.fieldId.localeCompare(b.fieldId);
    });
  const columns = [column('期末日期', '日期', 'gray', 'date', 16), ...fields.map((level) => column(`${level.name} %`, level.material, level.material.includes('发烟') ? 'fuming' : level.material.includes('试剂') ? 'reagent' : level.material.includes('98') ? 'brand' : 'gray', 'percent'))];
  const selected = days.filter((day) => inPeriod(day.date, period));
  const values = (day: SulfuricDaySummary) => fields.map((field) => day.levels.find((level) => level.fieldId === field.fieldId)?.levelPercent ?? null);
  return {
    key: 'levels', name: '液位', basis: '填报日期；最近实录行取范围内最后一天的液位，缺测保持空白。', columns,
    rows: withMonths(selected, (d) => d.date, period,
      (subset) => {
        const last = [...subset].sort((a, b) => b.date.localeCompare(a.date)).find((day) => values(day).some((value) => value !== null));
        return ['最近实录', ...(last ? values(last) : fields.map(() => null))];
      }, (d) => [d.date, ...values(d)], false),
  };
}

function consumptionSheet(days: SulfuricDaySummary[], period: SulfuricExportPeriod): ExportSheet {
  const meters = [...new Map(days.flatMap((day) => day.electricity?.meters ?? []).map((meter) => [meter.fieldId, meter])).values()]
    .sort((a, b) => Number(a.fieldId.startsWith('field_transformer')) - Number(b.fieldId.startsWith('field_transformer')) || a.fieldId.localeCompare(b.fieldId));
  const columns = [column('日期', '日期', 'gray', 'date', 16),
    ...meters.map((meter) => column(`${meter.name} kWh`, meter.fieldId.startsWith('field_transformer') ? '热电车间变压器' : '硫酸车间电表', meter.fieldId.startsWith('field_transformer') ? 'acid93' : 'brand')),
    column('用电合计 kWh', '用电合计', 'brand'), column('耗用 t', '双氧水', 'gray'), column('耗用 m³', '工业用水', 'reagent')];
  const metrics: Array<(day: SulfuricDaySummary) => number | null | undefined> = [
    ...meters.map((meter) => (day: SulfuricDaySummary) => day.electricity?.meters.find((item) => item.fieldId === meter.fieldId)?.usage),
    (day) => day.electricity?.total, (day) => day.peroxide, (day) => day.water,
  ];
  const selected = days.filter((day) => inPeriod(day.productionDate, period));
  return {
    key: 'consumption', name: '消耗数据', basis: '生产归属日；各表用量与耗用量按实录相加，空值不当作零。', columns,
    rows: withMonths(selected, (d) => d.productionDate, period,
      (subset) => ['合计', ...metrics.map((get) => sumRecorded(subset.map(get)))],
      (d) => [d.productionDate, ...metrics.map((get) => get(d) ?? null)], false),
  };
}

function parkingSheet(days: SulfuricDaySummary[], period: SulfuricExportPeriod): ExportSheet {
  const records = days.flatMap((day) => day.parkingRecords).filter((record) => inPeriod(record.start, period));
  const duration = (record: SulfuricParkingRecord) => {
    const minutes = parkingDurationMinutes(record);
    return minutes === null ? null : minutes / 1440;
  };
  const columns = [
    column('停车日期', '日期', 'gray', 'date', 16), column('开始时间', '记录', 'brand', 'datetime', 21),
    column('结束时间', '记录', 'brand', 'datetime', 21), column('停车时长', '记录', 'brand', 'duration', 16),
    column('停车原因', '记录', 'gray', 'text', 48),
  ];
  return {
    key: 'parking', name: '停车记录', basis: '按停车开始日期筛选；时长为结束时间减开始时间，缺少有效时间时留空。', columns,
    rows: withMonths(records, (r) => r.start, period,
      (subset) => ['合计', `${subset.length} 次`, null, sumRecorded(subset.map(duration)), null],
      (r) => [r.start.slice(0, 10), r.start.slice(0, 16).replace('T', ' '), r.end.slice(0, 16).replace('T', ' '), duration(r), r.reason || null], false),
  };
}

export function buildSulfuricExportSheets(days: SulfuricDaySummary[], period: SulfuricExportPeriod, sections: SulfuricExportSection[]): ExportSheet[] {
  const builders = { prod: productionSheet, levels: levelsSheet, consumption: consumptionSheet, parking: parkingSheet };
  return SULFURIC_EXPORT_OPTIONS.filter((option) => sections.includes(option.value)).map((option) => builders[option.value](days, period));
}
