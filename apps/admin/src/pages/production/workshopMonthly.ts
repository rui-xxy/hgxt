import type { BarDatum } from './dash-ui';

/** 按所选年份汇总日产量；没有记录的月份保留为空位。 */
export function workshopMonthlySeries(dates: string[], values: Array<number | null>, year: string): BarDatum[] {
  const totals = Array<number>(12).fill(0);
  const hasData = Array<boolean>(12).fill(false);

  dates.forEach((date, index) => {
    if (!date.startsWith(`${year}-`)) return;
    const monthIndex = Number(date.slice(5, 7)) - 1;
    const value = values[index];
    if (monthIndex < 0 || monthIndex >= 12 || value === null || value === undefined) return;
    totals[monthIndex] += value;
    hasData[monthIndex] = true;
  });

  return totals.map((total, index) => ({
    label: `${year}-${String(index + 1).padStart(2, '0')}`,
    value: hasData[index] ? total : null,
  }));
}

/** 月平均按该项目有实录的日期计算，零值计入，空值不计入。 */
export function averageRecorded(values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}
