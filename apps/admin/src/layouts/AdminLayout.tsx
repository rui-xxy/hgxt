import { useState, type MouseEvent } from 'react';
import { Dropdown, Layout, Menu, Tooltip, type MenuProps } from 'antd';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { logoutApi } from '../api/auth';
import { useMe } from '../api/hooks';
import { tokenStore } from '../api/client';
import { queryClient } from '../api/queryClient';
import { useThemeMode } from '../theme/ThemeProvider';
import { BrandMark } from '../components/BrandMark';
import {
  ChevronRightIcon,
  ChevronsUpDownIcon,
  FormsIcon,
  HomeIcon,
  LogoutIcon,
  MoonIcon,
  PanelLeftIcon,
  SunIcon,
  UsersIcon,
} from '../components/icons';

const { Sider } = Layout;

const COLLAPSED_KEY = 'hgxt:sider-collapsed';

/** 顶栏左侧的页面上下文（模块 / 页面），按路由映射 */
const PAGE_CONTEXT: Record<string, { module?: string; page: string }> = {
  '/': { page: '首页' },
  '/users': { module: '系统管理', page: '用户管理' },
  '/forms': { page: '表单系统' },
};

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const { mode, toggleMode } = useThemeMode();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const context = location.pathname.startsWith('/forms/')
    ? { module: '表单系统', page: '数据' }
    : PAGE_CONTEXT[location.pathname] ?? { page: 'HGXT' };

  const logoutMutation = useMutation({
    mutationFn: () => logoutApi(tokenStore.getRefreshToken() ?? ''),
    onSettled: () => {
      // 无论接口是否成功，本地会话一律清空
      tokenStore.clear();
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });

  const setCollapsedPersisted = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // 存储不可用时只影响记忆，不影响折叠
    }
  };

  const menuItems: MenuProps['items'] = [
    { key: '/', icon: <HomeIcon />, label: <Link to="/">首页</Link> },
    { key: '/forms', icon: <FormsIcon />, label: <Link to="/forms">表单系统</Link> },
    {
      type: 'group',
      key: 'system',
      label: '系统管理',
      children: [{ key: '/users', icon: <UsersIcon />, label: <Link to="/users">用户管理</Link> }],
    },
  ];

  const accountMenu: MenuProps = {
    items: [{ key: 'logout', label: '退出登录', icon: <LogoutIcon />, danger: true }],
    onClick: ({ key }) => {
      if (key === 'logout') logoutMutation.mutate();
    },
  };

  const themeLabel = mode === 'dark' ? '切换为浅色主题' : '切换为深色主题';
  const handleToggleTheme = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    toggleMode({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  };

  const initial = me.data?.name?.charAt(0) ?? '?';

  return (
    <Layout className="hg-shell" hasSider>
      <Sider
        width={232}
        collapsedWidth={64}
        collapsed={collapsed}
        breakpoint="lg"
        onBreakpoint={(broken) => setCollapsed(broken || readCollapsed())}
        trigger={null}
        className="hg-sider"
      >
        <div className="hg-brand">
          <BrandMark size={28} />
          {!collapsed && (
            <div className="hg-brand-copy">
              <span className="hg-brand-name">HGXT</span>
              <span className="hg-brand-sub">数据工作台</span>
            </div>
          )}
        </div>
        <Menu
          className="hg-nav"
          mode="inline"
          inlineCollapsed={collapsed}
          selectedKeys={[location.pathname.startsWith('/forms/') ? '/forms' : location.pathname]}
          items={menuItems}
        />
        <Dropdown menu={accountMenu} placement="topLeft" trigger={['click']}>
          <button type="button" className="hg-account" aria-label="账户菜单">
            <span className="hg-avatar">{initial}</span>
            {!collapsed && (
              <>
                <span className="hg-account-copy">
                  <span className="hg-account-name">{me.data?.name ?? '...'}</span>
                  <span className="hg-account-meta mono">{me.data?.username ?? ''}</span>
                </span>
                <ChevronsUpDownIcon className="hg-account-chevron" />
              </>
            )}
          </button>
        </Dropdown>
      </Sider>

      <div className="hg-main">
        <header className="hg-topbar">
          <div className="hg-topbar-left">
            <Tooltip title={collapsed ? '展开侧栏' : '收起侧栏'} placement="bottomLeft">
              <button
                type="button"
                className="hg-icon-button"
                aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
                onClick={() => setCollapsedPersisted(!collapsed)}
              >
                <PanelLeftIcon />
              </button>
            </Tooltip>
            <span className="hg-topbar-divider" aria-hidden />
            <nav className="hg-crumbs" aria-label="当前位置">
              {context.module ? (
                <>
                  <span className="hg-crumb-muted">{context.module}</span>
                  <ChevronRightIcon className="hg-crumb-sep" />
                </>
              ) : null}
              <span className="hg-crumb-current">{context.page}</span>
            </nav>
          </div>
          <div className="hg-topbar-right">
            <Tooltip title={themeLabel} placement="bottomRight">
              <button
                type="button"
                className="hg-icon-button hg-theme-toggle"
                data-mode={mode}
                aria-label={themeLabel}
                onClick={handleToggleTheme}
              >
                <SunIcon className="hg-theme-sun" />
                <MoonIcon className="hg-theme-moon" />
              </button>
            </Tooltip>
          </div>
        </header>
        <main className="hg-content">
          <Outlet />
        </main>
      </div>
    </Layout>
  );
}
