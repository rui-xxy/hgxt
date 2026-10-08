import { useMemo, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MaterialsResult, PlanProductSalesRow } from '@hgxt/shared';
import { briefBoard, materialsSummary, sulfuricSummary, workshopOverview } from '../../api/production';
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from '../../components/icons';
import { useThemeMode } from '../../theme/ThemeProvider';
import { briefPalette } from '../../theme/tokens';
import { briefProductionRows, briefWeeklyRows, calendarProgress, chinaToday, latestProductionDate, monthDays, monthProductionAsOf, reportWeek, shiftDay, shiftMonth, weekProductionAsOf, weekStart, type BriefProductionRow } from './executiveBriefData';
import './executiveBrief.css';

const fmt = (n: number | null | undefined, digits = 3) => n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('zh-CN', { maximumFractionDigits: digits });
const pct = (n: number | null | undefined) => n === null || n === undefined ? '—' : `${fmt(n, 1)}%`;
const signed = (n: number | null, suffix = '') => n === null ? '—' : `${n > 0 ? '+' : ''}${fmt(n, 1)}${suffix}`;
const stockDate = (data: MaterialsResult | undefined) => [...(data?.rawMaterials ?? []), ...(data?.finishedProducts ?? [])].map((row) => row.stockDate).sort().at(-1) ?? null;
type Tone = 'brand' | 'neutral' | 'ok' | 'amber' | 'danger';
const toneFor = (rate: number | null, progress: number | null): Tone => rate === null || progress === null ? 'brand' : rate >= progress ? 'ok' : rate >= progress - 15 ? 'amber' : 'danger';
const departmentOf = (name: string) => ({ 硫酸: '硫酸装置', 氨基磺酸: '氨基磺酸装置', 硫酸镁: '氨基磺酸装置', 水滑石: '新材料装置', 二乙基蒽醌: '蒽醌装置', 丰联: '丰联装置' })[name as '硫酸'] ?? name;

function Meter({ value, tone = 'brand', progress }: { value: number | null; tone?: Tone; progress?: number | null }) {
  return <span className="brief-meter" aria-hidden="true">{progress !== null && progress !== undefined ? <s style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /> : null}<i className={`brief-meter-${tone}`} style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }} /></span>;
}

function Sparkline({ values }: { values: Array<number | null> }) {
  const points = values.flatMap((value, index) => value === null ? [] : [{ value, index }]);
  if (points.length < 2) return <span className="brief-na">—</span>;
  const min = Math.min(...points.map((p) => p.value)), max = Math.max(...points.map((p) => p.value));
  return <svg className="brief-sparkline" width="54" height="22" viewBox="0 0 54 22" role="img" aria-label="近四周走势"><polyline points={points.map((p) => `${4 + p.index * 14},${18 - (max === min ? 7 : (p.value - min) / (max - min) * 14)}`).join(' ')} /></svg>;
}

