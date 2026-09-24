import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router';
import { setAuthFailureHandler } from './api/client';
import { RequireAuth } from './components/RequireAuth';
import { RequireSuperAdmin } from './components/RequireSuperAdmin';
import { AdminLayout } from './layouts/AdminLayout';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { UsersPage } from './pages/users/UsersPage';

export default function App() {
  const navigate = useNavigate();

  useEffect(() => {
    // 会话彻底失效（refresh 也失败）时统一跳登录页
    setAuthFailureHandler(() => navigate('/login', { replace: true }));
    return () => setAuthFailureHandler(() => undefined);
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AdminLayout />}>
          <Route index element={<HomePage />} />
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
  );
}
