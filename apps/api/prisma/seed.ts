import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/common/utils/argon';

if (!process.env.DATABASE_URL) {
  console.error('缺少环境变量 DATABASE_URL（请用 tsx --env-file=.env 运行，或先配置 .env）');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const username = 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123456';

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

  console.log('--------------------------------------------');
  console.log('已创建超级管理员:');
  console.log(`  用户名: ${username}`);
  console.log(`  密码:   ${password}`);
  console.log(`  id:     ${user.id}`);
  console.log('请登录后在「用户管理」中重置该默认密码！');
  console.log('--------------------------------------------');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
