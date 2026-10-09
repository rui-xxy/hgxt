import type { MaintenanceRecord } from '../api/maintenance';

export type MaintenancePeriod =
  | { kind: 'year'; year: number }
  | { kind: 'month'; year: number; month: number }
  | { kind: 'custom'; start: string; end: string };

export const numberText = (value: number, digits = 0): string =>
  value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const percentText = (part: number, total: number): string =>
  total > 0 ? `${numberText((part / total) * 100, 1)}%` : '—';

export const monthKey = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}`;

export const displayDate = (record: MaintenanceRecord): string =>
  record.date ?? (record.sourceDateText || '—');

export const validHours = (record: MaintenanceRecord): number | null =>
  record.repairHours !== null && Number.isFinite(record.repairHours)
    ? record.repairHours
    : null;

export const hasParts = (record: MaintenanceRecord): boolean => {
  const value = record.replacedParts.trim();
  return value !== '' && value !== '/' && value !== '／' && value !== '无';
};

export const peopleOf = (record: MaintenanceRecord): string[] =>
  [...new Set(record.personnel.split(/[、，,]/).map((person) => person.trim()).filter(Boolean))];

export function inPeriod(record: MaintenanceRecord, period: MaintenancePeriod): boolean {
  if (period.kind === 'year') return record.reportYear === period.year;
  if (period.kind === 'month') return record.reportYear === period.year && record.reportMonth === period.month;
  return record.date !== null && record.date >= period.start && record.date <= period.end;
}

export function recordsCsv(records: MaintenanceRecord[]): void {
  const headers = [
    '日期', '原始日期', '报表年', '报表月', '维修人员', '部门', '区域 / 位置', '车间', '设备名称', '规格型号',
    '工作内容', '工作时间', '更换配件', '故障类型', '故障原因', '维修工时', '返工', '备注',
  ];
  const rows = records.map((record) => [
    record.date ?? '', record.sourceDateText, record.reportYear, record.reportMonth,
    record.personnel, record.department, record.location, record.workshop, record.equipmentName, record.equipmentModel,
    record.workContent, record.workTimeText, record.replacedParts, record.faultType,
    record.faultCause, record.repairHours ?? '', record.isRework ? '是' : '否', record.remarks,
  ]);
  const encode = (value: string | number) => {
    const safeValue = typeof value === 'string' && /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${String(safeValue).replaceAll('"', '""')}"`;
  };
  const csv = [headers, ...rows].map((row) => row.map(encode).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `设备维修记录-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export interface MaintenanceMonthStat {
  year: number;
  month: number;
  count: number;
  hours: number;
  validHourCount: number;
  parts: number;
  people: number;
  departments: number;
  rework: number;
}

export function monthStats(records: MaintenanceRecord[], year: number): MaintenanceMonthStat[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const rows = records.filter((record) => record.reportYear === year && record.reportMonth === month);
    const hours = rows.map(validHours).filter((value): value is number => value !== null);
    return {
      year,
      month,
      count: rows.length,
      hours: hours.reduce((total, value) => total + value, 0),
      validHourCount: hours.length,
      parts: rows.filter(hasParts).length,
      people: new Set(rows.flatMap(peopleOf)).size,
      departments: new Set(rows.map((row) => row.department.trim()).filter(Boolean)).size,
      rework: rows.filter((row) => row.isRework).length,
    };
  });
}

export function uniqueOptions(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function primaryValue(values: string[]): string {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const value = raw.trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))[0]?.[0] ?? '—';
}
