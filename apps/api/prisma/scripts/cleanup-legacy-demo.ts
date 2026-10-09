/**
 * 一次性人工清理：删除首批演示数据脚本（无 demo_ 前缀时代）创建的账号与事件。
 *
 * 背景：2026-10-09 的首版 demo-monitor.ts 用过一批普通用户名（lijing、wangjg 等）。
 * 这些名字理论上可能与真实员工撞名，因此**不能**放进演示脚本自动删除，
 * 只保留在这个需要显式确认的独立脚本里：
 *
 *   pnpm --filter @hgxt/api exec tsx --env-file=.env prisma/scripts/cleanup-legacy-demo.ts --confirm-legacy-cleanup
 *
 * 不带 --confirm-legacy-cleanup 时只打印将要删除的内容（dry run），不做任何修改。
 * 本脚本已在 2026-10-09 于本机开发库执行过一次，正常情况下无需再跑。
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

/** 首版演示脚本使用过的无前缀用户名（历史清单，只减不增） */
const LEGACY_USERNAMES = [
  'wangjg', 'lijing', 'zhangmin', 'hupp', 'chenxy', 'liuyang',
  'zhouht', 'whp', 'zhengli', 'suntao', 'fengjh', 'liuyj',
];

function assertDevDatabase(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境禁止执行清理脚本');
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
    throw new Error(`清理脚本只能作用于本机开发库 hgxt（当前：${host}/${database || '未知'}），拒绝执行`);
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  assertDevDatabase();
  const confirmed = process.argv.includes('--confirm-legacy-cleanup');

  // 先核对这批用户名当前指向的账号，逐一列出供人工确认
  const users = await prisma.user.findMany({
    where: { username: { in: LEGACY_USERNAMES } },
    select: { id: true, username: true, name: true, department: true, createdAt: true, _count: { select: { formSubmissions: true } } },
  });
  console.log(`匹配到 ${users.length} 个历史演示账号：`);
  for (const user of users) {
    console.log(
      `  ${user.username}（${user.name} · ${user.department ?? '无部门'} · 创建于 ${user.createdAt.toISOString().slice(0, 10)} · 表单提交 ${user._count.formSubmissions} 条）`,
    );
  }
  if (users.some((user) => user._count.formSubmissions > 0)) {
    console.log('注意：有账号带表单提交记录，请先人工核实这些不是真实数据后再执行。');
  }
  if (!confirmed) {
    console.log('\nDry run：加 --confirm-legacy-cleanup 才会真正删除。');
    return;
  }

  const removedEvents = await prisma.accessEvent.deleteMany({
    where: { username: { in: LEGACY_USERNAMES } },
  });
  const removedUsers = await prisma.user.deleteMany({
    where: { username: { in: LEGACY_USERNAMES } },
  });
  console.log(`已删除 ${removedUsers.count} 个账号与 ${removedEvents.count} 条访问事件。`);
}

main().finally(() => prisma.$disconnect());
