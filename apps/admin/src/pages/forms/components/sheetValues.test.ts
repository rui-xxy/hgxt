import { describe, expect, it } from 'vitest';
import type { FormField } from '@hgxt/shared';
import { cellValuesEqual, displaySheetCell, parseSheetCell, sheetDataEqual } from './sheetValues';

const date: FormField = { id: 'field_date', title: '日期', type: 'date', required: true };
const amount: FormField = { id: 'amount', title: '读数', type: 'number', precision: 1, min: 0, max: 100 };

describe('表格单元格的改动判定', () => {
  it('空白格读取和方向键移动不产生修改', () => {
    expect(cellValuesEqual(amount, undefined, null)).toBe(true);
    expect(sheetDataEqual([date, amount], { field_date: '2026-09-26' }, { field_date: '2026-09-26', amount: null })).toBe(true);
  });

  it('输入数值不会被字段精度四舍五入，也不会在显示时补零', () => {
    expect(cellValuesEqual(amount, 77.7, '77.70')).toBe(true);
    expect(sheetDataEqual([date, amount], { amount: 77.8 }, { amount: 77.7 })).toBe(false);
    expect(parseSheetCell(amount, '77.74')).toEqual({ value: 77.74 });
    expect(displaySheetCell(77.74)).toBe('77.74');
    expect(displaySheetCell(86)).toBe('86');
    expect(parseSheetCell(amount, '101')).toEqual({ error: '读数超出允许范围' });
  });

  it('日期在提交前按真实日历校验', () => {
    expect(parseSheetCell(date, '2026-09-26')).toEqual({ value: '2026-09-26' });
    expect(parseSheetCell(date, '2026-02-30')).toEqual({ error: '日期无效' });
  });
});
