import { useEffect, useRef, useState } from 'react';
import { Avatar, Dropdown } from 'antd';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PagePermission, Role, type PagePermission as PagePermissionType } from '@hgxt/shared';
import { logoutApi } from '../api/auth';
import { listForms } from '../api/forms';
import { useMe } from '../api/hooks';
import { tokenStore } from '../api/client';
import { queryClient } from '../api/queryClient';
import {
  BriefIcon,
  DashboardIcon,
  FactoryIcon,
  FormsNavIcon,
  LogoutIcon,
  MoonIcon,
  PackageIcon,
  SlidersIcon,
  SunIcon,
  SystemNavIcon,
  TargetIcon,
  UsersIcon,
  WrenchIcon,
} from '../components/icons';
import { useThemeMode } from '../theme/ThemeProvider';
import { landingPath } from '../auth/landing';

interface ModuleItem {
  label: string;
  path: string;
  icon: typeof DashboardIcon;
  permission?: PagePermissionType;
  adminOnly?: boolean;
}

interface ModuleSection {
  label?: string;
  items: ModuleItem[];
}

interface ModuleDef {
  key: string;
  label: string;
  icon: typeof DashboardIcon;
  /** 二级面板标题 */
  title: string;
  /** 模块入口 */
  path: string;
  /** 路径命中该前缀即视为当前模块 */
  match: (pathname: string) => boolean;
  sections: ModuleSection[];
  adminOnly?: boolean;
  permission?: PagePermissionType;
}

/** 模块可插拔：新增业务系统只需在此加一份配置（design/00 · 布局架构） */
const MODULES: ModuleDef[] = [
  {
    key: 'home',
    label: '首页',
    icon: DashboardIcon,
    title: '首页',
    path: '/board',
    match: (p) =>
      p === '/' || p === '/workspace' || p.startsWith('/board') || p.startsWith('/brief') || p.startsWith('/energy') || p.startsWith('/materials') || p.startsWith('/plan'),
    sections: [
      { items: [{ label: '工作台', path: '/workspace', icon: DashboardIcon, adminOnly: true }] },
      {
        label: '生产看板',
        items: [
          { label: '车间版面', path: '/board', icon: FactoryIcon },
          { label: '经营简报', path: '/brief', icon: BriefIcon, permission: PagePermission.BRIEF },
          { label: '计划与完成', path: '/plan', icon: TargetIcon, permission: PagePermission.PLAN },
        ],
      },
      { label: '能源消耗', items: [{ label: '能源中心', path: '/energy', icon: SunIcon }] },
      { label: '库存', items: [{ label: '物料与库存', path: '/materials', icon: PackageIcon }] },
      { label: '计划管理', items: [{ label: '生产计划设置', path: '/plan/settings', icon: SlidersIcon, adminOnly: true }] },
    ],
  },
  {
    key: 'production',
    label: '表单',
    icon: FormsNavIcon,
    title: '表单',
    path: '/forms',
    adminOnly: true,
    match: (p) => p.startsWith('/forms') || p.startsWith('/form-fill'),
    sections: [{ items: [{ label: '全部表单', path: '/forms', icon: FormsNavIcon }] }],
  },
  {
    key: 'maintenance',
    label: '设备',
    icon: WrenchIcon,
    title: '设备',
    path: '/maintenance',
    permission: PagePermission.MAINTENANCE,
    match: (p) => p === '/maintenance' || p.startsWith('/maintenance/'),
    sections: [{
      items: [
        { label: '维修总览', path: '/maintenance', icon: DashboardIcon },
      ],
    }],
  },
  {
    key: 'system',
    label: '系统',
    icon: SystemNavIcon,
    title: '系统',
    path: '/users',
    match: (p) => p.startsWith('/users'),
    adminOnly: true,
    sections: [{ items: [{ label: '成员管理', path: '/users', icon: UsersIcon }] }],
  },
];

/** 顶部路径栏的页面名 */
function pageName(pathname: string): string {
  if (pathname === '/workspace') return '工作台';
  if (pathname === '/forms') return '全部表单';
  if (pathname.startsWith('/forms/')) return '数据';
  if (pathname === '/maintenance') return '维修总览';
  if (pathname.startsWith('/maintenance/records')) return '维修记录';
  if (pathname.startsWith('/maintenance/new')) return '维修登记';
  if (pathname.startsWith('/board')) return '车间版面';
  if (pathname.startsWith('/brief')) return '经营简报';
  if (pathname.startsWith('/energy')) return '能源中心';
  if (pathname.startsWith('/materials')) return '物料与库存';
  if (pathname === '/plan') return '计划与完成';
  if (pathname.startsWith('/plan/settings')) return '生产计划设置';
  if (pathname.startsWith('/plan')) return '计划与完成';
  if (pathname.startsWith('/users')) return '成员管理';
  return 'HGXT';
}

/**
 * 后台壳层：左侧 68px 图标轨（一级导航），鼠标移到图标上浮出该模块的二级菜单、
 * 移开即收起；右侧是圆角 14 的白色内容画布。
 */