function ProductionSection({ rows, progress, period, month, asOf, incidents }: { rows: BriefProductionRow[]; progress: number | null; period: 'month' | 'week'; month: string | null; asOf: string | null; incidents: Array<{ start: string; end: string; reason: string | null }> }) {
  const periodLabel = period === 'week' ? '本周' : `${month ? Number(month.slice(5)) : '本'} 月`;
  const progressLabel = period === 'week' ? '本周进度' : '时间进度';
  const departments = [...new Set(rows.map((row) => departmentOf(row.workshop)))];
  const trendEnd = weekStart(asOf ?? (month ? `${month}-01` : '2026-01-01'));
  const weekLabels = Array.from({ length: 4 }, (_, index) => `${reportWeek(shiftDay(trendEnd, (index - 3) * 7)).week}周`);
  return <section className="brief-section brief-production" aria-labelledby="brief-production-title">
    <div className="brief-section-head"><div><h2 id="brief-production-title">生产</h2><span>各部门 {periodLabel} 归属生产数据 · t</span></div><div className="brief-legend"><span><i className="brief-key brief-key-ok" /> ≥ {progressLabel}</span><span><i className="brief-key brief-key-amber" /> 落后 15 pt 内</span><span><i className="brief-key brief-key-danger" /> 落后 15 pt 以上</span><span>{progressLabel} {pct(progress)}</span></div></div>
    <div className="brief-production-table-wrap"><table className="brief-table brief-production-table"><colgroup>{[98, 100, 74, 56, 56, 56, 56, 66, 78, 78, 94, 128, 76, 76].map((width, index) => <col key={index} style={{ width }} />)}</colgroup><thead>
      <tr className="brief-group-row"><th colSpan={3} /><th colSpan={5}>近四周日均产量</th><th colSpan={6} /></tr>
      <tr><th>部门</th><th>产品</th><th>上月日均</th>{weekLabels.map((label) => <th key={label}>{label}</th>)}<th>周趋势</th><th>{periodLabel}日均</th><th>{period === 'week' ? '周折算预算' : '月预算'}</th><th>实际<br />截至 {asOf?.slice(5) ?? '—'}</th><th>预算达成率</th><th>差异 t</th><th>差异 %</th></tr>
    </thead><tbody>{rows.map((row, index) => {
      const weeks = row.weeklyDaily.slice(-4), tone = toneFor(row.rate, progress);
      const difference = row.rate === null || progress === null ? null : row.rate - progress;
      return <tr key={row.workshop}><td className="brief-department">{index === 0 || departmentOf(rows[index - 1].workshop) !== departmentOf(row.workshop) ? departmentOf(row.workshop) : ''}</td><td className="brief-product"><strong>{row.workshop}</strong></td><td>{fmt(row.previousDaily, 1)}</td>{weeks.map((value, i) => <td key={i} className={value !== null && row.previousDaily !== null && value < row.previousDaily ? 'brief-week-value brief-week-low' : 'brief-week-value'}>{fmt(value, 1)}</td>)}<td><Sparkline values={weeks} /></td><td className="brief-strong">{fmt(row.daily, 1)}</td><td>{fmt(row.plan)}</td><td className="brief-strong">{fmt(row.actual)}</td><td><div className="brief-rate"><b className={`brief-${tone}`}>{pct(row.rate)}</b><Meter value={row.rate} tone={tone} progress={progress} /></div></td><td className={row.gap === null ? '' : row.gap >= 0 ? 'brief-ok' : 'brief-danger'}>{signed(row.gap)}</td><td className={difference === null ? '' : difference >= 0 ? 'brief-ok' : 'brief-danger'}>{signed(difference, '%')}</td></tr>;
    })}</tbody></table></div>
    {!rows.length ? <p className="brief-empty">该期暂无生产记录</p> : null}
    <div className="brief-mobile-production"><div className="brief-mobile-section-title"><b>{periodLabel}生产</b><span>近四周日均 · t</span></div>{rows.map((row) => {
      const weeks = row.weeklyDaily.slice(-4), tone = toneFor(row.rate, progress), max = Math.max(1, ...weeks.map((n) => n ?? 0));
      return <div className="brief-production-card" key={row.workshop}><div className="brief-production-card-head"><strong>{row.workshop}</strong><span>{departmentOf(row.workshop)}</span><b className={`brief-${tone}`}>{pct(row.rate)}</b></div><Meter value={row.rate} tone={tone} progress={progress} /><div className="brief-mobile-metrics"><span>实际 / 预算<b>{fmt(row.actual)} / {fmt(row.plan)}</b></span><span>本期日均<b>{fmt(row.daily, 1)}</b></span><span>差异<b>{signed(row.gap)} t</b></span></div><div className="brief-week-bars">{weeks.map((value, i) => <span key={i}><i style={{ height: `${value === null ? 0 : Math.max(8, value / max * 100)}%` }} /><small>{fmt(value, 1)}</small></span>)}</div></div>;
    })}</div>
    <div className="brief-production-notes">{departments.map((department) => {
      const incident = department === '硫酸装置' ? incidents[0] : null;
      return <div key={department}><div><b>{department}</b>{incident ? <span className="brief-stop">停车记录</span> : null}</div><p>{incident ? `${incident.start} 至 ${incident.end} · ${incident.reason || '未填写原因'}` : '本期暂无结构化生产异常记录'}</p></div>;
    })}</div>
  </section>;
}

