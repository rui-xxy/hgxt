import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { App as AntApp, DatePicker } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import dayjs from 'dayjs';
import type { SulfuricDaySummary } from '@hgxt/shared';
import { sulfuricSummary, tankLevels, workshopOverview } from '../../api/production';
import { Dash, ExportButton, Kpi, MonthBars, PALETTE, Seg, downloadCsv, fmt, pctChange } from './dash-ui';
import { SulfuricCalculationModal } from './SulfuricCalculationModal';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const dayLabel = (d: string) => `${d.slice(5)} 周${WEEK[new Date(`${d}T00:00:00`).getDay()]}`;

const TITLES: Record<string, string> = {
  sulfuric: '硫酸车间',
  aminosulfonic: '氨基磺酸车间',
  magnesium: '硫酸镁车间',
  hydrotalcite: '水滑石车间',
  anthraquinone: '二乙基蒽醌车间',
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

type DetailTab = 'prod' | 'levels' | 'consumption';
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
  const [calcDate, setCalcDate] = useState<string | null>(null);

  const overview = useQuery({ queryKey: ['production', 'workshops', 0], queryFn: () => workshopOverview(0) });
  const sulfuric = useQuery({ queryKey: ['production', 'sulfuric', 0], queryFn: () => sulfuricSummary(0), enabled: code === 'sulfuric' });
  useEffect(() => { if (overview.error) message.error(overview.error.message); }, [overview.error, message]);

  const workshops = overview.data?.workshops ?? [];
  const workshop = workshops.find((w) => w.code === code) ?? workshops[0];
  const allDates = useMemo(() => overview.data?.dates ?? [], [overview.data]);
  const isSulfuric = code === 'sulfuric';

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
  const tanks = useQuery({ queryKey: ['production', 'tanks', activeDate], queryFn: () => tankLevels(activeDate ?? undefined), enabled: isSulfuric && Boolean(activeDate) });
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
        ['生产归属日', '98酸产量 t', '98酸外销 t', '98酸期末库存 t', '发烟产量 t', '发烟外销 t', '发烟内部·氨基磺酸 t', '发烟内部·蒽醌 t', '发烟期末库存 t', '试剂酸产量 t', '试剂酸外销 t', '试剂酸期末库存 t', '93酸产量 t', '93酸外销 t', '折98合计 t'],
        ...sDays.map((d, i) => [series[i].label, d?.production?.acid98 ?? null, d?.production?.flow.acid98 ?? null, d?.inventory?.acid98 ?? null, d?.production?.fuming ?? null, d?.production?.flow.fuming ?? null, d?.production?.internalFuming.aminosulfonic ?? null, d?.production?.internalFuming.anthraquinone ?? null, d?.inventory?.fuming ?? null, d?.production?.reagent ?? null, d?.production?.flow.reagent ?? null, d?.inventory?.reagent ?? null, d?.production?.acid93 ?? null, d?.production?.flow.acid93 ?? null, d?.production?.total98Equivalent ?? null]),
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
    } else {
      downloadCsv(`${TITLES[code]}-日产量-${filenamePeriod}.csv`, [['生产归属日', '日产量 t'], ...series.map((s) => [s.label, s.value])]);
    }
  };

  const kpiCount = isSulfuric ? 6 : 4;
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
    <Dash>
      <div className="enter" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="wstabs" role="tablist" aria-label="车间">
          {workshops.map((w) => (
            <button key={w.code} type="button" role="tab" className={w.code === code ? 'on' : ''} onClick={() => switchCode(w.code)}>
              {w.name}
            </button>
          ))}
        </div>
        <div className="pager">
          <button type="button" className="iconbtn" aria-label="上一个车间" onClick={() => step(-1)}><ChevronLeft size={16} strokeWidth={1.6} /></button>
          <span className="num">{idxOfCode + 1} / {workshops.length}</span>
          <button type="button" className="iconbtn" aria-label="下一个车间" onClick={() => step(1)}><ChevronRight size={16} strokeWidth={1.6} /></button>
        </div>
      </div>

      <div className="enter" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0 16px' }}>
        <h1 className="h1" style={{ fontSize: 28, flex: 1 }}>{TITLES[code] ?? '车间版面'}</h1>
        <button type="button" className={`btn sm ${range || monthKey !== currentMonth ? 'ghost' : 'secondary'}`} onClick={() => { setMonth(currentMonth); setRange(null); setSelected(null); setDetailPage(0); }}>本月</button>
        <div className="range-nav">
          <button type="button" className="iconbtn" aria-label="上一个月" onClick={() => changeMonth(-1)}><ChevronLeft size={16} strokeWidth={1.6} /></button>
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
          <button type="button" className="iconbtn" aria-label="下一个月" onClick={() => changeMonth(1)}><ChevronRight size={16} strokeWidth={1.6} /></button>
        </div>
        <ExportButton onClick={exportCsv} />
      </div>

      {workshop ? (
        <div className="kpis enter d1" style={{ gridTemplateColumns: `repeat(${kpiCount}, minmax(0, 1fr))` }}>
          <Kpi
            label={`${isSulfuric ? '折 98% 产量' : '日产量'} · ${activeDate?.slice(5) ?? '—'}`}
            value={fmt(activeValue, 1)}
            unit="t"
            delta={pctChange(activeValue, prevValue)}
            sub={`${range ? '区间' : '月'}累计 ${fmt(validSeries.length ? total : null, 0)} t`}
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
                <b>日产量</b>
                <div className="r lg">
                  <span><i style={{ width: 12, height: 0, borderTop: '1px dashed var(--ink3)', borderRadius: 0, verticalAlign: 3 }} />月均 {fmt(avg, 0)}</span>
                  <span><i style={{ background: 'var(--brand)' }} />选中日</span>
                </div>
              </div>
              <MonthBars data={series} unit={workshop.unit} tooltipOf={tooltipOf} selected={activeDate} onSelect={setSelected} />
            </div>
            <div className="right">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>{panelMode === 'day' ? (activeDate ? dayLabel(activeDate) : '—') : `${periodLabel} 累计`}</span>
                <Seg options={[{ label: '当日', value: 'day' }, { label: range ? '区间' : '本月', value: 'month' }]} value={panelMode} onChange={(v) => setPanelMode(v as 'day' | 'month')} />
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="faint" style={{ fontSize: 13 }}>{isSulfuric ? '折 98% 合计' : panelMode === 'day' ? '日产量' : '本月合计'}</div>
                <div className="kv" style={{ fontSize: 28 }}>
                  {fmt(isSulfuric ? (panelHasData ? panelTotal : null) : panelMode === 'day' ? activeValue : validSeries.length ? total : null, 1)}
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
          ) : null}
          <div className="r detail-pager">
            <span>{periodLabel} · {isSulfuric && tab === 'levels' ? '%' : isSulfuric && tab === 'consumption' ? 'kWh · t · m³' : 't'}</span>
            <button type="button" className="iconbtn" aria-label="翻到更新的明细" disabled={!canPageNewer} onClick={() => turnDetailPage('newer')}><ChevronLeft size={16} strokeWidth={1.6} /></button>
            <span>{currentDetailPage + 1} / {detailPageCount}</span>
            <button type="button" className="iconbtn" aria-label="翻到更早的明细" disabled={!canPageOlder} onClick={() => turnDetailPage('older')}><ChevronRight size={16} strokeWidth={1.6} /></button>
          </div>
        </div>
        <div className="scrolltbl">
          <table className={`dt workshop-detail-table${isSulfuric && tab === 'prod' ? ' detail-prod' : ''}`} style={productionBandStyle}>
            <thead>
              {isSulfuric && tab === 'prod' ? <>
                <tr className="grp detail-group-head">
                  <th rowSpan={2} className="detail-date-head">生产日期</th>
                  <th colSpan={3} className="colored-group-head" style={groupStyle(PALETTE.brand)}>98% 酸</th>
                  <th colSpan={5} className="colored-group-head" style={groupStyle(PALETTE.fuming)}>发烟硫酸</th>
                  <th colSpan={3} className="colored-group-head" style={groupStyle(PALETTE.reagent)}>试剂酸</th>
                  <th colSpan={2} className="colored-group-head" style={groupStyle(PALETTE.acid93)}>93% 酸</th>
                  <th rowSpan={2}>折 98% 合计</th>
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
              </> : <tr><th>生产日期</th><th>日产量 t</th><th>较月均</th></tr>}
            </thead>
            <tbody>
              {!pageEntries.length && <tr><td colSpan={!isSulfuric ? 3 : tab === 'prod' ? 15 : tab === 'levels' ? levelColumns.length + 1 : meterColumns.length + 4} className="muted">所选日期内暂无数据</td></tr>}
              {pageEntries.map((entry) => {
                if (entry.kind === 'summary') {
                  const dates = monthDays(entry.month);
                  const days = dates.map((date) => dayMap.get(date));
                  const values = dates.map((date) => workshop?.values[allDates.indexOf(date)] ?? null);
                  const lastInventory = [...days].reverse().find((d) => d?.inventory)?.inventory;
                  const lastLevelDay = [...days].reverse().find((day) => day?.levels?.some((level) => level.levelPercent !== null));
                  return (
                    <tr key={`summary-${entry.month}`} className="sum">
                      <td>合计</td>
                      {!isSulfuric && <><td>{fmt(sumOrNull(values), 1)}</td><td>—</td></>}
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
                        <td>{fmt(sumOrNull(days.map((d) => d?.production?.total98Equivalent)), 1)}</td>
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
                const p = d?.production;
                return (
                  <tr key={s.label} className={`clickrow${s.label === activeDate ? ' on' : ''}`} style={s.label === activeDate ? { background: 'var(--brand-soft)' } : undefined} onClick={() => onSelectDetailDate(s.label)}>
                    <td style={{ textAlign: 'left' }}>{dayLabel(s.label)}</td>
                    {!isSulfuric && <td>{fmt(s.value, 1)}</td>}
                    {!isSulfuric && <td className="muted">{s.value !== null && avg ? `${pctChange(s.value, avg)}%` : '—'}</td>}
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
                        <td>
                          {p ? <button type="button" className="hotcell" aria-label={`查看 ${s.label} 折 98% 产量计算过程`} onClick={(event) => { event.stopPropagation(); setCalcDate(s.label); }}>{fmt(p.total98Equivalent, 1)}</button> : '—'}
                        </td>
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
        </div>
      </div>
      <SulfuricCalculationModal day={calcDate ? dayMap.get(calcDate) ?? null : null} onClose={() => setCalcDate(null)} />
    </Dash>
  );
}
