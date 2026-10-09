import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router';
import { setAuthFailureHandler, setExternalLogoutHandler, tokenStore } from './api/client';
import { queryClient } from './api/queryClient';
import { RequireAuth } from './components/RequireAuth';
import { RequireSuperAdmin } from './components/RequireSuperAdmin';
import { RequirePageAccess } from './components/RequirePageAccess';
import { PagePermission } from '@hgxt/shared';
import { PageLoading } from './components/PageLoading';
import { AdminLayout } from './layouts/AdminLayout';
import { useMe } from './api/hooks';
import { landingPath } from './auth/landing';

function LandingRedirect() {
  const me = useMe();
  if (!me.data) return <PageLoading />;
  return <Navigate to={landingPath()} replace />;
}

/**
 * 设备维修登记入口：无需登录即可填报（后端提交接口已开放并限流）。
 * 已登录用户则沿用原带导航布局 + 页面权限校验的版本。
 */
function MaintenanceNewGate() {
  if (!tokenStore.getAccessToken()) return <MaintenanceNewPage />;
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route
          index
          element={
            <RequirePageAccess permission={PagePermission.MAINTENANCE}>
              <MaintenanceNewPage />
            </RequirePageAccess>
          }
        />
      </Route>
    </Routes>
  );
}

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
const WorkshopBoardPage = lazy(() =>
  import('./pages/production/WorkshopBoardPage').then((m) => ({ default: m.WorkshopBoardPage })),
);
const EnergyCenterPage = lazy(() =>
  import('./pages/production/EnergyCenterPage').then((m) => ({ default: m.EnergyCenterPage })),
);
const MaterialsPage = lazy(() =>
  import('./pages/production/MaterialsPage').then((m) => ({ default: m.MaterialsPage })),
);
const ProductionPlanPage = lazy(() =>
  import('./pages/production/ProductionPlanPage').then((m) => ({ default: m.ProductionPlanPage })),
);
const ExecutiveBriefPage = lazy(() =>
  import('./pages/production/ExecutiveBriefPage').then((m) => ({ default: m.ExecutiveBriefPage })),
);
const PlanSettingsPage = lazy(() =>
  import('./pages/production/PlanSettingsPage').then((m) => ({ default: m.PlanSettingsPage })),
);
const MaintenanceOverviewPage = lazy(() =>
  import('./pages/MaintenanceOverviewPage').then((m) => ({ default: m.MaintenanceOverviewPage })),
);
const MaintenanceRecordsPage = lazy(() =>
  import('./pages/MaintenanceRecordsPage').then((m) => ({ default: m.MaintenanceRecordsPage })),
);
const MaintenanceNewPage = lazy(() =>
  import('./pages/MaintenanceNewPage').then((m) => ({ default: m.MaintenanceNewPage })),
);
const MonitorOverviewPage = lazy(() =>
  import('./pages/monitor/MonitorOverviewPage').then((m) => ({ default: m.MonitorOverviewPage })),
);
const MonitorMemberPage = lazy(() =>
  import('./pages/monitor/MonitorMemberPage').then((m) => ({ default: m.MonitorMemberPage })),
);

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
        {/* 表单填写页无需登录：凭链接直接填报（后端对应接口已开放并限流） */}
        <Route path="form-fill/:id" element={<FormFillPage />} />
        <Route path="maintenance/new" element={<MaintenanceNewGate />} />
        <Route element={<RequireAuth />}>
          <Route element={<AdminLayout />}>
            <Route index element={<LandingRedirect />} />
            <Route path="workspace" element={<RequireSuperAdmin><HomePage /></RequireSuperAdmin>} />
            <Route path="forms" element={<RequireSuperAdmin><FormsPage /></RequireSuperAdmin>} />
            <Route path="maintenance" element={<RequirePageAccess permission={PagePermission.MAINTENANCE}><MaintenanceOverviewPage /></RequirePageAccess>} />
            <Route path="maintenance/records" element={<RequirePageAccess permission={PagePermission.MAINTENANCE}><MaintenanceRecordsPage /></RequirePageAccess>} />
            <Route path="maintenance/new" element={<RequirePageAccess permission={PagePermission.MAINTENANCE}><MaintenanceNewPage /></RequirePageAccess>} />
            <Route path="board" element={<WorkshopBoardPage />} />
            <Route path="energy" element={<EnergyCenterPage />} />
            <Route path="materials" element={<MaterialsPage />} />
            <Route path="brief" element={<RequirePageAccess permission={PagePermission.BRIEF}><ExecutiveBriefPage /></RequirePageAccess>} />
            <Route
              path="plan"
              element={
                <RequirePageAccess permission={PagePermission.PLAN}>
                  <ProductionPlanPage />
                </RequirePageAccess>
              }
            />
            <Route
              path="plan/settings"
              element={
                <RequireSuperAdmin>
                  <PlanSettingsPage />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="forms/:id"
              element={
                <RequireSuperAdmin>
                  <FormDataPage />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="users"
              element={
                <RequireSuperAdmin>
                  <UsersPage />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="monitor"
              element={
                <RequireSuperAdmin>
                  <MonitorOverviewPage />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="monitor/:id"
              element={
                <RequireSuperAdmin>
                  <MonitorMemberPage />
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
