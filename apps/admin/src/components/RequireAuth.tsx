import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../api/hooks';
import { tokenStore, ApiError } from '../api/client';
import { PageLoading } from './PageLoading';
import { ConnectionErrorPage } from './ConnectionErrorPage';

/**
 * D1 登录态守卫：
 *  - 无 token / /me 认证失败（kind='auth'）→ 登录页
 *  - /me 网络或服务器错误（kind='network'/'server'）→ 错误页 + 重试，绝不登出
 *  - 加载中 → 全屏 Spin
 */
export function RequireAuth() {
  const location = useLocation();
  if (!tokenStore.getAccessToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <AuthGate />;
}

function AuthGate() {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) return <PageLoading />;

  if (me.isError) {
    const error = me.error instanceof ApiError ? me.error : null;
    if (!error || error.kind === 'auth') {
      return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
    return (
      <ConnectionErrorPage
        message={me.error instanceof Error ? me.error.message : '未知错误'}
      />
    );
  }

  return <Outlet />;
}
