/**
 * 访问监控 API 与前端埋点。
 *
 * 埋点模型：只上报行为埋点（page_view / heartbeat）——动作与页面由客户端决定，
 * 不能作为业务事实。登录/登出/提交/导出等服务端可验证的事件由后端各业务记录。
 * 路由 → 页面 key 的映射是唯一入口（pageKeyOfPath），与 shared 的 PAGE_CATALOG 对齐。
 */
import type {
  MonitorDepartmentsResult,
  MonitorLogQuery,
  MonitorLogResult,
  MonitorMemberResult,
  MonitorOnlineResult,
  MonitorOverviewResult,
  MonitorPageHeatResult,
  MonitorSecurityResult,
  TrackEventBody,
} from '@hgxt/shared';
import { request, tokenStore } from './client';

// ── 查询（SUPER_ADMIN） ─────────────────────────────────────

export function monitorOverview(from: string, to: string): Promise<MonitorOverviewResult> {
  return request<MonitorOverviewResult>(`/monitor/overview?from=${from}&to=${to}`);
}

export function monitorSecurity(from: string, to: string): Promise<MonitorSecurityResult> {
  return request<MonitorSecurityResult>(`/monitor/security?from=${from}&to=${to}`);
}

export function monitorOnline(): Promise<MonitorOnlineResult> {
  return request<MonitorOnlineResult>('/monitor/online');
}

export function monitorPages(from: string, to: string): Promise<MonitorPageHeatResult> {
  return request<MonitorPageHeatResult>(`/monitor/pages?from=${from}&to=${to}`);
}

export function monitorDepartments(to: string): Promise<MonitorDepartmentsResult> {
  return request<MonitorDepartmentsResult>(`/monitor/departments?to=${to}`);
}

export function monitorLogs(query: MonitorLogQuery): Promise<MonitorLogResult> {
  const params = new URLSearchParams();
  if (query.tab) params.set('tab', query.tab);
  if (query.department) params.set('department', query.department);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  return request<MonitorLogResult>(`/monitor/logs?${params.toString()}`);
}

export function monitorMember(id: string, date?: string): Promise<MonitorMemberResult> {
  return request<MonitorMemberResult>(`/monitor/members/${id}${date ? `?date=${date}` : ''}`);
}

/** 日志导出走浏览器下载（带 token 的 fetch → blob，避免把 token 拼进 URL）；返回截断信息供提示 */
export async function downloadMonitorLogsCsv(
  query: MonitorLogQuery,
): Promise<{ total: number; exported: number }> {
  const params = new URLSearchParams();
  if (query.tab) params.set('tab', query.tab);
  if (query.department) params.set('department', query.department);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  const token = tokenStore.getAccessToken();
  const res = await fetch(`/api/monitor/logs/export?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error('导出失败');
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
  const filename = match ? decodeURIComponent(match[1]) : '访问日志.csv';
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return {
    total: Number(res.headers.get('X-Total-Count') ?? '0'),
    exported: Number(res.headers.get('X-Exported-Count') ?? '0'),
  };
}

// ── 埋点 ───────────────────────────────────────────────────

/** 路由 → PAGE_CATALOG key；返回 null 表示该路由不记录（登录页等） */
export function pageKeyOfPath(pathname: string): { page: string; detail?: string } | null {
  if (pathname === '/workspace') return { page: 'workspace' };
  if (pathname === '/board' || pathname.startsWith('/board/')) return { page: 'board' };
  if (pathname.startsWith('/brief')) return { page: 'brief' };
  if (pathname.startsWith('/energy')) return { page: 'energy' };
  if (pathname.startsWith('/materials')) return { page: 'materials' };
  if (pathname.startsWith('/plan/settings')) return { page: 'plan-settings' };
  if (pathname === '/plan' || pathname.startsWith('/plan/')) return { page: 'plan' };
  if (pathname.startsWith('/form-fill/')) return { page: 'form-fill' };
  if (pathname === '/forms') return { page: 'forms' };
  if (pathname.startsWith('/forms/')) return { page: 'forms' };
  if (pathname.startsWith('/maintenance/records')) return { page: 'maintenance-records' };
  if (pathname.startsWith('/maintenance/new')) return { page: 'maintenance-new' };
  if (pathname.startsWith('/maintenance')) return { page: 'maintenance' };
  if (pathname.startsWith('/users')) return { page: 'users' };
  if (pathname.startsWith('/monitor/')) return { page: 'monitor-member' };
  if (pathname === '/monitor') return { page: 'monitor' };
  return null;
}

function postEvent(body: TrackEventBody): void {
  // fire-and-forget：埋点失败不影响页面
  void request('/monitor/events', { method: 'POST', body }).catch(() => undefined);
}

/** 同一页面 1.5 秒内的重复 page_view 只记一次（React StrictMode 开发模式会双发副作用） */
let lastPageView = { page: '', detail: '', at: 0 };

export function trackPageView(page: string, detail?: string): void {
  const now = Date.now();
  if (lastPageView.page === page && lastPageView.detail === (detail ?? '') && now - lastPageView.at < 1500) return;
  lastPageView = { page, detail: detail ?? '', at: now };
  postEvent({ action: 'page_view', page, detail });
}

/** 60 秒一次在线心跳；仅在页面可见时发送（后台标签页不算在线） */
export function startHeartbeat(): () => void {
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') postEvent({ action: 'heartbeat' });
  }, 60_000);
  return () => window.clearInterval(timer);
}
