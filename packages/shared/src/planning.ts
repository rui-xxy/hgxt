/** 生产计划的纯函数工具（前后端共用） */

export const daysInYear = (year: number): number =>
  ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365);

export const daysInMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();

/**
 * 年度计划按各月天数占比拆分（largest-remainder）。
 * 业务口径要求年度计划为整数吨；先取整后按小数余量分配，保证 12 个月合计严格等于年度值。
 */
export function splitAnnual(annual: number, year: number): number[] {
  const total = Math.round(annual);
  if (total <= 0) return Array.from({ length: 12 }, () => 0);
  const days = Array.from({ length: 12 }, (_, i) => daysInMonth(year, i + 1));
  const sumDays = days.reduce((s, d) => s + d, 0);
  const exact = days.map((d) => (total * d) / sumDays);
  const result = exact.map((v) => Math.floor(v));
  let remainder = total - result.reduce((s, v) => s + v, 0);
  const byFraction = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let cursor = 0;
  while (remainder > 0) {
    result[byFraction[cursor % 12].i] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return result;
}


export interface PlanTargetRange {
  min: number | null;
  max: number | null;
}

/** 解析单耗目标：支持单值/上限（95、≤ 0.66、<= 0.66）和区间（85 – 95、85-95、85～95）。 */
export function parsePlanTarget(target: string | null | undefined): PlanTargetRange {
  const value = target?.trim() ?? '';
  if (!value) return { min: null, max: null };
  const range = value.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|—|~|～)\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return min <= max ? { min, max } : { min: null, max: null };
  }
  const upper = value.match(/^(?:≤|<=)?\s*(\d+(?:\.\d+)?)$/);
  return upper ? { min: null, max: Number(upper[1]) } : { min: null, max: null };
}

/** 区间外偏离百分比：区间内=0；低于下限为负；高于上限为正。 */
export function planTargetDeviation(current: number | null, range: PlanTargetRange): number | null {
  if (current === null) return null;
  if (range.max !== null && current > range.max) return +(((current / range.max) - 1) * 100).toFixed(1);
  if (range.min !== null && current < range.min) return -+(((range.min - current) / range.min) * 100).toFixed(1);
  if (range.max === null && range.min === null) return null;
  return 0;
}
