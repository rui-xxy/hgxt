import type { FormData, FormField } from '@hgxt/shared';

interface SourceRow {
  date: string;
  sourceRow: number;
  values: Record<string, string | number>;
}

export interface SulfuricControlSnapshot {
  source: string;
  from: string;
  to: string;
  rows: SourceRow[];
}

/** Excel A 列是唯一归属日；空值保持空值，不能把空白化验结果当作零。 */
export function buildSulfuricControlRows(snapshot: SulfuricControlSnapshot, schema: FormField[]): FormData[] {
  const known = new Set(schema.map((field) => field.id));
  const byDate = new Set<string>();
  const result: FormData[] = [];
  for (const row of snapshot.rows) {
    if (!/^202[56]-\d{2}-\d{2}$/.test(row.date) || row.date < snapshot.from || row.date > snapshot.to || byDate.has(row.date)) {
      throw new Error(`中控分析表第 ${row.sourceRow} 行日期无效或重复`);
    }
    byDate.add(row.date);
    const data: FormData = { field_date: row.date };
    for (const [key, value] of Object.entries(row.values)) {
      if (!known.has(key) || key === 'field_date' || !['string', 'number'].includes(typeof value) ||
          (typeof value === 'number' && !Number.isFinite(value)) || (typeof value === 'string' && value.length > 1000)) {
        throw new Error(`中控分析表第 ${row.sourceRow} 行字段 ${key} 无效`);
      }
      data[key] = value;
    }
    result.push(data);
  }
  return result.sort((a, b) => String(a.field_date).localeCompare(String(b.field_date)));
}
