export interface ParkingRecord {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  reason: string;
}

export function emptyParking(date: string): ParkingRecord {
  return { startDate: date, startTime: '', endDate: date, endTime: '', reason: '' };
}

function datePart(value: string, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : fallback;
}

function timePart(value: string) {
  return value.match(/(?:T|\b)(\d{2}:\d{2})/)?.[1] ?? '';
}

export function parseParking(value: unknown, date: string): ParkingRecord[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: { start?: string; end?: string; reason?: string }) => ({
      startDate: datePart(item.start ?? '', date),
      startTime: timePart(item.start ?? ''),
      endDate: datePart(item.end ?? '', date),
      endTime: timePart(item.end ?? ''),
      reason: item.reason ?? '',
    }));
  } catch {
    const old = value.match(/(\d{2}:\d{2})~(\d{2}:\d{2})\s*(.*)/);
    return old ? [{ startDate: date, startTime: old[1], endDate: date, endTime: old[2], reason: old[3] }] : [{ ...emptyParking(date), reason: value }];
  }
}

export function serializeParking(records: ParkingRecord[]): string {
  const values = records.map((record) => ({
    start: record.startDate && record.startTime ? `${record.startDate}T${record.startTime}` : '',
    end: record.endDate && record.endTime ? `${record.endDate}T${record.endTime}` : '',
    reason: record.reason.trim(),
  })).filter((record) => record.start || record.end || record.reason);
  return values.length ? JSON.stringify(values) : '';
}
