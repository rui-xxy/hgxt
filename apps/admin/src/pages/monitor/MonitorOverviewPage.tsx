import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { App, Button, DatePicker, Segmented, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import {
  MONITOR_DEVICE_LABELS,
  MONITOR_SECURITY_KIND_LABELS,
  shiftDateKey,
  shanghaiDateKey,
  type MonitorAction,
  type MonitorDevice,
  type MonitorLogTab,
} from '@hgxt/shared';
import {
  downloadMonitorLogsCsv,
  monitorDepartments,
  monitorLogs,
  monitorOnline,
  monitorOverview,
  monitorPages,
  monitorSecurity,
} from '../../api/monitor';
import { DeviceMonitorIcon, DownloadIcon, SmartphoneIcon } from '../../components/icons';
import { PageHeader } from '../../components/PageHeader';
import { TablePageFooter } from '../../components/PageNavigator';
import {
  countLabel,
  deltaLabel,
  dwellLabel,
  hoursLabel,
  onlineMinutesLabel,
  timeOf,
} from './monitorFormat';
import './monitor.css';

const LOG_TABS: Array<{ value: MonitorLogTab; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'login', label: '登录' },
  { value: 'view', label: '页面访问' },
  { value: 'data', label: '数据操作' },
];

const LIVE_REFETCH_MS = 60_000;

type Period = { mode: 'today' } | { mode: 'week' } | { mode: 'custom'; from: string; to: string };

/** 柱状图归一化：小时模式 main=当日、prev=前一日；多日模式只有 main */
interface ChartBar {
  key: string;
  label: string;
  main: number;
  prev: number | null;
  isPeak: boolean;
}

function clockOf(date = new Date()): string {
  return new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(11, 16);
}

function secondsOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString().slice(11, 19);
}

function DeviceChip({ device }: { device: MonitorDevice }) {
  const Icon = device === 'mobile' ? SmartphoneIcon : DeviceMonitorIcon;
  return (
    <span className="mon-chip">
      <Icon width={12} height={12} strokeWidth={1.6} />
      {MONITOR_DEVICE_LABELS[device]}
    </span>
  );
}

/** 日志动作的弱化/强调：失败标红、登出弱化，其余正常墨色 */
function actionTone(action: MonitorAction): string {
  if (action === 'login_failed') return 'mon-action-failed';
  if (action === 'logout') return 'mon-action-logout';
  return '';
}

