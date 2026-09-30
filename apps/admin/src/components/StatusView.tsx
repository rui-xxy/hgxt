import type { ReactNode } from 'react';

interface StatusViewProps {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** 语义色调：只在真实语义状态下使用 */
  tone?: 'neutral' | 'danger' | 'success';
  /** 占满视口（用于壳层之外的整页状态） */
  fullscreen?: boolean;
  /** 紧凑模式（用于表格空态等内嵌场景） */
  compact?: boolean;
}

/** 统一的状态页 / 空态：图标方块 + 标题 + 说明 + 操作，替代 AntD Result/Empty 的插画 */
export function StatusView({
  icon,
  title,
  description,
  actions,
  tone = 'neutral',
  fullscreen,
  compact,
}: StatusViewProps) {
  const className = ['hg-status', `hg-status-${tone}`, fullscreen ? 'hg-status-fullscreen' : '', compact ? 'hg-status-compact' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className}>
      <div className="hg-status-icon">{icon}</div>
      <div className="hg-status-title">{title}</div>
      {description ? <div className="hg-status-desc">{description}</div> : null}
      {actions ? <div className="hg-status-actions">{actions}</div> : null}
    </div>
  );
}