function SalesSection({ sales, materials, asOf, period, progress, showLatestStock }: { sales: PlanProductSalesRow[] | null; materials: MaterialsResult | undefined; asOf: string | null; period: 'month' | 'week'; progress: number | null; showLatestStock: boolean }) {
  const leaders = [...(sales ?? [])].filter((row) => row.sales !== null).sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0)).slice(0, 3);
  const stock = [...(materials?.finishedProducts ?? [])].filter((row) => row.stock !== null).sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0)).slice(0, 5);
  const inventoryFor = (row: PlanProductSalesRow) => showLatestStock
    ? materials?.finishedProducts.find((item) => item.name === row.product)?.stock ?? null
    : null;
  const rateFor = (row: PlanProductSalesRow) => row.budget && row.sales !== null ? row.sales / row.budget * 100 : null;
  const differenceFor = (row: PlanProductSalesRow) => row.budget !== null && row.sales !== null && progress !== null
    ? row.sales - row.budget * progress / 100 : null;
  return <div className="brief-sales-layout"><section className="brief-section brief-sales" aria-labelledby="brief-sales-title"><div className="brief-section-head"><div><h2 id="brief-sales-title">销售</h2><span>{period === 'week' ? '本周' : '本月'}累计销量 · 截至 {asOf ?? '暂无记录'} · t</span></div></div>
    <div className="brief-sales-table-wrap"><table className="brief-table brief-sales-table"><thead><tr><th>产品口径</th><th>销售预算</th><th>累计销量</th><th>预算达成率</th><th>差异 %</th><th>差异 t</th><th>目前库存</th></tr></thead><tbody>{sales?.map((row) => {
      const rate = rateFor(row), difference = differenceFor(row), deltaPct = rate !== null && progress !== null ? rate - progress : null;
      return <tr key={row.product}><td><strong>{row.product}</strong></td><td>{fmt(row.budget)}</td><td className="brief-strong">{fmt(row.sales)}</td><td><div className="brief-rate"><b className={`brief-${toneFor(rate, progress)}`}>{pct(rate)}</b><Meter value={rate} tone={toneFor(rate, progress)} progress={progress} /></div></td><td className={deltaPct === null ? '' : deltaPct >= 0 ? 'brief-ok' : 'brief-danger'}>{signed(deltaPct, '%')}</td><td className={difference === null ? '' : difference >= 0 ? 'brief-ok' : 'brief-danger'}>{signed(difference)}</td><td>{fmt(inventoryFor(row))}</td></tr>;
    })}</tbody><tfoot><tr><th>预算合计</th><th>{sales?.some((row) => row.budget !== null) ? fmt(sales.reduce((sum, row) => sum + (row.budget ?? 0), 0)) : '—'}</th><th colSpan={5} /></tr><tr><th>已录入销量</th><th /><th>{sales?.some((row) => row.sales !== null) ? fmt(sales.reduce((sum, row) => sum + (row.sales ?? 0), 0)) : '—'}</th><th colSpan={4} /></tr></tfoot></table></div>
    <div className="brief-mobile-sales">{sales?.map((row) => <div className="brief-mobile-sale" key={row.product}><div className="brief-mobile-sale-head"><strong>{row.product}</strong><b>{pct(rateFor(row))}</b></div><Meter value={rateFor(row)} tone={toneFor(rateFor(row), progress)} progress={progress} /><div className="brief-mobile-metrics"><span>累计 / 预算<b>{fmt(row.sales)} / {fmt(row.budget)}</b></span><span>差异<b>{signed(differenceFor(row))} t</b></span><span>库存<b>{fmt(inventoryFor(row))}</b></span></div></div>)}</div>
    {!sales?.length ? <p className="brief-empty">该期暂无销售预算</p> : null}
  </section><aside className="brief-section brief-sales-side"><h3>{period === 'week' ? '本周' : '本月'}销售情况</h3>{leaders.length ? <ol className="brief-sales-leaders">{leaders.map((row) => <li key={row.product}><span>{row.product}</span><strong>{fmt(row.sales)} t</strong></li>)}</ol> : <p className="brief-empty">暂无可用销量记录</p>}<h3>库存高管位</h3><div className="brief-high-stock-list">{stock.map((row) => <div key={`${row.workshop}-${row.name}`}><span title={row.name}>{row.name}</span><strong>{fmt(row.stock)} t</strong></div>)}</div>{!stock.length ? <p className="brief-empty">暂无产成品库存记录</p> : null}</aside></div>;
}

