/**
 * C2：请求层状态机测试（D1/D2 的验收载体）
 * 覆盖：401→刷新→重放 / 刷新失败→登出 / 网络错误不登出 / 服务器错误不登出 /
 *       同一旧 token 只尝试一次 / 竞争输家识别获胜标签页写入的新 token / storage 跨标签登出
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { request, tokenStore, ApiError, setAuthFailureHandler, setExternalLogoutHandler } from './client';

type MockResponse = {
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
};

function jsonResponse(status: number, body: unknown): MockResponse {
  return { status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) };
}

/** 按 URL 前缀分发 mock */
function mockFetch(routes: Record<string, (url: string, init?: RequestInit) => MockResponse | Promise<MockResponse>>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    for (const [prefix, handler] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return await handler(url, init);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', impl);
  return { impl, calls };
}

beforeEach(() => {
  tokenStore.clear();
});

/** 断言 promise 以 ApiError 拒绝并返回它（类型化收窄） */
async function expectApiError(p: Promise<unknown>): Promise<ApiError> {
  const error = await p.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

afterEach(() => {
  setAuthFailureHandler(null);
  setExternalLogoutHandler(null);
});

describe('D1：错误分类', () => {
  it('网络错误（fetch 抛出）→ kind=network，不触发登出', async () => {
    const onAuthFailure = vi.fn();
    setAuthFailureHandler(onAuthFailure);
    mockFetch({ '/api/users': () => Promise.reject(new TypeError('fetch failed')) });

    const error = await expectApiError(request('/users'));
    expect(error.kind).toBe('network');
    expect(onAuthFailure).not.toHaveBeenCalled();
    expect(tokenStore.getAccessToken()).toBeNull();
  });

  it('服务器 500 → kind=server，不触发登出', async () => {
    const onAuthFailure = vi.fn();
    setAuthFailureHandler(onAuthFailure);
    mockFetch({ '/api/users': () => jsonResponse(500, { message: 'Internal Server Error' }) });

    const error = await expectApiError(request('/users'));
    expect(error.kind).toBe('server');
    expect(error.message).toBe('Internal Server Error');
    expect(onAuthFailure).not.toHaveBeenCalled();
  });

  it('业务 4xx（409）→ kind=client', async () => {
    mockFetch({ '/api/users': () => jsonResponse(409, { message: '用户名已被占用' }) });
    const error = await expectApiError(request('/users', { method: 'POST', body: {} }));
    expect(error.kind).toBe('client');
    expect(error.message).toBe('用户名已被占用');
  });
});

describe('D1+A1：401 → 刷新 → 重放', () => {
  it('刷新成功后自动重放原请求', async () => {
    tokenStore.setTokens('expired-access', 'valid-refresh');
    let usersCalled = 0;
    const { calls } = mockFetch({
      '/api/auth/refresh': () =>
        jsonResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 900 }),
      '/api/users': () => {
        usersCalled++;
        return jsonResponse(usersCalled === 1 ? 401 : 200, []);
      },
    });

    const result = await request('/users');
    expect(result).toEqual([]);
    expect(usersCalled).toBe(2);
    // 重放时携带了新 token
    const replayInit = calls.filter((c) => c.url.includes('/users'))[1]?.init;
    expect(JSON.stringify(replayInit?.headers)).toContain('new-access');
    expect(tokenStore.getAccessToken()).toBe('new-access');
  });

  it('刷新失败 → 清空会话、触发登出回调、抛 kind=auth', async () => {
    tokenStore.setTokens('expired-access', 'dead-refresh');
    const onAuthFailure = vi.fn();
    setAuthFailureHandler(onAuthFailure);
    mockFetch({
      '/api/auth/refresh': () => jsonResponse(401, { message: '登录状态已失效' }),
      '/api/users': () => jsonResponse(401, { message: '登录已过期' }),
    });

    const error = await expectApiError(request('/users'));
    expect(error.kind).toBe('auth');
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
    expect(tokenStore.getAccessToken()).toBeNull();
  });

  it('刷新期间网络中断 → kind=network，不登出', async () => {
    tokenStore.setTokens('expired-access', 'some-refresh');
    const onAuthFailure = vi.fn();
    setAuthFailureHandler(onAuthFailure);
    mockFetch({
      '/api/users': () => jsonResponse(401, { message: '登录已过期' }),
      '/api/auth/refresh': () => Promise.reject(new TypeError('fetch failed')),
    });

    const error = await expectApiError(request('/users'));
    expect(error.kind).toBe('network');
    expect(onAuthFailure).not.toHaveBeenCalled();
  });
});

describe('A1 客户端配合：同一旧 token 只尝试一次', () => {
  it('旧 token 刷新失败后，第二次 401 不再发 refresh（避免触发服务端复用检测）', async () => {
    tokenStore.setTokens('expired-access', 'old-refresh');
    const { impl } = mockFetch({
      '/api/users': () => jsonResponse(401, { message: '登录已过期' }),
      '/api/auth/refresh': () => jsonResponse(401, { message: '登录状态已失效' }),
    });
    setAuthFailureHandler(() => undefined);

    await request('/users').catch(() => undefined);
    await new Promise((r) => setTimeout(r, 0));
    await request('/users').catch(() => undefined);

    const refreshCalls = impl.mock.calls.filter(([url]) => String(url).includes('/auth/refresh'));
    expect(refreshCalls.length).toBe(1);
  });

  it('竞争输家：失败后若其他标签页已写入新 token，识别为可用而不登出', async () => {
    tokenStore.setTokens('expired-access', 'shared-old-refresh');
    const onAuthFailure = vi.fn();
    setAuthFailureHandler(onAuthFailure);

    const refreshHandler = vi.fn(() => {
      // 模拟另一个标签页在同一时刻刷新成功并写入了新 token（D2 时序竞争）
      tokenStore.setTokens('winner-access', 'winner-refresh');
      return jsonResponse(401, { message: '登录状态已变更' });
    });
    let usersCalled = 0;
    mockFetch({
      '/api/auth/refresh': refreshHandler,
      '/api/users': () => {
        usersCalled++;
        return jsonResponse(usersCalled === 1 ? 401 : 200, ['ok']);
      },
    });

    const result = await request('/users');
    expect(result).toEqual(['ok']);
    expect(onAuthFailure).not.toHaveBeenCalled();
  });
});

describe('D2：跨标签页登出同步', () => {
  it('其他标签页移除 token（storage 事件）→ 触发外部登出回调', async () => {
    const onExternalLogout = vi.fn();
    setExternalLogoutHandler(onExternalLogout);
    tokenStore.setTokens('a', 'b');

    // 模拟另一个标签页登出：手动派发 storage 事件不会改本地 localStorage，
    // 需同步清空以呈现「token 已不存在」的真实状态
    tokenStore.clear();
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'hgxt:accessToken', newValue: null }),
    );
    expect(onExternalLogout).toHaveBeenCalledTimes(1);

    // 其他 key 的事件不触发
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: null }));
    expect(onExternalLogout).toHaveBeenCalledTimes(1);
  });

  it('其他标签页只是刷新 token（仍有 access token）→ 不触发登出', () => {
    const onExternalLogout = vi.fn();
    setExternalLogoutHandler(onExternalLogout);
    tokenStore.setTokens('a', 'b');

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'hgxt:accessToken', newValue: 'new-a' }),
    );
    expect(onExternalLogout).not.toHaveBeenCalled();
  });
});
