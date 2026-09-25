import { defineConfig } from 'vitest/config';

// 测试库地址可用 TEST_DATABASE_URL 覆盖（CI 里 postgres service 跑在 localhost:5432）
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/hgxt_test?schema=public';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    include: ['test/**/*.e2e-spec.ts'],
    // 共享同一个测试库，文件间不并行
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: 'test-jwt-access-secret-0123456789abcdef0123456789abcdef',
    },
  },
});
