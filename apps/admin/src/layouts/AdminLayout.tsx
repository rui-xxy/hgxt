import { Avatar, Button, Dropdown, Layout, Menu } from 'antd';
import {
  HomeOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MoreOutlined,
  MoonOutlined,
  SettingOutlined,
  SunOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { useMutation } from '@tanstack/react-query';
import { logoutApi } from '../api/auth';
import { useMe } from '../api/hooks';
import { tokenStore } from '../api/client';
import { queryClient } from '../api/queryClient';
import { useThemeMode } from '../theme/ThemeProvider';

const { Sider, Header, Content } = Layout;

/** 顶栏左侧的页面上下文（模块 / 页面），按路由映射 */
const PAGE_CONTEXT: Record<string, { module?: string; page: string }> = {
  '/': { page: '首页' },
  '/users': { module: '系统管理', page: '用户管理' },
  '/forms': { page: '表单系统' },
};

/**
 * 后台壳层（构图规范见 docs/ui-mapping.md「布局骨架」）：
 * 侧栏 240 = 品牌区 + 可伸缩导航 + 底部固定账户区；退出登录只在账户菜单中出现。
 * 顶栏 52 = 左页面上下文 + 右侧一键浅色/深色切换。
 */
export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const { mode, toggleMode } = useThemeMode();

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
  const menuItems = [
    { key: '/', icon: <HomeOutlined />, label: <Link to="/">首页</Link> },
    { key: '/forms', icon: <FileTextOutlined />, label: <Link to="/forms">表单系统</Link> },
    {
      key: 'system',
      icon: <SettingOutlined />,
      label: '系统管理',
      children: [{ key: '/users', icon: <TeamOutlined />, label: <Link to="/users">用户管理</Link> }],
    },
  ];

  const accountMenu = {
    items: [{ key: 'logout', label: '退出登录', icon: <LogoutOutlined />, danger: true }],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') logoutMutation.mutate();
    },
  };

  return (
    <Layout className="hgxt-root">
      <Sider width={240} className="hgxt-sider">
        <div className="hgxt-brand">
          <div className="hgxt-brand-mark">H</div>
          <div>
            <div className="hgxt-brand-name">HGXT</div>
            <div className="hgxt-brand-sub">管理后台</div>
          </div>
        </div>
        <Menu
          className="hgxt-menu"
          mode="inline"
          selectedKeys={[location.pathname.startsWith('/forms/') ? '/forms' : location.pathname]}
          defaultOpenKeys={['system']}
          items={menuItems}
        />
        <div className="hgxt-sider-account">
          <Dropdown menu={accountMenu} placement="topRight" trigger={['click']}>
            <Button type="text" className="hgxt-sider-user">
              <Avatar size={28} className="hgxt-avatar">
                {me.data?.name?.charAt(0) ?? '?'}
              </Avatar>
              <span className="hgxt-sider-user-copy">
                <span className="hgxt-sider-user-name">{me.data?.name ?? '...'}</span>
                <span className="hgxt-sider-user-meta">{me.data?.username ?? ''}</span>
              </span>
              <MoreOutlined className="hgxt-sider-user-more" />
            </Button>
          </Dropdown>
        </div>
      </Sider>
      <Layout>
        <Header className="hgxt-header">
          <div className="hgxt-header-left">
            {context.module ? <span className="hgxt-header-crumb">{context.module} /</span> : null}
            <span className="hgxt-header-page">{context.page}</span>
          </div>
          <Button
            type="text"
            className="hgxt-theme-toggle"
            aria-label={mode === 'dark' ? '切换为浅色主题' : '切换为深色主题'}
            title={mode === 'dark' ? '切换为浅色主题' : '切换为深色主题'}
            icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleMode}
          />
        </Header>
        <Content className="hgxt-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
