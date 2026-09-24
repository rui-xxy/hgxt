import { useState } from 'react';
import { App, Button, Form, Input } from 'antd';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { loginApi } from '../api/auth';
import { tokenStore } from '../api/client';
import { queryClient } from '../api/queryClient';

interface LoginFormValues {
  username: string;
  password: string;
}

/** 登录页：居中卡片、平静无装饰（DESIGN.md：无渐变、无整面品牌色） */
export function LoginPage() {
  const [form] = Form.useForm<LoginFormValues>();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasToken] = useState(() => Boolean(tokenStore.getAccessToken()));

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

  // 已有 token 的直接进后台（token 失效时守卫会再弹回本页）
  if (hasToken) return <Navigate to={from} replace />;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        style={{
          width: 360,
          padding: '28px 28px 24px',
          backgroundColor: 'var(--ant-color-bg-container)',
          border: '1px solid var(--ant-color-border-secondary)',
          borderRadius: 12,
        }}
      >
        <div style={{ marginBottom: 4, fontSize: 'var(--ui-font-size-xl)', fontWeight: 600 }}>
          HGXT 管理后台
        </div>
        <div style={{ marginBottom: 20, color: 'var(--ant-color-text-secondary)' }}>
          请使用账号登录
        </div>
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => loginMutation.mutate(values)}
          disabled={loginMutation.isPending}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input autoFocus autoComplete="username" placeholder="用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password autoComplete="current-password" placeholder="密码" />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={loginMutation.isPending}
            style={{ marginTop: 8 }}
          >
            登录
          </Button>
        </Form>
      </div>
    </div>
  );
}
