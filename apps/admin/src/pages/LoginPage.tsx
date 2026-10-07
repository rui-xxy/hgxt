import { App, Button, Form, Input } from 'antd';
import { useEffect, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { loginApi } from '../api/auth';
import { tokenStore } from '../api/client';
import { queryClient } from '../api/queryClient';
import { loginPalette } from '../theme/tokens';

interface LoginFormValues {
  username: string;
  password: string;
}

const loginColors = {
  '--hg-login-paper': loginPalette.paper,
  '--hg-login-showreel-bg': loginPalette.showreelBg,
  '--hg-login-ink': loginPalette.ink,
  '--hg-login-muted': loginPalette.muted,
  '--hg-login-line': loginPalette.line,
  '--hg-login-card-idle': loginPalette.cardIdle,
  '--hg-login-card-active': loginPalette.cardActive,
  '--hg-login-card-shadow': loginPalette.cardShadow,
  '--hg-login-teal': loginPalette.teal,
  '--hg-login-blue': loginPalette.blue,
  '--hg-login-white': loginPalette.white,
  '--hg-login-focus': loginPalette.focus,
} as CSSProperties;

const loginFilms = [
  { id: 'showreel', src: '/login-showreel/film.html', title: '恒光化工品牌短片', duration: 16_000 },
  { id: 'sulfur', src: '/login-sulfur/film.html', title: '以硫为源宣传动画', duration: 64_000 },
] as const;

function LoginHero() {
  const [filmIndex, setFilmIndex] = useState(0);
  const [loadedFilm, setLoadedFilm] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const film = loginFilms[filmIndex];

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (reducedMotion || loadedFilm !== film.id) return;
    const timer = window.setTimeout(() => setFilmIndex((index) => (index + 1) % loginFilms.length), film.duration);
    return () => window.clearTimeout(timer);
  }, [film, loadedFilm, reducedMotion]);

  return <div className={`hgxt-login-hero${film.id === 'showreel' ? ' hgxt-login-hero-showreel' : ''}`} aria-hidden="true">
    <iframe key={film.id} src={film.src} title={film.title} tabIndex={-1} onLoad={() => setLoadedFilm(film.id)} />
  </div>;
}

/** 两段宣传动画依次播放，登录表单悬浮在影片上方。 */
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
    <div className="hgxt-login" style={loginColors}>
      <LoginHero />
      <section className="hgxt-login-panel">
        <div className="hgxt-login-form">
          <h1 className="hgxt-login-title">欢迎登录</h1>
          <div className="hgxt-login-desc">恒光 · 衡阳基地</div>
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            onFinish={(values) => loginMutation.mutate(values)}
            disabled={loginMutation.isPending}
          >
            <Form.Item
              name="username"
              label="账号"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input size="large" variant="borderless" autoComplete="username" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password size="large" variant="borderless" autoComplete="current-password" />
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
