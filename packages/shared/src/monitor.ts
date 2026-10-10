/**
 * 访问监控契约：页面目录、事件动作与各查询接口的返回结构。
 *
 * AccessEvent 是唯一数据源（apps/api/prisma/schema.prisma），这里定义的
 * key / label / category 必须与前端埋点（apps/admin/src/api/monitor.ts 的
 * pageKeyOfPath）保持一致——后端按 key 聚合、前端按 label 展示。
 */

/** 埋点页面目录：key 与路由对应，label 用于日志/热度展示，category 用于页面热度分组 */
export interface MonitorPageCatalogItem {
  key: string;
  label: string;
  category: '生产' | '简报' | '设备' | '系统';
}

export const PAGE_CATALOG: MonitorPageCatalogItem[] = [
  { key: 'workspace', label: '工作台', category: '系统' },
  { key: 'board', label: '车间版面', category: '生产' },
  { key: 'brief', label: '生产经营简报', category: '简报' },
  { key: 'energy', label: '能源中心', category: '生产' },
  { key: 'materials', label: '物料与库存', category: '生产' },
  { key: 'plan', label: '计划与完成', category: '生产' },
  { key: 'plan-settings', label: '生产计划设置', category: '系统' },
  { key: 'forms', label: '表单数据', category: '系统' },
  { key: 'form-fill', label: '今日填报', category: '生产' },
  { key: 'maintenance', label: '维修总览', category: '设备' },
  { key: 'maintenance-records', label: '维修记录', category: '设备' },
  { key: 'maintenance-new', label: '维修登记', category: '设备' },
  { key: 'users', label: '成员管理', category: '系统' },
  { key: 'monitor', label: '访问监控', category: '系统' },
  { key: 'monitor-member', label: '成员访问详情', category: '系统' },
];

const PAGE_CATALOG_MAP = new Map(PAGE_CATALOG.map((item) => [item.key, item]));

/** 未知 key 的兜底：key 原样展示，归入「系统」 */
export function monitorPageInfo(key: string | null | undefined): MonitorPageCatalogItem {
  if (key && PAGE_CATALOG_MAP.has(key)) return PAGE_CATALOG_MAP.get(key)!;
  return { key: key ?? '', label: key ?? '未知页面', category: '系统' };
}

/** 页面热度的行标识：带 detail（如具体表单名）时拼在一起展示 */
export function monitorPageLabel(key: string | null | undefined, detail?: string | null): string {
  const info = monitorPageInfo(key);
  return detail ? `${info.label} · ${detail}` : info.label;
}

export type MonitorAction =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'page_view'
  | 'heartbeat'
  | 'submit'
  | 'update'
  | 'export';

export const MONITOR_ACTION_LABELS: Record<MonitorAction, string> = {
  login: '登录',
  login_failed: '登录失败',
  logout: '退出登录',
  page_view: '打开页面',
  heartbeat: '在线心跳',
  submit: '提交表单',
  update: '修改数据',
  export: '导出',
};

/** 访问日志的三个动作分组（页签） */
export type MonitorLogTab = 'all' | 'login' | 'view' | 'data';

export const MONITOR_LOG_TAB_ACTIONS: Record<Exclude<MonitorLogTab, 'all'>, MonitorAction[]> = {
  login: ['login', 'login_failed', 'logout'],
  view: ['page_view'],
  data: ['submit', 'update', 'export'],
};

export type MonitorDevice = 'desktop' | 'mobile';

export const MONITOR_DEVICE_LABELS: Record<MonitorDevice, string> = {
  desktop: '电脑',
  mobile: '手机',
};

/**
 * 前端埋点上报（POST /monitor/events）。
 * 只允许行为埋点（page_view / heartbeat）——动作与页面由客户端决定，
 * 不能作为业务事实；登录/登出/提交/导出等服务端可验证的事件由后端各业务记录。
 */
export interface TrackEventBody {
  action: 'page_view' | 'heartbeat';
  page?: string;
  /** 补充说明：如表单标题 */
  detail?: string;
}

// ── 总览 ───────────────────────────────────────────────────

