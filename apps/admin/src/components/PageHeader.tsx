import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  /** 标题下一行说明（design/00 · .sub） */
  description?: ReactNode;
  /** 页面级主操作（右置，如「添加成员」） */
  extra?: ReactNode;
}

/** 页面标题区：衬线标题 30 / 500，右侧主操作（design/00 · 页面模板） */
export function PageHeader({ title, description, extra }: PageHeaderProps) {
  return (
    <div className="hgxt-page-header">
      <div>
        <h1 className="hgxt-page-title">{title}</h1>
        {description ? <div className="hgxt-page-sub">{description}</div> : null}
      </div>
      {extra ? <div className="hgxt-page-extra">{extra}</div> : null}
    </div>
  );
}
