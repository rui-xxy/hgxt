import { describe, expect, it } from 'vitest';
import type { PlanConsumptionRow } from '@hgxt/shared';
import { consumptionTargetComparison, monthPlanTone, yearPlanTone } from './planAppearance';

const row = (changes: Partial<PlanConsumptionRow>): PlanConsumptionRow => ({
  workshop: '硫酸', material: '电', usageUnit: 'kWh', unit: 'kWh/t', monthUsage: 0,
  current: 89.6, lastMonth: 90.8, target: '≤ 92', targetMax: 92,
  deviationPct: 0, ...changes,
});

describe('计划与单耗状态配色', () => {
  it('区分月计划达成、接近和明显未达成', () => {
    expect([null, 85, 98, 99.6, 99.7, 100].map(monthPlanTone)).toEqual(['none', 'risk', 'near', 'almost', 'almost', 'met']);
  });

  it('按时间进度容差标记年度状态', () => {
    expect([null, -7.9, -3.5, -1.4, 2.1].map(yearPlanTone)).toEqual(['none', 'risk', 'near', 'met', 'met']);
  });

  it('单耗低于上限为改善，高于上限为超标', () => {
    expect(consumptionTargetComparison(row({}))).toEqual({ delta: -2.6, favorable: true });
    expect(consumptionTargetComparison(row({ current: 94, deviationPct: 2.2 }))).toEqual({ delta: 2.2, favorable: false });
    expect(consumptionTargetComparison(row({ current: 92 }))).toEqual({ delta: 0, favorable: true });
  });
});
