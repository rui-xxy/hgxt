import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router';
import { setAuthFailureHandler, setExternalLogoutHandler } from './api/client';
import { queryClient } from './api/queryClient';
import { RequireAuth } from './components/RequireAuth';
import { RequireSuperAdmin } from './components/RequireSuperAdmin';
import { PageLoading } from './components/PageLoading';
import { AdminLayout } from './layouts/AdminLayout';

// F3：路由级拆包——业务页面按需加载，不进首屏主包
const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const UsersPage = lazy(() =>
  import('./pages/users/UsersPage').then((m) => ({ default: m.UsersPage })),
);
const FormsPage = lazy(() => import('./pages/forms/FormsPage').then((m) => ({ default: m.FormsPage })));
const FormDataPage = lazy(() => import('./pages/forms/FormDataPage').then((m) => ({ default: m.FormDataPage })));
const FormFillPage = lazy(() => import('./pages/forms/FormFillPage').then((m) => ({ default: m.FormFillPage })));

export default function App() {
  const navigate = useNavigate();

  useEffect(() => {
    // 会话彻底失效（refresh 也失败）→ 跳登录页
    setAuthFailureHandler(() => {
      queryClient.clear();
      navigate('/login', { replace: true });
    });
    // D2：其他标签页登出 → 本页同步清缓存并回登录页
    setExternalLogoutHandler(() => {
      queryClient.clear();
      navigate('/login', { replace: true });
    });
    return () => {
      setAuthFailureHandler(null);
      setExternalLogoutHandler(null);
    };
  }, [navigate]);

  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="form-fill/:id" element={<FormFillPage />} />
          <Route element={<AdminLayout />}>
            <Route index element={<HomePage />} />
            <Route path="forms" element={<FormsPage />} />
            <Route path="forms/:id" element={<FormDataPage />} />
            <Route
              path="users"
              element={
                <RequireSuperAdmin>
                  <UsersPage />
                </RequireSuperAdmin>
              }
            />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
