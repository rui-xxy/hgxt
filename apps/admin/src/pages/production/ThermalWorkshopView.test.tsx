import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ThermalSummaryResult } from '@hgxt/shared';
import { ThermalPanel, ThermalTable } from './ThermalWorkshopView';

const reading = (value: number) => ({ previousReading: 0, currentReading: value, delta: value, value });

const data: ThermalSummaryResult = {
  outlets: [
    { key: 'jianheng', name: '建衡', group: 'external' },
    { key: 'amino', name: '氨基磺酸', group: 'internal' },
  ],
  days: [{
    date: '2026-10-10', sulfuricStopped: true,
    outlets: { jianheng: reading(10), amino: reading(10) },
    deliveredExternalTotal: 10, externalTotal: 0, internalTotal: 0, totalSupply: 0,
    jiantaoSupply: 20, selfSupply: 0,
    generation: reading(0), water: reading(0), steamMeter: reading(0),
  }],
};

describe('热电停车日的来源展示', () => {
  it('建滔量单列，内部热电供汽与明细不显示原始表差', () => {
    const { container } = render(<ThermalPanel data={data} days={data.days} />);
    expect(screen.getByText('建滔供气').closest('.amino-panel-row')?.textContent).toContain('20 t');
    fireEvent.click(screen.getByRole('button', { name: '内供' }));
    expect(screen.getByText('氨基磺酸').closest('.amino-panel-row')?.textContent).toContain('0 t');
    expect(container.textContent).not.toContain('10 t');
  });

  it('表格的停车日只把实际送达量记在建滔来源', () => {
    const { container } = render(<ThermalTable data={data} tab="prod"
      entries={[{ kind: 'day', date: '2026-10-10', index: 0 }]} activeDate="2026-10-10" onSelect={() => {}} />);
    const cells = [...container.querySelectorAll('tbody td')].map((cell) => cell.textContent);
    expect(cells).toEqual(['10-10', '0', '是', '0', '20', '0', '0', '0', '0']);
  });
});
