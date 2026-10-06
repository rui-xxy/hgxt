import { isDeepStrictEqual } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import type { FormData, FormField } from '@hgxt/shared';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import manifest from '../form-schemas/manifest.json';
import combinedSchema from '../form-schemas/sulfuric-control.json';
import assaySchema from '../form-schemas/sulfuric-control-assay.json';
import washingSchema from '../form-schemas/sulfuric-control-washing.json';
import acidSchema from '../form-schemas/sulfuric-control-acid.json';
import notesSchema from '../form-schemas/sulfuric-control-notes.json';
import source from '../data/sulfuric-control-2025-2026.json';
import { buildSulfuricControlRows, type SulfuricControlSnapshot } from '../import-sulfuric-control';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('缺少 DATABASE_URL');
const url = new URL(connectionString);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/hgxt') {
  throw new Error('此导入脚本只允许写入本机开发库 hgxt');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const parts = [
  { file: 'sulfuric-control-assay.json', schema: assaySchema },
  { file: 'sulfuric-control-washing.json', schema: washingSchema },
  { file: 'sulfuric-control-notes.json', schema: notesSchema },
  { file: 'sulfuric-control-acid.json', schema: acidSchema },
].map((part) => {
  const entry = manifest.find((item) => item.file === part.file);
  if (!entry) throw new Error(`manifest 缺少 ${part.file}`);
  return { ...part, entry };
});

function fieldIdentity(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('中控表单字段结构无效');
  return value.map((field: unknown) => {
    if (!field || typeof field !== 'object' || !('id' in field) || !('type' in field) ||
      typeof field.id !== 'string' || typeof field.type !== 'string') {
      throw new Error('中控表单字段结构无效');
    }
    const item = field as { id: string; type: string; required?: boolean; hidden?: boolean };
    return `${item.id}:${item.type}:${!!item.required}:${!!item.hidden}`;
  }).sort();
}

function project(row: FormData, schema: FormField[]): FormData {
  const projected: FormData = { field_date: row.field_date };
  for (const field of schema) {
    if (field.id !== 'field_date' && row[field.id] !== undefined) projected[field.id] = row[field.id];
  }
  return projected;
}

async function main(): Promise<void> {
  const sourceRows = buildSulfuricControlRows(source as unknown as SulfuricControlSnapshot, combinedSchema as FormField[]);
  const legacy = await prisma.form.findUnique({ where: { code: 'sulfuric_control' } });
  if (legacy && !isDeepStrictEqual(fieldIdentity(legacy.schema), fieldIdentity(combinedSchema))) {
    throw new Error('原中控表单的字段编号或类型与导入结构不同，未执行拆分');
  }
  const byDate = new Map(sourceRows.map((row) => [String(row.field_date), row]));
  if (legacy) {
    const submissions = await prisma.formSubmission.findMany({
      where: { formId: legacy.id }, orderBy: { updatedAt: 'asc' }, select: { data: true },
    });
    for (const submission of submissions) {
      const row = submission.data as FormData;
      if (typeof row.field_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.field_date)) {
        byDate.set(row.field_date, row);
      }
    }
  }
  // 第 03 张表单中已经修改过的备注，优先于原合表和 Excel。
  const acidForm = await prisma.form.findUnique({ where: { code: 'sulfuric_control_acid' } });
  if (acidForm) {
    const submissions = await prisma.formSubmission.findMany({
      where: { formId: acidForm.id }, orderBy: { updatedAt: 'asc' }, select: { data: true },
    });
    for (const submission of submissions) {
      const data = submission.data as FormData;
      if (typeof data.field_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.field_date) &&
        Object.prototype.hasOwnProperty.call(data, 'field_notes')) {
        byDate.set(data.field_date, { ...byDate.get(data.field_date), field_date: data.field_date, field_notes: data.field_notes });
      }
    }
  }
  const rows = [...byDate.values()].sort((a, b) => String(a.field_date).localeCompare(String(b.field_date)));
  if (process.argv.includes('--dry-run')) {
    console.log(`中控分析：准备拆为 4 张品质表单，${rows.length} 个归属日；原合表${legacy ? '保留为归档' : '不存在'}`);
    return;
  }
  for (const { entry, schema } of parts) {
    const existing = await prisma.form.findUnique({ where: { code: entry.code } });
    const currentFields = existing ? fieldIdentity(existing.schema) : [];
    const nextFields = fieldIdentity(schema);
    const acidNotesTransition = entry.code === 'sulfuric_control_acid' &&
      isDeepStrictEqual(currentFields, [...nextFields, 'field_notes:text:false:false'].sort());
    if (existing && !isDeepStrictEqual(currentFields, nextFields) && !acidNotesTransition) {
      throw new Error(`${entry.title} 的字段编号或类型与导入结构不同，未执行覆盖`);
    }
    const form = existing ? await prisma.form.update({ where: { id: existing.id }, data: {
      title: entry.title, category: '品质', entryMode: 'form', description: entry.description,
      status: 'published', schema: schema as Prisma.InputJsonValue,
    } }) : await prisma.form.create({ data: {
      code: entry.code, title: entry.title, category: '品质', entryMode: 'form', description: entry.description,
      parkingEnabled: false, schema: schema as Prisma.InputJsonValue,
    } });
    const existingRows = await prisma.formSubmission.findMany({ where: { formId: form.id }, select: { data: true } });
    const dates = new Set(existingRows.map((item) => (item.data as FormData).field_date));
    const missing = rows.filter((row) => !dates.has(row.field_date)).map((row) => project(row, schema as FormField[]));
    for (let start = 0; start < missing.length; start += 100) {
      await prisma.formSubmission.createMany({ data: missing.slice(start, start + 100).map((data) => ({
        formId: form.id, data: data as Prisma.InputJsonValue,
      })) });
    }
    console.log(`${entry.title}：原有 ${existingRows.length} 条，新增 ${missing.length} 条`);
  }
  // 备注已迁入独立表后，清除第 03 张表单行中的旧字段，避免保存时出现未知字段。
  if (acidForm) {
    const cleaned = await prisma.$executeRaw`
      UPDATE "FormSubmission" SET "data" = "data" - 'field_notes'
      WHERE "formId" = ${acidForm.id} AND "data" ? 'field_notes'
    `;
    console.log(`硫酸中控 03：清理已迁移备注 ${cleaned} 条`);
  }
  if (legacy) await prisma.form.update({ where: { id: legacy.id }, data: { status: 'archived' } });
  console.log('原硫酸中控合表已归档；历史记录未删除。');
}

void main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
