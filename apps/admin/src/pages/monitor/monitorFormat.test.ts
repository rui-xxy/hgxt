import { describe, expect, it } from 'vitest';
import { pageKeyOfPath } from '../../api/monitor';
import {
  countLabel,
  deltaLabel,
  dwellLabel,
  durationLabel,
  hoursLabel,
  minuteToClock,
  onlineMinutesLabel,
  timeOf,
} from './monitorFormat';

describe('monitorFormat 展示格式化', () => {
  it('timeOf：上海时区 HH:mm，跨天带日期', () => {
    // 2026-10-09 15:28 上海 = 07:28Z
    expect(timeOf('2026-10-09T07:28:00.000Z', '2026-10-09')).toBe('15:28');
    // 同一时刻相对别的基准日 → 显示日期
    expect(timeOf('2026-10-09T07:28:00.000Z', '2026-10-08')).toBe('10-09 15:28');
    // 上海 00:05 = 前一日 16:05Z；基准日取前一天 → 带日期
    expect(timeOf('2026-10-08T16:05:00.000Z', '2026-10-08')).toBe('10-09 00:05');
    // 基准日就是事件所在的上海日期 → 只显示时间
    expect(timeOf('2026-10-08T16:05:00.000Z', '2026-10-09')).toBe('00:05');
  });

  it('durationLabel：分钟 → 中文时长', () => {
    expect(durationLabel(9)).toBe('9 分钟');
    expect(durationLabel(98)).toBe('1 小时 38 分');
    expect(durationLabel(240)).toBe('4 小时');
  });

  it('dwellLabel：停留秒数格式化', () => {
    expect(dwellLabel(null)).toBe('—');
    expect(dwellLabel(20)).toBe('<1 分钟');
    expect(dwellLabel(402)).toBe('7 分钟');
    expect(dwellLabel(4020)).toBe('1:07');
  });

  it('deltaLabel：环比百分比', () => {
    expect(deltaLabel(null)).toBe('—');
    expect(deltaLabel(0.12)).toBe('+12%');
    expect(deltaLabel(-0.06)).toBe('-6%');
    expect(deltaLabel(0)).toBe('0%');
  });

  it('onlineMinutesLabel / countLabel / hoursLabel', () => {
    expect(onlineMinutesLabel(9)).toBe('9 分钟');
    expect(onlineMinutesLabel(98)).toBe('1 小时 38 分');
    expect(countLabel(1246)).toBe('1,246');
    expect(hoursLabel(null)).toBe('—');
    expect(hoursLabel(1.94)).toBe('1.9');
  });

  it('minuteToClock：一天内分钟数 → HH:mm 并钳位', () => {
    expect(minuteToClock(0)).toBe('00:00');
    expect(minuteToClock(842)).toBe('14:02');
    expect(minuteToClock(1439)).toBe('23:59');
    expect(minuteToClock(1500)).toBe('23:59');
  });
});

describe('pageKeyOfPath 路由 → 埋点页面', () => {
  it('已知路由映射到 PAGE_CATALOG key', () => {
    expect(pageKeyOfPath('/board')).toEqual({ page: 'board' });
    expect(pageKeyOfPath('/brief')).toEqual({ page: 'brief' });
    expect(pageKeyOfPath('/plan/settings')).toEqual({ page: 'plan-settings' });
    expect(pageKeyOfPath('/plan')).toEqual({ page: 'plan' });
    expect(pageKeyOfPath('/maintenance/records')).toEqual({ page: 'maintenance-records' });
    expect(pageKeyOfPath('/maintenance/new')).toEqual({ page: 'maintenance-new' });
    expect(pageKeyOfPath('/maintenance')).toEqual({ page: 'maintenance' });
    expect(pageKeyOfPath('/forms')).toEqual({ page: 'forms' });
    expect(pageKeyOfPath('/forms/abc')).toEqual({ page: 'forms' });
    expect(pageKeyOfPath('/users')).toEqual({ page: 'users' });
    expect(pageKeyOfPath('/monitor')).toEqual({ page: 'monitor' });
    expect(pageKeyOfPath('/monitor/uuid')).toEqual({ page: 'monitor-member' });
  });

  it('登录页等未知路由不记录', () => {
    expect(pageKeyOfPath('/login')).toBeNull();
    expect(pageKeyOfPath('/unknown')).toBeNull();
  });
});
