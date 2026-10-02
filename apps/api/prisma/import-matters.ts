import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import source from './data/matters-2026.json';

const fieldIds = [
  'matter', 'completionNote', 'department', 'owner', 'importance',
  'progress', 'startDate', 'dueDate', 'remainingAtExport', 'source',
] as const;

/** 首次导入附件快照；有数据后不再覆盖表格内的增删改。 */
export async function importMatters(prisma: PrismaClient, formId: string): Promise<number> {
  const existing = await prisma.formSubmission.count({ where: { formId } });
  if (existing > 0) return 0;

  const baseTime = Date.now() - source.rows.length;
  const data = source.rows.map((values, index) => ({
    formId,
    data: Object.fromEntries(fieldIds.map((id, column) => [id, values[column]])) as Prisma.InputJsonValue,
    createdAt: new Date(baseTime + index),
  }));
  const result = await prisma.formSubmission.createMany({ data });
  return result.count;
}
