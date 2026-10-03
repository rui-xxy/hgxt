import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Input, Popover } from 'antd';
import { Filter } from 'lucide-react';
import type { PlanTask } from '@hgxt/shared';
import { PageNavigator } from '../../components/PageNavigator';
import { pagedViewportStyle } from '../../styles/pagedViewport';
import {
  EMPTY_TASK_FILTERS, EMPTY_TASK_VALUE, TASK_PAGE_SIZE, filterPlanTasks,
  type TaskFilters, type TaskTab,
} from './planTasks';

type FilterColumn = 'status' | 'matter' | 'department' | 'importance' | 'owner' | 'dueDate' | 'progress' | 'completionNote';
const TASK_COLUMNS = '94px minmax(0,2fr) 130px 104px 110px 112px 110px minmax(0,1.4fr)';
const STATUS_LABELS: Record<PlanTask['status'], string> = {
  done: '已完成', late: '逾期', doing: '进行中', todo: '未开始',
};

function optionsFor(tasks: PlanTask[], field: 'importance' | 'progress') {
  const values = [...new Set(tasks.map((task) => task[field]))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  return values.map((value) => ({ value: value || EMPTY_TASK_VALUE, label: value || '未填写' }));
}

function FilterHeader({ label, active, open, onOpenChange, onClear, children }: {
  label: string;
  active: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClear: () => void;
  children: ReactNode;
}) {
  return <Popover trigger="click" placement="bottomLeft" open={open} onOpenChange={onOpenChange} content={
    <div className="plan-task-filter-panel">
      <strong>{label}筛选</strong>
      {children}
      <div className="plan-task-filter-actions">
        <button type="button" onClick={onClear} disabled={!active}>清除</button>
        <button type="button" onClick={() => onOpenChange(false)}>完成</button>
      </div>
    </div>
  }>
    <button type="button" className={`plan-task-filter-trigger${active ? ' is-active' : ''}`} aria-label={`筛选${label}`} aria-expanded={open}>
      <span>{label}</span><Filter size={14} strokeWidth={1.6} />
    </button>
  </Popover>;
}

function ChoiceList({ value, choices, onChange }: {
  value: string;
  choices: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return <div className="plan-task-filter-choices">
    {[{ value: '', label: '全部' }, ...choices].map((choice) =>
      <button key={choice.value} type="button" className={value === choice.value ? 'is-active' : ''} onClick={() => onChange(choice.value)}>
        {choice.label}
      </button>)}
  </div>;
}

export function PlanTasksTable({ tasks }: { tasks: PlanTask[] }) {
  const [tab, setTab] = useState<TaskTab>('week');
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [openFilter, setOpenFilter] = useState<FilterColumn | null>(null);
  const [page, setPage] = useState(1);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => filterPlanTasks(tasks, tab, filters), [tasks, tab, filters]);
  const tabTotal = useMemo(() => filterPlanTasks(tasks, tab, EMPTY_TASK_FILTERS).length, [tasks, tab]);
  const importanceOptions = useMemo(() => optionsFor(tasks, 'importance'), [tasks]);
  const progressOptions = useMemo(() => optionsFor(tasks, 'progress'), [tasks]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / TASK_PAGE_SIZE)));
  const pageRows = filtered.slice((currentPage - 1) * TASK_PAGE_SIZE, currentPage * TASK_PAGE_SIZE);
  const hasFilters = Object.values(filters).some(Boolean);
  const count = (predicate: (task: PlanTask) => boolean) => tasks.filter(predicate).length;

  useLayoutEffect(() => {
    if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0;
  }, [currentPage, tab, filters]);

  const update = (patch: Partial<TaskFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setPage(1);
  };
  const header = (column: FilterColumn, label: string, active: boolean, clear: () => void, content: ReactNode) =>
    <FilterHeader label={label} active={active} open={openFilter === column}
      onOpenChange={(open) => setOpenFilter(open ? column : null)} onClear={clear}>{content}</FilterHeader>;
  const textHeader = (column: 'matter' | 'department' | 'owner' | 'completionNote', label: string) =>
    header(column, label, Boolean(filters[column]), () => update({ [column]: '' }),
      <Input allowClear placeholder={`搜索${label}`} value={filters[column]} onChange={(event) => update({ [column]: event.target.value })} />);

  return <div className="card enter d5 plan-tasks-card">
    <div className="ct plan-tasks-title">
      <b>事项</b>
      <div className="tbtabs" role="tablist" aria-label="事项范围">
        {([
          ['week', `本周 ${count((task) => task.period === '本周')}`],
          ['next', `下周 ${count((task) => task.period === '下周')}`],
          ['late', `逾期 ${count((task) => task.status === 'late')}`],
        ] as [TaskTab, string][]).map(([key, label]) =>
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''}
            onClick={() => { setTab(key); setPage(1); setOpenFilter(null); }}>{label}</button>)}
      </div>
      {hasFilters && <button type="button" className="plan-task-clear-all" onClick={() => { setFilters(EMPTY_TASK_FILTERS); setPage(1); setOpenFilter(null); }}>清除筛选</button>}
    </div>
    <div className="plan-task-table-scroll hgxt-paged-viewport" ref={tableScrollRef} style={pagedViewportStyle(TASK_PAGE_SIZE, 44, 34)}>
      <div className="plan-task-table-inner">
        <div className="trow th plan-task-table-head" style={{ gridTemplateColumns: TASK_COLUMNS }}>
          {header('status', '状态', Boolean(filters.status), () => update({ status: '' }),
            <ChoiceList value={filters.status} choices={(Object.entries(STATUS_LABELS) as [PlanTask['status'], string][]).map(([value, label]) => ({ value, label }))}
              onChange={(value) => { update({ status: value as TaskFilters['status'] }); setOpenFilter(null); }} />)}
          {textHeader('matter', '事项')}
          {textHeader('department', '部门')}
          {header('importance', '重要程度', Boolean(filters.importance), () => update({ importance: '' }),
            <ChoiceList value={filters.importance} choices={importanceOptions} onChange={(value) => { update({ importance: value }); setOpenFilter(null); }} />)}
          {textHeader('owner', '负责人')}
          {header('dueDate', '计划完成', Boolean(filters.dueFrom || filters.dueTo), () => update({ dueFrom: '', dueTo: '' }),
            <div className="plan-task-date-filter">
              <label>起始日期<Input type="date" value={filters.dueFrom} onChange={(event) => update({ dueFrom: event.target.value })} /></label>
              <label>结束日期<Input type="date" value={filters.dueTo} onChange={(event) => update({ dueTo: event.target.value })} /></label>
            </div>)}
          {header('progress', '进度', Boolean(filters.progress), () => update({ progress: '' }),
            <ChoiceList value={filters.progress} choices={progressOptions} onChange={(value) => { update({ progress: value }); setOpenFilter(null); }} />)}
          {textHeader('completionNote', '完成情况说明')}
        </div>
        {pageRows.length ? pageRows.map((task, index) => <div className="trow" key={`${currentPage}-${index}-${task.matter}`} style={{ gridTemplateColumns: TASK_COLUMNS }}>
          <div><span className={`st ${task.status === 'done' ? 'st-ok' : task.status === 'late' ? 'st-bad' : task.status === 'doing' ? 'st-warn' : 'st-mute'}`}>{STATUS_LABELS[task.status]}</span></div>
          <span className="plan-task-wrap" style={{ fontWeight: 500 }}>{task.matter}</span>
          <span className="muted plan-task-truncate" title={task.department}>{task.department || '—'}</span>
          <span className="muted plan-task-truncate" title={task.importance}>{task.importance || '—'}</span>
          <span className="plan-task-truncate" title={task.owner}>{task.owner || '—'}</span>
          <span className="num">{task.dueDate?.slice(5) ?? '—'}</span>
          <span className="muted plan-task-truncate" title={task.progress}>{task.progress || '—'}</span>
          <span className="faint plan-task-wrap">{task.completionNote || '—'}</span>
        </div>) : <div className="empty plan-task-empty">{hasFilters ? '没有符合筛选条件的事项' : '暂无事项'}</div>}
      </div>
    </div>
    <div className="plan-task-footer">
      <span>{filtered.length ? `第 ${(currentPage - 1) * TASK_PAGE_SIZE + 1}–${Math.min(currentPage * TASK_PAGE_SIZE, filtered.length)} 条 / 共 ${filtered.length} 条` : '共 0 条'}{hasFilters ? ` · 筛选前 ${tabTotal} 条` : ''}</span>
      {filtered.length > TASK_PAGE_SIZE && <PageNavigator page={currentPage} pageSize={TASK_PAGE_SIZE} total={filtered.length} onChange={setPage} />}
    </div>
  </div>;
}