export interface MonitorOverviewResult {
  /** 统计区间（含端点）的上海时区日期 */
  from: string;
  to: string;
  /** 区间天数 */
  days: number;
  kpis: {
    /** 当前在线（实时，与统计区间无关）：人数与电脑/手机拆分 */
    online: { count: number; desktop: number; mobile: number };
    /** 区间内实际打开过页面的去重人数 / 全部启用成员数 */
    visitors: { users: number; totalUsers: number; rate: number | null };
    /** 区间内页面访问次数与人均次数（无访问成员时人均为 null） */
    pageViews: { count: number; perUser: number | null };
    /** 区间内活跃用户的人均在线时长（小时，按会话估算）与较上一周期的增减（分钟） */
    onlineHours: { avg: number | null; deltaMinutes: number | null };
    /** 连续 7 天（截至今天）未访问页面的启用用户数与姓名样例 */
    inactive7d: { count: number; names: string[] };
    /** 区间内安全提醒条数 */
    security: number;
  };
  /** 单日模式为 24 小时分布（today=所选日、yesterday=前一日）；多日模式为按天合计 */
  chart:
    | { mode: 'hourly'; hours: Array<{ hour: number; today: number; yesterday: number }> }
    | { mode: 'daily'; days: Array<{ date: string; views: number }> };
  /** 访问高峰（单日模式：最高小时的区间与次数） */
  peak: { label: string; count: number } | null;
  /** 区间内页面访问的设备占比（0-1） */
  deviceSplit: { desktop: number; mobile: number };
}

export type MonitorSecurityKind = 'login_failed' | 'off_hours' | 'export' | 'new_device';

export const MONITOR_SECURITY_KIND_LABELS: Record<MonitorSecurityKind, string> = {
  login_failed: '登录失败',
  off_hours: '非工作时间登录',
  export: '批量导出',
  new_device: '新设备登录',
};

export interface MonitorSecurityItem {
  kind: MonitorSecurityKind;
  time: string;
  userId: string | null;
  username: string;
  name: string;
  detail: string;
  ip: string | null;
  device: MonitorDevice;
}

export interface MonitorSecurityResult {
  from: string;
  to: string;
  /** 区间内条数 */
  total: number;
  items: MonitorSecurityItem[];
}

// ── 当前在线 ───────────────────────────────────────────────

export interface MonitorOnlineItem {
  userId: string | null;
  username: string;
  name: string;
  department: string | null;
  /** 最近访问的页面 key 与标题 */
  page: string | null;
  pageLabel: string;
  device: MonitorDevice;
  /** 本段会话开始时间（ISO） */
  since: string;
  minutes: number;
}

export interface MonitorOnlineResult {
  /** 判定窗口：最近一次心跳/访问在 N 分钟内算在线 */
  windowMinutes: number;
  count: number;
  items: MonitorOnlineItem[];
}

// ── 页面热度 ───────────────────────────────────────────────

export interface MonitorPageHeatRow {
  page: string;
  /** 展示名（含表单等 detail 时为「页面 · 对象」） */
  label: string;
  category: MonitorPageCatalogItem['category'];
  /** 统计 key：page 或 page+detail */
  groupKey: string;
  views: number;
  users: number;
  /** 平均停留秒（按同用户的下一事件间隔估算，上限 30 分钟）；样本不足为 null */
  avgDwellSec: number | null;
  /** 较上一等长周期的访问次数变化（-1~∞，正=增长）；昨日无数据为 null */
  deltaPct: number | null;
}

export interface MonitorPageHeatResult {
  from: string;
  to: string;
  rows: MonitorPageHeatRow[];
}

// ── 部门活跃 ───────────────────────────────────────────────

export interface MonitorDepartmentsResult {
  /** 截止日期（含）往前 7 天，升序 */
  dates: string[];
  rows: Array<{ department: string; counts: number[] }>;
}

// ── 访问日志 ───────────────────────────────────────────────

export interface MonitorLogItem {
  id: string;
  time: string;
  userId: string | null;
  username: string;
  name: string;
  department: string | null;
  action: MonitorAction;
  actionLabel: string;
  page: string | null;
  pageLabel: string;
  detail: string | null;
  device: MonitorDevice;
  ip: string | null;
}

