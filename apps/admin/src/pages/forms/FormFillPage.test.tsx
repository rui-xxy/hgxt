import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormDTO } from '@hgxt/shared';
import { createSubmission, getForm, latestValues } from '../../api/forms';
import { FormFillPage } from './FormFillPage';

vi.mock('../../api/forms', () => ({ createSubmission: vi.fn(), getForm: vi.fn(), latestValues: vi.fn() }));

const form: FormDTO = {
  id: 'control-1', code: 'sulfuric_control_assay', title: '硫酸中控 01｜矿样·干吸·风机', category: '品质',
  entryMode: 'form', description: null, parkingEnabled: false, latestEntryDate: null, submissionCount: 0,
  schema: [
    { id: 'field_date', title: '日期', type: 'date', hidden: true, required: true },
    { id: 'field_B', title: '有效硫', type: 'number', required: true },
    { id: 'field_C', title: '水分', type: 'number', required: true },
  ],
};

describe('硫酸中控填写日期', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.mocked(getForm).mockResolvedValue(form);
    vi.mocked(latestValues).mockResolvedValue({});
    vi.mocked(createSubmission).mockResolvedValue({ id: 'row-1', formId: form.id, data: {}, createdAt: '', updatedAt: '' });
  });

  it('将选择的记录日期与填写值一并提交', async () => {
    render(<QueryClientProvider client={new QueryClient()}><App><MemoryRouter initialEntries={[`/form-fill/${form.id}`]}>
      <Routes><Route path="/form-fill/:id" element={<FormFillPage />} /></Routes>
    </MemoryRouter></App></QueryClientProvider>);

    const date = await screen.findByRole('textbox', { name: '记录日期' });
    fireEvent.change(date, { target: { value: '2026年9月28日' } });
    fireEvent.keyDown(date, { key: 'Enter' });
    const submit = screen.getByRole('button', { name: '提交已填项目（0）' });
    expect(submit.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: '有效硫' }), { target: { value: '35.1' } });
    expect(screen.getByRole('button', { name: '提交已填项目（1）' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '提交已填项目（1）' }));

    await waitFor(() => expect(createSubmission).toHaveBeenCalledWith(form.id, { field_date: '2026-09-28', field_B: 35.1, field_C: null }));
  });
});
