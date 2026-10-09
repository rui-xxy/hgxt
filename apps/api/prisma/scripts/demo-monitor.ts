/**
 * 访问监控演示数据（仅用于本地开发库 hgxt）：
 * 按设计稿《HGXT-访问监控》的人物与节奏生成近 7 天的登录 / 页面访问 /
 * 心跳 / 提交 / 导出 / 安全事件，让监控页有内容可看。
 *
 * 安全护栏：
 *  - 启动即校验「数据库名为 hgxt + 连接的是本机地址 + 非生产环境」，否则拒绝执行；
 *  - 演示账号全部使用 demo_ 前缀的独立命名空间；清理只按 demo_ 前缀进行，
 *    绝不按普通用户名删除账号（首批无前缀的历史演示数据请用
 *    cleanup-legacy-demo.ts 人工确认后单独清理）。
 * 幂等：可重复执行。运行：pnpm --filter @hgxt/api exec tsx --env-file=.env prisma/scripts/demo-monitor.ts
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { hashPassword } from '../../src/common/utils/argon';

const DEMO_PASSWORD = 'Demo@12345678';
/** 演示账号独立命名空间：只允许删除 demo_ 前缀 */
const DEMO_PREFIX = 'demo_';

/** 只允许写入本机的开发库 hgxt：远程库（哪怕同名）与测试库/生产库一律拒绝 */
function assertDevDatabase(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境禁止执行演示数据脚本');
  }
  const url = process.env.DATABASE_URL ?? '';
  const withoutQuery = url.split('?')[0];
  const database = withoutQuery.split('/').pop() ?? '';
  // 剥离 scheme 与 user:pass@，取纯主机名
  const host = withoutQuery
    .replace(/^[a-z+]+:\/\//i, '')
    .split('/')[0]
    .split('@')
    .pop()!
    .split(':')[0]
    .toLowerCase();
  const localHosts = ['localhost', '127.0.0.1', '::1', '[::1]', ''];
  if (database !== 'hgxt' || !localHosts.includes(host)) {
    throw new Error(
      `演示数据只能写入本机开发库 hgxt（当前连接：${host || '本地套接字'}/${database || '未知'}），拒绝执行`,
    );
  }
}

interface DemoUser {
  username: string;
  name: string;
  department: string;
  /** 手机访问占比 0-1 */
  mobileShare: number;
  /** 常用页面（page key + 详情） */
  pages: Array<[string, string | null]>;
}

const USERS: DemoUser[] = [
  { username: 'demo_wangjg', name: '王建国', department: '总经办', mobileShare: 0.4, pages: [['brief', null], ['board', null], ['plan', null]] },
  { username: 'demo_lijing', name: '李静', department: '硫酸生产部', mobileShare: 0.1, pages: [['form-fill', '硫酸车间日报'], ['board', null], ['forms', '硫酸车间日报']] },
  { username: 'demo_zhangmin', name: '张敏', department: '工艺技术部', mobileShare: 0, pages: [['plan', null], ['form-fill', '硫酸车间日报'], ['energy', null]] },
  { username: 'demo_hupp', name: '胡鹏鹏', department: '设备工程部', mobileShare: 0.6, pages: [['maintenance-new', null], ['maintenance-records', null]] },
  { username: 'demo_chenxy', name: '陈晓燕', department: '氨基磺酸生产部', mobileShare: 0.2, pages: [['board', null], ['form-fill', '氨基磺酸车间日报']] },
  { username: 'demo_liuyang', name: '刘洋', department: '仓储物流部', mobileShare: 0, pages: [['materials', null], ['board', null]] },
  { username: 'demo_zhouht', name: '周海涛', department: '二乙蒽醌生产部', mobileShare: 0.3, pages: [['energy', null], ['board', null]] },
  { username: 'demo_whp', name: '吴海平', department: '设备工程部', mobileShare: 0.5, pages: [['maintenance', null], ['maintenance-records', null]] },
  { username: 'demo_zhengli', name: '郑丽', department: '硫酸镁生产部', mobileShare: 0, pages: [['form-fill', '硫酸镁车间日报'], ['board', null]] },
  { username: 'demo_suntao', name: '孙涛', department: '水滑石生产部', mobileShare: 0, pages: [['form-fill', '新材料车间日报'], ['board', null]] },
  { username: 'demo_fengjh', name: '冯建华', department: '丰联生产部', mobileShare: 0, pages: [['form-fill', '丰联车间日报'], ['board', null]] },
];

