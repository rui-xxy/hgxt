import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MonthBars, fmtRecorded } from './dash-ui';

describe('车间上报值显示', () => {
  it('按原值显示有效小数位，最多三位，并清除汇总浮点尾数', () => {
    expect(fmtRecorded(58.95)).toBe('58.95');
    expect(fmtRecorded(0.00775)).toBe('0.008');
    expect(fmtRecorded(1561.35)).toBe('1,561.35');
    expect(fmtRecorded(0.998000000000001)).toBe('0.998');
    expect(fmtRecorded(24135.737999999998)).toBe('24,135.738');
    expect(fmtRecorded(25373.897)).toBe('25,373.897');
    expect(fmtRecorded(16)).toBe('16');
    expect(fmtRecorded(null)).toBe('—');
  });

  it('柱顶和悬浮面板都不会显示汇总浮点尾数', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const { container } = render(createElement(MonthBars, {
      data: [{ label: '2026-02', value: 24135.737999999998 }], unit: 't', selected: '2026-02',
      onSelect: () => {}, sourcePrecision: true,
    }));
    expect(screen.getByText('24,135.738')).toBeTruthy();
    fireEvent.mouseEnter(container.querySelector('.hit')!);
    expect(screen.getAllByText('24,135.738')).toHaveLength(2);
    expect(container.textContent).not.toContain('999999');
    vi.unstubAllGlobals();
  });
});
