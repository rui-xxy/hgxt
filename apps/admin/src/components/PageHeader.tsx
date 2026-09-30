import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import { Link } from 'react-router';
import { ArrowLeftIcon } from './icons';

interface PageHeaderProps {
  title: ReactNode;
  /** 页面级主操作（右置，如「新增用户」；一页至多一个 primary） */
  extra?: ReactNode;
  /** 标题后的小计量标记（如记录数），不是解释性副文本 */
  meta?: ReactNode;
  /** 返回上一级：显示在标题左侧的图标按钮 */
  back?: { to: string; label: string };
}

/**
 * 页面标题区——HGXT 页面模板的第一层：
 * 左侧（返回）+ 标题 + 计量标记，右侧主操作。**不加辅助说明小字**（用户明确要求），
 * 页面用途靠标题与内容本身表达。
 */
export function PageHeader({ title, extra, meta, back }: PageHeaderProps) {
  return (
    <div className="hg-page-header">
      <div className="hg-page-heading">
        {back ? (
          <Tooltip title={back.label}>
            <Link to={back.to} aria-label={back.label} className="hg-icon-button">
              <ArrowLeftIcon />
            </Link>
          </Tooltip>
        ) : null}
        <h1 className="hg-page-title">{title}</h1>
        {meta !== undefined && meta !== null ? <span className="hg-page-meta tabular">{meta}</span> : null}
      </div>
      {extra ? <div className="hg-page-extra">{extra}</div> : null}
    </div>
  );
}
