import { Spin } from 'antd';
import { BrandMark } from './BrandMark';

/** 全屏加载态（RequireAuth 与路由 Suspense 共用）：品牌标识 + 细加载指示 */
export function PageLoading() {
  return (
    <div className="hg-page-loading">
      <BrandMark size={36} />
      <Spin size="small" />
    </div>
  );
}
