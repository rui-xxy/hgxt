import { describe, expect, it } from 'vitest';
import type { PlanCompletionRow, WorkshopOverviewResult } from '@hgxt/shared';
import { briefProductionRows, briefWeeklyRows, calendarProgress, latestProductionDate, monthProductionAsOf, reportWeek, shiftMonth, weekStart } from './executiveBriefData';

const overview: WorkshopOverviewResult = {
  dates: ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'],
  workshops: [{ code: 'sulfuric', name: '硫酸', unit: 't', values: [10, 2, null, 3, null] }],
};
const plan = (october: number | null): PlanCompletionRow => ({
  workshop: '硫酸', basis: '折 98% 硫酸', monthPlan: october, monthActual: 5, monthRate: null,
  yearPlan: 1000, yearActual: 15, yearRate: null, expectedByProgress: null,
  aheadOfProgress: null, status: null, statusPoints: null,
  months: Array.from({ length: 12 }, (_, index) => ({
    month: index + 1, plan: index === 8 ? 300 : index === 9 ? october : null,
    actual: null, met: null,
  })),
});

describe('经营简报期间口径', () => {
  it('月进度按今天除以当月天数，历史期为完整进度，周进度按本周日历天数', () => {
    expect(calendarProgress('month', '2026-10', null, '2026-10-08')).toBeCloseTo(8 / 31 * 100);
    expect(calendarProgress('month', '2026-09', null, '2026-10-08')).toBe(100);
    expect(calendarProgress('month', '2026-11', null, '2026-10-08')).toBe(0);
    expect(calendarProgress('week', '2026-10', '2026-10-05', '2026-10-08')).toBeCloseTo(4 / 7 * 100);
  });
  it('周次按全年第一个完整周起算，跨年不会重号', () => {
    expect(reportWeek('2026-09-26')).toEqual({ year: 2026, week: 38 });
    expect(reportWeek('2026-10-08')).toEqual({ year: 2026, week: 40 });
    expect(reportWeek('2026-01-01')).toEqual({ year: 2025, week: 52 });
    expect(reportWeek('2026-01-05')).toEqual({ year: 2026, week: 1 });
  });
  it('月度以有产量的归属日截止，空日不稀释日均，计划差额按日折算', () => {
    const asOf = monthProductionAsOf(overview, '2026-10');
    expect(asOf).toBe('2026-10-03');
    expect(latestProductionDate(overview)).toBe(asOf);
    const [row] = briefProductionRows(overview, [plan(310)], '2026-10', asOf, '2026-10-08');
    expect(row.actual).toBe(5);
    expect(row.daily).toBe(2.5);
    expect(row.previousDaily).toBe(10);
    expect(row.weeklyDaily).toEqual([null, null, null, 5]);
    expect(row.gap).toBe(-75);
  });

  it('跨月周按各自月计划逐日折算，未设计划不伪造达成率', () => {
    const start = weekStart('2026-10-03');
    expect(start).toBe('2026-09-28');
    const [row] = briefWeeklyRows(overview, [plan(310)], start, '2026-10-03', 2026, '2026-10-08');
    expect(row.plan).toBe(70);
    expect(row.actual).toBe(15);
    expect(row.gap).toBe(-55);
    expect(briefProductionRows(overview, [plan(null)], '2026-10', '2026-10-03', '2026-10-08')[0].rate).toBeNull();
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});
