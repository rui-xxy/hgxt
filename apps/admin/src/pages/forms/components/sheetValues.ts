import type { FormData, FormField } from '@hgxt/shared';

type CellValue = FormData[string];
type ParsedCell = { value: CellValue; error?: never } | { value?: never; error: string };

function comparable(field: FormField | undefined, value: CellValue | undefined): CellValue {
  if (value === undefined || value === null || value === '') return null;
  if (field?.type === 'number') {
    const number = Number(value);
    return Number.isFinite(number) ? number : String(value);
  }
  return String(value);
}

export function cellValuesEqual(field: FormField | undefined, a: CellValue | undefined, b: CellValue | undefined): boolean {
  return comparable(field, a) === comparable(field, b);
}

export function sheetDataEqual(schema: FormField[], a: FormData, b: FormData): boolean {
  const fields = new Map(schema.map((field) => [field.id, field]));
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((id) =>
    cellValuesEqual(fields.get(id), a[id], b[id]));
}

export function displaySheetCell(value: CellValue | undefined): string {
  return value === undefined || value === null ? '' : String(value);
}

export function parseSheetCell(field: FormField, draft: string): ParsedCell {
  const text = draft.trim();
  if (!text) return field.required ? { error: `${field.title}为必填项` } : { value: null };
  if (field.type === 'number') {
    const number = Number(text);
    if (!Number.isFinite(number)) return { error: `${field.title}请输入有效数字` };
    if ((field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max)) {
      return { error: `${field.title}超出允许范围` };
    }
    return { value: number };
  }
  if (field.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00.000Z`)) ||
      new Date(`${text}T00:00:00.000Z`).toISOString().slice(0, 10) !== text) {
      return { error: `${field.title}无效` };
    }
  }
  if (field.type === 'select' && !field.options?.some((option) => option.value === text)) {
    return { error: `${field.title}选项无效` };
  }
  if (text.length > 1000) return { error: `${field.title}内容过长` };
  return { value: text };
}