export interface MonitorLogQuery {
  tab?: MonitorLogTab;
  department?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface MonitorLogResult {
  items: MonitorLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ── 成员访问详情 ───────────────────────────────────────────

export interface MonitorMemberResult {
  user: {
    id: string;
    username: string;
    name: string;
    department: string | null;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
    status: 'ACTIVE' | 'DISABLED';
    lastLoginAt: string | null;
    createdAt: string;
  };
  /** 实时在线状态：active=最近 10 分钟内有活动 */
  online: { active: boolean; page: string | null; pageLabel: string | null; device: MonitorDevice | null };
  /** date 为查询日（上海时区） */
  date: string;
  kpis: {
    /** 当日在线时长（小时，按会话估算）与会话段数 */
    onlineHours: number;
    sessions: number;
    /** 当日页面访问次数与去重页面数 */
    views: number;
    distinctPages: number;
    /** 本月实际打开页面的天数 / 截至当日的日历天数 */
    monthVisitDays: number;
    monthElapsedDays: number;
    /** 本月提交 / 修改次数 */
    monthSubmits: number;
    monthUpdates: number;
  };
  /** 当日会话段：start/end 为 0 点起的分钟数（end 为会话最后活动 + 上限宽放） */
  sessions: Array<{ start: number; end: number; device: MonitorDevice }>;
  /** 当日足迹（时间倒序，最近在前；上限 50 条） */
  footprint: Array<{
    time: string;
    action: MonitorAction;
    actionLabel: string;
    page: string | null;
    pageLabel: string;
    detail: string | null;
    device: MonitorDevice;
  }>;
  /** 近 7 天（截至 date）每日在线小时；hours 保留 1 位小数 */
  weekOnline: Array<{ date: string; hours: number }>;
  /** 本月常用页面（按访问次数降序，前 5） */
  commonPages: Array<{ page: string; label: string; count: number }>;
  /** 最近登录记录（前 8 条）；durationMin=null 表示仍在会话中或无法估算 */
  logins: Array<{
    time: string;
    client: string | null;
    device: MonitorDevice;
    ip: string | null;
    durationMin: number | null;
    online: boolean;
  }>;
}

// ── 上海时区工具（中国无夏令时，固定 UTC+8） ─────────────────

/** Date → 上海时区 'YYYY-MM-DD' */
export function shanghaiDateKey(date: Date): string {
  return new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

/**
 * 是否为真实存在的日历日期（YYYY-MM-DD）。
 * 只查正则不够：'2026-13-45' 也匹配格式，进日期计算会产生 Invalid Date。
 */
export function isValidDateKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

/** 上海时区 'YYYY-MM-DD' → 该日 00:00（上海）对应的 UTC Date */
export function shanghaiDayStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000+08:00`);
}

/** 上海时区 'YYYY-MM-DD' + HH:MM → UTC Date */
export function shanghaiTime(dateKey: string, hour: number, minute = 0): Date {
  return new Date(
    Date.UTC(
      Number(dateKey.slice(0, 4)),
      Number(dateKey.slice(5, 7)) - 1,
      Number(dateKey.slice(8, 10)),
      hour - 8,
      minute,
    ),
  );
}

/** 上海时区日期加减天数 */
export function shiftDateKey(dateKey: string, days: number): string {
  const base = shanghaiDayStart(dateKey).getTime() + days * 86_400_000;
  return shanghaiDateKey(new Date(base));
}

/** 两个上海时区日期之间的天数差（b - a） */
export function diffDateKeys(a: string, b: string): number {
  return Math.round((shanghaiDayStart(b).getTime() - shanghaiDayStart(a).getTime()) / 86_400_000);
}

/** dateKey 是星期几（1=周一 … 7=周日，上海时区） */
export function shanghaiWeekday(dateKey: string): number {
  const day = shanghaiDayStart(dateKey).getUTCDay();
  return day === 0 ? 7 : day;
}

/** [from, to]（上海时区、含端点）内的工作日数 */
export function countWorkdays(from: string, to: string): number {
  let count = 0;
  for (let key = from; diffDateKeys(key, to) >= 0; key = shiftDateKey(key, 1)) {
    if (shanghaiWeekday(key) <= 5) count += 1;
  }
  return count;
}
