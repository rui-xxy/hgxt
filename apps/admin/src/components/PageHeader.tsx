import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  /** 页面级主操作（右置，如「新增用户」） */
  extra?: ReactNode;
}

/**
 * 页面标题区——HGXT 页面模板的第一层（规范见 docs/ui-mapping.md）：
 * 左侧标题、右侧主操作。**不加辅助说明小字**（用户明确要求），
 * 页面用途靠标题与内容本身表达。
 */
export function PageHeader({ title, extra }: PageHeaderProps) {
  return (
    <div className="hgxt-page-header">
      <h1 className="hgxt-page-title">{title}</h1>
      {extra ? <div className="hgxt-page-extra">{extra}</div> : null}
    </div>
  );
}
