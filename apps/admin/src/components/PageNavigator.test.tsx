import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageNavigator } from './PageNavigator';

describe('分页导航', () => {
  it('可以顺序翻页、输入页码直达，并把越界页码限制在有效范围', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PageNavigator page={1} pageSize={15} total={106} onChange={onChange} />);
    expect(screen.queryByText('…')).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /上一页/ }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /下一页/ }));
    expect(onChange).toHaveBeenLastCalledWith(2);

    rerender(<PageNavigator page={6} pageSize={15} total={106} onChange={onChange} />);
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: '跳转页码' });
    expect(input.value).toBe('6');
    fireEvent.change(input, { target: { value: '8' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(8);

    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(8);
  });

  it('编辑未保存时禁止翻页和跳转', () => {
    const onChange = vi.fn();
    render(<PageNavigator page={2} pageSize={15} total={60} disabled onChange={onChange} />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /上一页/ }).disabled).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '跳转页码' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /下一页/ }).disabled).toBe(true);
  });
});
