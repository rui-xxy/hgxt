import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStore } from './client';
import { maintenanceApi } from './maintenance';

describe('维修接口认证边界', () => {
  beforeEach(() => {
    tokenStore.setTokens('maintenance-access', 'maintenance-refresh');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    })));
  });

  afterEach(() => {
    tokenStore.clear();
    vi.unstubAllGlobals();
  });

  it('维修记录列表和按年查询携带登录令牌', async () => {
    await maintenanceApi.list();
    await maintenanceApi.listYear(2026);

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/maintenance/records',
      expect.objectContaining({ headers: { Authorization: 'Bearer maintenance-access' } }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/maintenance/records?year=2026',
      expect.objectContaining({ headers: { Authorization: 'Bearer maintenance-access' } }));
  });

  it('公开联想选项不携带令牌', async () => {
    await maintenanceApi.options();
    expect(fetch).toHaveBeenCalledWith('/api/maintenance/options',
      expect.objectContaining({ headers: {} }));
  });
});
