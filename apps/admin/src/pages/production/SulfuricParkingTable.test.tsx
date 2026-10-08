import { describe, expect, it } from 'vitest';
import { parkingDurationMinutes } from './SulfuricParkingTable';

describe('硫酸停车时长', () => {
  it('按实际起止日期计算跨日停车时间', () => {
    expect(parkingDurationMinutes({
      start: '2026-10-01 23:10', end: '2026-10-02 01:20', reason: '检修',
    })).toBe(130);
  });

  it('缺少结束时间或结束早于开始时不计入合计', () => {
    expect(parkingDurationMinutes({ start: '2026-10-01T08:00', end: '', reason: '' })).toBeNull();
    expect(parkingDurationMinutes({ start: '2026-10-01T08:00', end: '2026-10-01T07:00', reason: '' })).toBeNull();
  });
});