function InventorySection({ data }: { data: MaterialsResult | undefined }) {
  const raw = data?.rawMaterials ?? [];
  const low = raw.filter((row) => row.daysOfUse !== null && row.daysOfUse < 10).sort((a, b) => (a.daysOfUse ?? Infinity) - (b.daysOfUse ?? Infinity));
  const groups = raw.reduce<Record<string, typeof raw>>((acc, row) => { (acc[row.workshop] ??= []).push(row); return acc; }, {});
  return <section className="brief-section brief-inventory" aria-labelledby="brief-inventory-title"><div className="brief-section-head"><div><h2 id="brief-inventory-title">原辅料库存</h2><span>截至 {stockDate(data) ?? '暂无记录'} · 按最近有效耗用计算可用天数</span></div><div className="brief-legend"><span><i className="brief-key brief-key-danger" /> &lt; 5 天</span><span><i className="brief-key brief-key-amber" /> 5–10 天</span><span><i className="brief-key brief-key-ok" /> ≥ 10 天</span></div></div>
    <div className="brief-watch-grid">{low.slice(0, 7).map((row) => <div className="brief-watch" key={`${row.workshop}-${row.name}`}><strong className={row.daysOfUse! < 5 ? 'brief-danger' : 'brief-amber'}>{fmt(row.daysOfUse, 1)}<small>天</small></strong><b title={row.name}>{row.name}</b><span title={row.workshop}>{row.workshop} · 库存 {fmt(row.stock)} {row.unit}</span></div>)}</div>
    {!low.length ? <p className="brief-empty">{raw.length ? '现有记录没有低于 10 天的原辅料' : '暂无原辅料库存记录'}</p> : null}
    <div className="brief-inventory-grid">{Object.entries(groups).map(([workshop, items]) => <div className="brief-inventory-group" key={workshop}><h3>{workshop}</h3><div className="brief-inventory-row brief-inventory-head"><span>原辅料</span><span>库存</span><span>可用天数</span><span>单耗</span><span>日耗</span></div>{items.map((row) => <div className="brief-inventory-row" key={row.name}><span className="brief-inventory-material"><strong title={row.name}>{row.name}</strong><Meter value={row.daysOfUse === null ? null : Math.min(100, row.daysOfUse / 30 * 100)} tone={row.daysOfUse === null ? 'brand' : row.daysOfUse < 5 ? 'danger' : row.daysOfUse < 10 ? 'amber' : 'ok'} /></span><span>{fmt(row.stock)}</span><b className={row.daysOfUse === null ? '' : row.daysOfUse < 5 ? 'brief-danger' : row.daysOfUse < 10 ? 'brief-amber' : 'brief-ok'}>{fmt(row.daysOfUse, 1)}</b><span>—</span><span>{row.daysOfUse && row.stock !== null ? fmt(row.stock / row.daysOfUse, 2) : '—'}</span></div>)}</div>)}</div>
  </section>;
}

