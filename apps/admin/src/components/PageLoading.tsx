import { Spin } from 'antd';

/** 全屏加载态（RequireAuth 与路由 Suspense 共用） */
export function PageLoading() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <Spin size="large" />
    </div>
  );
}
