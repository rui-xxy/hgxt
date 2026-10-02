import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import { normalizeDepartmentValue } from '@hgxt/shared';
import source from './data/matters-2026.json';

const fieldIds = [
  'matter', 'completionNote', 'department', 'owner', 'importance',
  'progress', 'startDate', 'dueDate', 'remainingAtExport', 'source',
] as const;

/** 跨年事项保留：开始或计划完成日期有一个属于 2026 年即可。 */
export function isMatterIn2026(values: readonly (string | number | null)[]): boolean {
  return [values[6], values[7]].some((date) => typeof date === 'string' && date.startsWith('2026-'));
}

/** 首次导入附件快照；有数据后不再覆盖表格内的增删改。 */
export async function importMatters(prisma: PrismaClient, formId: string): Promise<number> {
  const existing = await prisma.formSubmission.count({ where: { formId } });
  if (existing > 0) return 0;

  const sourceRows = source.rows.filter(isMatterIn2026);
  const baseTime = Date.now() - sourceRows.length;
  const data = sourceRows.map((values, index) => {
    const fields = Object.fromEntries(fieldIds.map((id, column) => [id, values[column]]));
    if (typeof fields.department === 'string') fields.department = normalizeDepartmentValue(fields.department);
    return {
      formId,
      data: fields as Prisma.InputJsonValue,
      createdAt: new Date(baseTime + index),
    };
  });
  const result = await prisma.formSubmission.createMany({ data });
  return result.count;
}
