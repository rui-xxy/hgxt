import { describe, expect, it } from 'vitest';
import source from '../prisma/data/anthraquinone-2025-12-31_2026-10-07.json';
import { buildAnthraquinoneRows } from '../prisma/import-anthraquinone';

describe('蒽醌 Excel 日期与字段导入', () => {
  it('按 Excel 所标日期录入，精品只保存汇总值', () => {
    const rows = buildAnthraquinoneRows(source);
    expect(rows).toHaveLength(281);
    expect(rows.find((row) => row.field_date === '2026-09-01')).toMatchObject({
      field_date: '2026-09-01',
      field_fine_output: 1.25,
      field_fine_stock: 8.48,
      field_fuming_sulfuric_flow: 1216.6,
      field_gas_meter: 19864.66,
    });
    expect(rows.find((row) => row.field_date === '2026-09-30')).toMatchObject({
      field_date: '2026-09-30',
      field_fine_output: 3.4,
      field_fine_stock: 35.225,
      field_dilute_stock: 7.92,
      field_fuming_sulfuric_flow: 1505.4,
      field_empty_drum_stock: 17,
    });
    expect(rows.find((row) => row.field_date === '2026-10-01')).toMatchObject({
      field_date: '2026-10-01',
      field_crude_output: 1,
      field_fine_output: 2.65,
      field_fine_stock: 37.935,
      field_dilute_output: 77.4,
      field_fuming_sulfuric_flow: 1522.2,
      field_empty_drum_stock: 16,
    });
    expect(rows.find((row) => row.field_date === '2026-10-07')).toMatchObject({
      field_date: '2026-10-07',
      field_crude_output: 1,
      field_fine_output: 3.3,
      field_dilute_output: 54.96,
      field_dilute_stock: 28.056,
      field_defoamer_stock: 19,
    });
  });

  it('源单元格空白保持空值，不拿相邻日期的读数补齐', () => {
    const rows = buildAnthraquinoneRows(source);
    expect(rows.find((row) => row.field_date === '2026-09-19')).toMatchObject({
      field_date: '2026-09-19',
      field_fuming_sulfuric_flow: null,
      field_water_meter: null,
      field_electricity_meter: null,
    });
    expect(rows.find((row) => row.field_date === '2026-01-01')?.field_defoamer_stock).toBeNull();
    expect(rows.find((row) => row.field_date === '2026-05-21')?.field_water_meter).toBeNull();
  });
});
