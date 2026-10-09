/**
 * 访问监控的展示格式化：时间、时长、环比、会话分钟数 → 中文标签。
 * 纯函数，与 monitorFormat.test.ts 一一对应。
 */

/** ISO 时间 → 上海时区 HH:mm（当天）；跨天显示 MM-DD HH:mm */
export function timeOf(iso: string, baseDateKey?: string): string {
  const shifted = new Date(new Date(iso).getTime() + 8 * 3_600_000);
  const hhmm = `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
  const dateKey = shifted.toISOString().slice(0, 10);
  return baseDateKey && dateKey === baseDateKey ? hhmm : `${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')} ${hhmm}`;
}

/** ISO 时间 → 上海时区 YYYY-MM-DD HH:mm */
export function dateTimeOf(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 8 * 3_600_000);
  return `${shifted.toISOString().slice(0, 10)} ${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
}

/** 分钟数 → 「1 小时 38 分」「9 分钟」「4 小时」 */
export function durationLabel(minutes: number): string {
  if (minutes < 1) return '不到 1 分钟';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} 分钟`;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
}

/** 秒 → 停留时长「6:42」「0:48」；null → — */
export function dwellLabel(seconds: number | null): string {
  if (seconds === null) return '—';
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '<1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** 环比小数（0.12 = +12%）→ 「+12%」「-6%」「0%」；null → — */
export function deltaLabel(value: number | null): string {
  if (value === null) return '—';
  const pct = Math.round(value * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

/** 在线分钟数 → 「9 分钟」「1 小时 38 分」 */
export function onlineMinutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  return durationLabel(minutes);
}

/** 会话分钟数（0 起的一天内位置）→ 「14:02」 */
export function minuteToClock(minute: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.round(minute)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** 人数格式：1234 → 1,234 */
export function countLabel(value: number): string {
  return value.toLocaleString('zh-CN');
}

/** 人均小时 1.94 → 「1.9 h」 */
export function hoursLabel(hours: number | null, digits = 1): string {
  return hours === null ? '—' : `${hours.toFixed(digits)}`;
}
