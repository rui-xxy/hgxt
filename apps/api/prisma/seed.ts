import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/common/utils/argon';

// B3：seed 不再有默认密码——必须显式配置 SEED_ADMIN_PASSWORD 才执行
const rawPassword = process.env.SEED_ADMIN_PASSWORD;
if (!rawPassword || rawPassword.length < 8) {
  console.error('缺少或过短的环境变量 SEED_ADMIN_PASSWORD（至少 8 位）。');
  console.error('用法示例：SEED_ADMIN_PASSWORD="<你的密码>" pnpm db:seed');
  process.exit(1);
}
// 窄化后的绑定，供下方 main() 闭包使用
const password: string = rawPassword;

if (!process.env.DATABASE_URL) {
  console.error('缺少环境变量 DATABASE_URL（请用 tsx --env-file=.env 运行，或先配置 .env）');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const username = 'admin';

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`超级管理员 "${username}" 已存在（id=${existing.id}），跳过创建。`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      username,
      name: '管理员',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      passwordHash: await hashPassword(password),
    },
  });

  // B3：不回显密码，只确认创建结果
  console.log('--------------------------------------------');
  console.log('已创建超级管理员:');
  console.log(`  用户名: ${username}`);
  console.log(`  id:     ${user.id}`);
  console.log('  密码:   使用你所配置的 SEED_ADMIN_PASSWORD');
  console.log('--------------------------------------------');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
