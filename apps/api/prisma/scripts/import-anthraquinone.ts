import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import schema from '../form-schemas/anthraquinone.json';
import source from '../data/anthraquinone-2025-12-31_2026-10-07.json';
import { buildAnthraquinoneRows } from '../import-anthraquinone';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('缺少 DATABASE_URL');
const url = new URL(connectionString);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/hgxt') {
  throw new Error('此导入脚本只允许写入本机开发库 hgxt');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const rows = buildAnthraquinoneRows(source);
  const form = await prisma.form.findUniqueOrThrow({ where: { code: 'anthraquinone_daily' } });
  const existing = await prisma.formSubmission.findMany({ where: { formId: form.id } });
  const affected = existing.filter((row) => {
    const date = (row.data as Record<string, unknown>).field_date;
    return typeof date === 'string' && date >= source.from && date <= source.to;
  });
  const byDate = new Map<string, typeof affected>();
  for (const row of affected) {
    const date = (row.data as Record<string, string>).field_date;
    byDate.set(date, [...(byDate.get(date) ?? []), row]);
  }
  if ([...byDate.values()].some((items) => items.length > 1)) {
    throw new Error('开发库存在同日期的多条蒽醌记录，未执行导入');
  }
  const matches = (data: Record<string, unknown>, previous: Record<string, unknown> | undefined) =>
    previous && Object.keys(previous).length === Object.keys(data).length
      && Object.entries(data).every(([key, value]) => previous[key] === value);
  const schemaIsCurrent = isDeepStrictEqual(form.schema, schema);
  const sameData = affected.length === rows.length && rows.every((data) => {
    const previous = byDate.get(data.field_date as string)?.[0]?.data as Record<string, unknown> | undefined;
    return matches(data, previous);
  });
  const hasConflictingData = rows.some((data) => {
    const previous = byDate.get(data.field_date as string)?.[0]?.data as Record<string, unknown> | undefined;
    return previous && !matches(data, previous);
  });
  if (schemaIsCurrent && sameData) {
    console.log('蒽醌表单和报表数据已是当前版本，无需重复导入');
    return;
  }
  if (process.argv.includes('--dry-run')) {
    console.log(`待导入 ${rows.length} 天；现有 ${affected.length} 条；将保留同日记录 ID 并按 Excel 日期写入`);
    return;
  }
  if (hasConflictingData && !process.argv.includes('--force')) {
    throw new Error('现有蒽醌数据与附件不同；如确需覆盖原记录，请显式传入 --force');
  }
  const backupPath = join(tmpdir(), `hgxt-anthraquinone-before-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify({ form: { id: form.id, schema: form.schema }, submissions: affected }, null, 2), { encoding: 'utf8', flag: 'wx' });

  const result = await prisma.$transaction(async (tx) => {
    await tx.form.update({ where: { id: form.id }, data: { schema: schema as Prisma.InputJsonValue } });
    let created = 0;
    let updated = 0;
    for (const data of rows) {
      const date = data.field_date as string;
      const previous = byDate.get(date)?.[0];
      if (previous) {
        if (matches(data, previous.data as Record<string, unknown>)) continue;
        await tx.formSubmission.update({
          where: { id: previous.id },
          data: { data: data as Prisma.InputJsonValue },
        });
        updated++;
      } else {
        await tx.formSubmission.create({ data: { formId: form.id, data: data as Prisma.InputJsonValue } });
        created++;
      }
    }
    return { created, updated };
  }, { timeout: 120_000 });
  console.log(`蒽醌 ${source.from} 至 ${source.to} 导入完成：新增 ${result.created} 条，更新 ${result.updated} 条；原记录备份：${backupPath}`);
}

void main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
