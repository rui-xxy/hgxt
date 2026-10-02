import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlanTask } from '@hgxt/shared';
import { PlanTasksTable } from './PlanTasksTable';

const tasks: PlanTask[] = Array.from({ length: 45 }, (_, index) => ({
  period: '本周', status: 'done', matter: `测试事项 ${index + 1}`,
  department: '水滑石生产部', owner: '汪金虎', importance: '日常',
  dueDate: '2026-09-30', progress: '已完成', completionNote: '',
}));

describe('计划与完成事项分页', () => {
  beforeAll(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }));
  });

  it('本周事项每页只显示 20 条，翻页不离开当前页面', () => {
    const { container } = render(<PlanTasksTable tasks={tasks} />);
    expect(screen.queryByRole('tab', { name: /全部/ })).toBeNull();
    expect(screen.getByText('第 1–20 条 / 共 45 条')).toBeTruthy();
    expect(screen.getByText('测试事项 20')).toBeTruthy();
    expect(screen.queryByText('测试事项 21')).toBeNull();

    const next = container.querySelector<HTMLButtonElement>('.ant-pagination-next button');
    expect(next).not.toBeNull();
    fireEvent.click(next!);
    expect(screen.getByText('第 21–40 条 / 共 45 条')).toBeTruthy();
    expect(screen.getByText('测试事项 21')).toBeTruthy();
    expect(screen.queryByText('测试事项 20')).toBeNull();
  });
});
