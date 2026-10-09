import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, DatePicker, Popconfirm } from 'antd';
import dayjs from 'dayjs';
import { MONITOR_DEVICE_LABELS, shanghaiDateKey } from '@hgxt/shared';
import { monitorMember } from '../../api/monitor';
import { forceOfflineApi } from '../../api/users';
import { useMe } from '../../api/hooks';
import {
  ArrowLeftIcon,
  DeviceMonitorIcon,
  KeyIcon,
  SmartphoneIcon,
} from '../../components/icons';
import { PageLoading } from '../../components/PageLoading';
import { durationLabel, minuteToClock, timeOf } from './monitorFormat';
import './monitor.css';

export function MonitorMemberPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const me = useMe();
  const today = shanghaiDateKey(new Date());
  const [date, setDate] = useState(today);

  const member = useQuery({
    queryKey: ['monitor', 'member', id, date],
    queryFn: () => monitorMember(id, date),
    refetchInterval: date === today ? 60_000 : false,
    retry: false,
  });

  const forceOffline = useMutation({
    mutationFn: () => forceOfflineApi(id),
    onSuccess: (user) => {
      message.success(`已强制下线 ${user.name}，其全部会话立即失效`);
      void queryClient.invalidateQueries({ queryKey: ['monitor'] });
    },
    onError: (error) => message.error(error.message),
  });

  if (member.isLoading) return <PageLoading />;
  if (member.error || !member.data) {
    return (
      <div className="mem-page">
        <div className="mon-panel">
          <p className="mon-table-empty">成员访问数据加载失败：{member.error?.message ?? '未知错误'}</p>
          <Button onClick={() => navigate('/monitor')} icon={<ArrowLeftIcon width={15} height={15} />}>返回访问监控</Button>
        </div>
      </div>
    );
  }

  const data = member.data;
  const user = data.user;
  const kpis = data.kpis;
  const weekMax = Math.max(1, ...data.weekOnline.map((row) => row.hours));
  const pagesMax = Math.max(1, ...data.commonPages.map((row) => row.count));
  const fullAttendance = kpis.monthLoginDays >= kpis.monthWorkdays && kpis.monthWorkdays > 0;

  return (
    <div className="mem-page">
      {/* 成员信息头 */}
      <div className="mem-head">
        <span className="mem-avatar">{user.name.charAt(0)}</span>
        <div className="mem-head-main">
          <span className="mem-head-name">
            {user.name}
            <span className={`mem-online-chip${data.online.active ? '' : ' offline'}`}>
              <i className="mon-dot" style={{ background: data.online.active ? undefined : 'var(--hg-ink3)' }} />
              {data.online.active
                ? `在线 · ${data.online.pageLabel ?? '已登录'}`
                : user.status === 'ACTIVE' ? '离线' : '已禁用'}
            </span>
          </span>
          <span className="mem-head-meta">
            {[
              user.department ?? '未分配部门',
              `账号 ${user.username}`,
              user.role === 'SUPER_ADMIN' ? '管理员' : '普通用户',
            ].join(' · ')}
          </span>
        </div>
        <div className="mem-head-actions">
          <DatePicker
            value={dayjs(date)}
            allowClear={false}
            disabledDate={(current) => current && current.isAfter(dayjs(today), 'day')}
            onChange={(value) => {
              if (value) setDate(value.format('YYYY-MM-DD'));
            }}
          />
          <Button icon={<KeyIcon width={15} height={15} />}>
            <Link to="/users" style={{ color: 'inherit' }}>权限</Link>
          </Button>
          <Popconfirm
            title={`确定强制下线 ${user.name}？`}
            description={
              data.online.active
                ? '该用户当前全部登录会话立即失效，需要重新登录。'
                : '该用户当前不在线，但其登录凭证仍可能长期有效；此操作将全部吊销。'
            }
            okText="强制下线"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            disabled={forceOffline.isPending || me.data?.id === user.id}
            onConfirm={() => forceOffline.mutate()}
          >
            <Button
              danger
              disabled={forceOffline.isPending || me.data?.id === user.id}
              loading={forceOffline.isPending}
            >
              强制下线
            </Button>
          </Popconfirm>
        </div>
      </div>

      {/* KPI 行 */}
      <div className="mem-kpis">
        <div className="mon-kpi">
          <span className="mon-kpi-label">{date === today ? '今日在线' : `${date.slice(5)} 在线`}</span>
          <span className="mon-kpi-value">{kpis.onlineHours.toFixed(1)}<small>h</small></span>
          <span className="mon-kpi-sub">{kpis.sessions} 段会话</span>
        </div>
        <div className="mon-kpi">
          <span className="mon-kpi-label">{date === today ? '今日访问' : `${date.slice(5)} 访问`}</span>
          <span className="mon-kpi-value">{kpis.views}<small>次</small></span>
          <span className="mon-kpi-sub">{kpis.distinctPages} 个页面</span>
        </div>
        <div className="mon-kpi">
          <span className="mon-kpi-label">本月登录</span>
          <span className="mon-kpi-value">{kpis.monthLoginDays}<small>/ {kpis.monthWorkdays} 天</small></span>
          <span className="mon-kpi-sub">{fullAttendance ? '工作日全勤' : '按工作日统计'}</span>
        </div>
        <div className="mon-kpi">
          <span className="mon-kpi-label">提交 / 修改</span>
          <span className="mon-kpi-value">{kpis.monthSubmits}<small>· {kpis.monthUpdates} 次</small></span>
          <span className="mon-kpi-sub">本月报表提交 {kpis.monthSubmits} 次</span>
        </div>
      </div>

      {/* 会话时间轴 + 足迹 */}
      <div className="mem-main">
        <section className="mon-panel" aria-label="今日会话">
          <div className="mon-panel-head">
            <span className="mon-panel-title">{date === today ? '今日会话' : `${date.slice(5)} 会话`}</span>
            <span className="mem-session-legend">
              <span><i />电脑</span>
              <span className="lg-mobile"><i />手机</span>
            </span>
          </div>
          {data.sessions.length ? (
            <>
              <div className="mem-session-track" role="img" aria-label="按小时的会话时间轴">
                <div className="mem-session-row">
                  {data.sessions.map((session, index) => (
                    <i
                      key={index}
                      className={`mem-session-seg${session.device === 'mobile' ? ' mobile' : ''}`}
                      style={{ left: `${(session.start / 1440) * 100}%`, width: `${Math.max(0.3, ((session.end - session.start) / 1440) * 100)}%` }}
                      title={`${minuteToClock(session.start)} – ${minuteToClock(session.end)} · ${MONITOR_DEVICE_LABELS[session.device]}`}
                    />
                  ))}
                </div>
              </div>
              <div className="mem-session-axis" aria-hidden="true">
                {['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00'].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </>
          ) : (
            <p className="mon-table-empty">该日暂无会话记录</p>
          )}
        </section>

        <section className="mon-panel" aria-label="今日足迹">
          <div className="mon-panel-head">
            <span className="mon-panel-title">{date === today ? '今日足迹' : `${date.slice(5)} 足迹`}</span>
            <span className="mon-panel-hint">最近在前</span>
          </div>
          <div className="mem-footprint">
            {data.footprint.length ? (
              data.footprint.map((step, index) => (
                <div key={`${step.time}-${index}`} className={`mem-step${step.action === 'login_failed' ? ' is-danger' : ''}`}>
                  <span className="mem-step-time">{timeOf(step.time, date)}</span>
                  <div className="mem-step-body">
                    <span className="mem-step-action">
                      {step.actionLabel}
                      <DeviceTag device={step.device} />
                    </span>
                    <span className="mem-step-target" title={step.pageLabel}>
                      {step.pageLabel}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="mon-table-empty">该日暂无访问足迹</p>
            )}
          </div>
        </section>
      </div>

      {/* 近 7 天 + 常用页面 */}
      <div className="mem-main">
        <section className="mon-panel" aria-label="近 7 天在线时长">
          <div className="mon-panel-head">
            <span className="mon-panel-title">近 7 天在线时长</span>
            <span className="mon-panel-hint">截至 {date} · h</span>
          </div>
          <div className="mem-week-bars" role="img" aria-label="近 7 天每日在线小时">
            {data.weekOnline.map((row) => (
              <div key={row.date} className="mem-week-col" title={`${row.date}：${row.hours} h`}>
                <span className="mem-week-value">{row.hours > 0 ? row.hours.toFixed(1) : ''}</span>
                <i
                  className={`mem-week-bar${row.date === date ? ' today' : ''}`}
                  style={{ height: `${Math.max(row.hours > 0 ? 4 : 0, (row.hours / weekMax) * 100)}%` }}
                />
                <span className="mem-week-label">{Number(row.date.slice(8))}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mon-panel" aria-label="常用页面">
          <div className="mon-panel-head">
            <span className="mon-panel-title">常用页面</span>
            <span className="mon-panel-hint">{date.slice(0, 7)} 访问次数</span>
          </div>
          <div className="mem-pages">
            {data.commonPages.length ? (
              data.commonPages.map((row) => (
                <div key={row.label} className="mem-page-row">
                  <span className="mem-page-name" title={row.label}>{row.label}</span>
                  <span className="mem-page-track">
                    <i className="mem-page-bar" style={{ width: `${(row.count / pagesMax) * 100}%` }} />
                  </span>
                  <span className="mem-page-count">{row.count}</span>
                </div>
              ))
            ) : (
              <p className="mon-table-empty">本月暂无页面访问记录</p>
            )}
          </div>
        </section>
      </div>

      {/* 登录记录 */}
      <section className="mon-panel" aria-label="登录记录">
        <div className="mon-panel-head">
          <span className="mon-panel-title">登录记录</span>
          <span className="mon-panel-hint">最近 {data.logins.length} 次</span>
        </div>
        <div className="mem-login-list">
          {data.logins.length ? (
            data.logins.map((login, index) => (
              <div key={`${login.time}-${index}`} className="mem-login">
                <span className="mem-login-time">{timeOf(login.time, date)}</span>
                <span className="mem-login-client">
                  {MONITOR_DEVICE_LABELS[login.device]}
                  {login.client ? <small>{login.client}</small> : null}
                  {login.ip ? <small>{login.ip}</small> : null}
                </span>
                <span className={`mem-login-duration${login.online ? ' now' : ''}`}>
                  {login.online ? '在线中' : durationLabel(login.durationMin ?? 0)}
                </span>
              </div>
            ))
          ) : (
            <p className="mon-table-empty">暂无登录记录</p>
          )}
        </div>
      </section>
    </div>
  );
}

function DeviceTag({ device }: { device: 'desktop' | 'mobile' }) {
  const Icon = device === 'mobile' ? SmartphoneIcon : DeviceMonitorIcon;
  return (
    <span className="mon-chip">
      <Icon width={11} height={11} strokeWidth={1.6} />
    </span>
  );
}
