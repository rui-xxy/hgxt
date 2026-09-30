import { App, Button, Form, Input } from 'antd';
import { useLocation, useNavigate } from 'react-router';
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

  // D1：不再凭「localStorage 有 token」自动跳后台——是否有有效会话由
  // RequireAuth 的 /me 结果决定，避免网络错误时的登录页↔后台循环跳转
  return (
    <div className="hgxt-login">
      <section className="hgxt-login-hero">
        <div className="hgxt-login-brand">
          <div className="hgxt-mark">化</div>
          <div className="hgxt-login-word">Hgxt</div>
        </div>
        <div className="hgxt-login-copy">
          <h2 className="hgxt-login-headline">
            每一个车间的
            <br />
            每一笔数据，
            <br />
            <em>清清楚楚。</em>
          </h2>
          <div className="hgxt-login-lead">所有日报在一处填写、汇总与追溯。</div>
        </div>
        <div className="hgxt-login-foot">© 2026 HGXT · 内部系统，仅限授权人员使用</div>
      </section>
      <section className="hgxt-login-panel">
        <div className="hgxt-login-form">
          <h1 className="hgxt-login-title">登录</h1>
          <div className="hgxt-login-desc">欢迎回来，请使用分配给你的账号登录</div>
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
              <Input size="large" autoFocus autoComplete="username" placeholder="用户名" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password size="large" autoComplete="current-password" placeholder="密码" />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              className="hgxt-login-submit"
              loading={loginMutation.isPending}
            >
              登录
            </Button>
          </Form>
          <div className="hgxt-login-note">没有账号？请联系管理员开通</div>
        </div>
      </section>
    </div>
  );
}
