import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FenglianSummaryResult } from '@hgxt/shared';
import { FenglianTable, fenglianVisibleFields } from './FenglianWorkshopView';

const data: FenglianSummaryResult = {
  fields: [
    { id: 'field_201', title: '湿料产量', type: 'number', group: '三车间', section: '产成品', subgroup: '湿料', unit: 't' },
    { id: 'field_204', title: '干料打包数', type: 'number', group: '标准厂房', section: '产成品', subgroup: '干料', unit: 't' },
    { id: 'field_035', title: '湿料入库', type: 'number', group: '标准厂房', section: '原辅料', subgroup: '湿料', unit: 't' },
    { id: 'field_pp8285e_purchase', title: 'PP8285E购入', type: 'number', group: '标准厂房', section: '原辅料', subgroup: 'PP8285E', unit: 't' },
    { id: 'field_dmpy_purchase', title: 'DMPY购入', type: 'number', group: '标准厂房', section: '原辅料', subgroup: 'DMPY', unit: 't' },
    { id: 'field_electricity_cumulative', title: '电表累计读数', type: 'number', group: '标准厂房', section: '水电气', subgroup: '用电' },
  ],
  days: [{ date: '2026-09-01', values: { field_201: 9.545, field_204: 10, field_035: 39.503, field_pp8285e_purchase: 2, field_dmpy_purchase: 3, field_electricity_cumulative: 1561.35 } }],
};

describe('丰联车间看板', () => {
  it('同一产品的补充字段合并到同一个表头', () => {
    Element.prototype.scrollTo = vi.fn();
    const grouped = { ...data, fields: [
      { id: 'a1', title: '产量', type: 'number' as const, group: '标准厂房', section: '产成品', subgroup: '4500阻燃母粒' },
      { id: 'b1', title: '销量', type: 'number' as const, group: '标准厂房', section: '产成品', subgroup: '3500阻燃母粒' },
      { id: 'a2', title: '退货', type: 'number' as const, group: '标准厂房', section: '产成品', subgroup: '4500阻燃母粒' },
    ] };
    const { container } = render(<FenglianTable data={grouped} entries={[{ kind: 'day', date: '2026-09-01', index: 0 }]}
      activeDate="2026-09-01" onSelect={() => {}} selection={{ group: '标准厂房' }} onSelectionChange={() => {}} />);
    const headers = container.querySelectorAll('thead th.colored-group-head');
    expect(headers).toHaveLength(2);
    expect(headers[0].getAttribute('colspan')).toBe('2');
    expect([...container.querySelectorAll('thead tr:nth-child(2) th')].map((header) => header.textContent)).toEqual(['产量 ', '退货 ', '销量 ']);
  });

  it('按三车间和标准厂房，再按产成品、原辅料、水电气显示日报原值', () => {
    Element.prototype.scrollTo = vi.fn();
    expect(fenglianVisibleFields(data.fields, { group: '标准厂房' }).map((field) => field.id))
      .toEqual(['field_204']);
    expect(fenglianVisibleFields(data.fields, { group: '标准厂房', section: '原辅料' }).map((field) => field.id))
      .toEqual(['field_035', 'field_pp8285e_purchase', 'field_dmpy_purchase']);
    expect(fenglianVisibleFields(data.fields, { group: '标准厂房', section: '水电气' }).map((field) => field.id))
      .toEqual(['field_electricity_cumulative']);
    const onSelect = vi.fn();
    const { rerender } = render(<FenglianTable data={data} entries={[{ kind: 'day', date: '2026-09-01', index: 0 }]}
      activeDate="2026-09-01" onSelect={onSelect} selection={{ group: '' }} onSelectionChange={() => {}} />);
    expect(screen.getByText('湿料产量 t')).toBeTruthy();
    rerender(<FenglianTable data={data} entries={[{ kind: 'day', date: '2026-09-01', index: 0 }]}
      activeDate="2026-09-01" onSelect={onSelect} selection={{ group: '标准厂房' }} onSelectionChange={() => {}} />);
    expect(screen.getByText('产成品')).toBeTruthy();
    expect(screen.getByText('原辅料')).toBeTruthy();
    expect(screen.getByText('水电气')).toBeTruthy();
    expect(screen.getByText('干料打包数 t')).toBeTruthy();
    expect(screen.queryByText('湿料入库 t')).toBeNull();
    rerender(<FenglianTable data={data} entries={[{ kind: 'day', date: '2026-09-01', index: 0 }]}
      activeDate="2026-09-01" onSelect={onSelect} selection={{ group: '标准厂房', section: '原辅料' }} onSelectionChange={() => {}} />);
    expect(screen.getByText('湿料入库 t')).toBeTruthy();
    expect(screen.getByText('PP8285E购入 t')).toBeTruthy();
    expect(screen.getByText('DMPY购入 t')).toBeTruthy();
    expect(screen.queryByText('电表累计读数')).toBeNull();
    rerender(<FenglianTable data={data} entries={[{ kind: 'day', date: '2026-09-01', index: 0 }]}
      activeDate="2026-09-01" onSelect={onSelect} selection={{ group: '标准厂房', section: '水电气' }} onSelectionChange={() => {}} />);
    expect(screen.getByText('电表累计读数')).toBeTruthy();
    expect(screen.queryByText('PP8285E购入 t')).toBeNull();
    expect(screen.queryByText('DMPY购入 t')).toBeNull();
    expect(screen.getByText('1,561.35')).toBeTruthy();
    fireEvent.click(screen.getByText('09-01'));
    expect(onSelect).toHaveBeenCalledWith('2026-09-01');
  });
});
