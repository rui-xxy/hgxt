import type { MouseEvent } from 'react';
import { App, Button, Form, Input, Tooltip } from 'antd';
import { useLocation, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { loginApi } from '../api/auth';
import { tokenStore } from '../api/client';
import { queryClient } from '../api/queryClient';
import { BrandMark } from '../components/BrandMark';
import { ArrowRightIcon, LockIcon, MoonIcon, SunIcon, UserIcon } from '../components/icons';
import { useThemeMode } from '../theme/ThemeProvider';
import './login.css';

interface LoginFormValues {
  username: string;
  password: string;
}

export function LoginPage() {
  const [form] = Form.useForm<LoginFormValues>();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, toggleMode } = useThemeMode();

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const loginMutation = useMutation({
    mutationFn: (values: LoginFormValues) => loginApi(values.username, values.password),
    onSuccess: (data) => {
      tokenStore.setTokens(data.accessToken, data.refreshToken);
      queryClient.setQueryData(['me'], data.user);
      message.success(`欢迎，${data.user.name}`);
      navigate(from, { replace: true });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '登录失败，请稍后重试');
    },
  });

  const themeLabel = mode === 'dark' ? '切换为浅色主题' : '切换为深色主题';
  const handleToggleTheme = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    toggleMode({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  };

  // D1：不再凭「localStorage 有 token」自动跳后台——是否有有效会话由
  // RequireAuth 的 /me 结果决定，避免网络错误时的登录页↔后台循环跳转
  return (
    <div className="hg-login">
      <div className="hg-login-backdrop" aria-hidden />
      <div className="hg-login-corner">
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

      <main className="hg-login-card">
        <BrandMark size={40} />
        <h1 className="hg-login-title">欢迎回来</h1>
        <p className="hg-login-sub">登录 HGXT 数据工作台</p>
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => loginMutation.mutate(values)}
          disabled={loginMutation.isPending}
          className="hg-login-form"
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              size="large"
              autoFocus
              autoComplete="username"
              placeholder="请输入用户名"
              prefix={<UserIcon className="hg-login-field-icon" />}
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              size="large"
              autoComplete="current-password"
              placeholder="请输入密码"
              prefix={<LockIcon className="hg-login-field-icon" />}
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={loginMutation.isPending}
            className="hg-login-submit"
          >
            登录
            {loginMutation.isPending ? null : <ArrowRightIcon className="hg-login-submit-arrow" />}
          </Button>
        </Form>
      </main>

      <footer className="hg-login-footer">© {new Date().getFullYear()} HGXT</footer>
    </div>
  );
}
