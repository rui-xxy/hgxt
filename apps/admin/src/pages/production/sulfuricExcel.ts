import type { Worksheet } from 'exceljs';
import type { SulfuricDaySummary } from '@hgxt/shared';
import { workshopExcelPalette as color } from '../../theme/tokens';
import { buildSulfuricExportSheets, type ExportColumn, type ExportSheet, type SulfuricExportPeriod, type SulfuricExportSection } from './sulfuricExportData';

const numericFormat = '#,##0.###;[Red](#,##0.###);0';
const percentFormat = '0.###"%"';
const durationFormat = '[h]:mm';

function toneOf(tone: ExportColumn['tone']) {
  if (tone === 'brand') return { strong: color.brand, soft: color.brandSoft };
  if (tone === 'fuming') return { strong: color.fuming, soft: color.fumingSoft };
  if (tone === 'reagent') return { strong: color.reagent, soft: color.reagentSoft };
  if (tone === 'acid93') return { strong: color.acid93, soft: color.acid93Soft };
  return { strong: color.muted, soft: color.graySoft };
}

function writeSheet(sheet: Worksheet, spec: ExportSheet, periodLabel: string) {
  const count = spec.columns.length;
  sheet.properties.defaultRowHeight = 24;
  sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 6 }];
  sheet.getColumn(1).width = spec.columns[0]?.width ?? 17;
  for (let i = 2; i <= count; i++) sheet.getColumn(i).width = spec.columns[i - 1].width ?? Math.max(14, Math.min(24, spec.columns[i - 1].label.length * 1.65 + 4));

  sheet.mergeCells(1, 1, 1, count);
  const title = sheet.getCell(1, 1);
  title.value = `硫酸车间 · ${spec.name}`;
  title.font = { name: 'Microsoft YaHei', size: 18, bold: true, color: { argb: color.white } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color.ink } };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 40;

  sheet.mergeCells(2, 1, 2, count);
  const period = sheet.getCell(2, 1);
  period.value = `统计范围：${periodLabel}`;
  period.font = { name: 'Microsoft YaHei', size: 11, bold: true, color: { argb: color.ink } };
  period.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color.side } };
  period.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).height = 28;

  sheet.mergeCells(3, 1, 3, count);
  const basis = sheet.getCell(3, 1);
  basis.value = spec.basis;
  basis.font = { name: 'Microsoft YaHei', size: 10, color: { argb: color.muted } };
  basis.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  sheet.getRow(3).height = 29;
  sheet.getRow(4).height = 12;

  let groupStart = 1;
  while (groupStart <= count) {
    const current = spec.columns[groupStart - 1];
    let groupEnd = groupStart;
    while (groupEnd < count && spec.columns[groupEnd].group === current.group) groupEnd++;
    if (groupEnd > groupStart) sheet.mergeCells(5, groupStart, 5, groupEnd);
    const cell = sheet.getCell(5, groupStart);
    cell.value = current.group;
    cell.font = { name: 'Microsoft YaHei', size: 11, bold: true, color: { argb: toneOf(current.tone).strong } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toneOf(current.tone).soft } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { top: { style: 'medium', color: { argb: toneOf(current.tone).strong } } };
    groupStart = groupEnd + 1;
  }
  sheet.getRow(5).height = 30;
  spec.columns.forEach((column, index) => {
    const cell = sheet.getCell(6, index + 1);
    cell.value = column.label;
    cell.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: color.ink } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toneOf(column.tone).soft } };
    cell.alignment = { vertical: 'middle', horizontal: index ? 'center' : 'left', wrapText: true, indent: index ? 0 : 1 };
    cell.border = { bottom: { style: 'thin', color: { argb: color.line } } };
  });
  sheet.getRow(6).height = 36;
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: count } };

  spec.rows.forEach((entry, rowIndex) => {
    const rowNumber = rowIndex + 7;
    const row = sheet.getRow(rowNumber);
    row.height = entry.kind === 'month' ? 29 : entry.kind === 'empty' ? 34 : 25;
    if (entry.kind === 'month' || entry.kind === 'empty') {
      sheet.mergeCells(rowNumber, 1, rowNumber, count);
      const cell = row.getCell(1);
      cell.value = entry.cells[0];
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: entry.kind === 'month' ? color.side : color.white } };
      cell.font = { name: 'Microsoft YaHei', size: 11, bold: entry.kind === 'month', color: { argb: entry.kind === 'month' ? color.ink : color.muted } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      return;
    }
    entry.cells.forEach((value, index) => {
      const column = spec.columns[index];
      const cell = row.getCell(index + 1);
      cell.value = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && (column.format === 'date' || column.format === 'datetime')
        ? new Date(`${value.replace(' ', 'T')}${column.format === 'date' ? 'T00:00:00Z' : 'Z'}`)
        : value;
      const tone = toneOf(column.tone);
      const highlight = entry.kind === 'total' || entry.kind === 'average';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: highlight ? tone.soft : rowIndex % 2 ? color.white : color.graySoft } };
      cell.font = { name: 'Microsoft YaHei', size: 10, bold: highlight, color: { argb: color.ink } };
      cell.alignment = { vertical: 'middle', horizontal: index === 0 || column.format === 'text' || column.format === 'datetime' ? 'left' : 'right', indent: index === 0 ? 1 : 0, wrapText: column.format === 'text' && index > 0 };
      cell.border = { bottom: { style: 'hair', color: { argb: color.line } } };
      if (column.format === 'number') cell.numFmt = numericFormat;
      else if (column.format === 'percent') cell.numFmt = percentFormat;
      else if (column.format === 'duration') cell.numFmt = durationFormat;
      else if (column.format === 'date') cell.numFmt = 'yyyy-mm-dd';
      else if (column.format === 'datetime') cell.numFmt = 'yyyy-mm-dd hh:mm';
    });
  });
  sheet.getColumn(1).alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.headerFooter.oddFooter = 'HGXT 车间明细  ·  第 &P 页 / 共 &N 页';
}

export async function createSulfuricExcel(days: SulfuricDaySummary[], period: SulfuricExportPeriod, sections: SulfuricExportSection[]) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HGXT';
  workbook.created = new Date();
  const label = period.type === 'month' ? `${period.value.slice(0, 4)} 年 ${Number(period.value.slice(5))} 月`
    : period.type === 'year' ? `${period.value} 年` : '全部已录入数据';
  for (const spec of buildSulfuricExportSheets(days, period, sections)) {
    const sheet = workbook.addWorksheet(spec.name);
    sheet.properties.tabColor = { argb: toneOf(spec.columns[1]?.tone ?? 'brand').strong };
    writeSheet(sheet, spec, label);
  }
  return workbook.xlsx.writeBuffer();
}

export async function downloadSulfuricExcel(days: SulfuricDaySummary[], period: SulfuricExportPeriod, sections: SulfuricExportSection[]) {
  const buffer = await createSulfuricExcel(days, period, sections);
  const blob = new Blob([new Uint8Array(buffer as unknown as ArrayBuffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `硫酸车间明细_${period.type === 'all' ? '全部' : period.value}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
