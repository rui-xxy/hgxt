import { execSync } from 'node:child_process';

// 与 vitest.config.ts 的 env 保持一致：CI 可用 TEST_DATABASE_URL 覆盖
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/hgxt_test?schema=public';

/** 每次跑测试前把测试库迁移到最新（依赖可访问的 PostgreSQL 与 hgxt_test 库） */
export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
