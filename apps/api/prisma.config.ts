import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7：连接串从 schema.prisma 移到这里（Migrate/CLI 使用）。
// 注意用 process.env 而不是 env() 助手：env() 在变量缺失时直接抛错，
// 会让不需要数据库的 prisma generate（以及依赖它的 CI 构建）在干净机器上失败。
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file=.env prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
