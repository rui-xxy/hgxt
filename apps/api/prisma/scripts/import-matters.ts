import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import schema from '../form-schemas/matters-2026.json';
import { importMatters } from '../import-matters';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('缺少 DATABASE_URL');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const form = await prisma.form.upsert({
    where: { code: 'matters_2026' },
    update: { category: '总经办', entryMode: 'sheet' },
    create: {
      code: 'matters_2026',
      title: '2026年事项表',
      category: '总经办',
      entryMode: 'sheet',
      description: '事项跟踪表',
      schema,
    },
  });
  const imported = await importMatters(prisma, form.id);
  console.log(imported ? `已导入 ${imported} 条事项` : '事项表已有数据，未覆盖现有修改');
}

void main().finally(() => prisma.$disconnect());
