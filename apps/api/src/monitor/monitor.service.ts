import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  MONITOR_ACTION_LABELS,
  MONITOR_LOG_TAB_ACTIONS,
  countWorkdays,
  diffDateKeys,
  isValidDateKey,
  monitorPageInfo,
  monitorPageLabel,
  shiftDateKey,
  shanghaiDateKey,
  shanghaiDayStart,
  type MonitorAction,
  type MonitorDevice,
  type MonitorDepartmentsResult,
  type MonitorLogQuery,
  type MonitorLogResult,
  type MonitorMemberResult,
  type MonitorOnlineResult,
  type MonitorOverviewResult,
  type MonitorPageHeatResult,
  type MonitorSecurityResult,
  type TrackEventBody,
} from '@hgxt/shared';
import { PrismaService } from '../database/prisma.service';
import type { UaInfo } from '../common/utils/ua';

/** 在线判定窗口：最近一次活动在 10 分钟内算在线（登出立即终止） */
export const ONLINE_WINDOW_MS = 10 * 60_000;
/** 会话切分：同用户两次事件间隔超过 30 分钟视为两段会话 */
export const SESSION_GAP_MS = 30 * 60_000;
/** 会话尾部宽放：最后一次活动后仍计入 5 分钟在线 */
export const SESSION_TAIL_MS = 5 * 60_000;
/** 单段会话时长上限，防止单点事件撑爆时长 */
export const MAX_SESSION_SPAN_MS = 8 * 3_600_000;
/** 正常登录时间窗（上海时区 6:00–22:00），之外视为非工作时间 */
export const WORK_HOUR_START = 6;
export const WORK_HOUR_END = 22;
/** 访问事件保留天数；登录时顺手清理（与过期 refresh token 同一处） */
export const ACCESS_EVENT_RETENTION_DAYS = 180;
/** 单次查询的最大天数：内存聚合的事件量上界 = 92 天 × 每日事件量，防止慢查询拖垮业务接口 */
export const MAX_QUERY_DAYS = 92;

type EventRow = {
  id: string;
  userId: string | null;
  username: string;
  name: string;
  department: string | null;
  action: string;
  page: string | null;
  detail: string | null;
  device: string;
  client: string | null;
  ip: string | null;
  createdAt: Date;
};

const EVENT_SELECT = {
  id: true,
  userId: true,
  username: true,
  name: true,
  department: true,
  action: true,
  page: true,
  detail: true,
  device: true,
  client: true,
  ip: true,
  createdAt: true,
} as const;

/** 心跳之外的活动动作；登出单独处理（它是会话的硬终止边界） */
const ACTIVITY_ACTIONS = ['heartbeat', 'page_view', 'login', 'submit', 'update', 'export'] as const;

interface Session {
  start: Date;
  end: Date;
  events: EventRow[];
  /** logout 之后不再向后合并：登出即本段会话终点 */
  closed: boolean;
}

/**
 * 按时间排序的事件序列切成会话段：
 * 间隔 > SESSION_GAP_MS 或中途登出（含强制下线/禁用写入的 logout 事件）都视为分段。
 * 登出关闭的会话是明确终点，不再加尾部宽放（避免凭空多出 5 分钟在线）。
 */
export function splitSessions(sortedEvents: EventRow[]): Session[] {
  const sessions: Session[] = [];
  for (const event of sortedEvents) {
    const last = sessions.at(-1);
    if (last && !last.closed && event.createdAt.getTime() - last.end.getTime() <= SESSION_GAP_MS) {
      last.events.push(event);
      last.end = event.createdAt;
    } else {
      sessions.push({ start: event.createdAt, end: event.createdAt, events: [event], closed: false });
    }
    if (event.action === 'logout') sessions.at(-1)!.closed = true;
  }
  for (const session of sessions) {
    if (session.closed) continue;
    session.end = new Date(
      Math.min(session.end.getTime() + SESSION_TAIL_MS, session.start.getTime() + MAX_SESSION_SPAN_MS),
    );
  }
  return sessions;
}

/** 会话与在线时长只统计「真实使用」：登录失败不是在线（它有 userId 但不代表使用） */
function usageEvents(events: EventRow[]): EventRow[] {
  return events.filter((event) => event.action !== 'login_failed');
}

/**
 * 按（用户 × 设备）分流后切会话：一台设备登出只结束该设备的会话，
 * 不吞并同一用户在其他设备上的活动。多设备并行时长的「双重计数」是有意的——
 * 那确实是两路并发使用。
 */
function splitDeviceSessions(events: EventRow[]): Session[] {
  const streams = new Map<string, EventRow[]>();
  for (const event of usageEvents(events)) {
    if (!event.userId) continue;
    const key = `${event.userId}|${event.device}`;
    const bucket = streams.get(key);
    if (bucket) bucket.push(event);
    else streams.set(key, [event]);
  }
  const sessions: Session[] = [];
  for (const stream of streams.values()) sessions.push(...splitSessions(stream));
  return sessions.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function deviceOf(value: string): MonitorDevice {
  return value === 'mobile' ? 'mobile' : 'desktop';
}

/**
 * 日期入参校验：只查格式不够，'2026-13-45' 也会匹配正则并产生 Invalid Date。
 * 非法输入直接 400，绝不带着 NaN 进日期计算或 Prisma 查询。
 */
function assertDateKey(value: string | undefined, field: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!isValidDateKey(value)) {
    throw new BadRequestException(`${field} 应为真实存在的日期（YYYY-MM-DD）`);
  }
  return value;
}

