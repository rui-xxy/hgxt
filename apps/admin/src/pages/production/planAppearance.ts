import type { PlanConsumptionRow } from '@hgxt/shared';

export type PlanTone = 'met' | 'almost' | 'near' | 'risk' | 'none';

export function monthPlanTone(rate: number | null): PlanTone {
  if (rate === null) return 'none';
  if (rate >= 100) return 'met';
  if (rate >= 99) return 'almost';
  return rate >= 90 ? 'near' : 'risk';
}

export function yearPlanTone(pointsAhead: number | null): PlanTone {
  if (pointsAhead === null) return 'none';
  if (pointsAhead >= -2) return 'met';
  return pointsAhead >= -5 ? 'near' : 'risk';
}

export function consumptionTargetComparison(row: PlanConsumptionRow): {
  delta: number | null;
  favorable: boolean;
} {
  if (row.current === null || row.targetMax === null || row.targetMax <= 0) {
    return { delta: null, favorable: false };
  }
  const delta = +(((row.current / row.targetMax) - 1) * 100).toFixed(1);
  return { delta, favorable: delta <= 0 };
}
