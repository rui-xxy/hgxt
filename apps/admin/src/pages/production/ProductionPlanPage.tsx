import { useEffect, useMemo, useState } from 'react';
import { App as AntApp } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type {
  PlanCompletionRow,
  PlanConsumptionRow,
  PlanTask,
  PlanWeekRow,
  ProductionPlanBoardResult,
} from '@hgxt/shared';
// PlanWeekRow 等行类型由 API 返回值直接推断，此处仅引入图表与状态所需
import { planBoard } from '../../api/production';
import { Dash, Seg, fmt } from './dash-ui';
import { PlanTasksTable } from './PlanTasksTable';
import './dash.css';


const dg = (v: number | null): number => (v === null ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : v >= 1 ? 2 : 3);
const pctText = (v: number | null): string => (v === null ? '—' : `${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%`);
/** 完成率显示不能把“尚未完成”的 99.x% 四舍五入成 100%。 */
const completionRate = (actual: number | null, plan: number | null): number | null =>
  actual !== null && plan !== null && plan > 0 ? (actual / plan) * 100 : null;
const completionRateText = (actual: number | null, plan: number | null): string => {
  const rate = completionRate(actual, plan);
  if (rate === null) return '—';
  let shown = Math.round(rate * 10) / 10;
  if (actual !== null && plan !== null && actual < plan && shown >= 100) shown = 99.9;
  return `${Number.isInteger(shown) ? shown.toFixed(0) : shown.toFixed(1)}%`;
};
const CONSUMPTION_GRID = '120px minmax(0,1.2fr) minmax(0,1fr) 84px 64px 96px 84px 84px 84px minmax(110px,1fr)';

const deltaPct = (current: number, previous: number): number | null => previous > 0 ? ((current / previous) - 1) * 100 : null;

function WeekCard({
  row,
  metric,
  primary,
}: {
  row: PlanWeekRow;
  metric: 'production' | 'sales';
  primary: PlanConsumptionRow | null;
}) {
  const currentDaily = metric === 'production' ? row.productionDailyThis : row.salesDailyThis;
  const lastDaily = metric === 'production' ? row.productionDailyLast : row.salesDailyLast;
  const currentTotal = metric === 'production' ? row.productionThis : row.salesThis;
  const lastSame = metric === 'production' ? row.productionLast : row.salesLast;
  const change = metric === 'production' ? row.productionDelta : row.salesDelta;
  const lastFull = metric === 'production' ? row.productionLastFullWeek : row.salesLastFullWeek;
  const elapsed = currentDaily.filter((value) => value !== null).length;
  const max = Math.max(1, ...lastDaily, ...currentDaily.map((value) => value ?? 0));
  const average = elapsed > 0 ? currentTotal / elapsed : null;
  const lastAverage = lastFull !== null ? lastFull / 7 : null;
  const projected = average !== null ? average * 7 : null;
  const projectedChange = projected !== null && lastFull !== null ? deltaPct(projected, lastFull) : null;
  const unitChange = primary?.current !== null && primary?.current !== undefined && primary.lastMonth !== null
    ? deltaPct(primary.current, primary.lastMonth)
    : null;
  const unitLabel = primary
    ? `${primary.material === '蒸汽' ? '汽' : primary.material.replace('85%', '')}单耗`
    : '主要单耗';
  const days = ['一', '二', '三', '四', '五', '六', '日'];
  return (
    <div className="week-card">
      <div className="week-card-head">
        <b>{row.workshop}</b>
        <span className={`week-delta ${change === null ? 'mute' : change >= 0 ? 'up' : 'dn'}`}>{pctText(change)}</span>
      </div>
      <div className="week-card-total">
        <span>{fmt(currentTotal, 1)}<small>t</small></span>
        <span className="faint">上周同期 {fmt(lastSame, 1)}</span>
      </div>
      <div className="week-days" aria-label={`${row.workshop}${metric === 'production' ? '产量' : '销量'}逐日对比`}>
        {days.map((day, i) => {
          const current = currentDaily[i];
          const previous = lastDaily[i] ?? 0;
          const previousHeight = Math.max(previous > 0 ? 4 : 0, (previous / max) * 100);
          const currentHeight = current === null ? previousHeight : Math.max(current > 0 ? 4 : 0, (current / max) * 100);
          return (
            <div className="week-day" key={day} title={`周${day} · ${current === null ? '本周未到' : `本周 ${fmt(current, 1)} t`} · 上周 ${fmt(previous, 1)} t`}>
              <div className="week-day-bars">
                <i className="last" style={{ height: `${previousHeight}%` }} />
                <i className={current === null ? 'future' : 'current'} style={{ height: `${currentHeight}%` }} />
              </div>
              <span className={i === Math.max(0, elapsed - 1) ? 'today' : ''}>{day}</span>
            </div>
          );
        })}
      </div>
      <div className="week-card-foot">
        <div><span>日均 本周 / 上周</span><b>{fmt(average, 1)}<small>/ {fmt(lastAverage, 1)}</small></b></div>
        <div><span>{unitLabel}{primary ? ` · ${primary.unit}` : ''}</span><b>{primary?.current === null || primary?.current === undefined ? '—' : primary.current.toFixed(dg(primary.current))}<small>/ {primary?.lastMonth === null || primary?.lastMonth === undefined ? '—' : primary.lastMonth.toFixed(dg(primary.lastMonth))}</small>{unitChange !== null ? <em className={unitChange <= 0 ? 'up' : 'dn'}>{pctText(unitChange)}</em> : null}</b></div>
        <div><span>上周全周</span><b>{fmt(lastFull, 1)}<small>t</small></b></div>
        <div><span>按本周日均推算全周</span><b>{fmt(projected, 0)}<small>t</small>{projectedChange !== null ? <em className={projectedChange >= 0 ? 'up' : 'dn'}>{pctText(projectedChange)}</em> : null}</b></div>
      </div>
    </div>
  );
}

