import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { App as AntApp, DatePicker } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { DetailedWorkshopCode, SulfuricDaySummary } from '@hgxt/shared';
import { ChevronLeftIcon, ChevronRightIcon, FlaskIcon, ProductionChartIcon } from '../../components/icons';
import { aminoSummary, detailedWorkshopSummary, fenglianSummary, sulfuricSummary, tankLevels, thermalSummary, workshopOverview } from '../../api/production';
import { Dash, ExportButton, Kpi, MonthBars, PALETTE, Seg, downloadCsv, fmt, pctChange } from './dash-ui';
import { DetailedWorkshopPanel, DetailedWorkshopStockCards, DetailedWorkshopTable, detailMetricColor, detailMetricDigits, downloadDetailedWorkshopCsv } from './DetailedWorkshopView';
import { FenglianPanel, FenglianStockCards, FenglianTable, fenglianVisibleFields, type FenglianSelection } from './FenglianWorkshopView';
import { SulfuricCalculationModal } from './SulfuricCalculationModal';
import { SulfuricControlPanel, SulfuricControlPeek } from './SulfuricControlPanel';
import { ThermalPanel, ThermalTable } from './ThermalWorkshopView';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const dayLabel = (d: string) => `${d.slice(5)} 周${WEEK[new Date(`${d}T00:00:00`).getDay()]}`;

const TITLES: Record<string, string> = {
  sulfuric: '硫酸车间',
  aminosulfonic: '氨基磺酸车间',
  magnesium: '硫酸镁车间',
  hydrotalcite: '水滑石车间',
  anthraquinone: '二乙基蒽醌车间',
  fenglian: '丰联车间',
  thermal: '热电车间',
};

type AcidKey = 'acid98' | 'acid93' | 'reagent' | 'fuming';
/** 四酸的名称与颜色；折算仅在总产量计算面板展示。 */
const ACIDS: Array<{ key: AcidKey; name: string; color: string }> = [
  { key: 'acid98', name: '98% 酸', color: PALETTE.brand },
  { key: 'acid93', name: '93% 酸', color: PALETTE.acid93 },
  { key: 'reagent', name: '试剂酸', color: PALETTE.reagent },
  { key: 'fuming', name: '发烟硫酸', color: PALETTE.fuming },
];

/** 储罐分组配色 */
function groupColor(material: string, index: number): string {
  if (material.includes('发烟')) return PALETTE.fuming;
  if (material.includes('试剂')) return PALETTE.reagent;
  if (material.includes('双氧水')) return PALETTE.gray;
  if (material.includes('93')) return PALETTE.acid93;
  if (material.includes('98')) return PALETTE.brand;
  return [PALETTE.brand, PALETTE.fuming, PALETTE.reagent, PALETTE.gray][index % 4];
}

const sumOrNull = (values: Array<number | null | undefined>): number | null => {
  const present = values.filter((v): v is number => v !== null && v !== undefined);
  return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
};

type DateRange = [string, string];
type DetailEntry = { kind: 'day'; date: string; index: number } | { kind: 'summary'; month: string };
const DETAIL_PAGE_SIZE = 35;

type DetailTab = 'prod' | 'levels' | 'consumption' | 'inventory';
type AminoMetricKey = 'electricity' | 'steam' | 'water' | 'urea' | 'fuming';
const AMINO_COLORS = {
  electricity: PALETTE.brand,
  steam: PALETTE.acid93,
  water: PALETTE.reagent,
  urea: PALETTE.fuming,
  fuming: PALETTE.gray,
} as const;
const AMINO_METRICS: Array<{ key: AminoMetricKey; name: string; unit: string; color: string; category: '能源' | '原辅料' }> = [
  { key: 'electricity', name: '用电', unit: 'kWh', color: AMINO_COLORS.electricity, category: '能源' },
  { key: 'steam', name: '蒸汽', unit: 't', color: AMINO_COLORS.steam, category: '能源' },
  { key: 'water', name: '水', unit: 'm³', color: AMINO_COLORS.water, category: '能源' },
  { key: 'urea', name: '尿素', unit: 't', color: AMINO_COLORS.urea, category: '原辅料' },
  { key: 'fuming', name: '发烟硫酸', unit: 't', color: AMINO_COLORS.fuming, category: '原辅料' },
];
const aminoRate = (value: number | null | undefined, production: number | null | undefined) =>
  value !== null && value !== undefined && production !== null && production !== undefined && production > 0 ? value / production : null;
