import { describe, expect, it } from 'vitest';
import { workshopWeekChartSeries, workshopWeekSeries } from './workshopWeek';

describe('workshop weekly view', () => {
  it('keeps all seven days across a month and does not count missing records as zero', () => {
    const week = workshopWeekSeries(
      ['2026-09-30', '2026-10-01', '2026-10-03', '2026-10-04'],
      [12.125, 13.5, 0, 9],
      '2026-09-28',
    );
    expect(week.map((day) => day.label)).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01',
      '2026-10-02', '2026-10-03', '2026-10-04',
    ]);
    expect(week.map((day) => day.value)).toEqual([null, null, 12.125, 13.5, null, 0, 9]);
    expect(week.reduce((sum, day) => sum + (day.value ?? 0), 0)).toBe(34.625);
  });

  it('adds adjacent month dates to the chart without duplicating dates', () => {
    const week = workshopWeekSeries(['2026-09-30', '2026-10-01'], [1, 2], '2026-09-28');
    const chart = workshopWeekChartSeries([{ label: '2026-09-30', value: 1 }], week);
    expect(chart).toHaveLength(7);
    expect(chart[3]).toEqual({ label: '2026-10-01', value: 2 });
  });
});
