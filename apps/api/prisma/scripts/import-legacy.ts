// 旧系统（hengguang_chemical，sys_form 表单模块）数据一次性导入开发库：
// - 表单：按 code upsert，schema/标题采用 prisma/form-schemas 里的生产转换结果
// - 罐表档案：整体重建（fieldId 已换成旧系统口径，与迁移数据一致）
// - 提交数据：清空目标表单已有提交后批量插入（migration-data/submissions.json）
// - 用户：migration-data/users.json（不含 admin），初始密码统一为 DEFAULT_PASSWORD
// 运行：pnpm db:import-legacy（等价 tsx --env-file=.env prisma/scripts/import-legacy.ts）
// 数据来源：参照/users_table.dump + sys_form_schema.dump（2026-09-30 从生产库导出）
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { hashPassword } from '../../src/common/utils/argon';
import manifest from '../form-schemas/manifest.json';
import SCHEMAS from '../migration-data/_schemas.json';
import submissions from '../migration-data/submissions.json';
import users from '../migration-data/users.json';

// 迁移用户统一初始密码（首次登录后应自行修改）
const DEFAULT_PASSWORD = 'Hg@2026';

// 与 seed.ts 相同口径：旧系统 fieldId + 真实罐容（m³＝b2 满罐吨位÷密度）与电表倍率
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
const METERS = [
  ['meter_3', '1#电机', 1500],
  ['meter_4', '2#电机', 6000],
  ['meter_5', '1#电炉', 2000],
  ['meter_6', '2#电炉', 2000],
  ['meter_mgso4_phase2', '硫酸镁二期电表', 4000],
  ['meter_amino', '氨基磺酸电表', 3000],
] as const;

if (!process.env.DATABASE_URL) {
  console.error('缺少环境变量 DATABASE_URL（请用 tsx --env-file=.env 运行）');
  process.exit(1);
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface LegacySubmission {
  code: string;
  date: string | null;
  submittedAt: string;
  data: Record<string, unknown>;
}

async function importForms(): Promise<Map<string, string>> {
  const idByCode = new Map<string, string>();
  for (const entry of manifest) {
    const schema = (SCHEMAS as Record<string, unknown>)[entry.code];
    if (!schema) throw new Error(`_schemas.json 缺少 ${entry.code}`);
    const existing = (await prisma.form.findUnique({ where: { code: entry.code } }))
      ?? (await prisma.form.findFirst({ where: { title: entry.title } }));
    const form = existing
      ? await prisma.form.update({
          where: { id: existing.id },
          data: {
            code: entry.code,
            title: entry.title,
            description: entry.description,
            schema: schema as never,
            parkingEnabled: entry.parkingEnabled ?? false,
          },
        })
      : await prisma.form.create({
          data: {
            code: entry.code,
            title: entry.title,
            description: entry.description,
            schema: schema as never,
            parkingEnabled: entry.parkingEnabled ?? false,
          },
        });
    idByCode.set(entry.code, form.id);
    console.log(`表单 ${entry.code}（${(schema as unknown[]).length} 字段）id=${form.id}`);
  }
  return idByCode;
}

async function importTanksAndMeters(): Promise<void> {
  await prisma.tank.deleteMany();
  await prisma.meter.deleteMany();
  await prisma.tank.createMany({
    data: TANKS.map(([fieldId, name, material, capacity, density]) => ({
      fieldId, name, material, capacity, density,
    })),
  });
  await prisma.meter.createMany({
    data: METERS.map(([fieldId, name, multiplier]) => ({ fieldId, name, multiplier })),
  });
  console.log(`罐 ${TANKS.length} 个、电表 ${METERS.length} 个已重建`);
}

async function importSubmissions(idByCode: Map<string, string>): Promise<number> {
  const sourceRows = submissions as LegacySubmission[];
  const importedCodes = [...new Set(sourceRows.map((row) => row.code))];
  const unknownCode = importedCodes.find((code) => !idByCode.has(code));
  if (unknownCode) throw new Error(`提交数据包含未知表单：${unknownCode}`);
  // 仅重建快照中实际有提交的表单；事项表等独立维护的数据不能随旧数据导入清空。
  const formIds = importedCodes.map((code) => idByCode.get(code)!);

  // 旧库把数字存成字符串（"9.05"）；入库前按 schema 的 number 字段规范化成真数字
  const numberFields = new Map<string, Set<string>>();
  for (const entry of manifest) {
    const schema = (SCHEMAS as Record<string, Array<{ id: string; type: string }>>)[entry.code] ?? [];
    numberFields.set(entry.code, new Set(schema.filter((f) => f.type === 'number').map((f) => f.id)));
  }

  const rows = sourceRows.map((s) => {
    const data = { ...s.data };
    // 旧系统 parkingRecords 是 jsonb 数组；本系统存字符串（空数组直接丢弃）
    if (Array.isArray(data.parkingRecords)) {
      if (data.parkingRecords.length > 0) data.parkingRecords = JSON.stringify(data.parkingRecords);
      else delete data.parkingRecords;
    }
    const nums = numberFields.get(s.code);
    if (nums) {
      for (const key of Object.keys(data)) {
        if (!nums.has(key)) continue;
        const v = data[key];
        if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
          data[key] = Number(v);
        } else if (typeof v === 'string') {
          data[key] = null;
        }
      }
    }
    return {
      formId: idByCode.get(s.code)!,
      data: data as never,
      createdAt: new Date(s.submittedAt),
    };
  });

  const removedCount = await prisma.$transaction(async (tx) => {
    const removed = await tx.formSubmission.deleteMany({ where: { formId: { in: formIds } } });
    for (let i = 0; i < rows.length; i += 500) {
      await tx.formSubmission.createMany({ data: rows.slice(i, i + 500) });
    }
    return removed.count;
  }, { timeout: 60_000 });
  console.log(`提交 ${rows.length} 条已导入（清除旧数据 ${removedCount} 条）`);
  return rows.length;
}

async function importUsers(): Promise<number> {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  let created = 0;
  for (const u of users as { username: string; name: string; role: 'USER' | 'SUPER_ADMIN' }[]) {
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { name: u.name, role: u.role } });
      continue;
    }
    await prisma.user.create({
      data: {
        username: u.username,
        name: u.name,
        // 旧系统用户名多为手机号，同步补进 phone 字段
        phone: /^1\d{10}$/.test(u.username) ? u.username : null,
        role: u.role,
        status: 'ACTIVE',
        passwordHash,
      },
    });
    created++;
  }
  console.log(`用户 ${users.length} 个（新建 ${created}，初始密码 ${DEFAULT_PASSWORD}）`);
  return created;
}

async function main(): Promise<void> {
  const idByCode = await importForms();
  await importTanksAndMeters();
  await importSubmissions(idByCode);
  await importUsers();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
