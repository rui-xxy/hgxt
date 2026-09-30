import { useEffect, useRef, useState } from 'react';
import { Avatar, Dropdown } from 'antd';
import {
  BarChart3,
  FlaskConical,
  Home,
  LogOut,
  Moon,
  Package,
  Settings,
  Sun,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
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
    match: (p) => p.startsWith('/forms') || p.startsWith('/board') || p.startsWith('/energy') || p.startsWith('/materials'),
    items: [
      { label: '表单', path: '/forms', icon: FlaskConical },
      { label: '车间版面', path: '/board', icon: BarChart3 },
      { label: '能源中心', path: '/energy', icon: Zap },
      { label: '物料与库存', path: '/materials', icon: Package },
    ],
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
  if (pathname.startsWith('/board')) return '车间版面';
  if (pathname.startsWith('/energy')) return '能源中心';
  if (pathname.startsWith('/materials')) return '物料与库存';
  if (pathname.startsWith('/users')) return '成员';
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

  const modules = MODULES.filter((m) => !m.adminOnly || isAdmin);
  const current = MODULES.find((m) => m.match(location.pathname)) ?? MODULES[0];
  const flyout = modules.find((m) => m.key === hoverKey) ?? null;
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

  const themeLabel = mode === 'dark' ? '浅色模式' : '深色模式';
  const ThemeIcon = mode === 'dark' ? Sun : Moon;

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
        <ThemeIcon size={16} strokeWidth={1.6} />
        {themeLabel}
      </button>
      <button
        type="button"
        onClick={() => {
          setAccountOpen(false);
          logoutMutation.mutate();
        }}
      >
        <LogOut size={16} strokeWidth={1.6} />
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
        {modules.map((m) => (
          <Link
            key={m.key}
            to={m.path}
            aria-label={m.label}
            className={`hgxt-rail-link${m.key === current.key ? ' is-on' : ''}`}
            onMouseEnter={() => openFlyout(m.key)}
            onFocus={() => openFlyout(m.key)}
          >
            <m.icon size={20} strokeWidth={1.6} />
          </Link>
        ))}
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
          <div className="hgxt-flyout-label">页面</div>
          <div className="hgxt-flyout-nav">
            {flyout.items.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setHoverKey(null)}
                className={`hgxt-flyout-link${itemActive(item.path) ? ' is-on' : ''}`}
              >
                <item.icon size={18} strokeWidth={1.6} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </aside>
      ) : null}

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
