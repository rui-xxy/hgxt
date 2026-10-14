import { describe, expect, it } from 'vitest';
import type { SulfuricDaySummary } from '@hgxt/shared';
import { buildSulfuricExportSheets } from './sulfuricExportData';
import { createSulfuricExcel } from './sulfuricExcel';

function day(date: string, productionDate: string, amount: number, stock: number): SulfuricDaySummary {
  return {
    date, productionDate,
    production: {
      total98Equivalent: amount, acid98: amount, acid93: 0, reagent: 0, fuming: 0,
      flow: { acid98: 0, acid93: 0, reagent: 0, fuming: 0 },
      internalFuming: { aminosulfonic: null, anthraquinone: 0 },
    },
    inventory: { acid98: stock, fuming: 0, reagent: 0 },
    levels: [{ fieldId: 'tank_98', name: '98 酸罐', material: '98酸', levelPercent: stock }],
    electricity: { total: 100, meters: [{ fieldId: 'meter_1', name: '总表', usage: 100 }] },
    peroxide: 0, water: null,
    parkingRecords: date === '2026-10-01' ? [{ start: '2026-10-01 23:00', end: '2026-10-02 01:30', reason: '检修' }] : [],
  } as SulfuricDaySummary;
}

const days = [
  day('2026-10-01', '2026-09-30', 5, 11),
  day('2026-10-02', '2026-10-01', 10, 15),
  day('2026-10-03', '2026-10-02', -2, 20),
];

describe('sulfuric detail Excel export', () => {
  it('uses each section’s date basis, keeps zeros and negatives, and uses latest stock', () => {
    const sheets = buildSulfuricExportSheets(days, { type: 'month', value: '2026-10' }, ['prod', 'levels', 'consumption', 'parking']);
    expect(sheets.map((sheet) => sheet.name)).toEqual(['产量', '液位', '消耗数据', '停车记录']);
    const prod = sheets[0].rows;
    expect(prod.filter((row) => row.kind === 'day').map((row) => row.cells[0])).toEqual(['2026-10-02', '2026-10-01']);
    expect(prod[0].cells[1]).toBe(8);
    expect(prod[0].cells[4]).toBe(20);
    expect(prod[1].cells[1]).toBe(4);
    expect(prod[1].cells[4]).toBeNull();
    expect(prod[0].cells[8]).toBe(0);
    expect(prod[0].cells[7]).toBeNull();
    expect(sheets[1].rows.filter((row) => row.kind === 'day')).toHaveLength(3);
    expect(sheets[2].rows[0].cells.at(-2)).toBe(0);
    expect(sheets[2].rows[0].cells.at(-1)).toBeNull();
    expect(sheets[3].rows[0].cells[3]).toBeCloseTo(150 / 1440);
  });

  it('writes an openable styled workbook with separate sheets and numeric cells', async () => {
    const buffer = await createSulfuricExcel(days, { type: 'year', value: '2026' }, ['prod', 'parking']);
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['产量', '停车记录']);
    const production = workbook.getWorksheet('产量')!;
    expect(production.getCell('A1').value).toBe('硫酸车间 · 产量');
    expect(production.getCell('B7').value).toBe(13);
    expect(production.getCell('B7').numFmt).toContain('#,##0.###');
    expect(production.views[0]).toMatchObject({ state: 'frozen', xSplit: 1, ySplit: 6 });
    expect((workbook.getWorksheet('停车记录')?.getCell('D7').value as Date).toISOString()).toContain('T02:30:00');
  }, 20_000);
});
