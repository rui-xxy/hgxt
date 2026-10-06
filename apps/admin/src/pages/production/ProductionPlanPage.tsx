import { useEffect, useMemo, useState } from 'react';
import { App as AntApp } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type {
  PlanCompletionRow,
  PlanConsumptionRow,
  PlanTask,
  ProductionPlanBoardResult,
} from '@hgxt/shared';
// PlanWeekRow 等行类型由 API 返回值直接推断，此处仅引入图表与状态所需
import { planBoard } from '../../api/production';
import { Dash, Seg, fmt } from './dash-ui';
import './dash.css';

const BRAND = '#2F55A4';
const LAST_WEEK_BAR = '#C9D5EC';
const UNMET = '#9FB3DC';

const dg = (v: number | null): number => (v === null ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : v >= 1 ? 2 : 3);
const pctText = (v: number | null): string => (v === null ? '—' : `${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%`);

/** 月度趋势迷你柱图（design/plan/01：柱=实际、黑线=计划、未来月只有计划线） */
function MonthTrend({ row, year }: { row: PlanCompletionRow; year: number }) {
  const values = row.months.filter((m) => m.actual !== null).map((m) => m.actual as number);
  const plans = row.months.map((m) => m.plan ?? 0);
  const max = Math.max(1, ...values, ...plans);
  const H = 95;
  const metCount = row.months.filter((m) => m.met === true).length;
  return (
    <div className="mmcell">
      <div className="mmhead">
        <b>{row.workshop}</b>
        <span className="faint" style={{ fontSize: 12 }}>{row.basis}</span>
        <span className="faint" style={{ fontSize: 12, marginLeft: 'auto' }}>达标 {metCount} / 12 个月</span>
      </div>
      <div style={{ position: 'relative', height: H + 22 }}>
        {row.months.map((m, i) => {
          const slotW = 100 / 12;
          const x = `${i * slotW + slotW / 2}%`;
          const isFuture = m.actual === null && m.plan !== null;
          return (
            <div key={m.month} style={{ position: 'absolute', left: x, bottom: 14, transform: 'translateX(-50%)' }}>
              {m.actual !== null ? (
                <div
                  title={`${m.month} 月 · 实际 ${fmt(m.actual, 1)} / 计划 ${m.plan === null ? '—' : fmt(m.plan, 0)}`}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 10,
                    height: Math.max(2, (m.actual / max) * H),
                    borderRadius: '3px 3px 0 0',
                    background: m.met ? BRAND : UNMET,
                  }}
                />
              ) : null}
              {m.plan !== null && m.plan > 0 ? (
                <div
                  title={`${m.month} 月计划 ${fmt(m.plan, 0)} t`}
                  style={{
                    position: 'absolute',
                    bottom: (m.plan / max) * H,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 16,
                    height: 0,
                    borderTop: '2px solid var(--ink3)',
                  }}
                />
              ) : null}
              {isFuture ? <div style={{ position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)', fontSize: 10.5, color: 'var(--ink3)' }}>{m.month}</div> : null}
              {m.actual !== null ? <div style={{ position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)', fontSize: 10.5, color: 'var(--ink3)' }}>{m.month}</div> : null}
            </div>
          );
        })}
      </div>
      <div className="faint" style={{ fontSize: 11, marginTop: 20 }}>{year} 年 1 – 12 月</div>
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
  const [taskTab, setTaskTab] = useState<'week' | 'next' | 'late' | 'all'>('week');

  const query = useQuery({ queryKey: ['production', 'plan', year], queryFn: () => planBoard(year) });
  useEffect(() => { if (query.error) message.error(query.error.message); }, [query.error, message]);
  const data: ProductionPlanBoardResult | undefined = query.data;

  const monthLabel = data?.asOf ? `${Number(data.asOf.slice(5, 7))} 月` : '';
  const ahead = data?.completion.filter((r) => r.status === 'ahead') ?? [];
  const onTrack = data?.completion.filter((r) => r.status === 'onTrack') ?? [];
  const behind = data?.completion.filter((r) => r.status === 'behind') ?? [];
  const monthDone = data?.completion.filter((r) => r.monthRate !== null && r.monthRate >= 100) ?? [];
  const monthNotDone = data?.completion.filter((r) => r.monthRate !== null && r.monthRate < 100) ?? [];
  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const taskCount = (f: (t: PlanTask) => boolean) => tasks.filter(f).length;
  const taskList = useMemo(() => {
    if (taskTab === 'week') return tasks.filter((t) => t.period === '本周');
    if (taskTab === 'next') return tasks.filter((t) => t.period === '下周');
    if (taskTab === 'late') return tasks.filter((t) => t.status === 'late');
    return tasks;
  }, [tasks, taskTab]);
  const taskDisplay = taskTab === 'all' ? taskList.slice(0, 100) : taskList;

  const workshops = ['全部', ...(data?.completion.map((r) => r.workshop) ?? [])];
  const inWs = (w: string) => wsFilter === '全部' || wsFilter === w;

  const consumptionRows = (rows: PlanConsumptionRow[]) =>
    rows.map((r, i) => {
      const hiddenName = i > 0 && rows[i - 1].workshop === r.workshop;
      const vsTarget = r.current !== null && r.lastMonth !== null && r.lastMonth > 0
        ? +(((r.current - r.lastMonth) / r.lastMonth) * 100).toFixed(1) : null;
      const dv = r.deviationPct;
      const m = dv === null ? 0 : Math.min(Math.abs(dv), 10) / 10 * 50;
      return (
        <div className={`trow${i > 0 && rows[i - 1].workshop === r.workshop ? '' : ' gstart'}`} key={`${r.workshop}-${r.material}`}>
          <div className={hiddenName ? 'wsn dim' : 'wsn'}>{r.workshop}</div>
          <div>{r.material}</div>
          <div className="num r">{fmt(r.monthUsage, 1)}</div>
          <div className="num r" style={{ fontWeight: 600 }}>{r.current === null ? '—' : r.current.toFixed(dg(r.current))}</div>
          <div className="faint">{r.unit}</div>
          <div className="num r muted">{r.target ?? '—'}</div>
          <div className={`num r ${dv !== null && dv <= 0 ? 'up' : dv !== null ? 'dn' : ''}`}>{dv === null ? '—' : pctText(dv)}</div>
          <div className="num r muted">{r.lastMonth === null ? '—' : r.lastMonth.toFixed(dg(r.lastMonth))}</div>
          <div className={`num r ${vsTarget !== null && vsTarget <= 0 ? 'up' : vsTarget !== null ? 'dn' : ''}`}>{pctText(vsTarget)}</div>
          <div>
            <div className="ubar">
              <b />
              {dv !== null ? (
                <i style={{ left: dv >= 0 ? '50%' : `${50 - m}%`, width: `${m}%`, background: dv > 0 ? 'var(--danger)' : 'var(--ok)' }} />
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
              <i style={{ width: `${data.timeProgress?.pct ?? 0}%`, background: BRAND }} />
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
              {taskCount((t) => t.status === 'late') ? <span className="dn">{taskCount((t) => t.status === 'late')} 项逾期</span> : null}
              <span>{taskCount((t) => t.status === 'doing')} 项进行中</span>
              <span>下周计划 {taskCount((t) => t.period === '下周')} 项</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* 计划完成 */}
      <div className="card enter d2" style={{ marginTop: 16, padding: '18px 20px 8px' }}>
        <div className="ct">
          <b>计划完成</b>
          <span>完成率进度条上的黑色竖线：月度为 100%，年度为时间进度 {fmt(data?.timeProgress?.pct ?? null, 1)}%</span>
          <div className="r">
            <button className="btn secondary sm" onClick={() => navigate('/plan/settings')}>编辑计划</button>
          </div>
        </div>
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
                    <i style={{ width: `${Math.min(100, r.monthRate ?? 0)}%`, background: r.monthRate !== null && r.monthRate >= 100 ? BRAND : UNMET }} />
                    <b />
                  </div>
                  <span className="num" style={{ width: 46, textAlign: 'right' }}>{r.monthRate === null ? '—' : `${Math.round(r.monthRate)}%`}</span>
                </div>
              </div>
              <span />
              <span className="num r">{r.yearPlan > 0 ? fmt(r.yearPlan, 0) : '—'}</span>
              <span className="num r">{fmt(r.yearActual, 0)}</span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="pg" style={{ flex: 1 }}>
                    <i style={{ width: `${Math.min(100, r.yearRate ?? 0)}%`, background: r.status === 'behind' ? UNMET : BRAND }} />
                    {tp !== null ? <b style={{ left: `${Math.min(100, tp)}%` }} /> : null}
                  </div>
                  <span className="num" style={{ width: 46, textAlign: 'right' }}>{r.yearRate === null ? '—' : `${Math.round(r.yearRate)}%`}</span>
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
        <div className="faint" style={{ fontSize: 12, padding: '8px 8px 10px' }}>较时间进度单位为百分点（±2 内显示为持平）</div>
      </div>

      {/* 本周 vs 上周 */}
      <div className="card enter d3" style={{ marginTop: 16, padding: '18px 20px 8px' }}>
        <div className="ct">
          <b>本周 vs 上周</b>
          <span>产量 / 销量对比上周同期 · 单位 t</span>
        </div>
        <div className="prow phead" style={{ gridTemplateColumns: '110px minmax(0,1.3fr) 72px minmax(0,1.3fr) 72px 92px' }}>
          <span>车间</span><span>产量 · 本周 / 上周同期</span><span className="r">环比</span>
          <span>销量 · 本周 / 上周同期</span><span className="r">环比</span><span className="r">上周全周产量</span>
        </div>
        {(data?.week ?? []).map((r) => {
          const maxP = Math.max(r.productionThis, r.productionLast ?? 0, 1);
          const maxS = Math.max(r.salesThis, r.salesLast ?? 0, 1);
          return (
            <div className="prow" key={r.workshop} style={{ gridTemplateColumns: '110px minmax(0,1.3fr) 72px minmax(0,1.3fr) 72px 92px' }}>
              <span style={{ fontWeight: 600 }}>{r.workshop}</span>
              <div className="wk">
                <span className="faint" style={{ fontSize: 11 }}>本 {fmt(r.productionThis, 0)}</span>
                <div style={{ display: 'grid', gap: 3 }}>
                  <div className="bar-in" style={{ height: 7 }}><i style={{ width: `${(r.productionThis / maxP) * 100}%`, background: BRAND }} /></div>
                  <div className="bar-in" style={{ height: 7 }}><i style={{ width: `${((r.productionLast ?? 0) / maxP) * 100}%`, background: LAST_WEEK_BAR }} /></div>
                </div>
              </div>
              <span className={`num r ${(r.productionDelta ?? 0) >= 0 ? 'up' : 'dn'}`}>{pctText(r.productionDelta)}</span>
              <div className="wk">
                <span className="faint" style={{ fontSize: 11 }}>上 {fmt(r.salesThis, 0)}</span>
                <div style={{ display: 'grid', gap: 3 }}>
                  <div className="bar-in" style={{ height: 7 }}><i style={{ width: `${(r.salesThis / maxS) * 100}%`, background: BRAND }} /></div>
                  <div className="bar-in" style={{ height: 7 }}><i style={{ width: `${((r.salesLast ?? 0) / maxS) * 100}%`, background: LAST_WEEK_BAR }} /></div>
                </div>
              </div>
              <span className={`num r ${(r.salesDelta ?? 0) >= 0 ? 'up' : 'dn'}`}>{pctText(r.salesDelta)}</span>
              <span className="num r muted">{fmt(r.productionLastFullWeek, 0)}</span>
            </div>
          );
        })}
      </div>

      {/* 月度完成趋势 */}
      <div className="card enter d4" style={{ marginTop: 16, padding: '18px 20px' }}>
        <div className="ct">
          <b>月度完成趋势</b>
          <span>{year} 年 1 – 12 月</span>
          <div className="r lg">
            <span><i style={{ background: BRAND }} />达成计划</span>
            <span><i style={{ background: UNMET }} />未达成</span>
            <span><i className="ln" style={{ borderTop: '2px solid var(--ink3)' }} />月计划</span>
          </div>
        </div>
        <div className="mm">
          {(data?.completion ?? []).map((r) => <MonthTrend key={r.workshop} row={r} year={year} />)}
        </div>
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
          <span className="muted" style={{ fontSize: 12.5 }}>
            {view === 'ps' ? `${monthLabel} · 单位 t · 库存天数 = 期末库存 ÷ 日均销量` : `单耗 = 用量 ÷ 产量 · 目标来自计划设置（${monthLabel}口径）`}
          </span>
        </div>
        <div className="fbar">
          <span className="faint" style={{ fontSize: 12 }}>车间</span>
          {workshops.map((w) => (
            <button key={w} className={`chipbtn${wsFilter === w ? ' on' : ''}`} onClick={() => setWsFilter(w)}>{w}</button>
          ))}
        </div>
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
              <div className="trow th" style={{ gridTemplateColumns: '120px minmax(0,1.2fr) minmax(0,1fr) 84px 64px 84px 84px 84px 84px minmax(0,1fr)' }}>
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

      {/* 事项 */}
      <div className="card enter d5" style={{ marginTop: 16, padding: '18px 20px 8px' }}>
        <div className="ct">
          <b>事项</b>
          <div className="tbtabs" role="tablist">
            <button role="tab" className={taskTab === 'week' ? 'on' : ''} onClick={() => setTaskTab('week')}>本周 {taskCount((t) => t.period === '本周')}</button>
            <button role="tab" className={taskTab === 'next' ? 'on' : ''} onClick={() => setTaskTab('next')}>下周 {taskCount((t) => t.period === '下周')}</button>
            <button role="tab" className={taskTab === 'late' ? 'on' : ''} onClick={() => setTaskTab('late')}>逾期 {taskCount((t) => t.status === 'late')}</button>
            <button role="tab" className={taskTab === 'all' ? 'on' : ''} onClick={() => setTaskTab('all')}>全部 {tasks.length}</button>
          </div>
        </div>
        {taskDisplay.length ? (
          <div>
            <div className="trow th" style={{ gridTemplateColumns: '76px minmax(0,2fr) 110px 84px 72px 80px 84px minmax(0,1.4fr)' }}>
              <span>状态</span><span>事项</span><span>部门</span><span>重要程度</span><span>负责人</span><span>计划完成</span><span>进度</span><span>完成情况说明</span>
            </div>
            {taskDisplay.map((t, i) => (
              <div className="trow" key={`${t.matter}-${i}`} style={{ gridTemplateColumns: '76px minmax(0,2fr) 110px 84px 72px 80px 84px minmax(0,1.4fr)' }}>
                <div>
                  {t.status === 'done' ? <span className="st st-ok">已完成</span>
                    : t.status === 'late' ? <span className="st st-bad">逾期</span>
                    : t.status === 'doing' ? <span className="st st-warn">进行中</span>
                    : <span className="st st-mute">未开始</span>}
                </div>
                <span style={{ fontWeight: 500 }}>{t.matter}</span>
                <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.department}</span>
                <span className="muted">{t.importance}</span>
                <span>{t.owner}</span>
                <span className="num">{t.dueDate?.slice(5) ?? '—'}</span>
                <span className="muted">{t.progress || '—'}</span>
                <span className="faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.completionNote}</span>
              </div>
            ))}
          </div>
        ) : <div className="empty">暂无事项</div>}
        <div className="faint" style={{ fontSize: 12, padding: '8px 10px 10px' }}>
          来自「2026年事项表」表单提交（{year} 年度共 {tasks.length} 条{taskTab === 'all' && taskList.length > taskDisplay.length ? `，仅显示前 ${taskDisplay.length} 条` : ''}）；周期按计划完成日所在周推导
        </div>
      </div>
    </Dash>
  );
}
