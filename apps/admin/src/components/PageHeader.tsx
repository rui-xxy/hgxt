import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import { Link } from 'react-router';
import { ArrowLeftIcon } from './icons';

interface PageHeaderProps {
  title: ReactNode;
<<<<<<< HEAD
  /** 标题下一行说明（design/00 · .sub） */
  description?: ReactNode;
  /** 页面级主操作（右置，如「添加成员」） */
=======
  /** 页面级主操作（右置，如「新增用户」；一页至多一个 primary） */
>>>>>>> claude/exciting-shannon-u2nwwv
  extra?: ReactNode;
  /** 标题后的小计量标记（如记录数），不是解释性副文本 */
  meta?: ReactNode;
  /** 返回上一级：显示在标题左侧的图标按钮 */
  back?: { to: string; label: string };
}

<<<<<<< HEAD
/** 页面标题区：衬线标题 30 / 500，右侧主操作（design/00 · 页面模板） */
export function PageHeader({ title, description, extra }: PageHeaderProps) {
  return (
    <div className="hgxt-page-header">
      <div>
        <h1 className="hgxt-page-title">{title}</h1>
        {description ? <div className="hgxt-page-sub">{description}</div> : null}
=======
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
>>>>>>> claude/exciting-shannon-u2nwwv
      </div>
      {extra ? <div className="hg-page-extra">{extra}</div> : null}
    </div>
  );
}
