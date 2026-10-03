/** 生产计划的纯函数工具（前后端共用） */

export const daysInYear = (year: number): number =>
  ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365);

/** 读取上限；兼容旧库中的“≤ 95”和“85 – 95”。 */
export function parsePlanUpperLimit(target: string | null | undefined): number | null {
  const value = target?.trim() ?? '';
  if (!value) return null;
  const range = value.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|—|~|～)\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return min <= max && max > 0 ? max : null;
  }
  const upper = value.match(/^(?:≤|<=)?\s*(\d+(?:\.\d+)?)$/);
  return upper && Number(upper[1]) > 0 ? Number(upper[1]) : null;
}
