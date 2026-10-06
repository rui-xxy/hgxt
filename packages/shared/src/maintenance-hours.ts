/** 单条维修记录的工作时长。跨过 12:00–13:00 时扣除实际重叠的分钟。 */
export function calculateMaintenanceHours(workTimeText: string): number | null {
  const ranges = [...workTimeText.matchAll(/(\d{1,2})[:：](\d{2})\s*[-–—－~～至到]\s*(\d{1,2})[:：](\d{2})/g)];
  if (ranges.length === 0) return null;

  let minutes = 0;
  for (const [, startHourText, startMinuteText, endHourText, endMinuteText] of ranges) {
    const startHour = Number(startHourText);
    const startMinute = Number(startMinuteText);
    const endHour = Number(endHourText);
    const endMinute = Number(endMinuteText);
    if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return null;

    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    const adjustedEnd = end >= start ? end : end + 1440;
    const elapsed = adjustedEnd - start;
    const lunchOverlap = [0, 1440].reduce((total, dayStart) =>
      total + Math.max(0, Math.min(adjustedEnd, dayStart + 13 * 60) - Math.max(start, dayStart + 12 * 60)), 0);
    minutes += elapsed - lunchOverlap;
  }

  return Math.round((minutes / 60) * 100) / 100;
}
