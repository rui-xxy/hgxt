import { Avatar, Button, Dropdown, Layout, Menu, Segmented } from 'antd';
import { DownOutlined, HomeOutlined, SettingOutlined, TeamOutlined } from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { logoutApi } from '../api/auth';
import { useMe } from '../api/hooks';
import { tokenStore } from '../api/client';
import { queryClient } from '../api/queryClient';
import { useThemeMode } from '../theme/ThemeProvider';

const { Sider, Header, Content } = Layout;

/** 后台框架：左侧菜单 + 顶栏（主题切换、用户下拉） */
export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const { mode, setMode } = useThemeMode();

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
    {
      key: 'system',
      icon: <SettingOutlined />,
      label: '系统管理',
      children: [{ key: '/users', icon: <TeamOutlined />, label: <Link to="/users">用户管理</Link> }],
    },
  ];

  return (
    <Layout style={{ height: '100%' }}>
      <Sider width={208} style={{ borderRight: '1px solid var(--ant-color-border-secondary)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 48,
            padding: '0 16px',
            fontWeight: 600,
          }}
        >
          HGXT 管理后台
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['system']}
          items={menuItems}
          style={{ borderInlineEnd: 'none' }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            borderBottom: '1px solid var(--ant-color-border-secondary)',
          }}
        >
          <Segmented
            size="small"
            value={mode}
            onChange={(value) => setMode(value as typeof mode)}
            options={[
              { label: '浅色', value: 'light' },
              { label: '深色', value: 'dark' },
              { label: '跟随系统', value: 'system' },
            ]}
          />
          <Dropdown
            menu={{
              items: [{ key: 'logout', label: '退出登录' }],
              onClick: ({ key }) => {
                if (key === 'logout') logoutMutation.mutate();
              },
            }}
          >
            <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size={24} style={{ backgroundColor: 'var(--ant-color-primary)' }}>
                {me.data?.name?.charAt(0) ?? '?'}
              </Avatar>
              {me.data?.name ?? '...'}
              <DownOutlined style={{ fontSize: 10 }} />
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ padding: 16, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
