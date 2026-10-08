import type { PlanCompletionRow, WorkshopOverviewResult } from '@hgxt/shared';

export interface BriefProductionRow {
  workshop: string;
  basis: string;
  previousDaily: number | null;
  weeklyDaily: Array<number | null>;
  daily: number | null;
  plan: number | null;
  actual: number | null;
  rate: number | null;
  gap: number | null;
}

const WORKSHOP_CODES: Record<string, string> = {
  硫酸: 'sulfuric',
  氨基磺酸: 'aminosulfonic',
  硫酸镁: 'magnesium',
  水滑石: 'hydrotalcite',
  二乙基蒽醌: 'anthraquinone',
  丰联: 'fenglian',
};

export const shiftMonth = (month: string, step: number): string => {
  const [year, value] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, value - 1 + step, 1));
  return date.toISOString().slice(0, 7);
};

export const monthDays = (month: string): number => {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
};

export const shiftDay = (day: string, count: number): string => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};

export const weekStart = (day: string): string => {
  const date = new Date(`${day}T00:00:00Z`);
  const back = (date.getUTCDay() + 6) % 7;
  return shiftDay(day, -back);
};

/** 经营简报周次：以当年首个完整周一至周日为第 1 周。 */
export const reportWeek = (day: string): { year: number; week: number } => {
  const monday = weekStart(day);
  const firstMonday = (year: number): string => {
    const januaryFirst = `${year}-01-01`;
    const weekday = new Date(`${januaryFirst}T00:00:00Z`).getUTCDay();
    return shiftDay(januaryFirst, (8 - weekday) % 7);
  };
  let year = Number(monday.slice(0, 4));
  if (monday < firstMonday(year)) year -= 1;
  const days = Math.round((Date.parse(`${monday}T00:00:00Z`) - Date.parse(`${firstMonday(year)}T00:00:00Z`)) / 86400000);
  return { year, week: Math.floor(days / 7) + 1 };
};

export const latestProductionDate = (overview: WorkshopOverviewResult): string | null => {
  for (let i = overview.dates.length - 1; i >= 0; i -= 1) {
    if (overview.workshops.some((workshop) => workshop.code !== 'thermal' && workshop.values[i] !== null)) {
      return overview.dates[i];
    }
  }
  return null;
};

const total = (values: Array<number | null>): number | null => {
  const available = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return available.length ? available.reduce((sum, value) => sum + value, 0) : null;
};

const average = (values: Array<number | null>): number | null => {
  const available = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null;
};

/** 空日不按零产量计入日均；差额按已过去的生产归属日折算月计划。 */
export function briefProductionRows(
  overview: WorkshopOverviewResult,
  completion: PlanCompletionRow[],
  month: string,
  asOf: string | null,
): BriefProductionRow[] {
  const lastDay = asOf?.startsWith(month) ? Number(asOf.slice(-2)) : monthDays(month);
  const previous = shiftMonth(month, -1);
  return completion.map((planned) => {
    const series = overview.workshops.find((item) => item.code === WORKSHOP_CODES[planned.workshop]);
    const currentValues: Array<number | null> = [];
    const previousValues: Array<number | null> = [];
    overview.dates.forEach((date, index) => {
      const value = series?.values[index] ?? null;
      if (date.startsWith(month) && Number(date.slice(-2)) <= lastDay) {
        currentValues.push(value);
      }
      if (date.startsWith(previous)) previousValues.push(value);
    });
    const monthPlan = planned.months[Number(month.slice(5)) - 1]?.plan ?? null;
    const actual = total(currentValues);
    const dated = new Map(overview.dates.map((date, index) => [date, series?.values[index] ?? null]));
    const trendWeek = weekStart(asOf ?? `${month}-${String(lastDay).padStart(2, '0')}`);
    const weeks = Array.from({ length: 4 }, (_, index) => {
      const start = shiftDay(trendWeek, (index - 3) * 7);
      return average(Array.from({ length: 7 }, (_, offset) => {
        const date = shiftDay(start, offset);
        return asOf && date > asOf ? null : dated.get(date) ?? null;
      }));
    });
    const expected = monthPlan !== null ? monthPlan * lastDay / monthDays(month) : null;
    return {
      workshop: planned.workshop,
      basis: planned.basis,
      previousDaily: average(previousValues),
      weeklyDaily: weeks,
      daily: average(currentValues),
      plan: monthPlan,
      actual,
      rate: monthPlan !== null && monthPlan > 0 && actual !== null ? actual / monthPlan * 100 : null,
      gap: expected !== null && actual !== null ? actual - expected : null,
    };
  });
}

export function monthProductionAsOf(overview: WorkshopOverviewResult, month: string): string | null {
  for (let index = overview.dates.length - 1; index >= 0; index -= 1) {
    const date = overview.dates[index];
    if (date.startsWith(month) && overview.workshops.some((workshop) => workshop.code !== 'thermal' && workshop.values[index] !== null)) return date;
  }
  return null;
}

export function weekProductionAsOf(overview: WorkshopOverviewResult, start: string): string | null {
  const end = shiftDay(start, 6);
  for (let index = overview.dates.length - 1; index >= 0; index -= 1) {
    const date = overview.dates[index];
    if (date >= start && date <= end && overview.workshops.some((workshop) => workshop.code !== 'thermal' && workshop.values[index] !== null)) return date;
  }
  return null;
}

/** 周计划按所属月份的日计划折算；跨月周逐日相加，缺任一月计划即不显示计划指标。 */
export function briefWeeklyRows(
  overview: WorkshopOverviewResult,
  completion: PlanCompletionRow[],
  start: string,
  asOf: string | null,
  year: number,
): BriefProductionRow[] {
  return completion.map((planned) => {
    const series = overview.workshops.find((item) => item.code === WORKSHOP_CODES[planned.workshop]);
    const dated = new Map(overview.dates.map((date, index) => [date, series?.values[index] ?? null]));
    const current = Array.from({ length: 7 }, (_, offset) => {
      const day = shiftDay(start, offset);
      return asOf && day <= asOf ? dated.get(day) ?? null : null;
    });
    const weekDays = Array.from({ length: 7 }, (_, offset) => shiftDay(start, offset));
    const dailyPlans = weekDays.map((day) => {
      const monthly = planned.months.find((item) => item.month === Number(day.slice(5, 7)))?.plan ?? null;
      return Number(day.slice(0, 4)) === year && monthly !== null
        ? monthly / monthDays(day.slice(0, 7)) : null;
    });
    const plan = dailyPlans.every((value) => value !== null)
      ? dailyPlans.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
    const actual = total(current);
    const expected = asOf && plan !== null
      ? dailyPlans.slice(0, Math.min(7, weekDays.filter((day) => day <= asOf).length))
        .reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
    const previous = Array.from({ length: 7 }, (_, offset) => dated.get(shiftDay(start, offset - 7)) ?? null);
    const weeklyDaily = Array.from({ length: 4 }, (_, index) => {
      const trendStart = shiftDay(start, (index - 3) * 7);
      return average(Array.from({ length: 7 }, (_, offset) => dated.get(shiftDay(trendStart, offset)) ?? null));
    });
    return {
      workshop: planned.workshop,
      basis: planned.basis,
      previousDaily: average(previous),
      weeklyDaily,
      daily: average(current),
      plan,
      actual,
      rate: plan !== null && plan > 0 && actual !== null ? actual / plan * 100 : null,
      gap: expected !== null && actual !== null ? actual - expected : null,
    };
  });
}
