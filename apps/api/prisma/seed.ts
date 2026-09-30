import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/common/utils/argon';
import manifest from './form-schemas/manifest.json';
import sulfuricSchema from './form-schemas/sulfuric.json';
import aminosulfonicSchema from './form-schemas/aminosulfonic.json';
import magnesiumSchema from './form-schemas/magnesium.json';
import hydrotalciteSchema from './form-schemas/hydrotalcite.json';
import anthraquinoneSchema from './form-schemas/anthraquinone.json';
import thermalSchema from './form-schemas/thermal.json';
import salesSchema from './form-schemas/sales.json';
import fenglianSchema from './form-schemas/fenglian.json';
import warehouseSchema from './form-schemas/warehouse.json';
import finishedProductsSchema from './form-schemas/finished-products.json';

// manifest 是唯一的表单配置源：新增表单只需加一行 manifest + 对应 JSON 文件
const SCHEMA_MAP: Record<string, unknown> = {
  'sulfuric.json': sulfuricSchema,
  'aminosulfonic.json': aminosulfonicSchema,
  'magnesium.json': magnesiumSchema,
  'hydrotalcite.json': hydrotalciteSchema,
  'anthraquinone.json': anthraquinoneSchema,
  'thermal.json': thermalSchema,
  'sales.json': salesSchema,
  'fenglian.json': fenglianSchema,
  'warehouse.json': warehouseSchema,
  'finished-products.json': finishedProductsSchema,
};

// B3：seed 不再有默认密码——必须显式配置 SEED_ADMIN_PASSWORD 才执行
const rawPassword = process.env.SEED_ADMIN_PASSWORD;
if (!rawPassword || rawPassword.length < 8) {
  console.error('缺少或过短的环境变量 SEED_ADMIN_PASSWORD（至少 8 位）。');
  console.error('用法示例：SEED_ADMIN_PASSWORD="<你的密码>" pnpm db:seed');
  process.exit(1);
}
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
  } else {
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
    console.log(`  id:     ${user.id}`);
    console.log('  密码:   使用你所配置的 SEED_ADMIN_PASSWORD');
    console.log('--------------------------------------------');
  }

  // 按 manifest 创建/更新表单（code 是稳定业务标识，已有表单按 title 匹配后补 code）
  for (const entry of manifest) {
    const schema = SCHEMA_MAP[entry.file];
    if (!schema) {
      console.error(`manifest 引用了 ${entry.file} 但没有对应 import`);
      continue;
    }
    const existingForm = await prisma.form.findFirst({ where: { title: entry.title } });
    if (existingForm) {
      // 已有：补 code / 更新 parking / 不改 schema（保留用户已有的真实数据）
      await prisma.form.update({
        where: { id: existingForm.id },
        data: {
          code: entry.code,
          parkingEnabled: entry.parkingEnabled ?? false,
        },
      });
    } else {
      await prisma.form.create({
        data: {
          title: entry.title,
          code: entry.code,
          description: entry.description,
          schema: schema as never,
          parkingEnabled: entry.parkingEnabled ?? false,
        },
      });
      console.log(`已创建表单：${entry.title}（${(schema as unknown[]).length} 字段，code=${entry.code}）`);
    }
  }

  // 储罐与电表档案（产盘指标换算参数）。fieldId 与旧系统（hengguang_chemical）表单字段一致。
  // 罐容为真实值（m³）＝ b2 库满罐吨位 ÷ 密度（如 98酸 5777t÷1.84=3139.7，与规程 φ20m×10m 吻合）；
  // 电表倍率取自 b2 库 meters 表（meter_amino 为氨基磺酸一期电表，b2 代码注明 3000）。
  const TANKS = [
    ['tank_98-1', '98酸 2#罐', '98酸', 3139.7, 1.84],
    ['tank_98-2', '98酸 3#罐', '98酸', 3139.7, 1.84],
    ['tank_98-3', '98酸 4#罐', '98酸', 3139.7, 1.84],
    ['tank_98-4', '98酸拨酸槽', '98酸', 27.7, 1.84],
    ['tank_fy-1', '发烟酸 1#罐', '发烟硫酸', 3203.1, 1.92],
    ['tank_fy-2', '发烟酸 5#罐', '发烟硫酸', 3203.1, 1.92],
    ['tank_fy-3', '烟酸拨酸槽', '发烟硫酸', 31.8, 1.92],
    ['tank_fy-4', '氨基磺酸转运槽', '发烟硫酸', 100, 1.92],
    ['tank_jp-1', '试剂酸 1#罐', '试剂酸', 227.2, 1.84],
    ['tank_jp-2', '试剂酸 2#罐', '试剂酸', 260.9, 1.84],
    ['tank_jp-3', '试剂酸 3#罐', '试剂酸', 298.9, 1.84],
    ['tank_jp-4', '试剂酸 4#罐', '试剂酸', 298.9, 1.84],
    ['tank_syc-1', '双氧水储罐', '双氧水', 90.1, 1.11],
  ] as const;
  for (const [fieldId, name, material, capacity, density] of TANKS) {
    await prisma.tank.upsert({ where: { fieldId }, create: { fieldId, name, material, capacity, density }, update: { name, material, capacity, density } });
  }
  const METERS = [
    ['meter_3', '1#电机', 1500],
    ['meter_4', '2#电机', 6000],
    ['meter_5', '1#电炉', 2000],
    ['meter_6', '2#电炉', 2000],
    ['meter_mgso4_phase2', '硫酸镁二期电表', 4000],
    ['meter_amino', '氨基磺酸电表', 3000],
  ] as const;
  for (const [fieldId, name, multiplier] of METERS) {
    await prisma.meter.upsert({ where: { fieldId }, create: { fieldId, name, multiplier }, update: { name, multiplier } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
