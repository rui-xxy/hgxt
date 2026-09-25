import { PageHeader } from '../components/PageHeader';
import { useMe } from '../api/hooks';

/** 首页：干净的欢迎页——V1 没有业务数据，不做假 Dashboard */
export function HomePage() {
  const me = useMe();

  return <PageHeader title={`你好，${me.data?.name ?? ''}`} />;
}
