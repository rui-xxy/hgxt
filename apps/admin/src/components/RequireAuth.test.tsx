/**
 * C2：RequireAuth 守卫分支测试（D1 验收）
 * auth 错误 → 跳登录页；网络/服务器错误 → 错误页（不登出）；加载中 → Spin；成功 → 子路由
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { RequireAuth } from './RequireAuth';
import { ApiError, tokenStore } from '../api/client';

const useMeMock = vi.hoisted(() => vi.fn());
vi.mock('../api/hooks', () => ({
  useMe: useMeMock,
}));

beforeEach(() => {
  // 守卫第一层检查「本地是否有 access token」，测试里先放入，
  // 让用例真正走到 useMe 分支
  tokenStore.setTokens('test-access', 'test-refresh');
});

function renderGuard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<div>登录页</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<div>受保护内容</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setMeResult(result: Partial<{ isPending: boolean; isError: boolean; error: unknown; data: unknown }>) {
  useMeMock.mockReturnValue({ refetch: vi.fn(), ...result });
}

describe('RequireAuth 分支（D1）', () => {
  it('加载中显示全屏 Spin', () => {
    setMeResult({ isPending: true });
    renderGuard();
    expect(document.querySelector('.ant-spin')).toBeTruthy();
    expect(screen.queryByText('登录页')).toBeNull();
  });

  it('认证失败（kind=auth）跳转登录页', () => {
    setMeResult({ isError: true, error: new ApiError(401, '登录已过期，请重新登录', 'auth') });
    renderGuard();
    expect(screen.getByText('登录页')).toBeTruthy();
  });

  it('网络错误显示错误页与重新加载按钮，不跳登录页', () => {
    setMeResult({ isError: true, error: new ApiError(0, '无法连接服务器，请检查网络或服务状态', 'network') });
    renderGuard();
    expect(screen.getByText('无法连接服务器')).toBeTruthy();
    expect(screen.getByRole('button', { name: /重新加载/ })).toBeTruthy();
    expect(screen.queryByText('登录页')).toBeNull();
  });

  it('服务器错误同样停留在错误页', () => {
    setMeResult({ isError: true, error: new ApiError(500, '服务器内部错误', 'server') });
    renderGuard();
    expect(screen.getByText('无法连接服务器')).toBeTruthy();
    expect(screen.queryByText('登录页')).toBeNull();
  });

  it('成功时渲染受保护内容', () => {
    setMeResult({ data: { id: 'u1', username: 'admin', role: 'SUPER_ADMIN' } });
    renderGuard();
    expect(screen.getByText('受保护内容')).toBeTruthy();
  });
});