function groupKeyOf(event: Pick<EventRow, 'page' | 'detail'>): string {
  return event.detail ? `${event.page ?? ''}\u0000${event.detail}` : event.page ?? '';
}

/**
 * CSV 单元格：先中和公式注入（=、+、-、@、制表符等前缀会被 Excel 当公式执行），
 * 再处理逗号/引号/换行的标准转义。
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── 记录 ─────────────────────────────────────────────────

  /** 写入一条访问事件。监控记录绝不能影响主流程——失败只告警不抛出。 */
  async record(input: {
    userId?: string | null;
    username: string;
    name?: string | null;
    department?: string | null;
    action: MonitorAction | string;
    page?: string | null;
    detail?: string | null;
    ip?: string | null;
    ua?: UaInfo;
  }): Promise<void> {
    const ua = input.ua ?? { device: 'desktop' as MonitorDevice, client: null };
    try {
      await this.prisma.accessEvent.create({
        data: {
          userId: input.userId ?? null,
          username: input.username,
          name: input.name ?? '',
          department: input.department ?? null,
          action: input.action,
          page: input.page ?? null,
          detail: input.detail ?? null,
          device: ua.device,
          client: ua.client,
          ip: input.ip ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(`访问事件写入失败（${input.action} / ${input.username}）：${String(error)}`);
    }
  }

  /** 登录失败记录：detail 带上 15 分钟内的累计次数（密码错误 · 第 N 次） */
  async recordLoginFailure(input: {
    username: string;
    userId?: string | null;
    name?: string | null;
    reason: string;
    ip?: string | null;
    ua?: UaInfo;
  }): Promise<void> {
    let attempt = 1;
    try {
      const since = new Date(Date.now() - 15 * 60_000);
      attempt =
        1 +
        (await this.prisma.accessEvent.count({
          where: { action: 'login_failed', username: input.username, createdAt: { gte: since } },
        }));
    } catch {
      // 计数失败不影响记录本身
    }
    await this.record({
      userId: input.userId,
      username: input.username,
      name: input.name,
      action: 'login_failed',
      detail: `${input.reason} · 第 ${attempt} 次`,
      ip: input.ip,
      ua: input.ua,
    });
  }

  /** 登录时顺带清理过期事件，避免表无限膨胀（与 refresh token 清理同一处） */
  async cleanupExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - ACCESS_EVENT_RETENTION_DAYS * 86_400_000);
    try {
      await this.prisma.accessEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
    } catch (error) {
      this.logger.warn(`访问事件清理失败：${String(error)}`);
    }
  }

  /** 前端埋点上报（page_view / heartbeat / export） */
  async trackEvent(userId: string, body: TrackEventBody, ip: string | null, ua: UaInfo): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, name: true, department: true },
    });
    if (!user) throw new NotFoundException('账号不存在');
    await this.record({
      userId,
      username: user.username,
      name: user.name,
      department: user.department,
      action: body.action,
      page: body.page ?? null,
      detail: body.detail ?? null,
      ip,
      ua,
    });
  }

  /**
   * 业务事件记录（表单提交/修改等）：按 userId 现取姓名部门。
   * 整个流程（含查用户）都在捕获范围内——主业务已成功，埋点失败绝不反向影响接口结果。
   */
  async recordForUser(
    userId: string,
    action: MonitorAction,
    page: string | null,
    detail: string | null,
    extra?: { ip?: string | null; ua?: UaInfo },
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, name: true, department: true },
      });
      if (!user) return;
      await this.record({
        userId,
        username: user.username,
        name: user.name,
        department: user.department,
        action,
        page,
        detail,
        ip: extra?.ip ?? null,
        ua: extra?.ua,
      });
    } catch (error) {
      this.logger.warn(`业务事件记录失败（${action} / ${userId}）：${String(error)}`);
    }
  }

  // ── 查询 ─────────────────────────────────────────────────

  /** 上海时区 [from 00:00, to+1 00:00) 的日期窗口 */
  private rangeWhere(from: string, to: string) {
    return {
      gte: shanghaiDayStart(from),
      lt: shanghaiDayStart(shiftDateKey(to, 1)),
    };
  }

  private async fetchEvents(from: string, to: string, extra?: object): Promise<EventRow[]> {
    return this.prisma.accessEvent.findMany({
      where: { createdAt: this.rangeWhere(from, to), ...extra },
      select: EVENT_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * 规范查询区间：非法日期 400；缺省给最近 defaultDays 天；晚于今天按今天截断；
   * 跨度超过 MAX_QUERY_DAYS 拒绝——事件聚合在 Node 内存进行，必须给上界。
   */
  private normalizeRange(rawFrom: string | undefined, rawTo: string | undefined, defaultDays = 7) {
    const today = shanghaiDateKey(new Date());
    const validatedTo = assertDateKey(rawTo, 'to');
    const validatedFrom = assertDateKey(rawFrom, 'from');
    const to = validatedTo && validatedTo <= today ? validatedTo : today;
    const from = validatedFrom && validatedFrom <= to ? validatedFrom : shiftDateKey(to, -(defaultDays - 1));
    const days = diffDateKeys(from, to) + 1;
    if (days > MAX_QUERY_DAYS) {
      throw new BadRequestException(`一次最多查询 ${MAX_QUERY_DAYS} 天（当前 ${days} 天）`);
    }
    return { from, to, days };
  }

  async overview(rawFrom?: string, rawTo?: string): Promise<MonitorOverviewResult> {
    // 默认口径与设计稿一致：今天（单日 → 小时分布）
    const { from, to, days } = this.normalizeRange(rawFrom, rawTo, 1);

    const [kpis, prevOnline, events] = await Promise.all([
      this.overviewKpis(from, to),
      this.rangeAvgOnlineHours(shiftDateKey(from, -days), shiftDateKey(to, -days)),
      this.fetchEvents(from, to),
    ]);

    const views = events.filter((e) => e.action === 'page_view');
    const logins = events.filter((e) => e.action === 'login');

    let chart: MonitorOverviewResult['chart'];
    let peak: MonitorOverviewResult['peak'];
    if (days === 1) {
      const yesterdayFrom = shiftDateKey(from, -1);
      const yesterdayEvents = await this.fetchEvents(yesterdayFrom, yesterdayFrom);
      const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, today: 0, yesterday: 0 }));
      const addViews = (rows: EventRow[], key: 'today' | 'yesterday') => {
        for (const event of rows) {
          hours[new Date(event.createdAt.getTime() + 8 * 3_600_000).getUTCHours()][key] += 1;
        }
      };
      addViews(views, 'today');
      addViews(yesterdayEvents.filter((e) => e.action === 'page_view'), 'yesterday');
      const maxHour = hours.reduce((best, row) => (row.today > best.today ? row : best), hours[0]);
      peak = maxHour.today > 0
        ? {
            label: `${String(maxHour.hour).padStart(2, '0')}:00 – ${String((maxHour.hour + 1) % 24).padStart(2, '0')}:00`,
            count: maxHour.today,
          }
        : null;
      chart = { mode: 'hourly', hours };
    } else {
      const byDay = new Map<string, number>();
      for (const event of views) {
        const key = shanghaiDateKey(event.createdAt);
        byDay.set(key, (byDay.get(key) ?? 0) + 1);
      }
      const dayRows = Array.from({ length: days }, (_, index) => {
        const date = shiftDateKey(from, index);
        return { date, views: byDay.get(date) ?? 0 };
      });
      const best = dayRows.reduce((acc, row) => (row.views > acc.views ? row : acc), dayRows[0]);
      peak = best.views > 0 ? { label: `${Number(best.date.slice(5, 7))} 月 ${Number(best.date.slice(8))} 日`, count: best.views } : null;
      chart = { mode: 'daily', days: dayRows };
    }

    const desktopViews = views.filter((e) => e.device !== 'mobile').length;
    const deltaMinutes =
      kpis.onlineHours.avg !== null && prevOnline.avg !== null
        ? Math.round((kpis.onlineHours.avg - prevOnline.avg) * 60)
        : null;

    return {
      from,
      to,
      days,
      kpis: { ...kpis, onlineHours: { avg: kpis.onlineHours.avg, deltaMinutes } },
      chart,
      peak,
      loginStat: {
        count: logins.length,
        users: new Set(logins.map((e) => e.userId ?? e.username)).size,
      },
      deviceSplit:
        views.length === 0
          ? { desktop: 0, mobile: 0 }
          : { desktop: desktopViews / views.length, mobile: (views.length - desktopViews) / views.length },
    };
  }

  /** KPI 行（在线人数为实时口径） */
  private async overviewKpis(from: string, to: string) {
    const [events, totalUsers, inactiveUsers, security, online] = await Promise.all([
      this.fetchEvents(from, to),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: shanghaiDayStart(shiftDateKey(shanghaiDateKey(new Date()), -7)) } }],
        },
        select: { name: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.security(from, to),
      this.onlineList(),
    ]);

    const loginEvents = events.filter((e) => e.action === 'login');
    const loginUsers = new Set(loginEvents.map((e) => e.userId ?? e.username));
    const viewCount = events.filter((e) => e.action === 'page_view').length;
    const onlineHours = this.rangeAvgOnlineHoursFromEvents(events);

    return {
      online: {
        count: online.count,
        desktop: online.items.filter((i) => i.device === 'desktop').length,
        mobile: online.items.filter((i) => i.device === 'mobile').length,
      },
      logins: {
        users: loginUsers.size,
        totalUsers,
        rate: totalUsers > 0 ? loginUsers.size / totalUsers : null,
      },
      pageViews: {
        count: viewCount,
        perUser: loginUsers.size > 0 ? viewCount / loginUsers.size : null,
      },
      onlineHours,
      inactive7d: { count: inactiveUsers.length, names: inactiveUsers.slice(0, 3).map((u) => u.name) },
      security: security.total,
    };
  }

  /** 活跃用户的人均在线小时（按用户×设备分流切会话；登录失败不计入；格式化交给前端） */
  private rangeAvgOnlineHoursFromEvents(events: EventRow[]): { avg: number | null } {
    const activeUsers = new Set<string>();
    let totalMs = 0;
    for (const session of splitDeviceSessions(events)) {
      const userId = session.events[0].userId!;
      activeUsers.add(userId);
      totalMs += session.end.getTime() - session.start.getTime();
    }
    if (activeUsers.size === 0) return { avg: null };
    return { avg: totalMs / activeUsers.size / 3_600_000 };
  }

  private async rangeAvgOnlineHours(from: string, to: string): Promise<{ avg: number | null }> {
    return this.rangeAvgOnlineHoursFromEvents(await this.fetchEvents(from, to));
  }

  /** 安全提醒：登录失败（账号+IP 聚合）/ 非工作时间登录 / 导出 / 新设备登录 */
  async security(rawFrom?: string, rawTo?: string): Promise<MonitorSecurityResult> {
    const { from, to } = this.normalizeRange(rawFrom, rawTo);
    const events = await this.fetchEvents(from, to);
    const items: MonitorSecurityResult['items'] = [];

    // 登录失败：按 (username, ip) 聚合，取最新时间与累计次数
    const failures = new Map<string, { time: Date; count: number; event: EventRow }>();
    for (const event of events.filter((e) => e.action === 'login_failed')) {
      const key = `${event.username}|${event.ip ?? ''}`;
      const existing = failures.get(key);
      if (existing) {
        existing.count += 1;
        if (event.createdAt > existing.time) {
          existing.time = event.createdAt;
          existing.event = event;
        }
      } else {
        failures.set(key, { time: event.createdAt, count: 1, event });
      }
    }
    for (const { time, count, event } of failures.values()) {
      items.push({
        kind: 'login_failed',
        time: time.toISOString(),
        userId: event.userId,
        username: event.username,
        name: event.name,
        detail: count > 1 ? `${event.detail?.split(' · ')[0] ?? '登录失败'} ${count} 次` : event.detail ?? '登录失败',
        ip: event.ip,
        device: deviceOf(event.device),
      });
    }

    // 非工作时间登录（6:00–22:00 之外）
    for (const event of events.filter((e) => e.action === 'login')) {
      const hour = new Date(event.createdAt.getTime() + 8 * 3_600_000).getUTCHours();
      if (hour >= WORK_HOUR_START && hour < WORK_HOUR_END) continue;
      items.push({
        kind: 'off_hours',
        time: event.createdAt.toISOString(),
        userId: event.userId,
        username: event.username,
        name: event.name,
        detail: [deviceOf(event.device) === 'mobile' ? '手机' : '电脑', event.client].filter(Boolean).join(' · '),
        ip: event.ip,
        device: deviceOf(event.device),
      });
    }

    // 导出
    for (const event of events.filter((e) => e.action === 'export')) {
      items.push({
        kind: 'export',
        time: event.createdAt.toISOString(),
        userId: event.userId,
        username: event.username,
        name: event.name,
        detail: event.detail ?? '导出',
        ip: event.ip,
        device: deviceOf(event.device),
      });
    }

    // 新设备登录：区间内首次出现 (userId, client) 组合，且历史上从未出现过
    const loginEvents = events.filter((e) => e.action === 'login' && e.userId && e.client);
    if (loginEvents.length) {
      const seenPairs = new Set(
        (
          await this.prisma.accessEvent.findMany({
            where: { action: 'login', createdAt: { lt: shanghaiDayStart(from) } },
            select: { userId: true, client: true },
            distinct: ['userId', 'client'],
          })
        ).map((row) => `${row.userId}|${row.client}`),
      );
      const reported = new Set<string>();
      for (const event of loginEvents) {
        const pair = `${event.userId}|${event.client}`;
        if (seenPairs.has(pair) || reported.has(pair)) continue;
        reported.add(pair);
        items.push({
          kind: 'new_device',
          time: event.createdAt.toISOString(),
          userId: event.userId,
          username: event.username,
          name: event.name,
          detail: `${event.client} · 已通过验证`,
          ip: event.ip,
          device: deviceOf(event.device),
        });
      }
    }

    items.sort((a, b) => b.time.localeCompare(a.time));
    return { from, to, total: items.length, items: items.slice(0, 20) };
  }

  /**
   * 当前在线：窗口内最新事件为「活动」的（用户 × 设备）流。
   * 一台设备登出只结束该设备的流——手机仍在使用时，电脑登出不会把人整剔除；
   * 已禁用的账号即使事件还在窗口内也不算在线；登录失败不算活动。
   * 展示上每人取最近活跃的那条流（设备、页面、会话起点来自该流）。
   */
  async onlineList(): Promise<MonitorOnlineResult> {
    const now = new Date();
    const recent = await this.prisma.accessEvent.findMany({
      where: {
        createdAt: { gte: new Date(now.getTime() - ONLINE_WINDOW_MS) },
        action: { in: [...ACTIVITY_ACTIONS, 'logout'] },
        userId: { not: null },
      },
      select: EVENT_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    if (recent.length === 0) {
      return { windowMinutes: ONLINE_WINDOW_MS / 60_000, count: 0, items: [] };
    }

    // asc 序列逐条覆盖 → 每条（用户×设备）流的最新事件；最新是 logout → 该流已离线
    const latestByStream = new Map<string, EventRow>();
    for (const event of recent) {
      if (event.userId) latestByStream.set(`${event.userId}|${event.device}`, event);
    }
    const activeStreams = [...latestByStream.entries()].filter(([, event]) => event.action !== 'logout');
    if (activeStreams.length === 0) {
      return { windowMinutes: ONLINE_WINDOW_MS / 60_000, count: 0, items: [] };
    }

    // 只统计启用中的账号（禁用 = 会话已被吊销）
    const candidateIds = [...new Set(activeStreams.map(([key]) => key.split('|')[0]))];
    const activeRows = await this.prisma.user.findMany({
      where: { id: { in: candidateIds }, status: 'ACTIVE' },
      select: { id: true },
    });
    const allowedIds = new Set(activeRows.map((row) => row.id));
    const allowedStreams = activeStreams.filter(([key]) => allowedIds.has(key.split('|')[0]));
    if (allowedStreams.length === 0) {
      return { windowMinutes: ONLINE_WINDOW_MS / 60_000, count: 0, items: [] };
    }

    // 会话起点：回溯在线用户近 12 小时事件（含登出边界），仍按（用户×设备）分流
    const history = await this.prisma.accessEvent.findMany({
      where: {
        userId: { in: [...allowedIds] },
        createdAt: { gte: new Date(now.getTime() - 12 * 3_600_000) },
        action: { in: [...ACTIVITY_ACTIONS, 'logout'] },
      },
      select: EVENT_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    const streamEvents = new Map<string, EventRow[]>();
    for (const event of history) {
      const key = `${event.userId}|${event.device}`;
      const bucket = streamEvents.get(key);
      if (bucket) bucket.push(event);
      else streamEvents.set(key, [event]);
    }

    // 每位用户取最近活跃的流来展示
    const bestStreamByUser = new Map<string, { key: string; latest: EventRow }>();
    for (const [key, latest] of allowedStreams) {
      const userId = key.split('|')[0];
      const existing = bestStreamByUser.get(userId);
      if (!existing || latest.createdAt > existing.latest.createdAt) {
        bestStreamByUser.set(userId, { key, latest });
      }
    }

    const items = [...bestStreamByUser.entries()].map(([userId, { key, latest }]) => {
      const stream = splitSessions(usageEvents(streamEvents.get(key) ?? [latest])).at(-1)!;
      const lastView = [...(streamEvents.get(key) ?? [])].reverse().find((e) => e.action === 'page_view');
      return {
        userId,
        username: latest.username,
        name: latest.name,
        department: latest.department,
        page: lastView?.page ?? null,
        pageLabel: lastView ? monitorPageLabel(lastView.page, lastView.detail) : '已登录',
        device: deviceOf(latest.device),
        since: stream.start.toISOString(),
        minutes: Math.max(1, Math.round((now.getTime() - stream.start.getTime()) / 60_000)),
      };
    });
    items.sort((a, b) => b.minutes - a.minutes);
    return { windowMinutes: ONLINE_WINDOW_MS / 60_000, count: items.length, items };
  }

  /** 页面热度：按 (page, detail) 分组；停留估算见下方注释（上限 30 分钟） */
  async pageHeat(rawFrom?: string, rawTo?: string): Promise<MonitorPageHeatResult> {
    const { from, to, days } = this.normalizeRange(rawFrom, rawTo);
    const [events, prevEvents] = await Promise.all([
      this.fetchEvents(from, to),
      this.fetchEvents(shiftDateKey(from, -days), shiftDateKey(to, -days)),
    ]);

    // 逐用户事件序列
    const byUser = new Map<string, EventRow[]>();
    for (const event of events) {
      if (!event.userId) continue;
      const bucket = byUser.get(event.userId);
      if (bucket) bucket.push(event);
      else byUser.set(event.userId, [event]);
    }

    // 逐用户事件序列 → 每次页面访问的停留秒。
    // 心跳与同页刷新只证明「人还在」，不截断停留；边界 = 下一个**不同页面**的访问、
    // 登出、或超过 30 分钟无活动（空闲封顶），最终停留再封顶 30 分钟。
    const dwellByGroup = new Map<string, number[]>();
    for (const userEvents of byUser.values()) {
      userEvents.forEach((event, index) => {
        if (event.action !== 'page_view') return;
        const group = groupKeyOf(event);
        const startMs = event.createdAt.getTime();
        let lastSeenMs = startMs;
        let dwellMs: number | null = null;
        for (let next = index + 1; next < userEvents.length; next += 1) {
          const follower = userEvents[next];
          const gapMs = follower.createdAt.getTime() - lastSeenMs;
          if (gapMs > SESSION_GAP_MS) {
            // 超长空隙只能证明「打开过」，不能证明持续停留：
            // 按最后一次已确认的活动 + 尾部宽放估算，而不是补满 30 分钟
            dwellMs = Math.min(lastSeenMs - startMs + SESSION_TAIL_MS, SESSION_GAP_MS);
            break;
          }
          const leavesPage =
            follower.action === 'logout' || (follower.action === 'page_view' && groupKeyOf(follower) !== group);
          if (leavesPage) {
            dwellMs = Math.min(follower.createdAt.getTime() - startMs, SESSION_GAP_MS);
            break;
          }
          lastSeenMs = follower.createdAt.getTime();
        }
        if (dwellMs === null) dwellMs = Math.min(lastSeenMs - startMs, SESSION_GAP_MS); // 未离页：计到最近一次活动
        const bucket = dwellByGroup.get(group);
        if (bucket) bucket.push(dwellMs / 1000);
        else dwellByGroup.set(group, [dwellMs / 1000]);
      });
    }

    interface Acc {
      page: string;
      detail: string | null;
      views: number;
      users: Set<string>;
    }
    const acc = new Map<string, Acc>();
    for (const event of events.filter((e) => e.action === 'page_view')) {
      const key = groupKeyOf(event);
      const row = acc.get(key) ?? { page: event.page ?? '', detail: event.detail ?? null, views: 0, users: new Set<string>() };
      row.views += 1;
      if (event.userId) row.users.add(event.userId);
      acc.set(key, row);
    }
    const prevAcc = new Map<string, number>();
    for (const event of prevEvents.filter((e) => e.action === 'page_view')) {
      const key = groupKeyOf(event);
      prevAcc.set(key, (prevAcc.get(key) ?? 0) + 1);
    }

    const rows: MonitorPageHeatResult['rows'] = [...acc.entries()]
      .map(([groupKey, row]) => {
        const dwells = dwellByGroup.get(groupKey) ?? [];
        const prevViews = prevAcc.get(groupKey) ?? 0;
        return {
          page: row.page,
          label: monitorPageLabel(row.page, row.detail),
          category: monitorPageInfo(row.page).category,
          groupKey,
          views: row.views,
          users: row.users.size,
          avgDwellSec: dwells.length ? dwells.reduce((sum, value) => sum + value, 0) / dwells.length : null,
          deltaPct: prevViews > 0 ? (row.views - prevViews) / prevViews : null,
        };
      })
      .sort((a, b) => b.views - a.views);
    return { from, to, rows };
  }

  /** 部门活跃：截至 to（默认今天）的 7 天，每日登录人数矩阵 */
  async departments(rawTo?: string): Promise<MonitorDepartmentsResult> {
    const today = shanghaiDateKey(new Date());
    const validatedTo = assertDateKey(rawTo, 'to');
    const to = validatedTo && validatedTo <= today ? validatedTo : today;
    const from = shiftDateKey(to, -6);
    const events = await this.fetchEvents(from, to, { action: 'login' });
    const dates = Array.from({ length: 7 }, (_, index) => shiftDateKey(from, index));

    const acc = new Map<string, Array<Set<string>>>();
    for (const event of events) {
      if (!event.userId) continue;
      const dayIndex = diffDateKeys(from, shanghaiDateKey(event.createdAt));
      if (dayIndex < 0 || dayIndex > 6) continue;
      const department = event.department ?? '未分配';
      const row = acc.get(department) ?? Array.from({ length: 7 }, () => new Set<string>());
      row[dayIndex].add(event.userId);
      acc.set(department, row);
    }
    const rows = [...acc.entries()]
      .map(([department, sets]) => ({ department, counts: sets.map((set) => set.size) }))
      .sort(
        (a, b) =>
          b.counts.reduce((x, y) => x + y, 0) - a.counts.reduce((x, y) => x + y, 0) || a.department.localeCompare(b.department),
      );
    return { dates, rows };
  }

  private logFilters(query: MonitorLogQuery) {
    const { from, to } = this.normalizeRange(query.from, query.to, 1);
    const actions =
      query.tab && query.tab !== 'all' ? MONITOR_LOG_TAB_ACTIONS[query.tab] : undefined;
    const where = {
      createdAt: this.rangeWhere(from, to),
      ...(actions ? { action: { in: [...actions] } } : { action: { not: 'heartbeat' } }),
      ...(query.department === 'none'
        ? { department: null }
        : query.department
          ? { department: query.department }
          : {}),
    };
    return { where, from, to };
  }

  /** 访问日志（分页；heartbeat 不进日志）。DTO 已挡住非法参数，这里再防 NaN/负数兜底 */
  async logs(query: MonitorLogQuery): Promise<MonitorLogResult> {
    const requestedPage = Number(query.page);
    const requestedSize = Number(query.pageSize);
    const page = Number.isFinite(requestedPage) && requestedPage >= 1 ? Math.floor(requestedPage) : 1;
    const pageSize = Number.isFinite(requestedSize)
      ? Math.min(Math.max(1, Math.floor(requestedSize)), 100)
      : 12;
    const { where } = this.logFilters(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.accessEvent.findMany({
        where,
        select: EVENT_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.accessEvent.count({ where }),
    ]);
    return { items: rows.map(toLogItem), total, page, pageSize };
  }

  /** 访问日志导出 CSV（带 BOM，Excel 可直接打开）；最多 1 万条，截断时在文件内标注并返回真实总数 */
  async logsCsv(query: MonitorLogQuery): Promise<{
    csv: string;
    from: string;
    to: string;
    count: number;
    total: number;
  }> {
    const { where, from, to } = this.logFilters(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.accessEvent.findMany({
        where,
        select: EVENT_SELECT,
        orderBy: { createdAt: 'desc' },
        take: 10_000,
      }),
      this.prisma.accessEvent.count({ where }),
    ]);
    const lines = rows.map((row) => {
      const target =
        row.action === 'login' || row.action === 'login_failed' || row.action === 'logout'
          ? row.detail ?? MONITOR_ACTION_LABELS[row.action as MonitorAction] ?? row.action
          : monitorPageLabel(row.page, row.detail);
      return [
        new Date(row.createdAt.getTime() + 8 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19),
        row.name || row.username,
        row.department ?? '',
        MONITOR_ACTION_LABELS[row.action as MonitorAction] ?? row.action,
        target,
        row.device === 'mobile' ? '手机' : '电脑',
        row.ip ?? '',
      ]
        .map(csvCell)
        .join(',');
    });
    const header = ['时间', '用户', '部门', '动作', '页面 / 对象', '设备', 'IP'];
    const title =
      rows.length < total
        ? `访问日志（${from} 至 ${to}）· 共 ${total.toLocaleString('zh-CN')} 条，导出最近 ${rows.length.toLocaleString('zh-CN')} 条`
        : `访问日志（${from} 至 ${to}）`;
    const csv = `\uFEFF${[title, header.join(','), ...lines].join('\r\n')}\r\n`;
    return { csv, from, to, count: rows.length, total };
  }

  /**
   * 管理员强制下线 / 禁用：给该用户近 24 小时用过的**每台设备**各写一条登出边界事件。
   * 只写一条会让其他设备的活动流把「强制下线」误判为该用户仍在线；
   * 监控记录失败只告警，绝不影响踢线主流程。
   */
  async recordKickAllDevices(userId: string, detail: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, name: true, department: true },
      });
      if (!user) return;
      const devices = await this.prisma.accessEvent.findMany({
        where: { userId, createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
        select: { device: true },
        distinct: ['device'],
      });
      const deviceList = devices.length ? devices.map((row) => row.device) : ['desktop'];
      for (const device of deviceList) {
        await this.record({
          userId,
          username: user.username,
          name: user.name,
          department: user.department,
          action: 'logout',
          detail,
          ua: { device: device === 'mobile' ? 'mobile' : 'desktop', client: null },
        });
      }
    } catch (error) {
      this.logger.warn(`强制下线事件记录失败（${userId}）：${String(error)}`);
    }
  }

  /** 成员访问详情 */
  async member(userId: string, rawDate?: string): Promise<MonitorMemberResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    const today = shanghaiDateKey(new Date());
    const validatedDate = assertDateKey(rawDate, 'date');
    const date = validatedDate && validatedDate <= today ? validatedDate : today;
    const now = new Date();
    const dayEndExclusive = shanghaiDayStart(shiftDateKey(date, 1));
    const dayUpperBound = date === today ? now : dayEndExclusive;

    // 当日事件（今天截到现在）
    const dayEvents = (
      await this.prisma.accessEvent.findMany({
        where: { userId, createdAt: { gte: shanghaiDayStart(date), lt: dayEndExclusive } },
        select: EVENT_SELECT,
        orderBy: { createdAt: 'asc' },
      })
    ).filter((event) => event.createdAt <= dayUpperBound);

    // 会话/时长按（用户×设备）分流：登录失败不算在线时长，登出为分段硬边界
    const sessions = splitDeviceSessions(dayEvents);
    const dayStartMs = shanghaiDayStart(date).getTime();
    const toMinute = (time: Date) => Math.max(0, Math.min(1439, Math.round((time.getTime() - dayStartMs) / 60_000)));
    const viewEvents = dayEvents.filter((e) => e.action === 'page_view');

    // 本月（截至 date）
    const monthStart = `${date.slice(0, 7)}-01`;
    const monthEvents = await this.prisma.accessEvent.findMany({
      where: { userId, createdAt: { gte: shanghaiDayStart(monthStart), lt: dayEndExclusive } },
      select: EVENT_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    const monthLoginDays = new Set(
      monthEvents.filter((e) => e.action === 'login').map((e) => shanghaiDateKey(e.createdAt)),
    ).size;
    const monthSubmits = monthEvents.filter((e) => e.action === 'submit').length;
    const monthUpdates = monthEvents.filter((e) => e.action === 'update').length;
    const commonAcc = new Map<string, { page: string; detail: string | null; count: number }>();
    for (const event of monthEvents.filter((e) => e.action === 'page_view')) {
      const key = groupKeyOf(event);
      const row = commonAcc.get(key) ?? { page: event.page ?? '', detail: event.detail ?? null, count: 0 };
      row.count += 1;
      commonAcc.set(key, row);
    }
    const commonPages = [...commonAcc.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((row) => ({ page: row.page, label: monitorPageLabel(row.page, row.detail), count: row.count }));

    // 近 7 天在线小时
    const weekStart = shiftDateKey(date, -6);
    const weekEvents = await this.prisma.accessEvent.findMany({
      where: { userId, createdAt: { gte: shanghaiDayStart(weekStart), lt: dayEndExclusive } },
      select: EVENT_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    const weekBuckets = new Map<string, EventRow[]>();
    for (const event of weekEvents) {
      const key = shanghaiDateKey(event.createdAt);
      const bucket = weekBuckets.get(key);
      if (bucket) bucket.push(event);
      else weekBuckets.set(key, [event]);
    }
    const weekOnline = Array.from({ length: 7 }, (_, index) => {
      const key = shiftDateKey(weekStart, index);
      const totalMs = splitDeviceSessions(weekBuckets.get(key) ?? []).reduce(
        (sum, session) => sum + session.end.getTime() - session.start.getTime(),
        0,
      );
      return { date: key, hours: Math.round((totalMs / 3_600_000) * 10) / 10 };
    });

    // 实时在线按设备分流判定：任一设备的最新事件是「活动」（非登出/登录失败）
    // 且在窗口内即在线——电脑登出不影响仍在使用的手机
    const latestByDevice = new Map<string, EventRow>();
    for (const event of dayEvents) latestByDevice.set(event.device, event);
    let activeStreamLatest: EventRow | null = null;
    for (const latest of latestByDevice.values()) {
      if (latest.action === 'logout' || latest.action === 'login_failed') continue;
      if (now.getTime() - latest.createdAt.getTime() >= ONLINE_WINDOW_MS) continue;
      if (!activeStreamLatest || latest.createdAt > activeStreamLatest.createdAt) activeStreamLatest = latest;
    }
    const onlineActive = user.status === 'ACTIVE' && !!activeStreamLatest;
    const activeStreamEvents = activeStreamLatest
      ? dayEvents.filter((e) => e.device === activeStreamLatest.device)
      : [];
    const lastView = [...activeStreamEvents].reverse().find((e) => e.action === 'page_view');

    // 最近登录记录（会话时长：登录起走到 30 分钟间隔断开）
    const loginRows = await this.prisma.accessEvent.findMany({
      where: { userId, action: 'login' },
      select: EVENT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    const logins: MonitorMemberResult['logins'] = [];
    for (const [index, login] of loginRows.entries()) {
      const sessionEvents = await this.prisma.accessEvent.findMany({
        where: {
          userId,
          createdAt: { gte: login.createdAt, lt: shanghaiDayStart(shiftDateKey(shanghaiDateKey(login.createdAt), 1)) },
          action: { in: [...ACTIVITY_ACTIONS] },
        },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      let last = login.createdAt;
      for (const event of sessionEvents) {
        if (event.createdAt.getTime() - last.getTime() > SESSION_GAP_MS) break;
        last = event.createdAt;
      }
      const durationMin = Math.max(1, Math.round((last.getTime() - login.createdAt.getTime()) / 60_000));
      logins.push({
        time: login.createdAt.toISOString(),
        client: login.client,
        device: deviceOf(login.device),
        ip: login.ip,
        durationMin,
        online: index === 0 && onlineActive,
      });
    }

    const footprint: MonitorMemberResult['footprint'] = [...dayEvents]
      .reverse()
      .filter((event) => event.action !== 'heartbeat')
      .slice(0, 50)
      .map((event) => ({
        time: event.createdAt.toISOString(),
        action: event.action as MonitorAction,
        actionLabel: MONITOR_ACTION_LABELS[event.action as MonitorAction] ?? event.action,
        page: event.page,
        pageLabel: [event.page ? monitorPageInfo(event.page).label : '', event.detail].filter(Boolean).join(' · ') || '登录',
        detail: event.detail,
        device: deviceOf(event.device),
      }));

    const totalDayMs = sessions.reduce((sum, session) => sum + session.end.getTime() - session.start.getTime(), 0);

    return {
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        department: user.department,
        role: user.role,
        status: user.status,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      online: {
        active: onlineActive,
        page: onlineActive ? (lastView?.page ?? null) : null,
        pageLabel: onlineActive && lastView ? monitorPageLabel(lastView.page, lastView.detail) : null,
        device: activeStreamLatest ? deviceOf(activeStreamLatest.device) : null,
      },
      date,
      kpis: {
        onlineHours: Math.round((totalDayMs / 3_600_000) * 10) / 10,
        sessions: sessions.length,
        views: viewEvents.length,
        distinctPages: new Set(viewEvents.map(groupKeyOf)).size,
        monthLoginDays,
        monthWorkdays: countWorkdays(monthStart, date),
        monthSubmits,
        monthUpdates,
      },
      sessions: sessions.map((session) => ({
        start: toMinute(session.start),
        end: toMinute(session.end),
        device: deviceOf(session.events[0].device),
      })),
      footprint,
      weekOnline,
      commonPages,
      logins,
    };
  }
}

function toLogItem(row: EventRow): MonitorLogResult['items'][number] {
  const isAuthAction = row.action === 'login' || row.action === 'login_failed' || row.action === 'logout';
  return {
    id: row.id,
    time: row.createdAt.toISOString(),
    userId: row.userId,
    username: row.username,
    name: row.name,
    department: row.department,
    action: row.action as MonitorAction,
    actionLabel: MONITOR_ACTION_LABELS[row.action as MonitorAction] ?? row.action,
    page: row.page,
    pageLabel: isAuthAction
      ? row.detail ?? MONITOR_ACTION_LABELS[row.action as MonitorAction] ?? row.action
      : monitorPageLabel(row.page, row.detail),
    detail: row.detail,
    device: deviceOf(row.device),
    ip: row.ip,
  };
}
