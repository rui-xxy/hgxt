import { fireEvent, render, screen } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { FormField, FormSubmissionDTO } from '@hgxt/shared';
import { DataSheet } from './DataSheet';

const schema: FormField[] = [
  { id: 'field_date', title: '日期', type: 'date', group: '三车间', required: true },
  { id: 'field_201', title: '湿料产量', type: 'number', group: '三车间', section: '产成品', subgroup: '湿料' },
  { id: 'field_004', title: '85%磷酸购入', type: 'number', group: '三车间', section: '原辅料', subgroup: '85%磷酸' },
  { id: 'field_204', title: '干料打包数', type: 'number', group: '标准厂房', section: '产成品', subgroup: '干料' },
  { id: 'field_205', title: '干料销量', type: 'number', group: '标准厂房', section: '产成品', subgroup: '干料' },
  { id: 'field_035', title: '湿料入库', type: 'number', group: '标准厂房', section: '原辅料', subgroup: '湿料' },
  { id: 'field_pp8285e_purchase', title: 'PP8285E购入', type: 'number', group: '标准厂房', section: '原辅料', subgroup: 'PP8285E' },
  { id: 'field_dmpy_purchase', title: 'DMPY购入', type: 'number', group: '标准厂房', section: '原辅料', subgroup: 'DMPY' },
  { id: 'field_electricity_cumulative', title: '电表累计读数', type: 'number', group: '标准厂房', section: '水电气', subgroup: '用电' },
];

