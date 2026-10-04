import { describe, expect, it } from 'vitest';
import source from '../prisma/data/fenglian-2026-09.json';
import schema from '../prisma/form-schemas/fenglian.json';
import { buildFenglianRows } from '../prisma/import-fenglian';

describe('丰联 Excel 日期与分表导入', () => {
  it('按工作表的行日期合并，保留三车间出库与标准厂房入库的各自原值', () => {
    const rows = buildFenglianRows(source);
    expect(rows).toHaveLength(30);
    expect(Object.keys(rows[0])).toHaveLength(schema.length);
    expect(rows[0]).toMatchObject({
      field_date: '2026-09-01',
      field_201: 9.545,
      field_202: 39.503,
      field_035: 39.503,
      field_204: 10,
      field_205: 1.075,
      field_water_cumulative: 5378,
      field_electricity_cumulative: 1561.35,
    });
    expect(rows.find((row) => row.field_date === '2026-09-11')).toMatchObject({
      field_202: 39.881,
      field_035: 35.881,
    });
  });

  it('只导入 Excel 实有数值，9 月 30 日空产量保持空值，包材不进入表单', () => {
    const last = buildFenglianRows(source).at(-1);
    expect(last).toMatchObject({
      field_date: '2026-09-30',
      field_201: null,
      field_204: null,
      field_206: 89.303,
      field_water_cumulative: null,
    });
    expect(schema.some((field) => field.group.includes('包材'))).toBe(false);
    const sectionOf = (id: string) => schema.find((field) => field.id === id)?.section;
    expect(sectionOf('field_204')).toBe('产成品');
    expect(sectionOf('field_pp8285e_purchase')).toBe('原辅料');
    expect(sectionOf('field_dmpy_purchase')).toBe('原辅料');
    expect(sectionOf('field_nitrogen_purchase')).toBe('水电气');
    expect(sectionOf('field_water_cumulative')).toBe('水电气');
    expect([...new Set(schema.slice(1).map((field) => field.group))]).toEqual(['三车间', '标准厂房']);
    expect([...new Set(schema.filter((field) => field.group === '标准厂房').map((field) => field.section))]).toEqual(['产成品', '原辅料', '水电气']);
  });
});
