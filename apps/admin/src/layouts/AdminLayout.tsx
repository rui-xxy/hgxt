import { Avatar, Dropdown } from 'antd';
import { FlaskConical, Home, LogOut, Moon, Settings, Sun, Users, type LucideIcon } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { Role } from '@hgxt/shared';
import { logoutApi } from '../api/auth';
import { useMe } from '../api/hooks';
import { tokenStore } from '../api/client';
import { queryClient } from '../api/queryClient';
import { useThemeMode } from '../theme/ThemeProvider';

interface ModuleItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

interface ModuleDef {
  key: string;
  label: string;
  icon: LucideIcon;
  /** 二级面板标题 */
  title: string;
  /** 模块入口 */
  path: string;
  /** 路径命中该前缀（或精确命中 '/'）即视为当前模块 */
  match: (pathname: string) => boolean;
  items: ModuleItem[];
  adminOnly?: boolean;
}

/** 模块可插拔：新增业务系统只需在此加一份配置（design/00 · 布局架构） */
const MODULES: ModuleDef[] = [
  {
    key: 'home',
    label: '首页',
    icon: Home,
    title: '工作台',
    path: '/',
    match: (p) => p === '/',
    items: [{ label: '概览', path: '/', icon: Home }],
  },
  {
    key: 'production',
    label: '生产',
    icon: FlaskConical,
    title: '生产',
    path: '/forms',
    match: (p) => p.startsWith('/forms'),
    items: [{ label: '表单', path: '/forms', icon: FlaskConical }],
  },
  {
    key: 'system',
    label: '系统',
    icon: Settings,
    title: '系统',
    path: '/users',
    match: (p) => p.startsWith('/users'),
    adminOnly: true,
    items: [{ label: '成员', path: '/users', icon: Users }],
  },
];

/** 顶部路径栏的页面名 */
function pageName(pathname: string): string {
  if (pathname === '/') return '概览';
  if (pathname === '/forms') return '表单';
  if (pathname.startsWith('/forms/')) return '数据';
  if (pathname.startsWith('/users')) return '成员';
  return 'HGXT';
}

/**
 * 后台壳层（design/00 · 布局架构）：
 * ① 模块轨 68px（一级导航）→ ② 模块面板 236px（二级导航）→ ③ 圆角 14 的白色内容画布。
 */
export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const { mode, toggleMode } = useThemeMode();
  const isAdmin = me.data?.role === Role.SUPER_ADMIN;

  const modules = MODULES.filter((m) => !m.adminOnly || isAdmin);
  const current = MODULES.find((m) => m.match(location.pathname)) ?? MODULES[0];
  const itemActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const logoutMutation = useMutation({
    mutationFn: () => logoutApi(tokenStore.getRefreshToken() ?? ''),
    onSettled: () => {
      // 无论接口是否成功，本地会话一律清空
      tokenStore.clear();
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });

  const accountMenu = {
    items: [
      {
        key: 'logout',
        label: '退出登录',
        icon: <LogOut size={16} strokeWidth={1.6} />,
        danger: true,
      },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') logoutMutation.mutate();
    },
  };

  const themeLabel = mode === 'dark' ? '切换为浅色主题' : '切换为深色主题';
  const ThemeIcon = mode === 'dark' ? Sun : Moon;

  return (
    <div className="hgxt-shell">
      <nav className="hgxt-rail" aria-label="模块">
        <Link to="/" className="hgxt-mark" aria-label="HGXT 首页">
          化
        </Link>
        {modules.map((m) => (
          <Link
            key={m.key}
            to={m.path}
            className={`hgxt-rail-link${m.key === current.key ? ' is-on' : ''}`}
          >
            <m.icon size={20} strokeWidth={1.6} />
            <span>{m.label}</span>
          </Link>
        ))}
        <div className="hgxt-rail-foot">
          <button
            type="button"
            className="hgxt-iconbtn"
            aria-label={themeLabel}
            title={themeLabel}
            onClick={toggleMode}
          >
            <ThemeIcon size={18} strokeWidth={1.6} />
          </button>
          <Dropdown menu={accountMenu} placement="topRight" trigger={['click']}>
            <button type="button" className="hgxt-iconbtn hgxt-account" aria-label="账号菜单">
              <Avatar size={30} className="hgxt-avatar">
                {me.data?.name?.charAt(0) ?? '?'}
              </Avatar>
            </button>
          </Dropdown>
        </div>
      </nav>

      <aside className="hgxt-panel">
        <div className="hgxt-panel-head">
          <span className="hgxt-panel-title">{current.title}</span>
        </div>
        <div className="hgxt-panel-nav">
          {current.items.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`hgxt-panel-link${itemActive(item.path) ? ' is-on' : ''}`}
            >
              <item.icon size={18} strokeWidth={1.6} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
        <div className="hgxt-panel-user">
          <div className="hgxt-panel-user-name">{me.data?.name ?? '...'}</div>
          <div className="hgxt-panel-user-meta mono">{me.data?.username ?? ''}</div>
        </div>
      </aside>

      <div className="hgxt-canvas">
        <header className="hgxt-bar">
          <div className="hgxt-crumb">
            <span>{current.title}</span>
            <span className="hgxt-crumb-sep">/</span>
            <b>{pageName(location.pathname)}</b>
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
