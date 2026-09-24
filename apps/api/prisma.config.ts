import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7：连接串从 schema.prisma 移到这里（Migrate/CLI 使用）
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file=.env prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