const submission: FormSubmissionDTO = {
  id: 'row-1', formId: 'form-1',
  data: { field_date: '2026-09-01', field_201: 9.545, field_004: 1, field_204: 10, field_205: 1.075, field_035: 39.503, field_pp8285e_purchase: 2, field_dmpy_purchase: 3, field_electricity_cumulative: 1561.35 },
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('丰联表单分表编辑', () => {
  it('单列大标题与字段同名时只显示一次并贯穿两层表头', () => {
    Element.prototype.scrollTo = vi.fn();
    const client = new QueryClient();
    const controlSchema: FormField[] = [
      { id: 'field_date', title: '日期', type: 'date', required: true, hidden: true, group: '生产情况记录' },
      { id: 'field_notes', title: '生产情况记录', type: 'text', group: '生产情况记录', section: '生产情况记录', subgroup: '生产情况记录' },
    ];
    const { container } = render(<QueryClientProvider client={client}><App>
      <DataSheet formId="control-1" formTitle="硫酸中控数据" parkingEnabled={false} schema={controlSchema}
        submissions={[{ ...submission, data: { field_date: '2026-09-01', field_notes: '生产正常' } }]}
        total={1} sectioned scrollPositionRef={{ current: { left: 0, top: 0 } }} />
    </App></QueryClientProvider>);
    const headers = container.querySelectorAll('thead th[title="生产情况记录"]');
    expect(headers).toHaveLength(1);
    expect(headers[0].getAttribute('rowspan')).toBe('2');
    expect(container.querySelectorAll('thead tr:nth-child(2) th')).toHaveLength(0);
  });

  it('同一类别中分散的同名大标题合成一组', () => {
    Element.prototype.scrollTo = vi.fn();
    const client = new QueryClient();
    const groupedSchema: FormField[] = [
      { id: 'field_date', title: '日期', type: 'date', required: true, hidden: true, group: '车间' },
      { id: 'a1', title: '产量', type: 'number', group: '车间', section: '产成品', subgroup: '4500阻燃母粒' },
      { id: 'b1', title: '销量', type: 'number', group: '车间', section: '产成品', subgroup: '3500阻燃母粒' },
      { id: 'a2', title: '退货', type: 'number', group: '车间', section: '产成品', subgroup: '4500阻燃母粒' },
    ];
    const { container } = render(<QueryClientProvider client={client}><App>
      <DataSheet formId="form-1" formTitle="生产报表" parkingEnabled={false} schema={groupedSchema}
        submissions={[]} total={0} sectioned scrollPositionRef={{ current: { left: 0, top: 0 } }} />
    </App></QueryClientProvider>);
    const header = container.querySelector('thead th[title="4500阻燃母粒"]');
    expect(container.querySelectorAll('thead th[title="4500阻燃母粒"]')).toHaveLength(1);
    expect(header?.getAttribute('colspan')).toBe('2');
    expect([...container.querySelectorAll('thead tr:nth-child(2) th')].map((cell) => cell.textContent)).toEqual(['产量', '退货', '销量']);
  });

  it('切换主表后保留未保存的单元格修改', () => {
    Element.prototype.scrollTo = vi.fn();
    const client = new QueryClient();
    const { container } = render(<QueryClientProvider client={client}><App>
      <DataSheet formId="form-1" formTitle="丰联报表" parkingEnabled={false} schema={schema}
        submissions={[submission]} total={1} sectioned scrollPositionRef={{ current: { left: 0, top: 0 } }} />
    </App></QueryClientProvider>);
    const cell = container.querySelector('tbody tr:first-child td[title="9.545"]');
    expect(cell).not.toBeNull();
    fireEvent.pointerDown(cell!);
    const input = screen.getByRole('textbox', { name: '第 1 行 湿料产量' });
    fireEvent.change(input, { target: { value: '9.6' } });
    fireEvent.blur(input);
    expect(screen.getByRole('radiogroup', { name: '丰联报表分区' }).textContent).toBe('三车间标准厂房');
    expect(screen.getByRole('radiogroup', { name: '丰联报表类别' }).textContent).toBe('产成品原辅料');
    fireEvent.click(screen.getByText('标准厂房'));
    expect(screen.getByText('干料打包数')).toBeTruthy();
    expect(container.querySelectorAll('thead tr')).toHaveLength(2);
    expect(screen.getByRole('radiogroup', { name: '丰联报表类别' }).textContent).toBe('产成品原辅料水电气');
    expect(container.querySelector('thead th.forms-sheet-product-tone-0')?.textContent).toBe('干料');
    expect(screen.queryByText('湿料入库')).toBeNull();
    fireEvent.click(screen.getByText('原辅料'));
    expect(screen.getByText('湿料入库')).toBeTruthy();
    expect(screen.getByText('PP8285E购入')).toBeTruthy();
    expect(screen.getByText('DMPY购入')).toBeTruthy();
    expect(screen.queryByText('电表累计读数')).toBeNull();
    fireEvent.click(screen.getByText('水电气'));
    expect(screen.getByText('电表累计读数')).toBeTruthy();
    expect(screen.queryByText('PP8285E购入')).toBeNull();
    expect(screen.queryByText('DMPY购入')).toBeNull();
    fireEvent.click(screen.getByText('三车间'));
    expect(container.querySelector('tbody tr:first-child td[title="9.6"]')).not.toBeNull();
    expect(screen.getByText(/有未保存的更改/)).toBeTruthy();
  });

  it('连续滚动全部记录时只渲染可见行，不显示分页', () => {
    Element.prototype.scrollTo = vi.fn();
    const client = new QueryClient();
    const submissions = Array.from({ length: 120 }, (_, index): FormSubmissionDTO => ({
      ...submission,
      id: `row-${index + 1}`,
      data: { ...submission.data, field_201: index + 1 },
    }));
    const { container } = render(<QueryClientProvider client={client}><App>
      <DataSheet formId="form-1" formTitle="丰联报表" parkingEnabled={false} schema={schema}
        submissions={submissions} total={120} sectioned scrollPositionRef={{ current: { left: 0, top: 0 } }} />
    </App></QueryClientProvider>);
    expect(container.querySelectorAll('tbody tr:not(.forms-sheet-spacer)').length).toBeLessThan(120);
    expect(container.querySelector('.forms-sheet-pagination')).toBeNull();
    const scroll = container.querySelector('.forms-sheet-scroll') as HTMLDivElement;
    scroll.scrollTop = 68 + 90 * 44;
    fireEvent.scroll(scroll);
    const laterCell = container.querySelector('tbody td[title="91"]');
    expect(laterCell).not.toBeNull();
    fireEvent.pointerDown(laterCell!);
    const input = screen.getByRole('textbox', { name: '第 91 行 湿料产量' });
    fireEvent.change(input, { target: { value: '901' } });
    fireEvent.blur(input);
    scroll.scrollTop = 0;
    fireEvent.scroll(scroll);
    scroll.scrollTop = 68 + 90 * 44;
    fireEvent.scroll(scroll);
    expect(container.querySelector('tbody td[title="901"]')).not.toBeNull();
    expect(container.querySelectorAll('tbody tr.forms-sheet-spacer')).toHaveLength(2);
  });
});

describe('普通日报表新增行', () => {
  const dailySchema: FormField[] = [
    { id: 'date', title: '日期', type: 'date', required: true },
    { id: 'output', title: '产量', type: 'number' },
  ];

  it('连续新增未保存行时日期逐日递增', () => {
    Element.prototype.scrollTo = vi.fn();
    const client = new QueryClient();
    const { container } = render(<QueryClientProvider client={client}><App>
      <DataSheet formId="daily-1" formTitle="硫酸车间报表" parkingEnabled={false} schema={dailySchema}
        submissions={[{ ...submission, data: { date: '2026-09-30', output: 1 } }]}
        total={1} scrollPositionRef={{ current: { left: 0, top: 0 } }} />
    </App></QueryClientProvider>);
    const add = screen.getByRole('button', { name: '新增行' });
    fireEvent.click(add);
    fireEvent.click(add);
    fireEvent.click(add);
    expect([...container.querySelectorAll('tbody td[title^="2026-"]')].map((cell) => cell.getAttribute('title')))
      .toEqual(['2026-10-03', '2026-10-02', '2026-10-01', '2026-09-30']);
  });

  it('普通日报表记录较多时只渲染滚动区域内的行', () => {
    Element.prototype.scrollTo = vi.fn();
    const client = new QueryClient();
    const submissions = Array.from({ length: 120 }, (_, index): FormSubmissionDTO => ({
      ...submission,
      id: `daily-${index}`,
      data: { date: '2026-09-30', output: index + 1 },
    }));
    const { container } = render(<QueryClientProvider client={client}><App>
      <DataSheet formId="daily-1" formTitle="硫酸车间报表" parkingEnabled={false} schema={dailySchema}
        submissions={submissions} total={120} scrollPositionRef={{ current: { left: 0, top: 0 } }} />
    </App></QueryClientProvider>);
    expect(container.querySelectorAll('tbody tr:not(.forms-sheet-spacer)').length).toBeLessThan(120);
    const scroll = container.querySelector('.forms-sheet-scroll') as HTMLDivElement;
    scroll.scrollTop = 68 + 90 * 44;
    fireEvent.scroll(scroll);
    expect(container.querySelector('tbody td[title="91"]')).not.toBeNull();
  });
});
