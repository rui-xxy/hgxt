import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormSubmissionDTO } from '@hgxt/shared';
import { listSubmissions } from '../../api/forms';
import { loadFormSubmissions } from './FormDataPage';

vi.mock('../../api/forms', () => ({ listSubmissions: vi.fn(), getForm: vi.fn() }));

const submission = (index: number): FormSubmissionDTO => ({
  id: `row-${index}`,
  formId: 'fenglian',
  data: { field_date: '2026-09-01' },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

describe('分区表格加载', () => {
  beforeEach(() => vi.clearAllMocks());

  it('将筛选条件传给每一页，并合并筛选后的全部记录', async () => {
    vi.mocked(listSubmissions).mockImplementation(async (_id, page) => ({
      items: page === 1 ? Array.from({ length: 1000 }, (_, index) => submission(index)) : [submission(1000)],
      total: 1001,
      page: page ?? 1,
      pageSize: 1000,
    }));
    const filters = { keyword: '车间', progress: '已完成' };

    const result = await loadFormSubmissions('fenglian', 1, 100, filters, true);

    expect(listSubmissions).toHaveBeenNthCalledWith(1, 'fenglian', 1, 1000, filters);
    expect(listSubmissions).toHaveBeenNthCalledWith(2, 'fenglian', 2, 1000, filters);
    expect(result.items).toHaveLength(1001);
    expect(result.items.at(-1)?.id).toBe('row-1000');
  });
});