export function MonitorOverviewPage() {
  const { message } = App.useApp();
  const today = shanghaiDateKey(new Date());
  const [period, setPeriod] = useState<Period>({ mode: 'today' });
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [clock, setClock] = useState(clockOf());
  const [logTab, setLogTab] = useState<MonitorLogTab>('all');
  const [department, setDepartment] = useState<string>('');
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(12);

  const { from, to, periodLabel } = useMemo(() => {
    if (period.mode === 'custom' && period.from) return { from: period.from, to: period.to, periodLabel: `${period.from} 至 ${period.to}` };
    if (period.mode === 'week') {
      const start = shiftDateKey(today, -6);
      return { from: start, to: today, periodLabel: `近 7 天（${start} 至 ${today}）` };
    }
    return { from: today, to: today, periodLabel: '今天' };
  }, [period, today]);

  // 实时时钟（分钟粒度，与自动刷新节奏一致）
  useEffect(() => {
    const timer = window.setInterval(() => setClock(clockOf()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const overview = useQuery({
    queryKey: ['monitor', 'overview', from, to],
    queryFn: () => monitorOverview(from, to),
    refetchInterval: LIVE_REFETCH_MS,
  });
  const security = useQuery({
    queryKey: ['monitor', 'security', from, to],
    queryFn: () => monitorSecurity(from, to),
    refetchInterval: LIVE_REFETCH_MS,
  });
  const online = useQuery({
    queryKey: ['monitor', 'online'],
    queryFn: monitorOnline,
    refetchInterval: LIVE_REFETCH_MS,
  });
  const pages = useQuery({
    queryKey: ['monitor', 'pages', from, to],
    queryFn: () => monitorPages(from, to),
    refetchInterval: LIVE_REFETCH_MS,
  });
  const departments = useQuery({
    queryKey: ['monitor', 'departments', to],
    queryFn: () => monitorDepartments(to),
    refetchInterval: LIVE_REFETCH_MS,
  });
  const logs = useQuery({
    queryKey: ['monitor', 'logs', logTab, department, from, to, logPage, logPageSize],
    queryFn: () => monitorLogs({ tab: logTab, department: department || undefined, from, to, page: logPage, pageSize: logPageSize }),
    placeholderData: (previous) => previous,
    refetchInterval: LIVE_REFETCH_MS,
  });

  const departmentOptions = useMemo(() => {
    const names = [...new Set((departments.data?.rows ?? []).map((row) => row.department))];
    return [
      { value: '', label: '部门：全部' },
      ...names.map((name) => ({ value: name === '未分配' ? 'none' : name, label: name })),
    ];
  }, [departments.data]);

  const handleExport = async () => {
    try {
      const { total, exported } = await downloadMonitorLogsCsv({
        tab: logTab,
        department: department || undefined,
        from,
        to,
      });
      if (total > exported) {
        message.warning(`共 ${total.toLocaleString('zh-CN')} 条日志，CSV 仅包含最近 ${exported.toLocaleString('zh-CN')} 条`);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败');
    }
  };

  const kpis = overview.data?.kpis;
  const deltaMinutes = kpis?.onlineHours.deltaMinutes ?? null;

  /** 柱状图数据 + 峰值标记 + 坐标轴刻度 */
  const chart = useMemo(() => {
    const data = overview.data?.chart;
    if (data?.mode === 'hourly') {
      const peakHour = data.hours.reduce((best, row) => (row.today > best.today ? row : best), data.hours[0]);
      const bars: ChartBar[] = data.hours.map((row) => ({
        key: `h${row.hour}`,
        label: `${String(row.hour).padStart(2, '0')}:00`,
        main: row.today,
        prev: row.yesterday,
        isPeak: peakHour.today > 0 && row.hour === peakHour.hour,
      }));
      return {
        bars,
        max: Math.max(1, ...data.hours.flatMap((row) => [row.today, row.yesterday])),
        axis: ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00'],
      };
    }
    const days =
      data?.mode === 'daily'
        ? data.days
        : Array.from({ length: 7 }, (_, index) => ({ date: shiftDateKey(today, index - 6), views: 0 }));
    const best = days.reduce((acc, row) => (row.views > acc.views ? row : acc), days[0]);
    return {
      bars: days.map((row) => ({
        key: row.date,
        label: row.date.slice(5),
        main: row.views,
        prev: null,
        isPeak: best.views > 0 && row.date === best.date,
      })),
      max: Math.max(1, ...days.map((row) => row.views)),
      axis: days.map((row) => row.date.slice(5).replace('-', '/')),
    };
  }, [overview.data, today]);

  return (
    <div className="mon-page">
      <PageHeader
        title="访问监控"
        description={`实时 · ${clock} · 每分钟自动刷新 · ${periodLabel}`}
        extra={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Segmented
              value={period.mode === 'custom' ? 'custom' : period.mode}
              onChange={(value) => {
                if (value === 'today') setPeriod({ mode: 'today' });
                else if (value === 'week') setPeriod({ mode: 'week' });
                else {
                  if (range?.[0] && range[1]) {
                    const start = range[0].format('YYYY-MM-DD');
                    const end = range[1].format('YYYY-MM-DD');
                    setPeriod({ mode: 'custom', from: start <= end ? start : end, to: start <= end ? end : start });
                  } else {
                    setPeriod({ mode: 'custom', from: today, to: today });
                  }
                }
              }}
              options={[
                { value: 'today', label: '今天' },
                { value: 'week', label: '近 7 天' },
                { value: 'custom', label: '自定义' },
              ]}
            />
            {period.mode === 'custom' ? (
              <DatePicker.RangePicker
                size="middle"
                value={range}
                onChange={(value) => {
                  if (value?.[0] && value[1]) {
                    const start = value[0].format('YYYY-MM-DD');
                    const end = value[1].format('YYYY-MM-DD');
                    const from = start <= end ? start : end;
                    const to = start <= end ? end : start;
                    if (dayjs(to).diff(dayjs(from), 'day') >= 92) {
                      message.warning('一次最多查看 92 天');
                      return;
                    }
                    setRange(value);
                    setPeriod({ mode: 'custom', from, to });
                  } else {
                    setRange(value);
                  }
                }}
                disabledDate={(current) => current && current.isAfter(dayjs(today), 'day')}
                allowEmpty={[false, false]}
              />
            ) : null}
            <Button icon={<DownloadIcon width={15} height={15} />} onClick={handleExport}>
              导出
            </Button>
          </div>
        }
      />

      {/* KPI 行 */}
      <div className="mon-kpis">
        <div className="mon-kpi">
          <span className="mon-kpi-label">当前在线</span>
          <span className="mon-kpi-value is-ok">{countLabel(kpis?.online.count ?? 0)}<small>人</small></span>
          <span className="mon-kpi-sub">电脑 {kpis?.online.desktop ?? 0} · 手机 {kpis?.online.mobile ?? 0}</span>
        </div>
        <div className="mon-kpi">
          <span className="mon-kpi-label">{period.mode === 'today' ? '今日登录' : '期间登录'}</span>
          <span className="mon-kpi-value">{countLabel(kpis?.logins.users ?? 0)}<small>/ {kpis?.logins.totalUsers ?? 0} 人</small></span>
          <span className="mon-kpi-sub">登录率 {kpis?.logins.rate !== undefined && kpis?.logins.rate !== null ? `${Math.round(kpis.logins.rate * 100)}%` : '—'}</span>
        </div>
        <div className="mon-kpi">
          <span className="mon-kpi-label">页面访问</span>
          <span className="mon-kpi-value">{countLabel(kpis?.pageViews.count ?? 0)}<small>次</small></span>
          <span className="mon-kpi-sub">人均 {kpis?.pageViews.perUser !== undefined && kpis?.pageViews.perUser !== null ? kpis.pageViews.perUser.toFixed(1) : '—'} 次</span>
        </div>
        <div className="mon-kpi">
          <span className="mon-kpi-label">人均在线时长</span>
          <span className="mon-kpi-value">{hoursLabel(kpis?.onlineHours.avg ?? null)}<small>h</small></span>
          <span className="mon-kpi-sub">
            {deltaMinutes === null ? '较上一周期 —' : `较上一周期 ${deltaMinutes > 0 ? '+' : ''}${deltaMinutes} 分钟`}
          </span>
        </div>
        <div className="mon-kpi">
          <span className="mon-kpi-label">7 天未登录</span>
          <span className="mon-kpi-value">{countLabel(kpis?.inactive7d.count ?? 0)}<small>人</small></span>
          <span className="mon-kpi-sub">
            {kpis?.inactive7d.names.length ? `${kpis.inactive7d.names.join('、')}${kpis.inactive7d.count > kpis.inactive7d.names.length ? ' 等' : ''}` : '全员近期均有登录'}
          </span>
        </div>
        <div className="mon-kpi">
          <span className="mon-kpi-label">安全提醒</span>
          <span className="mon-kpi-value is-amber">
            {countLabel(kpis?.security ?? 0)}<small>条</small>
          </span>
          <span className="mon-kpi-sub">登录失败 · 非工作时间 · 导出 · 新设备</span>
        </div>
      </div>

      {/* 趋势 + 右栏 */}
      <div className="mon-main">
        <section className="mon-panel" aria-label="访问走势">
          <div className="mon-panel-head">
            <span className="mon-panel-title">{period.mode === 'today' ? '今日访问' : '访问走势'}</span>
            <span className="mon-panel-hint">
              页面访问次数 · {overview.data?.chart.mode === 'hourly' ? '按小时' : '按天'} · {periodLabel}
            </span>
          </div>
          <div className="mon-chart" role="img" aria-label="访问次数柱状图">
            {chart.bars.map((bar) => (
              <div
                key={bar.key}
                className="mon-bar-col"
                title={`${bar.label}：${bar.main} 次${bar.prev !== null ? `（前一日 ${bar.prev}）` : ''}`}
              >
                <div className="mon-bar-stack">
                  {bar.prev !== null ? <i className="mon-bar prev" style={{ height: `${(bar.prev / chart.max) * 100}%` }} /> : null}
                  <i
                    className={`mon-bar${bar.isPeak ? ' is-peak' : ''}`}
                    style={{ height: `${Math.max(bar.main > 0 ? 3 : 0, (bar.main / chart.max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mon-chart-axis" aria-hidden="true">
            {chart.axis.map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="mon-chart-stats">
            <div className="mon-stat">
              <span className="mon-stat-label">访问高峰</span>
              <span className="mon-stat-value">{overview.data?.peak ? `${overview.data.peak.label} · ${overview.data.peak.count} 次` : '—'}</span>
            </div>
            <div className="mon-stat">
              <span className="mon-stat-label">登录</span>
              <span className="mon-stat-value">
                {overview.data ? `${countLabel(overview.data.loginStat.count)} 次 · ${overview.data.loginStat.users} 人` : '—'}
              </span>
            </div>
            <div className="mon-stat">
              <span className="mon-stat-label">设备</span>
              <span className="mon-stat-value">
                {overview.data
                  ? `电脑 ${Math.round(overview.data.deviceSplit.desktop * 100)}% · 手机 ${Math.round(overview.data.deviceSplit.mobile * 100)}%`
                  : '—'}
              </span>
              <span className="mon-split-bar" aria-hidden="true">
                <i className="sp-desktop" style={{ width: `${Math.round((overview.data?.deviceSplit.desktop ?? 0) * 100)}%` }} />
              </span>
            </div>
          </div>
        </section>

        <div className="mon-side">
          <section className="mon-panel" aria-label="安全提醒">
            <div className="mon-panel-head">
              <span className="mon-panel-title">安全提醒</span>
              <span className="mon-panel-hint">{periodLabel} {security.data ? `${security.data.total} 条` : ''}</span>
            </div>
            <div className="mon-alerts">
              {security.data?.items.length ? (
                security.data.items.map((item, index) => (
                  <div key={`${item.time}-${index}`} className={`mon-alert${item.kind === 'login_failed' ? ' is-danger' : item.kind === 'off_hours' || item.kind === 'new_device' ? ' is-amber' : ''}`}>
                    <span className="mon-alert-time">{timeOf(item.time, today)}</span>
                    <div className="mon-alert-body">
                      <span className="mon-alert-kind">
                        {MONITOR_SECURITY_KIND_LABELS[item.kind]} · {item.name || item.username}
                      </span>
                      <span className="mon-alert-detail" title={item.detail}>
                        {item.detail}
                        {item.ip ? ` · ${item.ip}` : ''}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="mon-table-empty">{security.isLoading ? '正在加载…' : '本期没有需要关注的安全事件'}</p>
              )}
            </div>
          </section>

          <section className="mon-panel" aria-label="当前在线">
            <div className="mon-panel-head">
              <span className="mon-panel-title">当前在线</span>
              <span className="mon-panel-hint">{online.data ? `${online.data.count} 人` : ''} · 10 分钟内活跃</span>
            </div>
            <div className="mon-online-list">
              {online.data?.items.length ? (
                online.data.items.map((item) => (
                  <Link key={item.userId ?? item.username} to={item.userId ? `/monitor/${item.userId}` : '#'} className="mon-online-item">
                    <span className="mon-avatar">{(item.name || item.username).charAt(0)}</span>
                    <span className="mon-online-main">
                      <span className="mon-online-name">{item.name || item.username}</span>
                      <span className="mon-online-meta">
                        {[item.department, item.pageLabel].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="mon-online-side">
                      <DeviceChip device={item.device} />
                      <span>{onlineMinutesLabel(item.minutes)}</span>
                    </span>
                  </Link>
                ))
              ) : (
                <p className="mon-table-empty">{online.isLoading ? '正在加载…' : '当前没有成员在线'}</p>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* 页面热度 */}
      <section className="mon-panel" aria-label="页面热度">
        <div className="mon-panel-head">
          <span className="mon-panel-title">页面热度</span>
          <span className="mon-panel-hint">{periodLabel} · 前 10</span>
        </div>
        <div className="mon-table-wrap">
          <table className="mon-table">
            <thead>
              <tr>
                <th style={{ width: 34 }} />
                <th>页面</th>
                <th>类别</th>
                <th className="num">访问</th>
                <th className="num">人数</th>
                <th className="num">平均停留</th>
                <th className="num">较上期</th>
              </tr>
            </thead>
            <tbody>
              {(pages.data?.rows ?? []).slice(0, 10).map((row, index) => (
                <tr key={row.groupKey}>
                  <td className={`mon-rank${index < 3 ? ' top' : ''}`}>{index + 1}</td>
                  <td title={row.label}>{row.label}</td>
                  <td><span className="mon-chip">{row.category}</span></td>
                  <td className="num">{countLabel(row.views)}</td>
                  <td className="num">{row.users}</td>
                  <td className="num">{dwellLabel(row.avgDwellSec)}</td>
                  <td className={`num ${row.deltaPct === null ? 'mon-delta-flat' : row.deltaPct >= 0 ? 'mon-delta-pos' : 'mon-delta-neg'}`}>
                    {deltaLabel(row.deltaPct)}
                  </td>
                </tr>
              ))}
              {!pages.data?.rows.length ? (
                <tr><td colSpan={7} className="mon-table-empty">{pages.isLoading ? '正在加载…' : '本期暂无页面访问记录'}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* 部门活跃 */}
      <section className="mon-panel" aria-label="部门活跃">
        <div className="mon-panel-head">
          <span className="mon-panel-title">部门活跃</span>
          <span className="mon-panel-hint">近 7 天每日登录人数 · 截至 {to}</span>
        </div>
        <div className="mon-table-wrap">
          <table className="mon-table">
            <thead>
              <tr>
                <th>部门</th>
                {(departments.data?.dates ?? []).map((date) => (
                  <th key={date} className="num">{Number(date.slice(8))} 日</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(departments.data?.rows ?? []).map((row) => {
                const max = Math.max(1, ...row.counts);
                return (
                  <tr key={row.department}>
                    <td>{row.department}</td>
                    {row.counts.map((count, index) => (
                      <td key={index} className="mon-cell">
                        <span className={count === 0 ? 'zero' : count === max && max > 1 ? 'hot' : ''}>
                          {count === 0 ? '·' : count}
                        </span>
                      </td>
                    ))}
                  </tr>
                );
              })}
              {!departments.data?.rows.length ? (
                <tr><td colSpan={8} className="mon-table-empty">{departments.isLoading ? '正在加载…' : '近 7 天暂无登录记录'}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* 访问日志 */}
      <section className="mon-panel" aria-label="访问日志">
        <div className="mon-logbar">
          <Segmented
            value={logTab}
            onChange={(value) => { setLogTab(value as MonitorLogTab); setLogPage(1); }}
            options={LOG_TABS}
          />
          <Select
            size="middle"
            style={{ minWidth: 150 }}
            value={department}
            onChange={(value) => { setDepartment(value); setLogPage(1); }}
            options={departmentOptions}
            loading={departments.isLoading}
          />
          <span className="mon-logbar-spacer" />
          <span className="mon-count">{logs.data ? `共 ${logs.data.total} 条` : ''}</span>
          <Button icon={<DownloadIcon width={15} height={15} />} onClick={handleExport}>
            导出
          </Button>
        </div>
        <div className="mon-table-wrap">
          <table className="mon-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>用户</th>
                <th>动作</th>
                <th>页面 / 对象</th>
                <th>设备</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {(logs.data?.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td className="num" style={{ color: 'var(--hg-ink3)' }}>{secondsOf(item.time)}</td>
                  <td>
                    {item.userId ? (
                      <Link className="mon-user-link" to={`/monitor/${item.userId}`}>{item.name || item.username}</Link>
                    ) : (
                      <span className="mon-user-link">{item.name || item.username}</span>
                    )}
                    {item.department ? <small style={{ color: 'var(--hg-ink3)', marginLeft: 6 }}>{item.department}</small> : null}
                  </td>
                  <td className={actionTone(item.action)}>{item.actionLabel}</td>
                  <td title={item.pageLabel} style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.pageLabel}</td>
                  <td><DeviceChip device={item.device} /></td>
                  <td className="num" style={{ color: 'var(--hg-ink3)' }}>{item.ip ?? '—'}</td>
                </tr>
              ))}
              {!logs.data?.items.length ? (
                <tr><td colSpan={6} className="mon-table-empty">{logs.isLoading ? '正在加载…' : '本期暂无访问日志'}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {logs.data?.total ? (
          <TablePageFooter
            page={logPage}
            pageSize={logPageSize}
            total={logs.data.total}
            onChange={setLogPage}
            onPageSizeChange={(size) => { setLogPage(1); setLogPageSize(size); }}
          />
        ) : null}
      </section>
    </div>
  );
}
