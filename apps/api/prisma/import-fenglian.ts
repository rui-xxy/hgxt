import type { FormData } from '@hgxt/shared';
import schema from './form-schemas/fenglian.json';

interface SourceDay {
  date: string;
  sourceRow: number;
  values: Record<string, number | undefined>;
}

export interface FenglianSnapshot {
  from: string;
  to: string;
  sheets: {
    三车间: SourceDay[];
    标准厂房: SourceDay[];
    公共: SourceDay[];
  };
}

const SHEETS = ['三车间', '标准厂房', '公共'] as const;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** All three sheets use their printed row date; blank cells remain missing. */
export function buildFenglianRows(snapshot: FenglianSnapshot): FormData[] {
  const fieldIds = new Set(schema.map((field) => field.id));
  const bySheet = SHEETS.map((name) => {
    const rows = snapshot.sheets[name];
    const map = new Map<string, SourceDay>();
    for (const row of rows) {
      if (!datePattern.test(row.date) || row.date < snapshot.from || row.date > snapshot.to || map.has(row.date)) {
        throw new Error(`${name} 第 ${row.sourceRow} 行日期无效或重复`);
      }
      for (const [field, value] of Object.entries(row.values)) {
        if (!fieldIds.has(field) || field === 'field_date' || typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error(`${name} 第 ${row.sourceRow} 行字段 ${field} 无效`);
        }
      }
      map.set(row.date, row);
    }
    return { name, map };
  });
  const dates = [...bySheet[0].map.keys()].sort();
  const expectedDays = Math.round((Date.parse(`${snapshot.to}T00:00:00Z`) - Date.parse(`${snapshot.from}T00:00:00Z`)) / 86400000) + 1;
  if (!Number.isFinite(expectedDays) || dates.length !== expectedDays || bySheet.some(({ map }) => map.size !== expectedDays)) {
    throw new Error('丰联三个工作表的日期不完整');
  }
  return dates.map((date) => {
    const data: FormData = Object.fromEntries(schema.map((field) => [field.id, field.id === 'field_date' ? date : null]));
    const assigned = new Set<string>();
    for (const { name, map } of bySheet) {
      const row = map.get(date);
      if (!row) throw new Error(`${name} 缺少 ${date}`);
      for (const [field, value] of Object.entries(row.values)) {
        if (assigned.has(field)) throw new Error(`${date} 的 ${field} 在多个工作表中重复`);
        if (value === undefined) throw new Error(`${date} 的 ${field} 缺少数值`);
        assigned.add(field);
        data[field] = value;
      }
    }
    return data;
  });
}
