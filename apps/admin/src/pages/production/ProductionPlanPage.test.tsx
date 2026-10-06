import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ProductionPlanBoardResult } from '@hgxt/shared';
import { planBoard } from '../../api/production';
import { ProductionPlanPage } from './ProductionPlanPage';

vi.mock('../../api/production', () => ({ planBoard: vi.fn() }));

const board: ProductionPlanBoardResult = {
  year: 2026, asOf: '2026-09-29', timeProgress: null,
  completion: [{
    workshop: '硫酸', basis: '产量', monthPlan: 200, monthActual: 150, monthRate: 75,
    yearPlan: 1000, yearActual: 450, yearRate: 45, expectedByProgress: 300,
    aheadOfProgress: 150, status: 'ahead', statusPoints: 15,
    months: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      plan: index === 7 ? 100 : index === 8 ? 200 : null,
      actual: index === 7 ? 80 : index === 8 ? 150 : null,
      met: index === 7 || index === 8 ? false : null,
    })),
  }],
  week: [], sales: [], energyConsumption: [], materialConsumption: [], tasks: [],
};

describe('计划完成月度切换', () => {
  it('切换月份后更新月计划、完成和完成率，年度列保持不变', async () => {
    vi.mocked(planBoard).mockResolvedValue(board);
    const { container } = render(<QueryClientProvider client={new QueryClient()}><App><MemoryRouter><ProductionPlanPage /></MemoryRouter></App></QueryClientProvider>);

    await waitFor(() => expect(container.querySelector('.plan-completion-card .prow:not(.phead)')).not.toBeNull());
    const row = () => container.querySelector('.plan-completion-card .prow:not(.phead)')!;
    expect(row().textContent).toContain('200.00');
    expect(row().textContent).toContain('150.00');
    expect(row().textContent).toContain('75.0%');
    expect(container.querySelector('.plan-completion-card .phead')?.textContent).toContain('距年计划');
    expect(row().textContent).toContain('还差 550.00');
    expect(row().textContent).not.toContain('超前');

    fireEvent.click(screen.getByRole('button', { name: '计划完成上一个月' }));
    expect(row().textContent).toContain('100.00');
    expect(row().textContent).toContain('80.00');
    expect(row().textContent).toContain('80.0%');
    expect(row().textContent).toContain('1,000.00');
    expect(row().textContent).toContain('450.00');
    expect(row().textContent).toContain('还差 550.00');
    expect(screen.getByText('2026 年 8 月')).toBeTruthy();
  });
});
