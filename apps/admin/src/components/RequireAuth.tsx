import { Navigate, Outlet, useLocation } from 'react-router';
import { Spin } from 'antd';
import { useMe } from '../api/hooks';
import { tokenStore } from '../api/client';

/** 登录态守卫：无 token 直接去登录页；有 token 但 /me 失效同样回登录页 */
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

  if (me.isPending) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (me.isError || !me.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