export function ExecutiveBriefPage() {
  const { mode } = useThemeMode();
  const colors = briefPalette[mode];
  const briefColors = {
    '--hg-brief-ok-fill': colors.okFill,
    '--hg-brief-amber-fill': colors.amberFill,
    '--hg-brief-danger-fill': colors.dangerFill,
    '--hg-brief-ok-text': colors.okText,
    '--hg-brief-amber-text': colors.amberText,
    '--hg-brief-danger-text': colors.dangerText,
    '--hg-brief-danger-soft': colors.dangerSoft,
  } as CSSProperties;
  const overview = useQuery({ queryKey: ['production', 'workshops', 0], queryFn: () => workshopOverview(0) });
  const materials = useQuery({ queryKey: ['production', 'materials'], queryFn: materialsSummary });
  const parking = useQuery({ queryKey: ['production', 'sulfuric', 0], queryFn: () => sulfuricSummary(0) });
  const latest = overview.data ? latestProductionDate(overview.data) : null;
  const latestMonth = latest?.slice(0, 7) ?? null, latestWeek = latest ? weekStart(latest) : null;
  const [period, setPeriod] = useState<'month' | 'week'>('month');
  const [requestedMonth, setRequestedMonth] = useState<string | null>(null), [requestedWeek, setRequestedWeek] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'production' | 'sales' | 'inventory'>('production');
  const month = requestedMonth ?? latestMonth, week = requestedWeek ?? latestWeek;
  const year = period === 'week' && week ? Number(shiftDay(week, 6).slice(0, 4)) : month ? Number(month.slice(0, 4)) : new Date().getFullYear();
  const plan = useQuery({ queryKey: ['production', 'brief', year], queryFn: () => briefBoard(year), enabled: !!month });
  const firstMonth = overview.data?.dates[0]?.slice(0, 7) ?? null, firstWeek = overview.data?.dates[0] ? weekStart(overview.data.dates[0]) : null;
  const asOf = overview.data && month ? period === 'week' && week ? weekProductionAsOf(overview.data, week) : monthProductionAsOf(overview.data, month) : null;
  const today = chinaToday();
  const elapsed = calendarProgress(period, month, week, today);
  const rows = useMemo(() => overview.data && plan.data && month ? period === 'week' && week ? briefWeeklyRows(overview.data, plan.data.completion, week, asOf, year, today) : briefProductionRows(overview.data, plan.data.completion, month, asOf, today) : [], [overview.data, plan.data, month, week, period, asOf, year, today]);
  const planned = rows.filter((row) => row.plan !== null && row.plan > 0 && row.actual !== null);
  const met = elapsed === null ? [] : planned.filter((row) => row.rate !== null && row.rate >= elapsed);
  const sulfuric = rows.find((row) => row.workshop === '硫酸');
  const raw = materials.data?.rawMaterials ?? [], low = raw.filter((row) => row.daysOfUse !== null && row.daysOfUse < 10);
  const salesPeriod = period === 'month' ? plan.data?.productSalesHistory?.months.find((row) => row.key === month) : plan.data?.productSalesHistory?.weeks.find((row) => row.key === week);
  const sales = salesPeriod?.rows ?? null;
  const salesAsOf = salesPeriod?.asOf ?? null;
  const salesProgress = elapsed;
  const salesPlanned = (sales ?? []).filter((row) => row.budget !== null && row.budget > 0 && row.sales !== null);
  const salesMet = salesProgress === null ? [] : salesPlanned.filter((row) => row.sales! / row.budget! * 100 >= salesProgress);
  const salesGap = salesProgress === null ? null : salesPlanned.length ? Math.max(0, ...salesPlanned.map((row) => row.budget! * salesProgress / 100 - row.sales!)) : null;
  const incidents = (parking.data?.days ?? []).flatMap((day) => day.parkingRecords).filter((record) => period === 'week' && week ? record.start.slice(0, 10) >= week && record.start.slice(0, 10) <= shiftDay(week, 6) : record.start.slice(0, 7) === month).sort((a, b) => b.start.localeCompare(a.start));
  const error = overview.error ?? plan.error ?? materials.error;
  const selectedWeek = period === 'week' ? week : asOf ? weekStart(asOf) : null;
  const weekInfo = selectedWeek ? reportWeek(selectedWeek) : null;
  const weekLabel = weekInfo ? `${weekInfo.year} 年 · 第 ${weekInfo.week} 周` : null;
  const displayPeriod = period === 'week' && week
    ? `${weekLabel} · ${week} 至 ${shiftDay(week, 6)}`
    : month ? `${Number(month.slice(0, 4))} 年 ${Number(month.slice(5))} 月${weekInfo ? ` · 第 ${weekInfo.week} 周` : ''}` : '暂无期间';
  const stepperLabel = period === 'week' && weekInfo ? `第 ${weekInfo.week} 周` : month ? `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月` : '—';
  const heading = period === 'week' && weekInfo ? `第 ${weekInfo.week} 周生产经营简报` : month ? `${Number(month.slice(5))} 月生产经营简报` : '生产经营简报';
  const progressLabel = period === 'week' ? '本周进度' : '时间进度';

  return <main className="brief-page" style={briefColors} data-mobile-tab={mobileTab}><header className="brief-toolbar"><span className="brief-toolbar-mark">化</span><strong>生产经营简报</strong><span className="brief-toolbar-sep">/</span><span className="brief-toolbar-period">{displayPeriod}</span><div className="brief-toolbar-actions"><div className="brief-period-switch" role="group" aria-label="统计周期"><button type="button" aria-pressed={period === 'month'} onClick={() => { if (period === 'week' && week) setRequestedMonth(shiftDay(week, 6).slice(0, 7)); setPeriod('month'); }}>月度</button><button type="button" aria-pressed={period === 'week'} onClick={() => { if (period === 'month' && month) setRequestedWeek(weekStart(asOf ?? `${month}-${String(monthDays(month)).padStart(2, '0')}`)); setPeriod('week'); }}>周度</button></div><div className="brief-stepper"><button type="button" aria-label={period === 'week' ? '上一周' : '上一月'} disabled={period === 'week' ? !week || !firstWeek || week <= firstWeek : !month || !firstMonth || month <= firstMonth} onClick={() => { if (period === 'week' && week) setRequestedWeek(shiftDay(week, -7)); if (period === 'month' && month) setRequestedMonth(shiftMonth(month, -1)); }}><ChevronLeftIcon width={16} height={16} /></button><span>{stepperLabel}</span><button type="button" aria-label={period === 'week' ? '下一周' : '下一月'} disabled={period === 'week' ? !week || !latestWeek || week >= latestWeek : !month || !latestMonth || month >= latestMonth} onClick={() => { if (period === 'week' && week) setRequestedWeek(shiftDay(week, 7)); if (period === 'month' && month) setRequestedMonth(shiftMonth(month, 1)); }}><ChevronRightIcon width={16} height={16} /></button></div><button type="button" className="brief-print" onClick={() => window.print()}><DownloadIcon width={15} height={15} />导出 PDF</button></div></header>
    <div className="brief-body"><div className="brief-intro"><span className="brief-mobile-period">{displayPeriod}</span><h1>{heading}</h1></div>
      {error ? <div className="brief-error" role="alert">经营数据加载失败：{error.message}</div> : null}
      {overview.isLoading || plan.isLoading || materials.isLoading ? <div className="brief-loading" role="status">正在加载经营数据…</div> : null}
      <div className="brief-mobile-progress"><span>{progressLabel}</span><Meter value={elapsed} tone="neutral" /><strong>{pct(elapsed)}</strong></div>
      <div className="brief-mobile-tabs" role="tablist" aria-label="简报内容">{([['production', '生产'], ['sales', '销售'], ['inventory', '库存']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={mobileTab === key} onClick={() => setMobileTab(key)}>{label}</button>)}</div>
      <div className="brief-kpis"><div className="brief-kpi"><span>{period === 'week' ? '本周进度' : '时间进度'}</span><strong>{pct(elapsed)}</strong><Meter value={elapsed} tone="neutral" /><small>{period === 'week' ? '本周已过天数 ÷ 7' : '当月已过天数 ÷ 当月天数'}</small></div><div className="brief-kpi"><span>硫酸产量</span><strong>{fmt(sulfuric?.actual)}<small>t</small></strong><Meter value={sulfuric?.rate ?? null} tone={toneFor(sulfuric?.rate ?? null, elapsed)} /><small>预算 {fmt(sulfuric?.plan)} · 达成 {pct(sulfuric?.rate)}</small></div><div className="brief-kpi"><span>生产达成 ≥ 时间进度</span><strong>{planned.length ? met.length : '—'}<small> / {planned.length || '—'} 项</small></strong><div className="brief-status-dots">{rows.map((row) => <i key={row.workshop} className={`brief-dot-${toneFor(row.rate, elapsed)}`} />)}</div><small>基于已设月计划的车间</small></div><div className="brief-kpi"><span>销售达成 ≥ 时间进度</span><strong>{salesPlanned.length ? salesMet.length : '—'}<small> / {salesPlanned.length || '—'} 项</small></strong><div className="brief-status-dots">{salesPlanned.map((row) => <i key={row.product} className={`brief-dot-${toneFor(row.sales! / row.budget! * 100, salesProgress)}`} />)}</div><small>按日历进度比较</small></div><div className="brief-kpi"><span>销售最大缺口</span><strong>{fmt(salesGap)}<small>t</small></strong><Meter value={salesGap === null ? null : Math.min(100, salesGap)} tone="amber" /><small>相对日历进度</small></div><div className="brief-kpi"><span>原辅料 &lt; 10 天</span><strong>{materials.data ? low.length : '—'}<small>项</small></strong><div className="brief-status-dots">{low.slice(0, 6).map((row) => <i key={`${row.workshop}-${row.name}`} className={row.daysOfUse !== null && row.daysOfUse < 5 ? 'brief-dot-danger' : 'brief-dot-amber'} />)}</div><small>最近库存 {stockDate(materials.data) ?? '暂无记录'}</small></div></div>
      <div className={`brief-tab-pane${mobileTab === 'production' ? ' brief-tab-active' : ''}`}><ProductionSection rows={rows} progress={elapsed} period={period} month={month} asOf={asOf} incidents={incidents} /></div>
      <div className={`brief-tab-pane${mobileTab === 'sales' ? ' brief-tab-active' : ''}`}><SalesSection sales={sales} materials={materials.data} asOf={salesAsOf} period={period} progress={salesProgress} showLatestStock={period === 'month' ? month === latestMonth : week === latestWeek} /></div>
      <div className={`brief-tab-pane${mobileTab === 'inventory' ? ' brief-tab-active' : ''}`}><InventorySection data={materials.data} /></div>
    </div>
  </main>;
}
