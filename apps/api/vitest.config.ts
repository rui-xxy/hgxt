import { defineConfig } from 'vitest/config';

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
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/hgxt_test?schema=public',
      JWT_ACCESS_SECRET: 'test-jwt-access-secret-0123456789abcdef0123456789abcdef',
    },
  },
});