const niceChartMax = (value: number): number => {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((v) => v >= scaled) ?? 10;
  return step * magnitude;
};

function MonthlyTrend({
  row,
  year,
  timeProgress,
}: {
  row: PlanCompletionRow;
  year: number;
  timeProgress: ProductionPlanBoardResult['timeProgress'];
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const actuals = row.months.filter((month) => month.actual !== null).map((month) => month.actual as number);
  const max = niceChartMax(Math.max(1, ...row.months.map((m) => m.plan ?? 0), ...actuals) * 1.12);
  const grid = Array.from({ length: 5 }, (_, i) => (max / 4) * i);
  const remainingMonths = row.months.filter((month) => month.actual === null && month.plan !== null).length;
  const forecast = timeProgress?.dayOfYear ? (row.yearActual / timeProgress.dayOfYear) * timeProgress.daysInYear : null;
  const needMonthly = remainingMonths > 0 ? Math.max(0, row.yearPlan - row.yearActual) / remainingMonths : null;
  const recent = actuals.slice(-3);
  const recentAverage = recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : null;
  const quarters = Array.from({ length: 4 }, (_, q) => {
    const months = row.months.slice(q * 3, q * 3 + 3);
    const complete = months.every((month) => month.actual !== null);
    const plan = months.reduce((sum, month) => sum + (month.plan ?? 0), 0);
    const actual = months.reduce((sum, month) => sum + (month.actual ?? 0), 0);
    return { name: `Q${q + 1}`, rate: complete && plan > 0 ? (actual / plan) * 100 : null };
  });
  const hoveredMonth = hovered === null ? null : row.months[hovered];
  const cumulativeAtHover = hovered === null ? null : row.months.slice(0, hovered + 1).reduce((sum, month) => sum + (month.actual ?? 0), 0);
  return (
    <div className="trend-split">
      <div className="trend-left">
        <div className="trend-chart" onMouseLeave={() => setHovered(null)}>
          <div className="trend-y-axis">
            {grid.map((value, i) => <span key={value} style={{ bottom: `${i * 25}%` }}>{fmt(value, 0)}</span>)}
          </div>
          <div className="trend-plot-wrap">
            <div className="trend-plot">
              {grid.map((value, i) => <i className="trend-grid-line" key={value} style={{ bottom: `${i * 25}%` }} />)}
              <div className="trend-columns">
                {row.months.map((month, i) => {
                  const plan = month.plan ?? 0;
                  const actual = month.actual;
                  const planPct = Math.min(100, (plan / max) * 100);
                  const actualPct = actual === null ? 0 : Math.min(100, (actual / max) * 100);
                  return (
                    <div className="trend-column" key={month.month} onMouseEnter={() => setHovered(i)}>
                      {actual !== null ? <i className={month.met ? 'trend-bar plan-bar' : 'trend-bar plan-unmet'} style={{ height: `${actualPct}%` }} />
                        : plan > 0 ? <i className="trend-bar trend-future" style={{ height: `${planPct}%` }} /> : null}
                      {plan > 0 ? <i className="trend-plan-line" style={{ bottom: `${planPct}%` }} /> : null}
                      <span className="trend-value" style={{ bottom: `calc(${Math.max(planPct, actualPct)}% + 7px)` }}>{actual === null ? (plan > 0 ? fmt(plan, 0) : '') : fmt(actual, 0)}</span>
                    </div>
                  );
                })}
              </div>
              {hoveredMonth ? (
                <div className="trend-tip" style={{ left: `${Math.min(72, hovered! * (100 / 12) + 5)}%` }}>
                  <b>{year} 年 {hoveredMonth.month} 月</b>
                  <span><i>计划</i><strong>{fmt(hoveredMonth.plan, 0)} t</strong></span>
                  <span><i>实际</i><strong>{fmt(hoveredMonth.actual, 0)} t</strong></span>
                  <span><i>完成率</i><strong>{hoveredMonth.actual !== null && hoveredMonth.plan ? `${((hoveredMonth.actual / hoveredMonth.plan) * 100).toFixed(1)}%` : '—'}</strong></span>
                  <span><i>年累计完成率</i><strong>{cumulativeAtHover !== null && row.yearPlan > 0 ? `${((cumulativeAtHover / row.yearPlan) * 100).toFixed(1)}%` : '—'}</strong></span>
                </div>
              ) : null}
            </div>
            <div className="trend-month-labels">
              {row.months.map((month) => {
                const rate = completionRate(month.actual, month.plan);
                return <span key={month.month}>{month.month}月<b className={rate === null ? 'faint' : rate >= 100 ? 'up' : rate >= 90 ? 'warn' : 'dn'}>{completionRateText(month.actual, month.plan)}</b></span>;
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="trend-summary">
        <span className="faint">年度累计 · 截至 {actuals.length || '—'} 月</span>
        <div className="trend-year-total"><b>{fmt(row.yearActual, 0)}</b><span>/ {fmt(row.yearPlan, 0)} t</span></div>
        <div className="pg trend-progress"><i className={row.status === 'behind' ? 'plan-unmet' : 'plan-bar'} style={{ width: `${Math.min(100, row.yearRate ?? 0)}%` }} />{timeProgress ? <b style={{ left: `${Math.min(100, timeProgress.pct)}%` }} /> : null}</div>
        <div className="trend-progress-label"><span><b>{row.yearRate?.toFixed(1) ?? '—'}%</b> 完成率</span><span>时间进度 {timeProgress?.pct.toFixed(1) ?? '—'}%</span></div>
        <div className="trend-stats">
          <div><span>按当前速度预计全年</span><b>{fmt(forecast, 0)} t</b>{forecast !== null && row.yearPlan > 0 ? <em className={forecast >= row.yearPlan ? 'up' : 'dn'}>{forecast >= row.yearPlan ? '可完成，超 ' : '缺口 '}{fmt(Math.abs(forecast - row.yearPlan), 0)} t（{((forecast / row.yearPlan) * 100).toFixed(1)}%）</em> : null}</div>
          <div><span>剩余 {remainingMonths} 个月需月均</span><b>{fmt(needMonthly, 0)} t</b><em className="faint">近 {recent.length} 月月均 {fmt(recentAverage, 0)} t</em></div>
        </div>
        <div className="trend-quarters">
          <span className="faint">季度完成</span>
          {quarters.map((quarter) => <div className="trend-quarter" key={quarter.name}><span>{quarter.name}</span><div className="pg"><i className={quarter.rate !== null && quarter.rate >= 100 ? 'plan-bar' : 'plan-unmet'} style={{ width: `${Math.min(100, quarter.rate ?? 0)}%` }} /><b style={{ left: '100%' }} /></div><b>{quarter.rate === null ? '—' : `${quarter.rate.toFixed(1)}%`}</b></div>)}
        </div>
      </div>
    </div>
  );
}

type ViewKey = 'ps' | 'en' | 'mt';

export function ProductionPlanPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [view, setView] = useState<ViewKey>('ps');
  const [wsFilter, setWsFilter] = useState('全部');
  const [weekMetric, setWeekMetric] = useState<'production' | 'sales'>('production');
  const [trendWorkshop, setTrendWorkshop] = useState('硫酸');

  const query = useQuery({ queryKey: ['production', 'plan', year], queryFn: () => planBoard(year) });
  useEffect(() => { if (query.error) message.error(query.error.message); }, [query.error, message]);
  const data: ProductionPlanBoardResult | undefined = query.data;

  const monthLabel = data?.asOf ? `${Number(data.asOf.slice(5, 7))} 月` : '';
  // 周对比的“同期”窗口：以 asOf 所在周的周一为界（与后端口径一致），明确标出日期区间
  const asOf = data?.asOf ?? null;
  const weekRange = useMemo(() => {
    if (!asOf) return null;
    const dt = new Date(`${asOf}T00:00:00Z`);
    const weekday = dt.getUTCDay();
    const monday = new Date(dt);
    monday.setUTCDate(dt.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const d = (x: Date) => x.toISOString().slice(5, 10);
    return { fullWeek: `${d(monday)} 周一 – ${d(sunday)} 周日`, elapsedDays: weekday === 0 ? 7 : weekday };
  }, [asOf]);
  const ahead = data?.completion.filter((r) => r.status === 'ahead') ?? [];
  const onTrack = data?.completion.filter((r) => r.status === 'onTrack') ?? [];
  const behind = data?.completion.filter((r) => r.status === 'behind') ?? [];
  const monthDone = data?.completion.filter((r) => r.monthPlan !== null && r.monthPlan > 0 && r.monthActual >= r.monthPlan) ?? [];
  const monthNotDone = data?.completion.filter((r) => r.monthPlan !== null && r.monthPlan > 0 && r.monthActual < r.monthPlan) ?? [];
  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const taskCount = (f: (t: PlanTask) => boolean) => tasks.filter(f).length;

  const workshops = ['全部', ...(data?.completion.map((r) => r.workshop) ?? [])];
  const inWs = (w: string) => wsFilter === '全部' || wsFilter === w;
  const trendRow = data?.completion.find((row) => row.workshop === trendWorkshop) ?? data?.completion[0];
  const primaryConsumptionFor = (workshop: string): PlanConsumptionRow | null => {
    const specs: Record<string, { source: 'energy' | 'material'; material: string }> = {
      硫酸: { source: 'energy', material: '电' },
      氨基磺酸: { source: 'material', material: '尿素' },
      硫酸镁: { source: 'material', material: '氧化镁' },
      水滑石: { source: 'energy', material: '蒸汽' },
      二乙基蒽醌: { source: 'material', material: '苯酐' },
      丰联: { source: 'material', material: '85%磷酸' },
    };
    const spec = specs[workshop];
    if (!spec || !data) return null;
    const rows = spec.source === 'energy' ? data.energyConsumption : data.materialConsumption;
    return rows.find((row) => row.workshop === workshop && row.material === spec.material) ?? null;
  };

  const consumptionRows = (rows: PlanConsumptionRow[]) =>
    rows.map((r, i) => {
      const hiddenName = i > 0 && rows[i - 1].workshop === r.workshop;
      const vsTarget = r.current !== null && r.lastMonth !== null && r.lastMonth > 0
        ? +(((r.current - r.lastMonth) / r.lastMonth) * 100).toFixed(1) : null;
      const dv = r.deviationPct;
      const targetOk = dv !== null && dv === 0;
      const m = dv === null ? 0 : Math.min(Math.abs(dv), 10) / 10 * 50;
      return (
        <div
          className={`trow${i > 0 && rows[i - 1].workshop === r.workshop ? '' : ' gstart'}`}
          key={`${r.workshop}-${r.material}`}
          style={{ gridTemplateColumns: CONSUMPTION_GRID }}
        >
          <div className={hiddenName ? 'wsn dim' : 'wsn'}>{r.workshop}</div>
          <div>{r.material}</div>
          <div className="num r">{fmt(r.monthUsage, 1)}{r.monthUsage === null ? null : <span className="faint" style={{ fontSize: 11, marginLeft: 4 }}>{r.usageUnit}</span>}</div>
          <div className="num r" style={{ fontWeight: 600 }}>{r.current === null ? '—' : r.current.toFixed(dg(r.current))}</div>
          <div className="faint">{r.unit}</div>
          <div className="num r muted">{r.target ?? '—'}</div>
          <div className={`num r ${targetOk ? 'up' : dv !== null ? 'dn' : ''}`}>{dv === null ? '—' : dv === 0 ? '达标' : pctText(dv)}</div>
          <div className="num r muted">{r.lastMonth === null ? '—' : r.lastMonth.toFixed(dg(r.lastMonth))}</div>
          <div className={`num r ${vsTarget !== null && vsTarget <= 0 ? 'up' : vsTarget !== null ? 'dn' : ''}`}>{pctText(vsTarget)}</div>
          <div>
            <div className="ubar">
              <b />
              {dv !== null ? (
                <i style={{ left: dv >= 0 ? '50%' : `${50 - m}%`, width: `${m}%`, background: dv === 0 ? 'var(--ok)' : 'var(--danger)' }} />
              ) : null}
            </div>
          </div>
        </div>
      );
    });

  return (
    <Dash>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
        <div style={{ flex: 1 }}>
          <h1 className="h1" style={{ fontSize: 28, margin: 0 }}>计划与完成</h1>
          {data?.asOf ? <div className="sub">截至 {data.asOf} {['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${data.asOf}T00:00:00Z`).getUTCDay()]}</div> : null}
        </div>
        <Seg
          options={[{ label: `${thisYear} 年`, value: String(thisYear) }, { label: `${thisYear - 1} 年`, value: String(thisYear - 1) }]}
          value={String(year)}
          onChange={(v) => setYear(Number(v))}
        />
      </div>

      {data ? (
        <div className="kpis enter d1" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <div className="kpi">
            <div className="kl">年度时间进度</div>
            <div className="kv">{fmt(data.timeProgress?.pct ?? null, 1)}<small>%</small></div>
            <div className="kd"><span>第 {data.timeProgress?.dayOfYear ?? '—'} 天 / {data.timeProgress?.daysInYear ?? '—'} 天</span></div>
            <div className="pg" style={{ marginTop: 8 }}>
              <i className="plan-bar" style={{ width: `${data.timeProgress?.pct ?? 0}%` }} />
              <b style={{ left: '100%' }} />
            </div>
          </div>
          <div className="kpi">
            <div className="kl">年度进度达标车间</div>
            <div className="kv">{ahead.length + onTrack.length}<small>/ {data.completion.length}</small></div>
            <div className="kd">
              {onTrack.length ? <span>持平 {onTrack.length}（{onTrack.map((r) => r.workshop).join('、')}）</span> : null}
              {behind.length ? <span className="dn">滞后 {behind.length}：{behind.map((r) => r.workshop).join('、')}</span> : <span className="faint">无滞后</span>}
            </div>
          </div>
          <div className="kpi">
            <div className="kl">{monthLabel}计划完成车间</div>
            <div className="kv">{monthDone.length}<small>/ {data.completion.filter((r) => r.monthPlan !== null).length}</small></div>
            <div className="kd">
              {monthNotDone.length ? (
                <span className="dn">未完成：{monthNotDone.map((r) => `${r.workshop} ${r.monthRate?.toFixed(1)}%`).join(' · ')}</span>
              ) : <span className="faint">全部完成或未设计划</span>}
            </div>
          </div>
          <div className="kpi">
            <div className="kl">本周事项</div>
            <div className="kv">{taskCount((t) => t.period === '本周' && t.status === 'done')}<small>/ {taskCount((t) => t.period === '本周')} 已完成</small></div>
            <div className="kd">
              {/* 口径：本卡为“本周”——逾期/进行中只在周期=本周的事项里统计，历史逾期不混入 */}
              {taskCount((t) => t.period === '本周' && t.status === 'late') ? <span className="dn">{taskCount((t) => t.period === '本周' && t.status === 'late')} 项逾期</span> : null}
              <span>{taskCount((t) => t.period === '本周' && t.status === 'doing')} 项进行中</span>
              <span>下周计划 {taskCount((t) => t.period === '下周')} 项</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* 计划完成 */}
      <div className="card enter d2" style={{ marginTop: 16, padding: '18px 20px 8px' }}>
        <div className="ct">
          <b>计划完成</b>
          <div className="r">
            <button className="btn secondary sm" onClick={() => navigate('/plan/settings')}>编辑计划</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 1080 }}>
        <div className="ghd" style={{ gridTemplateColumns: '128px 64px 64px minmax(0,1fr) 4px 76px 76px minmax(0,1.2fr) 72px 92px', paddingTop: 6, paddingBottom: 4 }}>
          <span /><span style={{ gridColumn: 'span 3' }}>{monthLabel}</span><span /><span style={{ gridColumn: 'span 5' }}>{year} 年度</span>
        </div>
        <div className="prow phead" style={{ gridTemplateColumns: '128px 64px 64px minmax(0,1fr) 4px 76px 76px minmax(0,1.2fr) 72px 92px' }}>
          <span>车间 / 产品</span>
          <span className="r">计划</span><span className="r">完成</span><span>完成率</span><span />
          <span className="r">年计划</span><span className="r">累计完成</span><span>完成率</span><span className="r">按进度</span><span>较时间进度</span>
        </div>
        {(data?.completion ?? []).map((r) => {
          const tp = data?.timeProgress?.pct ?? null;
          return (
            <div className="prow" key={r.workshop} style={{ gridTemplateColumns: '128px 64px 64px minmax(0,1fr) 4px 76px 76px minmax(0,1.2fr) 72px 92px' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.workshop}</div>
                <div className="faint" style={{ fontSize: 11.5 }}>{r.basis}</div>
              </div>
              <span className="num r">{r.monthPlan === null ? '—' : fmt(r.monthPlan, 0)}</span>
              <span className="num r">{fmt(r.monthActual, 0)}</span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="pg" style={{ flex: 1 }}>
                    <i className={r.monthPlan !== null && r.monthActual >= r.monthPlan ? 'plan-bar' : 'plan-unmet'} style={{ width: `${Math.min(100, completionRate(r.monthActual, r.monthPlan) ?? 0)}%` }} />
                    <b />
                  </div>
                  <span className="num" style={{ width: 52, textAlign: 'right' }}>{completionRateText(r.monthActual, r.monthPlan)}</span>
                </div>
              </div>
              <span />
              <span className="num r">{r.yearPlan > 0 ? fmt(r.yearPlan, 0) : '—'}</span>
              <span className="num r">{fmt(r.yearActual, 0)}</span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="pg" style={{ flex: 1 }}>
                    <i className={r.status === 'behind' ? 'plan-unmet' : 'plan-bar'} style={{ width: `${Math.min(100, completionRate(r.yearActual, r.yearPlan > 0 ? r.yearPlan : null) ?? 0)}%` }} />
                    {tp !== null ? <b style={{ left: `${Math.min(100, tp)}%` }} /> : null}
                  </div>
                  <span className="num" style={{ width: 52, textAlign: 'right' }}>{completionRateText(r.yearActual, r.yearPlan > 0 ? r.yearPlan : null)}</span>
                </div>
              </div>
              <span className={`num r ${r.aheadOfProgress !== null && r.aheadOfProgress >= 0 ? 'up' : 'dn'}`}>
                {r.aheadOfProgress === null ? '—' : r.aheadOfProgress >= 0 ? `超 ${fmt(r.aheadOfProgress, 0)}` : `欠 ${fmt(Math.abs(r.aheadOfProgress), 0)}`}
              </span>
              <div>
                {r.status === 'ahead' ? <span className="st st-ok">超前 {r.statusPoints}</span>
                  : r.status === 'onTrack' ? <span className="st st-mute">持平 {r.statusPoints}</span>
                  : r.status === 'behind' ? <span className="st st-bad">滞后 {r.statusPoints}</span>
                  : <span className="faint">—</span>}
              </div>
            </div>
          );
        })}
        </div>
        </div>
      </div>

      {/* 本周 vs 上周：新版 6 车间卡片 */}
      <div className="card enter d3" style={{ marginTop: 16, padding: '18px 20px' }}>
        <div className="ct week-section-head">
          <b>本周 vs 上周</b>
          <div className="tbtabs" role="tablist">
            <button role="tab" className={weekMetric === 'production' ? 'on' : ''} onClick={() => setWeekMetric('production')}>产量</button>
            <button role="tab" className={weekMetric === 'sales' ? 'on' : ''} onClick={() => setWeekMetric('sales')}>销量</button>
          </div>
          <div className="r lg week-legend">
            <span className="faint">{weekRange ? `本周 ${weekRange.fullWeek} · 已过 ${weekRange.elapsedDays} 天` : '暂无本周数据'}</span>
            <span><i className="plan-bar" />本周</span><span><i className="plan-prev" />上周</span><span><i className="legend-dashed" />未到</span>
          </div>
        </div>
        <div className="week-card-grid">
          {(data?.week ?? []).map((row) => <WeekCard key={row.workshop} row={row} metric={weekMetric} primary={primaryConsumptionFor(row.workshop)} />)}
        </div>
      </div>

      {/* 月度完成趋势：单车间大图 + 年度分析 */}
      <div className="card enter d4" style={{ marginTop: 16, padding: '18px 20px' }}>
        <div className="ct trend-section-head">
          <b>月度完成趋势</b>
          <span>{year} 年 · {trendRow?.basis ?? '—'}</span>
          <div className="r lg">
            <span><i className="plan-bar" />达成</span><span><i className="plan-unmet" />未达成</span>
            <span><i className="ln trend-plan-legend" />月计划</span><span><i className="legend-dashed" />待完成</span>
          </div>
        </div>
        <div className="fbar trend-filter">
          {(data?.completion ?? []).map((row) => <button key={row.workshop} className={`chipbtn${trendRow?.workshop === row.workshop ? ' on' : ''}`} onClick={() => setTrendWorkshop(row.workshop)}>{row.workshop}</button>)}
        </div>
        {trendRow ? <MonthlyTrend row={trendRow} year={year} timeProgress={data?.timeProgress ?? null} /> : <div className="empty">暂无月度数据</div>}
      </div>

      {/* 产销与单耗 */}
      <div className="card enter d5" style={{ marginTop: 16, padding: '18px 20px 8px' }}>
        <div className="ct">
          <b>产销与单耗</b>
          <div className="tbtabs" role="tablist">
            <button role="tab" className={view === 'ps' ? 'on' : ''} onClick={() => setView('ps')}>产销</button>
            <button role="tab" className={view === 'en' ? 'on' : ''} onClick={() => setView('en')}>能源单耗</button>
            <button role="tab" className={view === 'mt' ? 'on' : ''} onClick={() => setView('mt')}>原辅料单耗</button>
          </div>
        </div>
        <div className="fbar">
          <span className="faint" style={{ fontSize: 12 }}>车间</span>
          {workshops.map((w) => (
            <button key={w} className={`chipbtn${wsFilter === w ? ' on' : ''}`} onClick={() => setWsFilter(w)}>{w}</button>
          ))}
        </div>
        <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: view === 'ps' ? 1080 : 1180 }}>
        <div className="swap" key={view}>
          {view === 'ps' ? (
            <div>
              <div className="trow th" style={{ gridTemplateColumns: 'minmax(0,1.2fr) repeat(7, minmax(0,1fr))' }}>
                <span>车间</span><span className="r">产量</span><span className="r">销量</span><span className="r">产销率</span>
                <span className="r">期末库存</span><span className="r">库存天数</span><span className="r">上月产量</span><span className="r">产量环比</span>
              </div>
              {(data?.sales ?? []).filter((r) => inWs(r.workshop)).map((r) => (
                <div className="trow" key={r.workshop} style={{ gridTemplateColumns: 'minmax(0,1.2fr) repeat(7, minmax(0,1fr))' }}>
                  <div className="wsn">{r.workshop}</div>
                  <span className="num r">{fmt(r.production, 0)}</span>
                  <span className="num r">{fmt(r.sales, 0)}</span>
                  <span className="num r">{r.salesRatio === null ? '—' : `${r.salesRatio}%`}</span>
                  <span className="num r">{fmt(r.inventory, 1)}</span>
                  <span className={`num r${r.inventoryDays !== null && r.inventoryDays < 5 ? ' warn' : ''}`}>{r.inventoryDays === null ? '—' : `${r.inventoryDays} 天`}</span>
                  <span className="num r muted">{fmt(r.lastMonthProduction, 0)}</span>
                  <span className={`num r ${(r.productionDelta ?? 0) >= 0 ? 'up' : 'dn'}`}>{pctText(r.productionDelta)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div className="trow th" style={{ gridTemplateColumns: CONSUMPTION_GRID }}>
                <span>车间</span>
                <span>{view === 'en' ? '能源' : '原辅料'}</span>
                <span className="r">本月用量</span><span className="r">单耗</span><span>单位</span><span className="r">目标</span>
                <span className="r">较目标</span><span className="r">上月</span><span className="r">较上月</span><span>偏离目标</span>
              </div>
              {consumptionRows((view === 'en' ? data?.energyConsumption : data?.materialConsumption)?.filter((r) => inWs(r.workshop)) ?? [])}
            </div>
          )}
        </div>
        </div>
        </div>
      </div>

      {/* 事项 */}
      <PlanTasksTable key={year} tasks={tasks} />
    </Dash>
  );
}
