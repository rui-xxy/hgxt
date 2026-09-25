import { execSync } from 'node:child_process';

const TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/hgxt_test?schema=public';

/** 每次跑测试前把测试库迁移到最新（依赖本机 Docker 的 hgxt-postgres 与 hgxt_test 库） */
export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
