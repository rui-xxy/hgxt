import { Typography } from 'antd';
import { useMe } from '../api/hooks';

const { Title, Paragraph } = Typography;

/** 首页：干净的欢迎页——V1 没有业务数据，不做假 Dashboard */
export function HomePage() {
  const me = useMe();

  return (
    <div style={{ maxWidth: 720 }}>
      <Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
        欢迎使用 HGXT 管理后台
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 4 }}>
        当前登录：{me.data?.name ?? '...'}（{me.data?.username ?? ''}）
      </Paragraph>
      <Paragraph type="secondary">
        当前版本 V1 提供登录与用户管理能力，业务模块将随实际需求逐步迭代。
      </Paragraph>
    </div>
  );
}
