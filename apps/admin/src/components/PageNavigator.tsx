import { useState } from 'react';

interface PageNavigatorProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

export function PageNavigator({ page, pageSize, total, onChange, disabled = false }: PageNavigatorProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const [editing, setEditing] = useState<{ page: number; value: string } | null>(null);
  const draft = editing?.page === currentPage ? editing.value : String(currentPage);

  const commit = (value: string) => {
    setEditing(null);
    if (disabled) return;
    const requested = Number.parseInt(value, 10);
    const next = Number.isNaN(requested) ? currentPage : Math.min(Math.max(1, requested), pageCount);
    if (next !== currentPage) onChange(next);
  };

  return <nav className="hgxt-page-nav" aria-label="分页">
    <button type="button" aria-label="上一页" disabled={disabled || currentPage === 1} onClick={() => onChange(currentPage - 1)}>‹ <span>上一页</span></button>
    <span className="hgxt-page-nav-position">
      第 <input aria-label="跳转页码" inputMode="numeric" pattern="[0-9]*" value={draft} disabled={disabled}
        onChange={(event) => setEditing({ page: currentPage, value: event.target.value.replace(/\D/g, '') })}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit(event.currentTarget.value); }
          if (event.key === 'Escape') { event.preventDefault(); setEditing(null); }
        }}
        onBlur={(event) => commit(event.currentTarget.value)} /> / {pageCount} 页
    </span>
    <button type="button" aria-label="下一页" disabled={disabled || currentPage === pageCount} onClick={() => onChange(currentPage + 1)}><span>下一页</span> ›</button>
  </nav>;
}

interface TablePageFooterProps extends PageNavigatorProps {
  onPageSizeChange: (pageSize: number) => void;
}

export function TablePageFooter({ page, pageSize, total, onChange, onPageSizeChange }: TablePageFooterProps) {
  if (total === 0) return null;
  const currentPage = Math.min(Math.max(1, page), Math.ceil(total / pageSize));
  return <div className="hgxt-table-pagination">
    <span className="hgxt-table-pagination-count">第 {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} 条 / 共 {total} 条</span>
    <select className="hgxt-table-page-size" aria-label="每页条数" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
      {[10, 20, 50, 100].map((size) => <option key={size} value={size}>每页 {size} 条</option>)}
    </select>
    {total > pageSize && <PageNavigator page={currentPage} pageSize={pageSize} total={total} onChange={onChange} />}
  </div>;
}
