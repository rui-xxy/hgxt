import dayjs from 'dayjs';
import type { SulfuricDaySummary, SulfuricParkingRecord } from '@hgxt/shared';

function normalized(value: string) {
  return value.replace(' ', 'T');
}

export function parkingDurationMinutes(record: SulfuricParkingRecord): number | null {
  const start = dayjs(normalized(record.start));
  const end = dayjs(normalized(record.end));
  if (!start.isValid() || !end.isValid()) return null;
  const minutes = end.diff(start, 'minute');
  return minutes >= 0 ? minutes : null;
}

function durationText(minutes: number | null): string {
  if (minutes === null) return '—';
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}

function timestampText(value: string): string {
  return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value) ? value.slice(0, 16).replace('T', ' ') : '—';
}

export function SulfuricParkingTable({ days, month }: { days: SulfuricDaySummary[]; month: string }) {
  const records = days.flatMap((day) => day.parkingRecords ?? [])
    .filter((record) => record.start.slice(0, 7) === month)
    .sort((a, b) => b.start.localeCompare(a.start));
  const durations = records.map(parkingDurationMinutes);
  const totalMinutes = durations.reduce<number>((sum, minutes) => sum + (minutes ?? 0), 0);
  const completedCount = durations.filter((minutes) => minutes !== null).length;
  return <div className="scrolltbl">
    <table className="dt workshop-detail-table sulfuric-parking-table">
      <thead><tr><th>停车日期</th><th>开始时间</th><th>结束时间</th><th>停车时长</th><th>停车原因</th></tr></thead>
      <tbody>
        <tr className="sum"><td>合计</td><td>{records.length} 次</td><td>—</td><td>{durationText(completedCount || !records.length ? totalMinutes : null)}</td><td className="sulfuric-parking-reason">{completedCount < records.length ? `已计算 ${completedCount} / ${records.length} 次` : '—'}</td></tr>
        {records.length ? records.map((record, index) => <tr key={`${record.start}-${record.end}-${index}`}>
          <td>{record.start.slice(5, 10) || '—'}</td>
          <td>{timestampText(record.start)}</td>
          <td>{timestampText(record.end)}</td>
          <td>{durationText(durations[index])}</td>
          <td className="sulfuric-parking-reason">{record.reason || '—'}</td>
        </tr>) : <tr><td colSpan={5} className="muted">本月暂无停车记录</td></tr>}
      </tbody>
    </table>
  </div>;
}
