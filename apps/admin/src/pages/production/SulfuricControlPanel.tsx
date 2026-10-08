import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DatePicker } from 'antd';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { SulfuricControlDay, SulfuricControlMetricKey } from '@hgxt/shared';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons';
import { useThemeMode } from '../../theme/ThemeProvider';
import { controlChartPalette } from '../../theme/tokens';
import { sulfuricControl } from '../../api/production';
import { fmt } from './dash-ui';
import './sulfuric-control.css';

type Metric = { key: SulfuricControlMetricKey; name: string; short: string; digits: number; spec?: [number, number] };
const METRICS: Metric[] = [
  { key: 'dry', name: '干燥塔', short: '干燥', digits: 2, spec: [93, 98] },
  { key: 'a1', name: '一吸塔', short: '一吸', digits: 2, spec: [98, 98.5] },
  { key: 'a2', name: '二吸塔', short: '二吸', digits: 2, spec: [97.8, 98.5] },
  { key: 'fum', name: '发烟硫酸', short: '发烟硫酸', digits: 2, spec: [104.5, 105.5] },
  { key: 's_raw', name: '原料有效硫', short: '原料有效硫', digits: 2 },
  { key: 's_feed', name: '入炉矿有效硫', short: '入炉矿有效硫', digits: 2 },
  { key: 'h2o', name: '入炉矿水分', short: '入炉矿水分', digits: 2 },
  { key: 's_cyc', name: '旋风灰硫', short: '旋风灰', digits: 2 },
  { key: 's_belt', name: '皮带渣硫', short: '皮带渣', digits: 2 },
  { key: 's_slag', name: '后室排渣硫', short: '后室排渣', digits: 2 },
  { key: 'tail', name: '尾吸塔酸浓', short: '酸浓', digits: 2 },
  { key: 'h2o2', name: '尾吸塔双氧水', short: '双氧水', digits: 2 },
  { key: 'reag', name: '试剂酸浓', short: '酸浓', digits: 2 },
  { key: 'so2', name: '风机出口 SO₂', short: 'SO₂', digits: 1 },
];
const BY_KEY = Object.fromEntries(METRICS.map((metric) => [metric.key, metric])) as Record<SulfuricControlMetricKey, Metric>;
type ChartTone = keyof typeof controlChartPalette.light;
const CHART_TONES: Record<SulfuricControlMetricKey, ChartTone> = {
  dry: 'blue', a1: 'blue', a2: 'blue', fum: 'blue',
  s_raw: 'paleBlue', s_feed: 'blue', h2o: 'amber',
  s_cyc: 'blue', s_belt: 'orange', s_slag: 'green',
  tail: 'blue', h2o2: 'green', reag: 'blue', so2: 'blue',
};
const chartColorStyle = (key: SulfuricControlMetricKey) => ({ '--hg-chart-series': `var(--hg-chart-${CHART_TONES[key]})` } as CSSProperties);
const GROUPS: Array<{ title: string; keys: SulfuricControlMetricKey[] }> = [
  { title: '干吸酸浓', keys: ['dry', 'a1', 'a2', 'fum'] },
  { title: '焙烧', keys: ['s_raw', 's_feed', 'h2o', 's_cyc', 's_belt', 's_slag'] },
  { title: '稀酸 · 试剂酸', keys: ['tail', 'h2o2', 'reag'] },
  { title: '风机', keys: ['so2'] },
];
const CATEGORIES: Array<{ key: string; title: string; keys: SulfuricControlMetricKey[]; charts: Array<{ title: string; keys: SulfuricControlMetricKey[] }> }> = [
  { key: 'dry', title: '干吸酸浓', keys: ['dry', 'a1', 'a2', 'fum'], charts: [
    { title: '干燥塔', keys: ['dry'] }, { title: '一吸塔', keys: ['a1'] },
    { title: '二吸塔', keys: ['a2'] }, { title: '发烟硫酸', keys: ['fum'] },
  ] },
  { key: 'roast', title: '焙烧', keys: ['s_raw', 's_feed', 'h2o', 's_cyc', 's_belt', 's_slag'], charts: [
    { title: '有效硫', keys: ['s_feed', 's_raw'] }, { title: '入炉矿水分', keys: ['h2o'] },
    { title: '烧渣有效硫', keys: ['s_belt', 's_cyc', 's_slag'] },
  ] },
  { key: 'dil', title: '稀酸', keys: ['tail', 'h2o2'], charts: [
    { title: '尾吸塔酸浓', keys: ['tail'] }, { title: '尾吸塔双氧水', keys: ['h2o2'] },
  ] },
  { key: 'reagent', title: '试剂酸', keys: ['reag'], charts: [{ title: '试剂酸浓', keys: ['reag'] }] },
  { key: 'fan', title: '风机', keys: ['so2'], charts: [{ title: '风机出口 SO₂', keys: ['so2'] }] },
];
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const outOfSpec = (metric: Metric, value: number | null) => value !== null && !!metric.spec && (value < metric.spec[0] || value > metric.spec[1]);
const monthDays = (month: string) => Array.from({ length: dayjs(`${month}-01`).daysInMonth() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
const valueOf = (day: SulfuricControlDay | undefined, key: SulfuricControlMetricKey) => day?.values[key] ?? null;
function SpecGauge({ metric, value }: { metric: Metric; value: number | null }) {
  if (!metric.spec) return null;
  const [low, high] = metric.spec;
  const span = high - low;
  const min = low - span * 0.7;
  const max = high + span * 0.7;
  const position = (number: number) => Math.max(1, Math.min(99, ((number - min) / (max - min)) * 100));
  return <div className="scc-spec-gauge" aria-label={`合格范围 ${low} 至 ${high}%`}>
    <div className="scc-spec-track">
      <span className="scc-spec-band" style={{ left: `${position(low)}%`, width: `${position(high) - position(low)}%` }} />
      {value !== null && <i className={outOfSpec(metric, value) ? 'bad' : ''} style={{ left: `${position(value)}%` }} />}
    </div>
    <div className="scc-spec-labels"><span>{low}</span><span>{high}</span></div>
  </div>;
}

function TrendChart({ title, keys, days, byDate, selectedDate, onSelect }: {
  title: string; keys: SulfuricControlMetricKey[]; days: string[]; byDate: Map<string, SulfuricControlDay>;
  selectedDate: string; onSelect: (date: string) => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(280);
  useEffect(() => {
    const node = chartRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setPlotWidth(Math.max(220, Math.floor(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const samples = days.flatMap((date) => keys.map((key) => valueOf(byDate.get(date), key))).filter((value): value is number => value !== null);
  const specs = keys.flatMap((key) => BY_KEY[key].spec ?? []);
  const lo = Math.min(...samples, ...specs);
  const hi = Math.max(...samples, ...specs);
  const padding = Number.isFinite(lo) ? Math.max((hi - lo) * 0.18, 0.05) : 1;
  const min = Number.isFinite(lo) ? lo - padding : 0;
  const max = Number.isFinite(hi) ? hi + padding : 1;
  const x = (index: number) => 34 + ((index + 0.5) / Math.max(1, days.length)) * (plotWidth - 40);
  const y = (value: number) => 124 - ((value - min) / Math.max(0.001, max - min)) * 110;
  const paths = keys.map((key) => {
    let open = false;
    const points = days.map((date, index) => {
      const value = valueOf(byDate.get(date), key);
      if (value === null) { open = false; return ''; }
      const command = `${open ? 'L' : 'M'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`;
      open = true;
      return command;
    }).join(' ');
    return { key, points };
  });
  const selectedIndex = days.indexOf(selectedDate);
  const spec = keys.length === 1 ? BY_KEY[keys[0]].spec : undefined;
  const measured = days.map((date) => valueOf(byDate.get(date), keys[0])).filter((value): value is number => value !== null);
  const qualified = spec ? measured.filter((value) => value >= spec[0] && value <= spec[1]).length : 0;
  const patternId = `scc-band-${keys[0]}`;
  const summary = spec ? `合格 ${qualified} / ${measured.length}`
    : measured.length ? `均 ${fmt(measured.reduce((total, value) => total + value, 0) / measured.length, BY_KEY[keys[0]].digits)}` : '—';
  return <div className="scc-trend-card">
    <div className="scc-trend-head"><b>{title}</b>{spec && <span className="scc-trend-spec">{spec[0]}–{spec[1]}</span>}
      {keys.length > 1 ? <div className="scc-trend-legend">{keys.map((key) => <span key={key} title={BY_KEY[key].name}><i style={chartColorStyle(key)} />{BY_KEY[key].short}</span>)}</div>
        : <span className="scc-trend-summary">{summary}</span>}
    </div>
    <div className="scc-trend-plot" ref={chartRef}><svg viewBox={`0 0 ${plotWidth} 160`} role="img" aria-label={`${title}月度走势`}>
      <defs><pattern id={patternId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" className="scc-band-base" /><line x1="0" y1="0" x2="0" y2="6" className="scc-band-line" /></pattern></defs>
      {spec && <rect x="34" y={y(spec[1])} width={plotWidth - 38} height={Math.max(2, y(spec[0]) - y(spec[1]))} fill={`url(#${patternId})`} />}
      {[0, 1, 2].map((index) => <g key={index}><line x1="34" x2={plotWidth - 4} y1={16 + index * 54} y2={16 + index * 54} className="scc-grid-line" /><text x="29" y={20 + index * 54} textAnchor="end" className="scc-axis-label">{fmt(max - ((max - min) / 2) * index, max - min < 2 ? 1 : 0)}</text></g>)}
      {selectedIndex >= 0 && <rect x={x(selectedIndex) - 5} y="6" width="10" height="122" className="scc-selected-band" />}
      {paths.map(({ key, points }) => <path key={key} d={points} fill="none" className="scc-series" style={chartColorStyle(key)} />)}
      {keys.map((key) => days.map((date, dayIndex) => {
        const value = valueOf(byDate.get(date), key);
        if (value === null || (!outOfSpec(BY_KEY[key], value) && date !== selectedDate)) return null;
        return <circle key={`${key}-${date}`} cx={x(dayIndex)} cy={y(value)} r={date === selectedDate ? 4 : 3} className={outOfSpec(BY_KEY[key], value) ? 'scc-point-bad' : 'scc-point'} style={chartColorStyle(key)} />;
      }))}
      {keys.map((key) => {
        const value = valueOf(byDate.get(selectedDate), key);
        return value === null || selectedIndex < 0 ? null : <text key={key} x={x(selectedIndex)} y={Math.max(12, y(value) - 9)} textAnchor="middle" className={outOfSpec(BY_KEY[key], value) ? 'scc-point-label bad' : 'scc-point-label'}>{fmt(value, BY_KEY[key].digits)}</text>;
      })}
      {[0, 7, 14, 21, days.length - 1].filter((index, position, all) => index < days.length && all.indexOf(index) === position).map((index) => <text key={index} x={x(index)} y="157" textAnchor="middle" className="scc-axis-label">{days[index].slice(5)}</text>)}
      {days.map((date, index) => <rect key={date} x={x(index) - 5} y="6" width="10" height="122" fill="transparent" className="scc-chart-hit" onClick={() => onSelect(date)}><title>{date}</title></rect>)}
    </svg></div>
  </div>;
}

export function SulfuricControlPanel() {
  const { mode } = useThemeMode();
  const chartPalette = controlChartPalette[mode];
  const chartPaletteStyle = {
    '--hg-chart-blue': chartPalette.blue,
    '--hg-chart-paleBlue': chartPalette.paleBlue,
    '--hg-chart-amber': chartPalette.amber,
    '--hg-chart-orange': chartPalette.orange,
    '--hg-chart-green': chartPalette.green,
  } as CSSProperties;
  const [month, setMonth] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState('dry');
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const query = useQuery({ queryKey: ['production', 'sulfuric-control', month], queryFn: () => sulfuricControl(month ?? undefined), placeholderData: keepPreviousData });
  const data = query.data;
  const activeMonth = month ?? data?.month ?? dayjs().format('YYYY-MM');
  const days = useMemo(() => monthDays(activeMonth), [activeMonth]);
  const visibleDays = useMemo(() => data?.month === activeMonth ? data.days : [], [activeMonth, data]);
  const byDate = useMemo(() => new Map(visibleDays.map((day) => [day.date, day])), [visibleDays]);
  const lastDayInMonth = visibleDays.at(-1)?.date ?? days[days.length - 1];
  const activeDate = selectedDate?.startsWith(`${activeMonth}-`) ? selectedDate : lastDayInMonth;
  const current = byDate.get(activeDate);
  const yesterday = byDate.get(dayjs(activeDate).subtract(1, 'day').format('YYYY-MM-DD'));
  const category = CATEGORIES.find((item) => item.key === categoryKey) ?? CATEGORIES[0];
  const firstDate = data?.availableMonths[0] ? `${data.availableMonths[0]}-01` : null;
  const selectDate = (date: string) => {
    if (date.slice(0, 7) !== activeMonth) tableScrollRef.current?.scrollTo({ top: 0, left: 0 });
    setMonth(date.slice(0, 7));
    setSelectedDate(date);
  };
  const stepDate = (delta: number) => selectDate(dayjs(activeDate).add(delta, 'day').format('YYYY-MM-DD'));
  const scrollTableToDate = (date: string) => {
    const viewport = tableScrollRef.current;
    const row = [...(viewport?.querySelectorAll<HTMLTableRowElement>('tbody tr[data-date]') ?? [])]
      .find((item) => item.dataset.date === date);
    if (!viewport || !row) return;
    const headerHeight = viewport.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const rowRect = row.getBoundingClientRect();
    const rowTop = rowRect.top - viewport.getBoundingClientRect().top + viewport.scrollTop;
    const centerOffset = Math.max(0, (viewport.clientHeight - headerHeight - rowRect.height) / 2);
    viewport.scrollTo({ top: Math.max(0, rowTop - headerHeight - centerOffset), behavior: 'smooth' });
  };

  return <section className="scc" aria-label="硫酸中控数据" style={chartPaletteStyle}>
    <header className="scc-header">
      <h1>中控数据</h1>
      <div className="scc-header-actions">
        <div className="scc-date-nav">
          <button type="button" aria-label="前一天" disabled={!firstDate || activeDate <= firstDate} onClick={() => stepDate(-1)}><ChevronLeftIcon width={16} height={16} /></button>
          <div className="scc-date-picker"><DatePicker value={dayjs(activeDate)} allowClear={false} format="YYYY 年 M 月 D 日" disabledDate={(date) => !data?.latestDate || (!!firstDate && date.format('YYYY-MM-DD') < firstDate) || date.format('YYYY-MM-DD') > data.latestDate} onChange={(date) => { if (date) selectDate(date.format('YYYY-MM-DD')); }} /><span>周{WEEK[dayjs(activeDate).day()]}</span></div>
          <button type="button" aria-label="后一天" disabled={!data?.latestDate || activeDate >= data.latestDate} onClick={() => stepDate(1)}><ChevronRightIcon width={16} height={16} /></button>
        </div>
        <button type="button" className="scc-latest" disabled={!data?.latestDate} onClick={() => { if (data?.latestDate) selectDate(data.latestDate); }}>最新</button>
      </div>
    </header>

    {query.isLoading ? <div className="scc-empty">加载中…</div> : query.error ? <div className="scc-empty">中控数据加载失败：{query.error.message}</div> : !data?.latestDate ? <div className="scc-empty">尚未录入中控数据</div> : <>
      <div className="scc-daily-layout"><div className="scc-daily-metrics">
      {GROUPS.map((group) => <div key={group.title} className="scc-daily-group">
        <div className="scc-section-title"><b>{group.title}</b>{group.keys.some((key) => BY_KEY[key].spec) && <span>合格 {group.keys.filter((key) => BY_KEY[key].spec && valueOf(current, key) !== null && !outOfSpec(BY_KEY[key], valueOf(current, key))).length} / {group.keys.filter((key) => BY_KEY[key].spec && valueOf(current, key) !== null).length}</span>}</div>
        <div className={`scc-tiles cols-${group.keys.length}`}>
          {group.keys.map((key) => {
            const metric = BY_KEY[key];
            const value = valueOf(current, key);
            const prev = valueOf(yesterday, key);
            const bad = outOfSpec(metric, value);
            return <div key={key} className={`scc-tile${metric.spec ? ' spec' : ''}${bad ? ' bad' : ''}${value === null ? ' missing' : ''}`}>
              <span className="scc-tile-name">{metric.name}</span>
              <div className="scc-tile-value">{fmt(value, metric.digits)}<small>{value === null ? '' : '%'}</small></div>
              <SpecGauge metric={metric} value={value} />
              <span className="scc-tile-change">{value === null ? '未出数' : prev === null ? '昨日 —' : `${value >= prev ? '▲' : '▼'} ${Math.abs(value - prev).toFixed(metric.digits)} 较昨日`}</span>
            </div>;
          })}
        </div>
      </div>)}
      </div><aside className="scc-notes"><div className="scc-section-title"><b>当日备注</b><span>{current?.notes.length ?? 0} 条</span></div>
        <div className="scc-notes-card">{current?.notes.length ? current.notes.map((note, index) => <div className="scc-note" key={`${index}-${note}`}><span className="scc-note-number">{index + 1}</span><p>{note}</p></div>) : <div className="scc-no-note">无</div>}</div>
      </aside></div>

      <section className="scc-month-section">
        <div className="scc-month-header"><h3>{activeMonth.slice(0, 4)} 年 {Number(activeMonth.slice(5))} 月</h3><div className="scc-category-tabs" role="tablist" aria-label="中控指标类别">
          {CATEGORIES.map((item) => <button key={item.key} type="button" role="tab" aria-selected={categoryKey === item.key} className={categoryKey === item.key ? 'on' : ''} onClick={() => { tableScrollRef.current?.scrollTo({ top: 0, left: 0 }); setCategoryKey(item.key); }}>{item.title}</button>)}
        </div></div>
        <div className={`scc-trends count-${category.charts.length}`}>{category.charts.map((chart) => <TrendChart key={chart.title} title={chart.title} keys={chart.keys} days={days} byDate={byDate} selectedDate={activeDate} onSelect={(date) => { if (date <= data.latestDate!) { setSelectedDate(date); scrollTableToDate(date); } }} />)}</div>
        <div className="scc-table-scroll" ref={tableScrollRef}><table className="scc-table"><thead><tr><th>日期</th>{category.keys.map((key) => <th key={key} title={BY_KEY[key].name}>{BY_KEY[key].short}{BY_KEY[key].spec && <small>{BY_KEY[key].spec!.join('–')}</small>}</th>)}<th>备注</th></tr></thead>
          <tbody>{[...days].reverse().filter((date) => date <= data.latestDate!).map((date) => {
            const day = byDate.get(date);
            return <tr key={date} data-date={date} className={date === activeDate ? 'on' : ''} onClick={() => setSelectedDate(date)}><td>{date.slice(5)} 周{WEEK[dayjs(date).day()]}</td>
              {category.keys.map((key) => <td key={key} className={outOfSpec(BY_KEY[key], valueOf(day, key)) ? 'bad' : ''}>{fmt(valueOf(day, key), BY_KEY[key].digits)}</td>)}
              <td className="scc-table-note" title={day?.notes.join('；')}>{day?.notes.join('；') || '—'}</td></tr>;
          })}</tbody></table></div>
      </section>
    </>}
  </section>;
}

/** 设计稿 01：左侧视图条悬停时预览最新中控读数，浮层不改变页面宽度。 */
export function SulfuricControlPeek() {
  const query = useQuery({ queryKey: ['production', 'sulfuric-control', null], queryFn: () => sulfuricControl() });
  const latest = query.data?.days.at(-1);
  const keys: SulfuricControlMetricKey[] = ['dry', 'a1', 'a2', 'fum', 's_feed', 'so2'];
  return <div className="scc-peek" role="tooltip">
    <strong>中控数据 <span>{latest?.date ?? '—'}</span></strong>
    {keys.map((key) => <div className="scc-peek-row" key={key}><span>{BY_KEY[key].name}</span><b className={outOfSpec(BY_KEY[key], valueOf(latest, key)) ? 'bad' : ''}>{fmt(valueOf(latest, key), BY_KEY[key].digits)}{valueOf(latest, key) === null ? '' : '%'}</b></div>)}
    <div className="scc-peek-note">备注 {latest?.notes.length ?? 0} 条{latest?.notes[0] ? ` · ${latest.notes[0]}` : ''}</div>
  </div>;
}
