import { describe, expect, it } from 'vitest';
import { averageRecorded, workshopMonthlySeries } from './workshopMonthly';

describe('workshopMonthlySeries', () => {
  it('汇总所选年份并区分零产量和无记录月份', () => {
    const series = workshopMonthlySeries(
      ['2025-12-31', '2026-01-01', '2026-01-02', '2026-02-01', '2026-10-01'],
      [99, 1.25, 2.5, 0, null],
      '2026',
    );

    expect(series).toHaveLength(12);
    expect(series[0]).toEqual({ label: '2026-01', value: 3.75 });
    expect(series[1]).toEqual({ label: '2026-02', value: 0 });
    expect(series[9]).toEqual({ label: '2026-10', value: null });
    expect(series[11]).toEqual({ label: '2026-12', value: null });
  });
});

describe('硫酸产量月平均', () => {
  it('按每项有实录的天数计算，保留零值并跳过缺测', () => {
    expect(averageRecorded([10, null, 0, undefined, 20])).toBe(10);
    expect(averageRecorded([null, undefined])).toBeNull();
  });
});
