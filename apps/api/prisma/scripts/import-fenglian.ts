import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import schema from '../form-schemas/fenglian.json';
import source from '../data/fenglian-2026-09.json';
import { buildFenglianRows } from '../import-fenglian';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('缺少 DATABASE_URL');
const url = new URL(connectionString);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/hgxt') {
  throw new Error('此导入脚本只允许写入本机开发库 hgxt');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const rows = buildFenglianRows(source);
  const form = await prisma.form.findUniqueOrThrow({ where: { code: 'fenglian_daily' } });
  const existing = await prisma.formSubmission.findMany({ where: { formId: form.id } });
  const affected = existing.filter((row) => {
    const date = (row.data as Record<string, unknown>).field_date;
    return typeof date === 'string' && date >= source.from && date <= source.to;
  });
  const affectedIds = new Set(affected.map((row) => row.id));
  const newFieldIds = new Set(schema.map((field) => field.id));
  const hiddenHistoricalField = existing.filter((row) => !affectedIds.has(row.id)).flatMap((row) =>
    Object.entries(row.data as Record<string, unknown>)
      .filter(([id, value]) => id.startsWith('field_') && !newFieldIds.has(id) && value !== null && value !== '')
      .map(([id]) => id))[0];
  if (hiddenHistoricalField) {
    throw new Error(`区间外历史记录含新版表单未收录的 ${hiddenHistoricalField}，未执行导入`);
  }
  const byDate = new Map<string, typeof affected>();
  for (const row of affected) {
    const date = (row.data as Record<string, string>).field_date;
    byDate.set(date, [...(byDate.get(date) ?? []), row]);
  }
  if ([...byDate.values()].some((items) => items.length > 1)) {
    throw new Error('开发库存在同日期的多条丰联记录，未执行导入');
  }
  const schemaIsCurrent = isDeepStrictEqual(form.schema, schema);
  const sameData = affected.length === rows.length && rows.every((data) =>
    isDeepStrictEqual(byDate.get(data.field_date as string)?.[0]?.data, data));
  if (schemaIsCurrent && sameData) {
    console.log('丰联表单与 9 月数据已是当前版本，无需重复导入');
    return;
  }
  if (process.argv.includes('--dry-run')) {
    console.log(`待导入 ${rows.length} 天；已有 ${affected.length} 条；字段 ${schema.length} 个`);
    return;
  }
  if (affected.length && !sameData && !process.argv.includes('--force')) {
    throw new Error('9 月已有与 Excel 不同的数据；如确需覆盖人工修改，请显式传入 --force');
  }
  const backupPath = join(tmpdir(), `hgxt-fenglian-before-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify({ form: { id: form.id, schema: form.schema }, submissions: affected }, null, 2), { encoding: 'utf8', flag: 'wx' });

  const result = await prisma.$transaction(async (tx) => {
    await tx.form.update({ where: { id: form.id }, data: { schema: schema as Prisma.InputJsonValue } });
    let created = 0;
    let updated = 0;
    for (const data of rows) {
      const previous = byDate.get(data.field_date as string)?.[0];
      if (previous) {
        if (!isDeepStrictEqual(previous.data, data)) {
          await tx.formSubmission.update({ where: { id: previous.id }, data: { data: data as Prisma.InputJsonValue } });
          updated++;
        }
      } else {
        await tx.formSubmission.create({ data: { formId: form.id, data: data as Prisma.InputJsonValue } });
        created++;
      }
    }
    return { created, updated };
  }, { timeout: 120_000 });
  console.log(`丰联表单结构已同步；${source.from} 至 ${source.to}：新增 ${result.created} 条，更新 ${result.updated} 条；备份：${backupPath}`);
}

void main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
