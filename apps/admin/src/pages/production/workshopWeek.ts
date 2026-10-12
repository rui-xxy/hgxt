import type { BarDatum } from './dash-ui';
import { shiftDay } from './executiveBriefData';

/** 周一至周日逐日取原始产量；缺报日保持空值，不把它当作零。 */
export function workshopWeekSeries(dates: string[], values: Array<number | null>, monday: string): BarDatum[] {
  const byDate = new Map(dates.map((date, index) => [date, values[index] ?? null]));
  return Array.from({ length: 7 }, (_, index) => {
    const label = shiftDay(monday, index);
    return { label, value: byDate.get(label) ?? null };
  });
}

/** 周跨月时把相邻月份的日期补到月图中，以便完整高亮七天。 */
export function workshopWeekChartSeries(monthSeries: BarDatum[], weekSeries: BarDatum[]): BarDatum[] {
  const byDate = new Map([...monthSeries, ...weekSeries].map((day) => [day.label, day]));
  return [...byDate.values()].sort((a, b) => a.label.localeCompare(b.label));
}