const CLIENTS = {
  desktop: { device: 'desktop', client: 'Chrome 129 · Windows' },
  mobile: { device: 'mobile', client: '企业微信 · Android' },
  ipad: { device: 'mobile', client: 'Safari 17 · iOS' },
};

/** 上海时区某天 h:m 的 UTC Date */
function at(dateKey: string, hour: number, minute: number): Date {
  return new Date(Date.UTC(+dateKey.slice(0, 4), +dateKey.slice(5, 7) - 1, +dateKey.slice(8, 10), hour - 8, minute));
}

function dayKey(offsetDays: number): string {
  return new Date(Date.now() + 8 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

// 伪随机（固定种子，保证可复现）
let seed = 42;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

interface EventDraft {
  userId: string | null;
  username: string;
  name: string;
  department: string | null;
  action: string;
  page?: string | null;
  detail?: string | null;
  device: string;
  client?: string | null;
  ip?: string | null;
  createdAt: Date;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  assertDevDatabase();
  // 清理范围严格限定 demo_ 前缀：绝不按普通用户名删账号
  await prisma.accessEvent.deleteMany({ where: { username: { startsWith: DEMO_PREFIX } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: DEMO_PREFIX } } });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const created: Record<string, string> = {};
  for (const user of USERS) {
    const row = await prisma.user.create({
      data: {
        username: user.username,
        name: user.name,
        department: user.department,
        passwordHash,
        role: 'USER',
        pagePermissions: ['plan', 'brief', 'maintenance'],
      },
    });
    created[user.username] = row.id;
  }

  const now = Date.now();
  const events: EventDraft[] = [];
  const push = (draft: EventDraft) => {
    if (draft.createdAt.getTime() < now) events.push(draft);
  };
  const base = (user: DemoUser, mobile: boolean) => ({
    userId: created[user.username],
    username: user.username,
    name: user.name,
    department: user.department,
    ...(mobile ? CLIENTS.mobile : CLIENTS.desktop),
    ip: mobile ? `223.104.${Math.floor(rand() * 200)}.${Math.floor(rand() * 200)}` : `10.0.1.${10 + Math.floor(rand() * 90)}`,
  });

  // 近 7 天（含今天）：工作日每人登录 + 全天会话；周末少数人加班
  for (let dayOffset = -6; dayOffset <= 0; dayOffset += 1) {
    const key = dayKey(dayOffset);
    const weekday = new Date(at(key, 12, 0).getTime() + 8 * 3_600_000).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    for (const user of USERS) {
      const working = weekend ? rand() < 0.25 : rand() < 0.92;
      if (!working) continue;
      const mobile = rand() < user.mobileShare;
      const meta = base(user, mobile);
      const loginMinute = 7 * 60 + Math.floor(rand() * 50);
      push({ ...meta, action: 'login', detail: meta.client, createdAt: at(key, Math.floor(loginMinute / 60), loginMinute % 60) });

      // 一段上午会话：页面访问 + 心跳（每 ~25 分钟一个活动点）
      let cursor = loginMinute + 3 + Math.floor(rand() * 8);
      const morningEnd = weekend ? 11 * 60 : 12 * 60 - 10;
      while (cursor < morningEnd) {
        const [page, detail] = user.pages[Math.floor(rand() * user.pages.length)];
        const isView = rand() < 0.55;
        push({
          ...meta,
          action: isView ? 'page_view' : 'heartbeat',
          page: isView ? page : null,
          detail: isView ? detail : null,
          createdAt: at(key, Math.floor(cursor / 60), cursor % 60),
        });
        cursor += 12 + Math.floor(rand() * 20);
      }

      // 下午会话（今天只到当前时间）
      const afternoonStart = 13 * 60 + 40 + Math.floor(rand() * 30);
      let pm = afternoonStart;
      const pmEnd = 17 * 60 + 30;
      while (pm < pmEnd) {
        const [page, detail] = user.pages[Math.floor(rand() * user.pages.length)];
        const isView = rand() < 0.5;
        push({
          ...meta,
          action: isView ? 'page_view' : 'heartbeat',
          page: isView ? page : null,
          detail: isView ? detail : null,
          createdAt: at(key, Math.floor(pm / 60), pm % 60),
        });
        pm += 15 + Math.floor(rand() * 22);
      }

      // 下班前登出（只有较早的日子补，今天留给「在线」状态）
      if (dayOffset < 0 && !mobile) {
        const logoutMinute = 17 * 60 + 20 + Math.floor(rand() * 35);
        push({ ...meta, action: 'logout', detail: '在线 8 小时 12 分钟', createdAt: at(key, Math.floor(logoutMinute / 60), logoutMinute % 60) });
      }
    }
  }

  const today = dayKey(0);
  // 李静今天的填报动作（今日填报 · 硫酸车间日报）
  const lijing = USERS.find((u) => u.username === 'demo_lijing')!;
  const lijingMeta = base(lijing, false);
  push({ ...lijingMeta, action: 'page_view', page: 'form-fill', detail: '硫酸车间日报', createdAt: at(today, 14, 0) });
  push({ ...lijingMeta, action: 'submit', page: 'form-fill', detail: '硫酸车间日报 · 10-09', createdAt: at(today, 14, 2) });
  push({ ...lijingMeta, action: 'page_view', page: 'board', detail: null, createdAt: at(today, 15, 21) });
  push({ ...lijingMeta, action: 'heartbeat', createdAt: at(today, 15, 26) });
  push({ ...lijingMeta, action: 'update', page: 'form-fill', detail: '硫酸车间日报 · 2# 罐液位', createdAt: at(today, 15, 28) });

  // 刘洋导出物料库存
  const liuyang = USERS.find((u) => u.username === 'demo_liuyang')!;
  const liuyangMeta = base(liuyang, false);
  push({ ...liuyangMeta, action: 'page_view', page: 'materials', detail: null, createdAt: at(today, 14, 50) });
  push({ ...liuyangMeta, action: 'export', page: 'materials', detail: '物料与库存 · Excel', createdAt: at(today, 14, 55) });

  // 王建国（手机）下午看简报
  const wangjg = USERS.find((u) => u.username === 'demo_wangjg')!;
  const wangMobile = base(wangjg, true);
  push({ ...wangMobile, action: 'page_view', page: 'brief', detail: null, createdAt: at(today, 15, 31) });
  push({ ...wangMobile, action: 'heartbeat', createdAt: at(today, 15, 40) });

  // 安全事件：demo_liuyj 连续 5 次密码错误（15:03–15:08）
  for (let i = 0; i < 5; i += 1) {
    push({
      userId: null,
      username: 'demo_liuyj',
      name: '',
      department: null,
      action: 'login_failed',
      detail: `密码错误 · 第 ${i + 1} 次`,
      ...CLIENTS.desktop,
      ip: '112.48.33.106',
      createdAt: at(today, 15, 3 + i),
    });
  }
  // 周海涛凌晨 02:14 手机登录（非工作时间）
  const zhouht = USERS.find((u) => u.username === 'demo_zhouht')!;
  push({
    ...base(zhouht, true),
    action: 'login',
    detail: CLIENTS.mobile.client,
    createdAt: at(today, 2, 14),
  });
  // 陈晓燕新设备（iPad）登录
  const chenxyUser = USERS.find((u) => u.username === 'demo_chenxy')!;
  push({
    userId: created[chenxyUser.username],
    username: chenxyUser.username,
    name: chenxyUser.name,
    department: chenxyUser.department,
    action: 'login',
    detail: CLIENTS.ipad.client,
    ...CLIENTS.ipad,
    ip: '10.0.1.88',
    createdAt: at(today, 8, 3),
  });

  await prisma.accessEvent.createMany({
    data: events.map((event) => ({ ...event, page: event.page ?? null, detail: event.detail ?? null, client: event.client ?? null, ip: event.ip ?? null })),
  });

  // lastLoginAt 与演示一致
  for (const user of USERS) {
    const last = events.filter((e) => e.username === user.username && e.action === 'login').at(-1);
    await prisma.user.update({
      where: { id: created[user.username] },
      data: { lastLoginAt: last?.createdAt ?? null },
    });
  }

  console.log(`演示数据完成：${USERS.length} 名成员 / ${events.length} 条访问事件（密码统一 ${DEMO_PASSWORD}）`);
}

main().finally(() => prisma.$disconnect());