export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const { mode, toggleMode } = useThemeMode();
  const isAdmin = me.data?.role === Role.SUPER_ADMIN;
  const formNavigation = useQuery({
    queryKey: ['forms', 'navigation'],
    queryFn: () => listForms({ page: 1, pageSize: 100, keyword: '' }),
    enabled: isAdmin,
  });
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const openFlyout = (key: string) => {
    window.clearTimeout(closeTimer.current);
    setHoverKey(key);
  };
  const scheduleClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHoverKey(null), 140);
  };

  const canSee = (permission?: PagePermissionType) => !permission || isAdmin || !!me.data?.pagePermissions.includes(permission);
  const modules = MODULES.filter((m) => (!m.adminOnly || isAdmin) && canSee(m.permission)).map((module) => ({
    ...module,
    path: module.key === 'home' ? landingPath() : module.path,
    sections: module.sections.map((section) => ({
      ...section,
      items: section.items.filter((item) => (!item.adminOnly || isAdmin) && canSee(item.permission)),
    })).filter((section) => section.items.length > 0),
  })).filter((module) => module.sections.length > 0);
  const current = MODULES.find((m) => m.match(location.pathname)) ?? MODULES[0];
  const flyout = modules.find((m) => m.key === hoverKey) ?? null;
  const itemActive = (path: string) =>
    path === '/workspace' || path === '/forms' || path === '/plan' || path === '/maintenance'
      ? location.pathname === path
      : location.pathname.startsWith(path);

  const logoutMutation = useMutation({
    mutationFn: () => logoutApi(tokenStore.getRefreshToken() ?? ''),
    onSettled: () => {
      // 无论接口是否成功，本地会话一律清空
      tokenStore.clear();
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });

  const themeLabel = mode === 'dark' ? '浅色模式' : '深色模式';
  const ThemeIcon = mode === 'dark' ? SunIcon : MoonIcon;

  const accountPanel = (
    <div className="hgxt-acct-menu">
      <div className="hgxt-acct-head">
        <div className="hgxt-acct-name">{me.data?.name ?? '...'}</div>
        <div className="hgxt-acct-meta">
          <span className="mono">{me.data?.username ?? ''}</span>
          {me.data ? ` · ${me.data.role === Role.SUPER_ADMIN ? '管理员' : '普通用户'}` : ''}
        </div>
      </div>
      <hr />
      <button
        type="button"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setAccountOpen(false);
          toggleMode({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        }}
      >
        <ThemeIcon width={16} height={16} strokeWidth={1.6} />
        {themeLabel}
      </button>
      <button
        type="button"
        onClick={() => {
          setAccountOpen(false);
          logoutMutation.mutate();
        }}
      >
        <LogoutIcon width={16} height={16} strokeWidth={1.6} />
        退出登录
      </button>
    </div>
  );

  return (
    <div className="hgxt-shell">
      <nav className="hgxt-rail" aria-label="模块" onMouseLeave={scheduleClose}>
        <Link to="/" className="hgxt-mark" aria-label="HGXT 首页">
          化
        </Link>
        {modules.map((m) => {
          const isActive = m.key === current.key;
          const RailIcon = m.icon;
          return <Link
            key={m.key}
            to={m.path}
            aria-label={m.label}
            aria-current={isActive ? 'page' : undefined}
            className={`hgxt-rail-link${isActive ? ' is-on' : ''}`}
            onMouseEnter={() => openFlyout(m.key)}
            onFocus={() => openFlyout(m.key)}
          >
            <RailIcon width={20} height={20} strokeWidth={1.6} />
          </Link>;
        })}
        <div className="hgxt-rail-foot">
          <Dropdown
            open={accountOpen}
            onOpenChange={setAccountOpen}
            placement="topLeft"
            trigger={['click']}
            popupRender={() => accountPanel}
          >
            <button type="button" className="hgxt-iconbtn hgxt-account" aria-label="账号菜单">
              <Avatar size={30} className="hgxt-avatar">
                {me.data?.name?.charAt(0) ?? '?'}
              </Avatar>
            </button>
          </Dropdown>
        </div>
      </nav>

      {flyout ? (
        <aside
          className="hgxt-flyout"
          onMouseEnter={() => openFlyout(flyout.key)}
          onMouseLeave={scheduleClose}
          onBlur={scheduleClose}
        >
          <div className="hgxt-flyout-title">{flyout.title}</div>
          {flyout.sections.map((section) => (
            <div key={section.label ?? section.items[0]?.path ?? flyout.key} className="hgxt-flyout-section">
              {section.label ? <div className="hgxt-flyout-label">{section.label}</div> : null}
              <div className="hgxt-flyout-nav">
                {section.items.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={item.label}
                    onClick={() => setHoverKey(null)}
                    className={`hgxt-flyout-link${itemActive(item.path) ? ' is-on' : ''}`}
                  >
                    <item.icon width={17} height={17} strokeWidth={1.6} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </aside>
      ) : null}

      <div className="hgxt-canvas">
        <header className="hgxt-bar">
          <div className="hgxt-crumb">
            <span>{current.title}</span>
            <span className="hgxt-crumb-sep">/</span>
            <b>{location.pathname.startsWith('/forms/') ? formNavigation.data?.items.find((form) => location.pathname === `/forms/${form.id}`)?.title ?? pageName(location.pathname) : pageName(location.pathname)}</b>
          </div>
        </header>
        <main className="hgxt-scroll">
          <div className="hgxt-page">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