const aminoTons = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${fmt(value, 1)} t`;
const groupStyle = (color: string): CSSProperties => ({ '--group-accent': color } as CSSProperties);
const meterGroupStyle = (fieldId: string): CSSProperties => groupStyle(fieldId.startsWith('field_transformer') ? PALETTE.acid93 : PALETTE.brand);
const productionBandStyle = {
  '--band-acid98': PALETTE.brand,
  '--band-fuming': PALETTE.fuming,
  '--band-reagent': PALETTE.reagent,
  '--band-acid93': PALETTE.acid93,
} as CSSProperties;

export function WorkshopBoardPage() {
  const { message } = AntApp.useApp();
  const [code, setCode] = useState('sulfuric');
  const [range, setRange] = useState<DateRange | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [detailPage, setDetailPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<'day' | 'month'>('day');
  const [tab, setTab] = useState<DetailTab>('prod');
  const [workshopView, setWorkshopView] = useState<'board' | 'control'>('board');
  const [calcDate, setCalcDate] = useState<string | null>(null);
  const [fenglianSelection, setFenglianSelection] = useState<FenglianSelection>({ group: '' });
  const otherCode: DetailedWorkshopCode | null = code === 'magnesium' || code === 'hydrotalcite' || code === 'anthraquinone' ? code : null;

  const overview = useQuery({ queryKey: ['production', 'workshops', 0], queryFn: () => workshopOverview(0) });
  const sulfuric = useQuery({ queryKey: ['production', 'sulfuric', 0], queryFn: () => sulfuricSummary(0), enabled: workshopView === 'board' && code === 'sulfuric' });
  const amino = useQuery({ queryKey: ['production', 'amino', 0], queryFn: () => aminoSummary(0), enabled: workshopView === 'board' && code === 'aminosulfonic' });
  const fenglian = useQuery({ queryKey: ['production', 'fenglian', 0], queryFn: () => fenglianSummary(0), enabled: workshopView === 'board' && code === 'fenglian' });
  const detailed = useQuery({ queryKey: ['production', 'detail', otherCode, 0], queryFn: () => detailedWorkshopSummary(otherCode!, 0), enabled: workshopView === 'board' && Boolean(otherCode) });
  const thermal = useQuery({ queryKey: ['production', 'thermal', 0], queryFn: () => thermalSummary(0), enabled: workshopView === 'board' && code === 'thermal' });
  useEffect(() => { if (overview.error) message.error(overview.error.message); }, [overview.error, message]);
  useEffect(() => { if (amino.error) message.error(amino.error.message); }, [amino.error, message]);
  useEffect(() => { if (fenglian.error) message.error(fenglian.error.message); }, [fenglian.error, message]);
  useEffect(() => { if (detailed.error) message.error(detailed.error.message); }, [detailed.error, message]);
  useEffect(() => { if (thermal.error) message.error(thermal.error.message); }, [thermal.error, message]);

  const workshops = overview.data?.workshops ?? [];
  const workshop = workshops.find((w) => w.code === code) ?? workshops[0];
  const allDates = useMemo(() => overview.data?.dates ?? [], [overview.data]);
  const isSulfuric = code === 'sulfuric';
  const isAmino = code === 'aminosulfonic';
  const isFenglian = code === 'fenglian';
  const isOther = otherCode !== null;
  const isAnthra = code === 'anthraquinone';
  const isThermal = code === 'thermal';

  const latestMonth = allDates[allDates.length - 1]?.slice(0, 7) ?? dayjs().format('YYYY-MM');
  const currentMonth = dayjs().format('YYYY-MM');
  const monthKey = month ?? latestMonth;
  const availableMonths = [...new Set(allDates.map((date) => date.slice(0, 7)))];
  const period: DateRange = range ?? [
    `${monthKey}-01`,
    dayjs(`${monthKey}-01`).endOf('month').format('YYYY-MM-DD'),
  ];
  const [periodStart, periodEnd] = period;
  const periodLabel = range ? `${period[0]} 至 ${period[1]}` : `${monthKey.slice(0, 4)} 年 ${Number(monthKey.slice(5))} 月`;

  const visible = useMemo(() => {
    return allDates.map((d, i) => ({ d, i })).filter(({ d }) => d >= periodStart && d <= periodEnd);
  }, [allDates, periodStart, periodEnd]);

  const series = useMemo(
    () => (workshop ? visible.map(({ d, i }) => ({ label: d, value: workshop.values[i] ?? null })) : []),
    [workshop, visible],
  );
  const validSeries = series.filter((s) => s.value !== null) as Array<{ label: string; value: number }>;
  const fallbackDate = validSeries[validSeries.length - 1]?.label ?? series[series.length - 1]?.label ?? null;
  const activeDate = selected && series.some((s) => s.label === selected) ? selected : fallbackDate;
  const tanks = useQuery({ queryKey: ['production', 'tanks', activeDate], queryFn: () => tankLevels(activeDate ?? undefined), enabled: workshopView === 'board' && isSulfuric && Boolean(activeDate) });
  const activeIdx = validSeries.findIndex((s) => s.label === activeDate);
  const activeValue = activeIdx >= 0 ? validSeries[activeIdx].value : null;
  const prevValue = activeIdx > 0 ? validSeries[activeIdx - 1].value : null;
  const total = validSeries.reduce((s, v) => s + v.value, 0);
  const avg = validSeries.length ? total / validSeries.length : null;
  const peak = validSeries.length ? Math.max(...validSeries.map((v) => v.value)) : null;

  const dayMap = useMemo(() => {
    const m = new Map<string, SulfuricDaySummary>();
    for (const d of sulfuric.data?.days ?? []) m.set(d.productionDate, d);
    return m;
  }, [sulfuric.data]);
  const sDay = activeDate ? dayMap.get(activeDate) : undefined;
  const aminoMap = useMemo(() => new Map((amino.data?.days ?? []).map((day) => [day.date, day])), [amino.data]);
  const aDay = activeDate ? aminoMap.get(activeDate) : undefined;
  const aPrevDay = activeIdx > 0 ? aminoMap.get(validSeries[activeIdx - 1].label) : undefined;
  const aDays = series.map((s) => aminoMap.get(s.label));
  const fenglianMap = useMemo(() => new Map((fenglian.data?.days ?? []).map((day) => [day.date, day])), [fenglian.data]);
  const fDay = activeDate ? fenglianMap.get(activeDate) : undefined;
  const fPrevDay = activeIdx > 0 ? fenglianMap.get(validSeries[activeIdx - 1].label) : undefined;
  const fDays = series.map((s) => fenglianMap.get(s.label));
  const fValue = (day: typeof fDay, field: string) => day?.values[field] ?? null;
  const otherMap = useMemo(() => new Map((detailed.data?.days ?? []).map((day) => [day.date, day])), [detailed.data]);
  const oDay = activeDate ? otherMap.get(activeDate) : undefined;
  const oPrevDay = activeIdx > 0 ? otherMap.get(validSeries[activeIdx - 1].label) : undefined;
  const oDays = series.map((s) => otherMap.get(s.label));
  const thermalMap = useMemo(() => new Map((thermal.data?.days ?? []).map((day) => [day.date, day])), [thermal.data]);
  const tDay = activeDate ? thermalMap.get(activeDate) : undefined;
  const tPrevDay = activeIdx > 0 ? thermalMap.get(validSeries[activeIdx - 1].label) : undefined;
  const tDays = series.map((s) => thermalMap.get(s.label));
  const featuredMetrics = detailed.data?.metrics.filter((metric) => metric.featured) ?? [];
  const sDays = series.map((s) => dayMap.get(s.label));
  const meterColumns = [...new Map((sulfuric.data?.days ?? [])
    .flatMap((d) => d.electricity?.meters ?? [])
    .map((meter) => [meter.fieldId, meter] as const)).values()];
  const ownMeterColumns = meterColumns.filter((meter) => meter.fieldId.startsWith('meter_'));
  const thermalMeterColumns = meterColumns.filter((meter) => meter.fieldId.startsWith('field_transformer'));
  const levelColumns = sulfuric.data?.days.find((day) => day.levels?.length)?.levels ?? [];
  const levelGroups = [...new Set(levelColumns.map((level) => level.material))]
    .sort((a, b) => ['98酸', '发烟硫酸', '试剂酸', '双氧水'].indexOf(a) - ['98酸', '发烟硫酸', '试剂酸', '双氧水'].indexOf(b))
    .map((material, index) => ({ material, color: groupColor(material, index), columns: levelColumns.filter((level) => level.material === material) }));
  const levelOf = (day: SulfuricDaySummary | undefined, fieldId: string) =>
    day?.levels?.find((level) => level.fieldId === fieldId)?.levelPercent ?? null;
  const levelText = (day: SulfuricDaySummary | undefined, fieldId: string) => {
    const value = levelOf(day, fieldId);
    return value === null ? '—' : `${fmt(value, 1)}%`;
  };
  const prevDay = activeIdx > 0 ? dayMap.get(validSeries[activeIdx - 1].label) : undefined;

  const invSeries = sDays.map((d) => d?.inventory?.total ?? null);
  const elecSeries = sDays.map((d) => d?.electricity?.total ?? null);
  const peroxideSeries = sDays.map((d) => d?.peroxide ?? null);
  const waterSeries = sDays.map((d) => d?.water ?? null);
  const unitOf = (d?: SulfuricDaySummary) => (d?.electricity && d.production?.total98Equivalent ? d.electricity.total / d.production.total98Equivalent : null);
  const unitSeries = sDays.map((d) => unitOf(d));
  const unitNow = unitOf(sDay);
  const unitValid = unitSeries.filter((v): v is number => v !== null);
  const unitAvg = unitValid.length ? unitValid.reduce((s, v) => s + v, 0) / unitValid.length : null;

  // 柱状图悬浮信息与右侧面板沿用同一份产量和内部领用数据。
  const tooltipOf = (label: string) => {
    if (isFenglian) {
      const day = fenglianMap.get(label);
      if (!day) return null;
      return [
        { name: '干料打包', value: `${fmt(fValue(day, 'field_204'), 3)} t`, color: PALETTE.brand },
        { name: '湿料产量', value: `${fmt(fValue(day, 'field_201'), 3)} t`, color: PALETTE.acid93 },
        { name: '干料销量', value: `${fmt(fValue(day, 'field_205'), 3)} t`, color: PALETTE.reagent },
        { name: '天然气耗用', value: `${fmt(fValue(day, 'field_gas_consumption'), 3)} m³`, color: PALETTE.fuming },
      ];
    }
    if (isThermal) {
      const day = thermalMap.get(label);
      if (!day) return null;
      return [
        { name: '总供汽', value: day.totalSupply === null ? '—' : `${fmt(day.totalSupply, 1)} t`, color: PALETTE.brand },
        { name: '外供蒸汽', value: day.externalTotal === null ? '—' : `${fmt(day.externalTotal, 1)} t`, color: PALETTE.fuming },
        { name: '内部供汽', value: day.internalTotal === null ? '—' : `${fmt(day.internalTotal, 1)} t`, color: PALETTE.reagent },
        { name: '自发电', value: day.generation.value === null ? '—' : `${fmt(day.generation.value)} kWh`, color: PALETTE.gray },
      ];
    }
    if (isOther) {
      const day = otherMap.get(label);
      if (!day || !detailed.data) return null;
      return [
        { name: detailed.data.productionLabel, value: day.production === null ? '—' : `${fmt(day.production, isAnthra ? 2 : 1)} t`, color: PALETTE.brand },
        ...detailed.data.metrics.filter((metric) => metric.featured).map((metric, index) => ({
          name: metric.name,
          value: day.metrics[metric.key] === null || day.metrics[metric.key] === undefined ? '—' : `${fmt(day.metrics[metric.key], detailMetricDigits(detailed.data!.code, metric))} ${metric.unit}`,
          color: detailMetricColor(metric, index, detailed.data!.metrics),
        })),
      ];
    }
    if (isAmino) {
      const day = aminoMap.get(label);
      if (!day) return null;
      return [
        { name: '产量', value: day.production === null ? '—' : `${fmt(day.production, 1)} t`, color: PALETTE.brand },
        ...AMINO_METRICS.map((metric) => ({ name: metric.name, value: day[metric.key] === null ? '—' : `${fmt(day[metric.key], metric.key === 'electricity' ? 0 : 1)} ${metric.unit}`, color: metric.color })),
      ];
    }
    if (!isSulfuric) return null;
    const p = dayMap.get(label)?.production;
    if (!p) return null;
    const tons = (value: number | null) => value === null ? '—' : `${fmt(value, 1)} t`;
    return [
      ...ACIDS.map((a) => ({ name: a.name, value: tons(p[a.key]), color: a.color })),
      { name: '内部·氨基磺酸', value: tons(p.internalFuming.aminosulfonic), color: PALETTE.fuming },
      { name: '内部·蒽醌', value: tons(p.internalFuming.anthraquinone), color: PALETTE.fuming },
    ];
  };

  const panelRows = useMemo(() => {
    const days = panelMode === 'day' ? [sDay] : sDays;
    return ACIDS.map((a) => {
      let prod = 0;
      let flow = 0;
      let amino = 0;
      let anthraquinone = 0;
      let aminoSeen = false;
      let anthraquinoneSeen = false;
      for (const d of days) {
        if (!d?.production) continue;
        prod += d.production[a.key];
        flow += d.production.flow[a.key];
        if (a.key === 'fuming') {
          if (d.production.internalFuming.aminosulfonic !== null) {
            amino += d.production.internalFuming.aminosulfonic;
            aminoSeen = true;
          }
          if (d.production.internalFuming.anthraquinone !== null) {
            anthraquinone += d.production.internalFuming.anthraquinone;
            anthraquinoneSeen = true;
          }
        }
      }
      return { ...a, prod, flow, amino: aminoSeen ? amino : null, anthraquinone: anthraquinoneSeen ? anthraquinone : null };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelMode, sDay, dayMap, visible]);
  const panelTotal = panelMode === 'day'
    ? sDay?.production?.total98Equivalent ?? 0
    : sumOrNull(sDays.map((day) => day?.production?.total98Equivalent)) ?? 0;
  const panelHasData = (panelMode === 'day' ? [sDay] : sDays).some((d) => d?.production);
  const panelMax = Math.max(1, ...panelRows.map((r) => Math.abs(r.prod)));

  const switchCode = (next: string) => { setCode(next); setSelected(null); setCalcDate(null); setTab('prod'); setDetailPage(0); };
  const changeMonth = (delta: number) => {
    setMonth(dayjs(`${range ? range[1].slice(0, 7) : monthKey}-01`).add(delta, 'month').format('YYYY-MM'));
    setRange(null);
    setSelected(null);
    setDetailPage(0);
  };
  const idxOfCode = workshops.findIndex((w) => w.code === code);
  const step = (dir: number) => {
    if (!workshops.length) return;
    switchCode(workshops[(idxOfCode + dir + workshops.length) % workshops.length].code);
  };

  const exportCsv = () => {
    if (!workshop) return;
    const filenamePeriod = `${period[0]}_${period[1]}`;
    if (isSulfuric && tab === 'prod') {
      downloadCsv(`硫酸车间-产量-${filenamePeriod}.csv`, [
        ['生产归属日', '折98合计 t', '98酸产量 t', '98酸外销 t', '98酸期末库存 t', '发烟产量 t', '发烟外销 t', '发烟内部·氨基磺酸 t', '发烟内部·蒽醌 t', '发烟期末库存 t', '试剂酸产量 t', '试剂酸外销 t', '试剂酸期末库存 t', '93酸产量 t', '93酸外销 t'],
        ...sDays.map((d, i) => [series[i].label, d?.production?.total98Equivalent ?? null, d?.production?.acid98 ?? null, d?.production?.flow.acid98 ?? null, d?.inventory?.acid98 ?? null, d?.production?.fuming ?? null, d?.production?.flow.fuming ?? null, d?.production?.internalFuming.aminosulfonic ?? null, d?.production?.internalFuming.anthraquinone ?? null, d?.inventory?.fuming ?? null, d?.production?.reagent ?? null, d?.production?.flow.reagent ?? null, d?.inventory?.reagent ?? null, d?.production?.acid93 ?? null, d?.production?.flow.acid93 ?? null]),
      ]);
    } else if (isSulfuric && tab === 'levels') {
      downloadCsv(`硫酸车间-液位-${filenamePeriod}.csv`, [
        ['期末归属日', ...levelGroups.flatMap((group) => group.columns.map((level) => `${group.material}·${level.name} %`))],
        ...sDays.map((day, i) => [series[i].label, ...levelGroups.flatMap((group) => group.columns.map((level) => levelOf(day, level.fieldId)))]),
      ]);
    } else if (isSulfuric) {
      downloadCsv(`硫酸车间-消耗数据-${filenamePeriod}.csv`, [
        ['消耗归属日', ...meterColumns.map((meter) => `${meter.name} kWh`), '用电合计 kWh', '双氧水耗用 t', '工业用水 m³'],
        ...sDays.map((day, i) => [series[i].label, ...meterColumns.map((meter) => day?.electricity?.meters.find((value) => value.fieldId === meter.fieldId)?.usage ?? null), day?.electricity?.total ?? null, day?.peroxide ?? null, day?.water ?? null]),
      ]);
    } else if (isFenglian && fenglian.data) {
      const fields = fenglianVisibleFields(fenglian.data.fields, fenglianSelection);
      downloadCsv(`丰联车间-${fields[0]?.group ?? '三车间'}-${fields[0]?.section ?? '产成品'}-${filenamePeriod}.csv`, [
        ['日期', ...fields.map((field) => `${field.title}${field.unit ? ` ${field.unit}` : ''}`)],
        ...fDays.map((day, i) => [series[i].label, ...fields.map((field) => day?.values[field.id] ?? null)]),
      ]);
    } else if (isThermal && thermal.data) {
      const outlets = thermal.data.outlets;
      downloadCsv(`热电车间-供汽与计量-${filenamePeriod}.csv`, [
        ['日期', '总供汽 t', ...outlets.map((outlet) => `${outlet.group === 'external' ? '外供' : '内供'}·${outlet.name} t`), '外供合计 t', '内供合计 t', '自发电 kWh', '总水表 m³', '蒸汽总表 t'],
        ...tDays.map((day, i) => [series[i].label, day?.totalSupply ?? null, ...outlets.map((outlet) => day?.outlets[outlet.key]?.value ?? null), day?.externalTotal ?? null, day?.internalTotal ?? null,
          day?.generation.value ?? null, day?.water.value ?? null, day?.steamMeter.value ?? null]),
      ]);
    } else if (isAmino) {
      if (tab === 'inventory') {
        downloadCsv(`氨基磺酸车间-库存-${filenamePeriod}.csv`, [
          ['日期', '氨基磺酸产量 t', '氨基磺酸销量 t', '氨基磺酸库存 t', '尿素购入 t', '尿素耗用 t', '尿素库存 t', '发烟硫酸购入 t', '发烟硫酸耗用 t', '发烟硫酸库存 t'],
          ...aDays.map((day, i) => [series[i].label, day?.finishedProduction ?? null, day?.finishedSales ?? null, day?.finishedStock ?? null,
            day?.ureaPurchase ?? null, day?.ureaWarehouseConsumption ?? null, day?.ureaStock ?? null, null, day?.fuming ?? null, day?.fumingStock ?? null]),
        ]);
      } else {
        downloadCsv(`氨基磺酸车间-产量与消耗-${filenamePeriod}.csv`, [
          ['日期', '产量 t', ...AMINO_METRICS.flatMap((metric) => [`${metric.name}消耗 ${metric.unit}`, `${metric.name}单耗 ${metric.unit}/t`])],
          ...aDays.map((day, i) => [series[i].label, day?.production ?? null, ...AMINO_METRICS.flatMap((metric) => [day?.[metric.key] ?? null, aminoRate(day?.[metric.key], day?.production)])]),
        ]);
      }
    } else if (isOther && detailed.data) {
      downloadDetailedWorkshopCsv(detailed.data, tab === 'inventory' ? 'inventory' : 'prod', period[0], period[1]);
    } else {
      downloadCsv(`${TITLES[code]}-日产量-${filenamePeriod}.csv`, [['生产归属日', '日产量 t'], ...series.map((s) => [s.label, s.value])]);
    }
  };

  const kpiCount = isSulfuric || isAmino || isOther || isThermal || isFenglian ? 6 : 4;
  const aPanelDays = panelMode === 'day' ? [aDay] : aDays;
  const fPanelDays = panelMode === 'day' ? [fDay] : fDays;
  const detailDates = range
    ? allDates.filter((d) => d >= range[0] && d <= range[1])
    : allDates.filter((d) => d.startsWith(monthKey));
  const summaryDate = (key: string) => dayjs(`${key}-01`).endOf('month').format('YYYY-MM-DD');
  const detailEntries: DetailEntry[] = [
    ...detailDates.map((date): DetailEntry => ({ kind: 'day', date, index: allDates.indexOf(date) })),
    ...availableMonths
      .filter((key) => summaryDate(key) <= dayjs().format('YYYY-MM-DD') && summaryDate(key) >= periodStart && summaryDate(key) <= periodEnd && (!range || range[0] <= `${key}-01`))
      .map((key): DetailEntry => ({ kind: 'summary', month: key })),
  ].sort((a, b) => {
    const dateOf = (entry: DetailEntry) => entry.kind === 'day' ? entry.date : summaryDate(entry.month);
    return dateOf(b).localeCompare(dateOf(a)) || (a.kind === 'summary' ? -1 : 1);
  });
  const detailPageCount = Math.max(1, Math.ceil(detailEntries.length / DETAIL_PAGE_SIZE));
  const currentDetailPage = Math.min(detailPage, detailPageCount - 1);
  const pageEntries = detailEntries.slice(currentDetailPage * DETAIL_PAGE_SIZE, (currentDetailPage + 1) * DETAIL_PAGE_SIZE);
  const olderMonth = [...availableMonths].reverse().find((item) => item < monthKey);
  const newerMonth = availableMonths.find((item) => item > monthKey);
  const canPageNewer = currentDetailPage > 0 || (!range && Boolean(newerMonth));
  const canPageOlder = currentDetailPage + 1 < detailPageCount || (!range && Boolean(olderMonth));
  const turnDetailPage = (direction: 'newer' | 'older') => {
    const nextPage = currentDetailPage + (direction === 'older' ? 1 : -1);
    if (nextPage >= 0 && nextPage < detailPageCount) setDetailPage(nextPage);
    else if (!range) {
      setMonth(direction === 'older' ? olderMonth ?? monthKey : newerMonth ?? monthKey);
      setDetailPage(0);
      setSelected(null);
    }
  };
  const monthDays = (key: string) => allDates.filter((date) => date.startsWith(key));
  const onSelectDetailDate = (date: string) => {
    if (!range && date.slice(0, 7) !== monthKey) setMonth(date.slice(0, 7));
    setSelected(date);
  };

  return (
    <Dash className="workshop-board-dash">
      <div className="workshop-view-layout">
        <nav className="workshop-view-rail" aria-label="车间视图">
          <button type="button" className={workshopView === 'board' ? 'on' : ''} onClick={() => setWorkshopView('board')} aria-label="生产看板" title="生产看板"><ProductionChartIcon width={18} height={18} /></button>
          <div className="workshop-view-rail-item"><button type="button" className={workshopView === 'control' ? 'on' : ''} onClick={() => setWorkshopView('control')} aria-label="中控数据" title="中控数据"><FlaskIcon width={18} height={18} /></button>{workshopView === 'board' && isSulfuric && <SulfuricControlPeek />}</div>
        </nav>
        <div className="workshop-view-content">
      <div className="enter" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="wstabs" role="tablist" aria-label="车间">
          {workshops.map((w) => (
            <button key={w.code} type="button" role="tab" className={w.code === code ? 'on' : ''} onClick={() => switchCode(w.code)}>
              {w.name}
            </button>
          ))}
        </div>
        <div className="pager">
          <button type="button" className="iconbtn" aria-label="上一个车间" onClick={() => step(-1)}><ChevronLeftIcon width={16} height={16} /></button>
          <span className="num">{idxOfCode + 1} / {workshops.length}</span>
          <button type="button" className="iconbtn" aria-label="下一个车间" onClick={() => step(1)}><ChevronRightIcon width={16} height={16} /></button>
        </div>
      </div>

      <div className="enter" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0 16px' }}>
        <h1 className="h1" style={{ fontSize: 28, flex: 1 }}>{TITLES[code] ?? '车间版面'}</h1>
        {workshopView === 'board' && <><button type="button" className={`btn sm ${range || monthKey !== currentMonth ? 'ghost' : 'secondary'}`} onClick={() => { setMonth(currentMonth); setRange(null); setSelected(null); setDetailPage(0); }}>本月</button>
        <div className="range-nav">
          <button type="button" className="iconbtn" aria-label="上一个月" onClick={() => changeMonth(-1)}><ChevronLeftIcon width={16} height={16} /></button>
          <DatePicker.RangePicker
            aria-label="选择起止日期"
            className="workshop-range"
            value={[dayjs(period[0]), dayjs(period[1])]}
            format="YYYY-MM-DD"
            allowClear={false}
            onChange={(dates) => {
              if (!dates?.[0] || !dates[1]) return;
              setRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
              setSelected(null);
              setDetailPage(0);
            }}
          />
          <button type="button" className="iconbtn" aria-label="下一个月" onClick={() => changeMonth(1)}><ChevronRightIcon width={16} height={16} /></button>
        </div>
        <ExportButton onClick={exportCsv} /></>}
      </div>

        {workshopView === 'control' ? (isSulfuric ? <SulfuricControlPanel /> : <div className="workshop-control-blank" aria-label={`${TITLES[code] ?? '车间'}中控数据`} />) : <>

      {workshop ? (
        <div className="kpis enter d1" style={{ gridTemplateColumns: `repeat(${kpiCount}, minmax(0, 1fr))` }}>
          <Kpi
            label={`${isSulfuric ? '折 98% 产量' : isThermal ? '总供汽' : isFenglian ? '干料打包' : '日产量'} · ${activeDate?.slice(5) ?? '—'}`}
            value={fmt(activeValue, isFenglian ? 3 : isAnthra ? 2 : 1)}
            unit="t"
            delta={pctChange(activeValue, prevValue)}
            sub={`${range ? '区间' : '月'}累计 ${fmt(validSeries.length ? total : null, isFenglian ? 3 : isAnthra ? 2 : 0)} t`}
            spark={series.map((s) => s.value)}
          />
          {isSulfuric ? (
            <>
              <Kpi label="罐区库存" value={fmt(sDay?.inventory?.total ?? null, 0)} unit="t" delta={pctChange(sDay?.inventory?.total, prevDay?.inventory?.total)} spark={invSeries} />
              <Kpi label="电单耗" value={fmt(unitNow, 1)} unit="kWh/t" delta={pctChange(unitNow, unitOf(prevDay))} good="down" sub={unitAvg === null ? '' : `均值 ${fmt(unitAvg, 1)}`} spark={unitSeries} />
              <Kpi label="日用电" value={fmt(sDay?.electricity?.total ?? null, 0)} unit="kWh" delta={pctChange(sDay?.electricity?.total, prevDay?.electricity?.total)} good="down" spark={elecSeries} />
            </>
          ) : null}
          {isSulfuric ? <>
            <Kpi label="双氧水消耗" value={fmt(sDay?.peroxide ?? null, 1)} unit="t" delta={pctChange(sDay?.peroxide, prevDay?.peroxide)} good="down" spark={peroxideSeries} />
            <Kpi label="工业用水消耗" value={fmt(sDay?.water ?? null, 0)} unit="m³" delta={pctChange(sDay?.water, prevDay?.water)} good="down" spark={waterSeries} />
          </> : isThermal ? <>
            <Kpi label="外供蒸汽" value={fmt(tDay?.externalTotal, 1)} unit="t" delta={pctChange(tDay?.externalTotal, tPrevDay?.externalTotal)} spark={tDays.map((day) => day?.externalTotal ?? null)} />
            <Kpi label="内部供汽" value={fmt(tDay?.internalTotal, 1)} unit="t" delta={pctChange(tDay?.internalTotal, tPrevDay?.internalTotal)} spark={tDays.map((day) => day?.internalTotal ?? null)} />
            <Kpi label="自发电" value={fmt(tDay?.generation.value, 0)} unit="kWh" delta={pctChange(tDay?.generation.value, tPrevDay?.generation.value)} spark={tDays.map((day) => day?.generation.value ?? null)} />
            <Kpi label="总水表供水" value={fmt(tDay?.water.value, 0)} unit="m³" delta={pctChange(tDay?.water.value, tPrevDay?.water.value)} spark={tDays.map((day) => day?.water.value ?? null)} />
            <Kpi label="蒸汽总表" value={fmt(tDay?.steamMeter.value, 1)} unit="t" delta={pctChange(tDay?.steamMeter.value, tPrevDay?.steamMeter.value)} spark={tDays.map((day) => day?.steamMeter.value ?? null)} />
          </> : isFenglian ? <>
            <Kpi label="湿料产量" value={fmt(fValue(fDay, 'field_201'), 3)} unit="t" delta={pctChange(fValue(fDay, 'field_201'), fValue(fPrevDay, 'field_201'))} spark={fDays.map((day) => fValue(day, 'field_201'))} />
            <Kpi label="干料销量" value={fmt(fValue(fDay, 'field_205'), 3)} unit="t" delta={pctChange(fValue(fDay, 'field_205'), fValue(fPrevDay, 'field_205'))} spark={fDays.map((day) => fValue(day, 'field_205'))} />
            <Kpi label="干料期末库存" value={fmt(fValue(fDay, 'field_206'), 3)} unit="t" delta={pctChange(fValue(fDay, 'field_206'), fValue(fPrevDay, 'field_206'))} spark={fDays.map((day) => fValue(day, 'field_206'))} />
            <Kpi label="天然气耗用" value={fmt(fValue(fDay, 'field_gas_consumption'), 3)} unit="m³" spark={fDays.map((day) => fValue(day, 'field_gas_consumption'))} />
            <Kpi label="电表累计读数" value={fmt(fValue(fDay, 'field_electricity_cumulative'), 3)} spark={fDays.map((day) => fValue(day, 'field_electricity_cumulative'))} />
          </> : isAmino ? <>
            {AMINO_METRICS.map((metric) => {
              const value = aDay?.[metric.key] ?? null;
              const rate = aminoRate(value, aDay?.production);
              return <Kpi key={metric.key} label={metric.name} value={fmt(value, metric.key === 'electricity' ? 0 : 1)} unit={metric.unit}
                delta={pctChange(value, aPrevDay?.[metric.key])} good="down"
                sub={rate === null ? '' : `单耗 ${fmt(rate, metric.key === 'electricity' ? 1 : 2)} ${metric.unit}/t`}
                spark={aDays.map((day) => day?.[metric.key] ?? null)} />;
            })}
          </> : isOther ? <>
            {featuredMetrics.map((metric) => {
              const value = oDay?.metrics[metric.key] ?? null;
              const rate = value !== null && oDay?.production && oDay.production > 0 ? value / oDay.production : null;
              return <Kpi key={metric.key} label={metric.name} value={fmt(value, detailMetricDigits(detailed.data!.code, metric))} unit={metric.unit}
                delta={pctChange(value, oPrevDay?.metrics[metric.key])} good="down"
                sub={rate === null ? '' : `单耗 ${fmt(rate, metric.unit === 'kWh' ? 1 : 2)} ${metric.unit}/t`}
                spark={oDays.map((day) => day?.metrics[metric.key] ?? null)} />;
            })}
          </> : <>
            <Kpi label={range ? '区间均日产' : '月均日产'} value={fmt(avg, 1)} unit="t" sub={`${validSeries.length} 个有效日`} />
            <Kpi label="峰值日产" value={fmt(peak, 1)} unit="t" sub={peak === null ? '' : validSeries.find((v) => v.value === peak)?.label.slice(5)} />
          </>}
        </div>
      ) : null}

      {workshop ? (
        <div className="card enter d2" style={{ marginTop: 16, padding: '18px 20px' }}>
          <div className="split">
            <div className="left">
              <div className="ct" style={{ marginBottom: 14 }}>
                <b>{isThermal ? '日供汽量' : isFenglian ? '干料打包数' : '日产量'}</b>
                <div className="r lg">
                  <span><i style={{ width: 12, height: 0, borderTop: '1px dashed var(--ink3)', borderRadius: 0, verticalAlign: 3 }} />月均 {fmt(avg, isFenglian ? 3 : isAnthra ? 2 : 0)}</span>
                  <span><i style={{ background: 'var(--brand)' }} />选中日</span>
                </div>
              </div>
              <MonthBars data={series} unit={workshop.unit} tooltipOf={tooltipOf} selected={activeDate} onSelect={setSelected} valueDigits={isFenglian ? 3 : isAnthra ? 2 : 0} />
            </div>
            <div className="right">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>{panelMode === 'day' ? (activeDate ? dayLabel(activeDate) : '—') : `${periodLabel} 累计`}</span>
                <Seg options={[{ label: '当日', value: 'day' }, { label: range ? '区间' : '本月', value: 'month' }]} value={panelMode} onChange={(v) => setPanelMode(v as 'day' | 'month')} />
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="faint" style={{ fontSize: 13 }}>{isSulfuric ? '折 98% 合计' : isThermal ? '总供汽' : isFenglian ? '干料打包数' : panelMode === 'day' ? detailed.data?.productionLabel ?? '日产量' : range ? '区间合计' : '本月合计'}</div>
                <div className="kv" style={{ fontSize: 28 }}>
                  {fmt(isSulfuric ? (panelHasData ? panelTotal : null) : panelMode === 'day' ? activeValue : validSeries.length ? total : null, isFenglian ? 3 : isAnthra ? 2 : 1)}
                  <small>t</small>
                </div>
              </div>
              {isSulfuric ? (
                <div style={{ marginTop: 8, borderTop: '1px solid var(--line)' }}>
                  {panelRows.map((r) => (
                    <div key={r.key}>
                      <div className="sp-row">
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <i style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: 'inline-block', flex: '0 0 auto' }} />
                            <span style={{ fontWeight: 500 }}>{r.name}</span>
                          </div>
                          <div className="bar-in" style={{ marginTop: 5, height: 4 }}>
                            <i style={{ width: `${Math.max(0, Math.min(100, (r.prod / panelMax) * 100))}%`, background: r.color }} />
                          </div>
                        </div>
                        <span className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.prod, 1)} t</span>
                      </div>
                      <div className="sp-sub"><span>外销</span><span className="num" style={{ textAlign: 'right' }}>{fmt(r.flow, 1)}</span></div>
                      {r.key === 'fuming' && <>
                        <div className="sp-sub"><span>内部·氨基磺酸</span><span className="num" style={{ textAlign: 'right' }}>{fmt(r.amino, 1)}</span></div>
                        <div className="sp-sub"><span>内部·蒽醌</span><span className="num" style={{ textAlign: 'right' }}>{fmt(r.anthraquinone, 1)}</span></div>
                      </>}
                    </div>
                  ))}
                </div>
              ) : isThermal && thermal.data ? (
                <ThermalPanel data={thermal.data} days={panelMode === 'day' ? [tDay] : tDays} />
              ) : isFenglian ? (
                <FenglianPanel days={fPanelDays} />
              ) : isAmino ? (
                <div className="amino-panel">
                  {(['能源', '原辅料'] as const).map((category) => <div key={category} className="amino-panel-group">
                    <div className="amino-panel-heading">{category}<span>消耗</span></div>
                    {AMINO_METRICS.filter((metric) => metric.category === category).map((metric) => {
                      const used = sumOrNull(aPanelDays.map((day) => day?.[metric.key]));
                      return <div className="amino-panel-row" key={metric.key} style={groupStyle(metric.color)}>
                        <span className="amino-panel-name"><i style={{ background: metric.color }} />{metric.name}</span>
                        <strong>{fmt(used, metric.key === 'electricity' ? 0 : 1)} <small>{metric.unit}</small></strong>
                      </div>;
                    })}
                  </div>)}
                </div>
              ) : isOther && detailed.data ? (
                <DetailedWorkshopPanel
                  data={detailed.data}
                  days={panelMode === 'day' ? [oDay] : oDays}
                />
              ) : (
                <div className="stats">
                  <div><div className="sl">{range ? '区间均日产' : '月均日产'}</div><div className="sv">{fmt(avg, 1)} t</div></div>
                  <div><div className="sl">峰值日产</div><div className="sv">{fmt(peak, 1)} t</div></div>
                  <div><div className="sl">有效日</div><div className="sv">{validSeries.length} 天</div></div>
                  <div><div className="sl">较月均</div><div className="sv">{activeValue !== null && avg ? `${pctChange(activeValue, avg)}%` : '—'}</div></div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isSulfuric && tanks.data?.groups.length ? (
        <div className="card enter d3" style={{ marginTop: 16, padding: '18px 20px' }}>
          <div className="ct" style={{ marginBottom: 14 }}>
            <b>罐区期末库存 · {dayLabel(tanks.data.date)}</b>
            <div className="r lg">
              <span><i style={{ background: 'var(--ink3)', width: 1, height: 10, borderRadius: 0 }} />20% / 90% 警戒线</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px 48px' }}>
            {tanks.data.groups.map((g, gi) => {
              const color = groupColor(g.material, gi);
              const cap = g.tanks.reduce((s, t) => s + t.capacity * t.density, 0);
              return (
                <div className="igrp" key={g.material}>
                  <div className="ih">
                    <i style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
                    <span style={{ fontWeight: 600 }}>{g.material}</span>
                    {cap > 0 ? <span className="faint" style={{ fontSize: 13 }}>库容率 {Math.round((g.totalTons / cap) * 100)}%</span> : null}
                    <span className="num" style={{ marginLeft: 'auto', fontWeight: 600 }}>{fmt(g.totalTons, 1)} t</span>
                  </div>
                  {g.tanks.map((t) => (
                    <div className="lvl" key={t.fieldId}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                      <div className="trk">
                        <i style={{ width: `${Math.max(0, Math.min(100, t.levelPercent ?? 0))}%`, background: color }} />
                        <b style={{ left: '20%' }} />
                        <b style={{ left: '90%' }} />
                      </div>
                      <span className="p">{t.levelPercent === null ? '—' : `${Math.round(t.levelPercent)}%`}</span>
                      <span className="t">{fmt(t.tons, 1)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {isAmino && (
        <div className="card enter d3" style={{ marginTop: 16, padding: '18px 20px' }}>
          <div className="ct" style={{ marginBottom: 14 }}><b>期末库存 · {activeDate ? dayLabel(activeDate) : '—'}</b></div>
          <div className="amino-stock-grid">
            <div className="amino-stock" style={groupStyle(AMINO_COLORS.electricity)}>
              <span>产成品 · 氨基磺酸</span><strong>{fmt(aDay?.finishedStock, 1)} <small>t</small></strong>
              <div className="amino-stock-flows"><span>产量 <b>{aminoTons(aDay?.finishedProduction)}</b></span><span>销量 <b>{aminoTons(aDay?.finishedSales)}</b></span></div>
            </div>
            <div className="amino-stock" style={groupStyle(AMINO_COLORS.urea)}>
              <span>原辅料 · 尿素</span><strong>{fmt(aDay?.ureaStock, 1)} <small>t</small></strong>
              <div className="amino-stock-flows"><span>购入 <b>{aminoTons(aDay?.ureaPurchase)}</b></span><span>耗用 <b>{aminoTons(aDay?.ureaWarehouseConsumption)}</b></span></div>
            </div>
            <div className="amino-stock" style={groupStyle(AMINO_COLORS.fuming)}>
              <span>原辅料 · 发烟硫酸</span><strong>{fmt(aDay?.fumingStock, 1)} <small>t</small></strong>
              <div className="amino-stock-flows"><span>购入 <b>—</b></span><span>耗用 <b>{aminoTons(aDay?.fuming)}</b></span></div>
            </div>
          </div>
          <p className="amino-stock-note">发烟硫酸由硫酸车间内部供应，日报暂无独立购入量。</p>
        </div>
      )}

      {isFenglian && fenglian.data && (
        <div className="card enter d3" style={{ marginTop: 16, padding: '18px 20px' }}>
          <div className="ct" style={{ marginBottom: 14 }}><b>期末库存 · {activeDate ? dayLabel(activeDate) : '—'}</b></div>
          <FenglianStockCards day={fDay} />
        </div>
      )}

      {isOther && detailed.data && (
        <div className="card enter d3" style={{ marginTop: 16, padding: '18px 20px' }}>
          <div className="ct" style={{ marginBottom: 14 }}><b>期末库存 · {activeDate ? dayLabel(activeDate) : '—'}</b></div>
          <DetailedWorkshopStockCards data={detailed.data} day={oDay} />
        </div>
      )}

      <div className="card enter d4" style={{ marginTop: 16, padding: '18px 20px 10px' }}>
        <div className="ct" style={{ alignItems: 'center', marginBottom: 12 }}>
          <b style={{ fontSize: 16 }}>明细</b>
          {isSulfuric ? (
            <Seg
              className="tbtabs"
              options={[{ label: '产量', value: 'prod' }, { label: '液位', value: 'levels' }, { label: '消耗数据', value: 'consumption' }]}
              value={tab}
              onChange={(v) => setTab(v as DetailTab)}
            />
          ) : isAmino ? (
            <Seg className="tbtabs" options={[{ label: '产量与消耗', value: 'prod' }, { label: '库存', value: 'inventory' }]} value={tab} onChange={(v) => setTab(v as DetailTab)} />
          ) : isOther ? (
            <Seg className="tbtabs" options={[{ label: '产量与消耗', value: 'prod' }, { label: '库存', value: 'inventory' }]} value={tab} onChange={(v) => setTab(v as DetailTab)} />
          ) : isThermal ? (
            <Seg className="tbtabs" options={[{ label: '供汽去向', value: 'prod' }, { label: '电水计量', value: 'consumption' }]} value={tab} onChange={(v) => setTab(v as DetailTab)} />
          ) : null}
          <div className="r detail-pager">
            <span>{periodLabel} · {isFenglian ? 't · kg · m³ · 表读数' : isSulfuric && tab === 'levels' ? '%' : (isSulfuric && tab === 'consumption') || ((isAmino || isOther) && tab === 'prod') || (isThermal && tab === 'consumption') ? 'kWh · t · m³' : 't'}</span>
            <button type="button" className="iconbtn" aria-label="翻到更早的明细" disabled={!canPageOlder} onClick={() => turnDetailPage('older')}><ChevronLeftIcon width={16} height={16} /></button>
            <span>{currentDetailPage + 1} / {detailPageCount}</span>
            <button type="button" className="iconbtn" aria-label="翻到更新的明细" disabled={!canPageNewer} onClick={() => turnDetailPage('newer')}><ChevronRightIcon width={16} height={16} /></button>
          </div>
        </div>
        {isFenglian ? (
          fenglian.data
            ? <FenglianTable data={fenglian.data} entries={pageEntries} activeDate={activeDate} onSelect={onSelectDetailDate} selection={fenglianSelection} onSelectionChange={setFenglianSelection} />
            : <div className="scrolltbl"><div className="empty">加载中…</div></div>
        ) : isThermal ? (
          thermal.data
            ? <ThermalTable data={thermal.data} tab={tab === 'consumption' ? 'consumption' : 'prod'} entries={pageEntries} activeDate={activeDate} onSelect={onSelectDetailDate} />
            : <div className="scrolltbl"><div className="empty">加载中…</div></div>
        ) : isOther ? (
          detailed.data
            ? <DetailedWorkshopTable data={detailed.data} tab={tab === 'inventory' ? 'inventory' : 'prod'} entries={pageEntries} activeDate={activeDate} onSelect={onSelectDetailDate} />
            : <div className="scrolltbl"><div className="empty">加载中…</div></div>
        ) : <div className="scrolltbl">
          <table className={`dt workshop-detail-table${isSulfuric && tab === 'prod' ? ' detail-prod' : ''}${isAmino && tab === 'inventory' ? ' amino-inventory' : ''}`} style={productionBandStyle}>
            <thead>
              {isSulfuric && tab === 'prod' ? <>
                <tr className="grp detail-group-head">
                  <th rowSpan={2} className="detail-date-head">生产日期</th>
                  <th rowSpan={2} className="detail-total-cell">折 98% 合计</th>
                  <th colSpan={3} className="colored-group-head" style={groupStyle(PALETTE.brand)}>98% 酸</th>
                  <th colSpan={5} className="colored-group-head" style={groupStyle(PALETTE.fuming)}>发烟硫酸</th>
                  <th colSpan={3} className="colored-group-head" style={groupStyle(PALETTE.reagent)}>试剂酸</th>
                  <th colSpan={2} className="colored-group-head" style={groupStyle(PALETTE.acid93)}>93% 酸</th>
                </tr>
                <tr className="detail-subhead">
                  <th className="band-98">产量</th><th className="band-98">外销</th><th className="band-98">期末库存</th>
                  <th className="band-fuming">产量</th><th className="band-fuming">外销</th><th className="band-fuming">内部·氨基磺酸</th><th className="band-fuming">内部·蒽醌</th><th className="band-fuming">期末库存</th>
                  <th className="band-reagent">产量</th><th className="band-reagent">外销</th><th className="band-reagent">期末库存</th>
                  <th className="band-93">产量</th><th className="band-93">外销</th>
                </tr>
              </> : isSulfuric && tab === 'levels' ? <>
                <tr className="grp detail-group-head">
                  <th rowSpan={2} className="detail-date-head">期末日期</th>
                  {levelGroups.map((group) => <th key={group.material} colSpan={group.columns.length} className="colored-group-head" style={groupStyle(group.color)}>{group.material}</th>)}
                </tr>
                <tr className="detail-subhead">
                  {levelGroups.flatMap((group) => group.columns.map((level) => <th key={level.fieldId} className="band-cell" style={groupStyle(group.color)}>{level.name}</th>))}
                </tr>
              </> : isSulfuric && tab === 'consumption' ? <>
                <tr className="grp detail-group-head">
                  <th rowSpan={2} className="detail-date-head">日期</th>
                  {ownMeterColumns.length > 0 && <th colSpan={ownMeterColumns.length} className="colored-group-head" style={groupStyle(PALETTE.brand)}>硫酸车间电表</th>}
                  {thermalMeterColumns.length > 0 && <th colSpan={thermalMeterColumns.length} className="colored-group-head" style={groupStyle(PALETTE.acid93)}>热电车间变压器</th>}
                  <th colSpan={1} className="colored-group-head" style={groupStyle(PALETTE.brand)}>用电合计</th>
                  <th colSpan={1} className="colored-group-head" style={groupStyle(PALETTE.gray)}>双氧水</th>
                  <th colSpan={1} className="colored-group-head" style={groupStyle(PALETTE.reagent)}>工业用水</th>
                </tr>
                <tr className="detail-subhead">
                  {meterColumns.map((meter) => <th key={meter.fieldId} className="band-cell" style={meterGroupStyle(meter.fieldId)}>{meter.name}</th>)}
                  <th className="band-cell" style={groupStyle(PALETTE.brand)}>kWh</th>
                  <th className="band-cell" style={groupStyle(PALETTE.gray)}>耗用 t</th>
                  <th className="band-cell" style={groupStyle(PALETTE.reagent)}>耗用 m³</th>
                </tr>
              </> : isAmino && tab === 'prod' ? <>
                <tr className="grp detail-group-head">
                  <th rowSpan={2} className="detail-date-head">日期</th>
                  <th rowSpan={2}>产量 t</th>
                  <th colSpan={6} className="colored-group-head" style={groupStyle(PALETTE.brand)}>能源消耗</th>
                  <th colSpan={4} className="colored-group-head" style={groupStyle(AMINO_COLORS.urea)}>原辅料消耗</th>
                </tr>
                <tr className="detail-subhead">
                  {AMINO_METRICS.flatMap((metric) => [
                    <th key={`${metric.key}-used`} className="band-cell" style={groupStyle(metric.color)}>{metric.name} {metric.unit}</th>,
                    <th key={`${metric.key}-rate`} className="band-cell" style={groupStyle(metric.color)}>单耗 {metric.unit}/t</th>,
                  ])}
                </tr>
              </> : isAmino && tab === 'inventory' ? <>
                <tr className="grp detail-group-head"><th rowSpan={3} className="detail-date-head">日期</th><th colSpan={3} className="colored-group-head" style={groupStyle(AMINO_COLORS.electricity)}>产成品</th><th colSpan={6} className="colored-group-head" style={groupStyle(AMINO_COLORS.urea)}>原辅料</th></tr>
                <tr className="grp detail-material-head"><th colSpan={3} className="colored-group-head" style={groupStyle(AMINO_COLORS.electricity)}>氨基磺酸</th><th colSpan={3} className="colored-group-head" style={groupStyle(AMINO_COLORS.urea)}>尿素</th><th colSpan={3} className="colored-group-head" style={groupStyle(AMINO_COLORS.fuming)}>发烟硫酸</th></tr>
                <tr className="detail-subhead">
                  {['产量', '销量', '期末库存'].map((name) => <th key={`finished-${name}`} className="band-cell" style={groupStyle(AMINO_COLORS.electricity)}>{name} t</th>)}
                  {['购入', '耗用', '期末库存'].map((name) => <th key={`urea-${name}`} className="band-cell" style={groupStyle(AMINO_COLORS.urea)}>{name} t</th>)}
                  {['购入', '耗用', '期末库存'].map((name) => <th key={`fuming-${name}`} className="band-cell" style={groupStyle(AMINO_COLORS.fuming)}>{name} t</th>)}
                </tr>
              </> : <tr><th>生产日期</th><th>日产量 t</th><th>较月均</th></tr>}
            </thead>
            <tbody>
              {!pageEntries.length && <tr><td colSpan={isAmino ? tab === 'inventory' ? 10 : 12 : !isSulfuric ? 3 : tab === 'prod' ? 15 : tab === 'levels' ? levelColumns.length + 1 : meterColumns.length + 4} className="muted">所选日期内暂无数据</td></tr>}
              {pageEntries.map((entry) => {
                if (entry.kind === 'summary') {
                  const dates = monthDays(entry.month);
                  const days = dates.map((date) => dayMap.get(date));
                  const values = dates.map((date) => workshop?.values[allDates.indexOf(date)] ?? null);
                  const lastInventory = [...days].reverse().find((d) => d?.inventory)?.inventory;
                  const lastLevelDay = [...days].reverse().find((day) => day?.levels?.some((level) => level.levelPercent !== null));
                  const aminoDays = dates.map((date) => aminoMap.get(date));
                  const aminoProduction = sumOrNull(aminoDays.map((day) => day?.production));
                  const lastAminoStock = [...aminoDays].reverse();
                  return (
                    <tr key={`summary-${entry.month}`} className="sum">
                      <td>合计</td>
                      {isSulfuric && tab === 'prod' && <td className="detail-total-cell">{fmt(sumOrNull(days.map((d) => d?.production?.total98Equivalent)), 1)}</td>}
                      {!isSulfuric && !isAmino && <><td>{fmt(sumOrNull(values), 1)}</td><td>—</td></>}
                      {isAmino && tab === 'prod' && <>
                        <td>{fmt(aminoProduction, 1)}</td>
                        {AMINO_METRICS.flatMap((metric) => {
                          const used = sumOrNull(aminoDays.map((day) => day?.[metric.key]));
                          return [
                            <td key={`${metric.key}-used`} className="band-cell" style={groupStyle(metric.color)}>{fmt(used, metric.key === 'electricity' ? 0 : 1)}</td>,
                            <td key={`${metric.key}-rate`} className="band-cell" style={groupStyle(metric.color)}>{fmt(aminoRate(used, aminoProduction), metric.key === 'electricity' ? 1 : 2)}</td>,
                          ];
                        })}
                      </>}
                      {isAmino && tab === 'inventory' && <>
                        <td className="band-cell" style={groupStyle(AMINO_COLORS.electricity)}>{fmt(sumOrNull(aminoDays.map((day) => day?.finishedProduction)), 1)}</td>
                        <td className="band-cell" style={groupStyle(AMINO_COLORS.electricity)}>{fmt(sumOrNull(aminoDays.map((day) => day?.finishedSales)), 1)}</td>
                        <td className="band-cell" style={groupStyle(AMINO_COLORS.electricity)}>{fmt(lastAminoStock.find((day) => day?.finishedStock !== null && day?.finishedStock !== undefined)?.finishedStock, 1)}</td>
                        <td className="band-cell" style={groupStyle(AMINO_COLORS.urea)}>{fmt(sumOrNull(aminoDays.map((day) => day?.ureaPurchase)), 1)}</td>
                        <td className="band-cell" style={groupStyle(AMINO_COLORS.urea)}>{fmt(sumOrNull(aminoDays.map((day) => day?.ureaWarehouseConsumption)), 1)}</td>
                        <td className="band-cell" style={groupStyle(AMINO_COLORS.urea)}>{fmt(lastAminoStock.find((day) => day?.ureaStock !== null && day?.ureaStock !== undefined)?.ureaStock, 1)}</td>
                        <td className="band-cell" style={groupStyle(AMINO_COLORS.fuming)}>—</td>
                        <td className="band-cell" style={groupStyle(AMINO_COLORS.fuming)}>{fmt(sumOrNull(aminoDays.map((day) => day?.fuming)), 1)}</td>
                        <td className="band-cell" style={groupStyle(AMINO_COLORS.fuming)}>{fmt(lastAminoStock.find((day) => day?.fumingStock !== null && day?.fumingStock !== undefined)?.fumingStock, 1)}</td>
                      </>}
                      {isSulfuric && tab === 'prod' && <>
                        <td className="band-98">{fmt(sumOrNull(days.map((d) => d?.production?.acid98)), 1)}</td>
                        <td className="band-98">{fmt(sumOrNull(days.map((d) => d?.production?.flow.acid98)), 1)}</td>
                        <td className="band-98">{fmt(lastInventory?.acid98, 1)}</td>
                        <td className="band-fuming">{fmt(sumOrNull(days.map((d) => d?.production?.fuming)), 1)}</td>
                        <td className="band-fuming">{fmt(sumOrNull(days.map((d) => d?.production?.flow.fuming)), 1)}</td>
                        <td className="band-fuming">{fmt(sumOrNull(days.map((d) => d?.production?.internalFuming.aminosulfonic)), 1)}</td>
                        <td className="band-fuming">{fmt(sumOrNull(days.map((d) => d?.production?.internalFuming.anthraquinone)), 1)}</td>
                        <td className="band-fuming">{fmt(lastInventory?.fuming, 1)}</td>
                        <td className="band-reagent">{fmt(sumOrNull(days.map((d) => d?.production?.reagent)), 1)}</td>
                        <td className="band-reagent">{fmt(sumOrNull(days.map((d) => d?.production?.flow.reagent)), 1)}</td>
                        <td className="band-reagent">{fmt(lastInventory?.reagent, 1)}</td>
                        <td className="band-93">{fmt(sumOrNull(days.map((d) => d?.production?.acid93)), 1)}</td>
                        <td className="band-93">{fmt(sumOrNull(days.map((d) => d?.production?.flow.acid93)), 1)}</td>
                      </>}
                      {isSulfuric && tab === 'levels' && levelGroups.flatMap((group) => group.columns.map((level) => <td key={level.fieldId} className="band-cell" style={groupStyle(group.color)}>{levelText(lastLevelDay, level.fieldId)}</td>))}
                      {isSulfuric && tab === 'consumption' && <>
                        {meterColumns.map((meter) => <td key={meter.fieldId} className="band-cell" style={meterGroupStyle(meter.fieldId)}>{fmt(sumOrNull(days.map((day) => day?.electricity?.meters.find((value) => value.fieldId === meter.fieldId)?.usage)), 0)}</td>)}
                        <td className="band-cell" style={groupStyle(PALETTE.brand)}>{fmt(sumOrNull(days.map((day) => day?.electricity?.total)), 0)}</td>
                        <td className="band-cell" style={groupStyle(PALETTE.gray)}>{fmt(sumOrNull(days.map((day) => day?.peroxide)), 1)}</td>
                        <td className="band-cell" style={groupStyle(PALETTE.reagent)}>{fmt(sumOrNull(days.map((day) => day?.water)), 0)}</td>
                      </>}
                    </tr>
                  );
                }
                const s = { label: entry.date, value: workshop?.values[entry.index] ?? null };
                const d = dayMap.get(s.label);
                const a = aminoMap.get(s.label);
                const p = d?.production;
                return (
                  <tr key={s.label} className={`clickrow${s.label === activeDate ? ' on' : ''}`} style={s.label === activeDate ? { background: 'var(--brand-soft)' } : undefined} onClick={() => onSelectDetailDate(s.label)}>
                    <td style={{ textAlign: 'left' }}>{dayLabel(s.label)}</td>
                    {isSulfuric && tab === 'prod' && <td className="detail-total-cell">
                      {p ? <button type="button" className="hotcell" aria-label={`查看 ${s.label} 折 98% 产量计算过程`} onClick={(event) => { event.stopPropagation(); setCalcDate(s.label); }}>{fmt(p.total98Equivalent, 1)}</button> : '—'}
                    </td>}
                    {!isSulfuric && !isAmino && <td>{fmt(s.value, 1)}</td>}
                    {!isSulfuric && !isAmino && <td className="muted">{s.value !== null && avg ? `${pctChange(s.value, avg)}%` : '—'}</td>}
                    {isAmino && tab === 'prod' && <>
                      <td>{fmt(a?.production, 1)}</td>
                      {AMINO_METRICS.flatMap((metric) => [
                        <td key={`${metric.key}-used`} className="band-cell" style={groupStyle(metric.color)}>{fmt(a?.[metric.key], metric.key === 'electricity' ? 0 : 1)}</td>,
                        <td key={`${metric.key}-rate`} className="band-cell" style={groupStyle(metric.color)}>{fmt(aminoRate(a?.[metric.key], a?.production), metric.key === 'electricity' ? 1 : 2)}</td>,
                      ])}
                    </>}
                    {isAmino && tab === 'inventory' && <>
                      <td className="band-cell" style={groupStyle(AMINO_COLORS.electricity)}>{fmt(a?.finishedProduction, 1)}</td>
                      <td className="band-cell" style={groupStyle(AMINO_COLORS.electricity)}>{fmt(a?.finishedSales, 1)}</td>
                      <td className="band-cell" style={groupStyle(AMINO_COLORS.electricity)}>{fmt(a?.finishedStock, 1)}</td>
                      <td className="band-cell" style={groupStyle(AMINO_COLORS.urea)}>{fmt(a?.ureaPurchase, 1)}</td>
                      <td className="band-cell" style={groupStyle(AMINO_COLORS.urea)}>{fmt(a?.ureaWarehouseConsumption, 1)}</td>
                      <td className="band-cell" style={groupStyle(AMINO_COLORS.urea)}>{fmt(a?.ureaStock, 1)}</td>
                      <td className="band-cell" style={groupStyle(AMINO_COLORS.fuming)}>—</td>
                      <td className="band-cell" style={groupStyle(AMINO_COLORS.fuming)}>{fmt(a?.fuming, 1)}</td>
                      <td className="band-cell" style={groupStyle(AMINO_COLORS.fuming)}>{fmt(a?.fumingStock, 1)}</td>
                    </>}
                    {isSulfuric && tab === 'prod' && (
                      <>
                        <td className="band-98">{fmt(p?.acid98, 1)}</td>
                        <td className="band-98">{fmt(p?.flow.acid98, 1)}</td>
                        <td className="band-98">{fmt(d?.inventory?.acid98, 1)}</td>
                        <td className="band-fuming">{fmt(p?.fuming, 1)}</td>
                        <td className="band-fuming">{fmt(p?.flow.fuming, 1)}</td>
                        <td className="band-fuming">{fmt(p?.internalFuming.aminosulfonic, 1)}</td>
                        <td className="band-fuming">{fmt(p?.internalFuming.anthraquinone, 1)}</td>
                        <td className="band-fuming">{fmt(d?.inventory?.fuming, 1)}</td>
                        <td className="band-reagent">{fmt(p?.reagent, 1)}</td>
                        <td className="band-reagent">{fmt(p?.flow.reagent, 1)}</td>
                        <td className="band-reagent">{fmt(d?.inventory?.reagent, 1)}</td>
                        <td className="band-93">{fmt(p?.acid93, 1)}</td>
                        <td className="band-93">{fmt(p?.flow.acid93, 1)}</td>
                      </>
                    )}
                    {isSulfuric && tab === 'levels' && (
                      <>{levelGroups.flatMap((group) => group.columns.map((level) => <td key={level.fieldId} className="band-cell" style={groupStyle(group.color)}>{levelText(d, level.fieldId)}</td>))}</>
                    )}
                    {isSulfuric && tab === 'consumption' && (
                      <>
                        {meterColumns.map((meter) => <td key={meter.fieldId} className="band-cell" style={meterGroupStyle(meter.fieldId)}>{fmt(d?.electricity?.meters.find((value) => value.fieldId === meter.fieldId)?.usage ?? null, 0)}</td>)}
                        <td className="band-cell" style={{ ...groupStyle(PALETTE.brand), fontWeight: 600 }}>{fmt(d?.electricity?.total ?? null, 0)}</td>
                        <td className="band-cell" style={groupStyle(PALETTE.gray)}>{fmt(d?.peroxide, 1)}</td>
                        <td className="band-cell" style={groupStyle(PALETTE.reagent)}>{fmt(d?.water, 0)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
      </div>
        </>}
        </div>
      </div>
      <SulfuricCalculationModal day={calcDate ? dayMap.get(calcDate) ?? null : null} onClose={() => setCalcDate(null)} />
    </Dash>
  );
}
