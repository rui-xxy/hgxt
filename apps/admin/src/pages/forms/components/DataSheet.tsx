import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Empty, Input, Modal, Popconfirm, Segmented, Select, Space } from 'antd';
import { DownloadIcon, PlusIcon, SaveIcon, TrashIcon, UndoIcon } from '../../../components/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parseDepartmentNames, type FormData, type FormField, type FormSubmissionDTO, type SaveFormSubmissionsBody } from '@hgxt/shared';
import { saveSubmissions } from '../../../api/forms';
import { PageNavigator } from '../../../components/PageNavigator';
import { pagedViewportStyle } from '../../../styles/pagedViewport';
import { ParkingEditor } from './ParkingEditor';
import { parseParking, serializeParking } from './parking';
import { cellValuesEqual, displaySheetCell, parseSheetCell, sheetDataEqual } from './sheetValues';

interface SheetRow { key: string; id?: string; data: FormData; original: FormData; }
interface Cell { key: string; col: number; }
interface Props { formId: string; formTitle: string; parkingEnabled: boolean; schema: FormField[]; submissions: FormSubmissionDTO[]; total: number; page?: number; pageSize?: number; disableAdd?: boolean; showLiveRemaining?: boolean; sectioned?: boolean; onPageChange?: (page: number) => void; onDirtyChange?: (dirty: boolean) => void; scrollPositionRef: { current: { left: number; top: number } }; }

const rowNoWidth = 48;
const parkingWidth = 118;
const actionWidth = 64;
const dateWidth = 128;
const remainingWidth = 116;
const rowHeight = 44;
const sectionedHeaderHeight = 68;
const virtualOverscan = 4;
const virtualStep = 4;

function currentRemaining(value: FormData[string] | undefined): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—';
  const [year, month, day] = value.split('-').map(Number);
  const due = Date.UTC(year, month - 1, day);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due - today) / 86_400_000);
  return days === 0 ? '今天' : days > 0 ? `${days}天后` : `${-days}天前`;
}

/** 主日期字段 = schema 中第一个必填 date 字段；可选日期不作为日报归属日 */
function primaryDateField(schema: FormField[]): FormField | undefined {
  return schema.find((field) => field.type === 'date' && field.required);
}

/** 现有数据里主日期的最大值 + 1 天（日报场景逐日递增；无数据/无日期字段则为今天） */
function nextDate(schema: FormField[], submissions: FormSubmissionDTO[]): string {
  const primary = primaryDateField(schema);
  const today = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  if (!primary) return today();
  let max = '';
  for (const item of submissions) {
    const value = item.data[primary.id];
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value > max) max = value;
  }
  if (!max) return today();
  const next = new Date(`${max}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** 同一类别下相同的大标题集中显示，避免后面的补充字段再次生成一组同名表头。 */
function groupBySubgroup(fields: FormField[]): FormField[] {
  const groups = new Map<string, FormField[]>();
  for (const field of fields) {
    const name = field.subgroup ?? '其他';
    const group = groups.get(name) ?? [];
    group.push(field);
    groups.set(name, group);
  }
  return [...groups.values()].flat();
}

export function DataSheet({ formId, formTitle, parkingEnabled, schema, submissions, total, page = 1, pageSize = 1000, disableAdd = false, showLiveRemaining = false, sectioned = false, onPageChange, onDirtyChange, scrollPositionRef }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const initial = useMemo(() => submissions.map((item): SheetRow => ({ key: item.id, id: item.id, data: { ...item.data }, original: { ...item.data } })), [submissions]);
  const [rows, setRows] = useState<SheetRow[]>(initial);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [editing, setEditing] = useState<Cell | null>(null);
  const [draft, setDraft] = useState('');
  const [parkingKey, setParkingKey] = useState<string | null>(null);
  const [notesEditor, setNotesEditor] = useState<{ rowKey: string; value: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [virtualViewportHeight, setVirtualViewportHeight] = useState(440);
  const [virtualStart, setVirtualStart] = useState(0);
  const primary = useMemo(() => primaryDateField(schema), [schema]);
  const sections = useMemo(() => [...new Set(schema.filter((field) => field.id !== primary?.id).map((field) => field.group ?? '其他'))], [schema, primary]);
  const [activeSection, setActiveSection] = useState(sections[0] ?? '');
  const section = sections.includes(activeSection) ? activeSection : sections[0] ?? '';
  const categories = useMemo(() => [...new Set(schema.filter((field) => field.group === section && field.id !== primary?.id).map((field) => field.section ?? '其他'))], [schema, section, primary]);
  const [activeCategory, setActiveCategory] = useState('');
  const category = categories.includes(activeCategory) ? activeCategory : categories[0] ?? '';
  const visibleSchema = useMemo(() => sectioned
    ? [primary, ...groupBySubgroup(schema.filter((field) => field.group === section && (field.section ?? '其他') === category && field.id !== primary?.id))].filter((field): field is FormField => !!field)
    : schema, [primary, schema, section, category, sectioned]);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const activeCellRef = useRef<HTMLTableCellElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const suppressBlur = useRef(false);
  const rowsRef = useRef(rows);
  const includeParking = parkingEnabled;
  const leadingWidth = rowNoWidth + actionWidth + (includeParking ? parkingWidth : 0);
  const fieldWidths = visibleSchema.map((field) => field.type === 'date' ? dateWidth : field.width ?? (sectioned ? 150 : 100));
  const groups = visibleSchema.reduce<{ title: string; count: number }[]>((current, field) => {
    const title = field.subgroup ?? field.group ?? '其他';
    if (current.at(-1)?.title === title) current[current.length - 1].count += 1;
    else current.push({ title, count: 1 });
    return current;
  }, []);
  const dataFields = sectioned ? visibleSchema.slice(1) : [];
  const columnGroups = (fields: FormField[], titleOf: (field: FormField) => string, keyOf = titleOf) => fields.reduce<{ key: string; title: string; count: number; start: number }[]>((current, field, index) => {
    const key = keyOf(field);
    if (current.at(-1)?.key === key) current[current.length - 1].count += 1;
    else current.push({ key, title: titleOf(field), count: 1, start: index });
    return current;
  }, []);
  const productGroups = columnGroups(dataFields, (field) => field.subgroup ?? '其他');
  const mergedHeaderFields = new Set(productGroups.filter((group) => group.count === 1 &&
    group.title.trim() === dataFields[group.start].title.trim()).map((group) => dataFields[group.start].id));
  let groupIndex = 0;
  const groupIndexes = visibleSchema.map((field, index) => {
    if (index > 0 && `${field.section ?? ''}:${field.subgroup ?? field.group ?? '其他'}` !== `${visibleSchema[index - 1].section ?? ''}:${visibleSchema[index - 1].subgroup ?? visibleSchema[index - 1].group ?? '其他'}`) groupIndex++;
    return groupIndex;
  });
  const parkingRow = rows.find((row) => row.key === parkingKey);
  const stats = useMemo(() => ({
    created: rows.filter((row) => !row.id).length,
    updated: rows.filter((row) => row.id && !sheetDataEqual(schema, row.data, row.original)).length,
    deleted: deleted.length,
  }), [rows, schema, deleted]);
  const virtualCount = Math.ceil(virtualViewportHeight / rowHeight) + virtualOverscan * 2 + virtualStep;
  const renderStart = sectioned ? Math.min(virtualStart, Math.max(0, rows.length - virtualCount)) : 0;
  const renderEnd = sectioned ? Math.min(rows.length, renderStart + virtualCount) : rows.length;
  const renderedRows = sectioned ? rows.slice(renderStart, renderEnd) : rows;
  const tableColSpan = visibleSchema.length + (includeParking ? 3 : 2) + (showLiveRemaining ? 1 : 0);
  const editRow = editing && rows.find((row) => row.key === editing.key);
  const pendingField = editing && visibleSchema[editing.col];
  const pendingValue = pendingField ? parseSheetCell(pendingField, draft) : null;
  const pendingEdit = !!editing && !!editRow && !!pendingField && draft !== displaySheetCell(editRow.data[pendingField.id]) && !!pendingValue &&
    ('error' in pendingValue || !cellValuesEqual(pendingField, editRow.data[pendingField.id], pendingValue.value));
  const dirty = stats.created + stats.updated + stats.deleted > 0 || pendingEdit;
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  const mutation = useMutation({
    mutationFn: (body: SaveFormSubmissionsBody) => saveSubmissions(formId, body),
    onSuccess: async () => {
      setSaved(true);
      message.success('表格修改已保存');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['forms', formId, 'submissions'] }),
        queryClient.invalidateQueries({ queryKey: ['forms', formId] }),
        queryClient.invalidateQueries({ queryKey: ['forms', 'list'] }),
        queryClient.invalidateQueries({ queryKey: ['production', 'sulfuric-control'] }),
      ]);
    },
    onError: (error) => message.error(error.message),
  });

  const replaceRows = (next: SheetRow[]) => { rowsRef.current = next; setRows(next); };
  const commit = (cell: Cell, value: string) => {
    const field = visibleSchema[cell.col];
    const current = rowsRef.current;
    const row = current.find((item) => item.key === cell.key);
    if (!row || displaySheetCell(row.data[field.id]) === value) return true;
    const parsed = parseSheetCell(field, value);
    if ('error' in parsed) { message.warning(parsed.error); return false; }
    if (cellValuesEqual(field, row.data[field.id], parsed.value)) return true;
    replaceRows(current.map((item) => item.key === cell.key ? { ...item, data: { ...item.data, [field.id]: parsed.value } } : item));
    setSaved(false);
    return true;
  };
  const enter = (key: string, col: number) => {
    const index = rowsRef.current.findIndex((item) => item.key === key);
    const row = rowsRef.current[index];
    if (!row) return;
    if (sectioned && (index < renderStart || index >= renderEnd)) setVirtualStart(Math.max(0, index - virtualOverscan));
    setDraft(row.data[visibleSchema[col].id] == null ? '' : String(row.data[visibleSchema[col].id]));
    setEditing({ key, col });
  };
  const switchTo = (cell: Cell) => {
    if (editing?.key === cell.key && editing.col === cell.col) return;
    if (editing && !commit(editing, draft)) { inputRef.current?.focus({ preventScroll: true }); return; }
    suppressBlur.current = true;
    enter(cell.key, cell.col);
    window.setTimeout(() => { suppressBlur.current = false; }, 0);
  };
  const move = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (!editing) return;
    const current = rowsRef.current;
    const index = current.findIndex((row) => row.key === editing.key);
    if (index < 0) return;
    const nextIndex = Math.max(0, Math.min(current.length - 1, index + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0)));
    const nextCol = Math.max(0, Math.min(visibleSchema.length - 1, editing.col + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0)));
    if (nextIndex === index && nextCol === editing.col) { commit(editing, draft); return; }
    switchTo({ key: current[nextIndex].key, col: nextCol });
  };
  const finishEditing = (cell: Cell) => {
    if (suppressBlur.current) return;
    if (commit(cell, draft)) setEditing(null);
    else window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
  };
  const handleCellKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      suppressBlur.current = true;
      setEditing(null);
      window.setTimeout(() => { suppressBlur.current = false; }, 0);
      return;
    }
    if (['Enter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      move(event.key === 'Enter' || event.key === 'ArrowDown' ? 'down'
        : event.key === 'ArrowUp' ? 'up'
          : event.key === 'ArrowLeft' || (event.key === 'Tab' && event.shiftKey) ? 'left' : 'right');
    }
  };
  useLayoutEffect(() => {
    if (sectioned) {
      const firstVisible = Math.max(0, Math.floor((scrollPositionRef.current.top - sectionedHeaderHeight) / rowHeight));
      setVirtualStart(Math.max(0, Math.floor((firstVisible - virtualOverscan) / virtualStep) * virtualStep));
    }
    scrollRef.current?.scrollTo(scrollPositionRef.current);
  }, [scrollPositionRef, sectioned]);
  useLayoutEffect(() => {
    if (!sectioned || !scrollRef.current) return;
    const scroll = scrollRef.current;
    const measure = () => setVirtualViewportHeight((height) => scroll.clientHeight > 0 ? scroll.clientHeight : height);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [sectioned]);
  useLayoutEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    const scroll = scrollRef.current;
    input?.focus({ preventScroll: true });
    if (!scroll) return;
    const cell = activeCellRef.current;
    if (!cell) return;
    const scrollBounds = scroll.getBoundingClientRect();
    let cellBounds = cell.getBoundingClientRect();
    if (editing.col > 0) {
      const frozenRight = scroll.querySelector('thead .forms-sheet-date')?.getBoundingClientRect().right ?? scrollBounds.left + leadingWidth;
      const visibleLeft = frozenRight + 4;
      const visibleRight = scrollBounds.left + scroll.clientWidth - 4;
      if (cellBounds.left < visibleLeft) scroll.scrollLeft -= visibleLeft - cellBounds.left;
      else if (cellBounds.right > visibleRight) scroll.scrollLeft += cellBounds.right - visibleRight;
      cellBounds = cell.getBoundingClientRect();
    }
    const headerBottom = scroll.querySelector('thead th[rowspan]')?.getBoundingClientRect().bottom ?? scrollBounds.top + 68;
    if (cellBounds.top < headerBottom + 4) scroll.scrollTop -= headerBottom + 4 - cellBounds.top;
    else if (cellBounds.bottom > scrollBounds.top + scroll.clientHeight - 4) {
      scroll.scrollTop += cellBounds.bottom - (scrollBounds.top + scroll.clientHeight - 4);
    }
  }, [editing, leadingWidth]);
  const addRow = () => {
    if (mutation.isPending) return;
    const key = `new-${crypto.randomUUID()}`;
    // 主日期字段自动填「最大日期 + 1 天」，其余字段按类型置空；无日期字段则不填
    const primary = primaryDateField(schema);
    const dateValue = nextDate(schema, submissions);
    const data = Object.fromEntries(schema.map((field) => [field.id, field.type === 'date' ? field.required ? dateValue : null : field.type === 'number' ? null : ''])) as FormData;
    const firstEntry = visibleSchema.findIndex((field) => field.id !== primary?.id);
    const col = firstEntry < 0 ? 0 : firstEntry;
    replaceRows([{ key, data, original: { ...data } }, ...rowsRef.current]);
    setVirtualStart(0);
    setDraft(String(data[visibleSchema[col].id] ?? ''));
    setEditing({ key, col });
    scrollRef.current?.scrollTo({ top: 0 });
    setSaved(false);
  };
  const removeRow = (row: SheetRow) => {
    if (mutation.isPending) return;
    if (row.id) setDeleted((current) => [...current, row.id!]);
    replaceRows(rowsRef.current.filter((item) => item.key !== row.key));
    if (editing?.key === row.key) setEditing(null);
    setSaved(false);
  };
  const reset = () => { if (mutation.isPending) return; replaceRows(initial); setDeleted([]); setEditing(null); setParkingKey(null); setSaved(false); };
  const save = () => {
    if (mutation.isPending) return;
    if (editing && !commit(editing, draft)) return;
    setEditing(null);
    const nextRows = rowsRef.current;
    // 主日期字段存在才要求每行日期有效（无日期字段的表单直接放行）
    const primary = primaryDateField(schema);
    if (primary && nextRows.some((row) => typeof row.data[primary.id] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.data[primary.id] as string))) {
      message.warning(`请先填写每行有效的${primary.title}`); return;
    }
    mutation.mutate({
      created: nextRows.filter((row) => !row.id).map((row) => row.data),
      updated: nextRows.filter((row) => row.id && !sheetDataEqual(schema, row.data, row.original)).map((row) => ({ id: row.id!, data: row.data })),
      deleted,
    });
  };
  const switchSection = (nextSection: string) => {
    if (editing && !commit(editing, draft)) return;
    setEditing(null);
    setActiveSection(nextSection);
    setActiveCategory(schema.find((field) => field.group === nextSection && field.id !== primary?.id)?.section ?? '其他');
    setVirtualStart(0);
    scrollPositionRef.current = { left: 0, top: 0 };
    scrollRef.current?.scrollTo({ left: 0, top: 0 });
  };
  const switchCategory = (nextCategory: string) => {
    if (editing && !commit(editing, draft)) return;
    setEditing(null);
    setActiveCategory(nextCategory);
    setVirtualStart(0);
    scrollPositionRef.current = { left: 0, top: 0 };
    scrollRef.current?.scrollTo({ left: 0, top: 0 });
  };
  const exportCsv = () => {
    if (mutation.isPending) return;
    if (editing && !commit(editing, draft)) return;
    const exportFields = sectioned ? visibleSchema : schema;
    const headers = [...(includeParking ? ['停车记录'] : []), ...exportFields.map((field) => field.title)];
    const lines = rowsRef.current.map((row) => [...(includeParking ? [String(row.data.parkingRecords ?? '')] : []), ...exportFields.map((field) => displaySheetCell(row.data[field.id]))]);
    const escape = (value: string) => /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    const csv = [headers, ...lines].map((line) => line.map(escape).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${formTitle}${sectioned ? `_${section}_${category}` : ''}_${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const handleScroll = (scroll: HTMLDivElement) => {
    scrollPositionRef.current = { left: scroll.scrollLeft, top: scroll.scrollTop };
    if (!sectioned) return;
    const firstVisible = Math.max(0, Math.floor((scroll.scrollTop - sectionedHeaderHeight) / rowHeight));
    const nextStart = Math.max(0, Math.floor((firstVisible - virtualOverscan) / virtualStep) * virtualStep);
    if (nextStart === virtualStart) return;
    if (editing) {
      const editIndex = rowsRef.current.findIndex((row) => row.key === editing.key);
      if (editIndex < nextStart || editIndex >= nextStart + virtualCount) {
        if (!commit(editing, draft)) {
          scroll.scrollTop = Math.max(0, sectionedHeaderHeight + editIndex * rowHeight - rowHeight);
          inputRef.current?.focus({ preventScroll: true });
          return;
        }
        setEditing(null);
      }
    }
    setVirtualStart(nextStart);
  };

  return <div className="forms-sheet">
    {sectioned && <div className="forms-sheet-section-tabs">
      {sections.length > 1 && <div className="forms-sheet-section-nav"><Segmented aria-label={`${formTitle}分区`} value={section} options={sections} onChange={(value) => switchSection(String(value))} /></div>}
      {categories.length > 1 && <div className="forms-sheet-section-nav"><Segmented aria-label={`${formTitle}类别`} value={category} options={categories} onChange={(value) => switchCategory(String(value))} /></div>}
    </div>}
    <div className="forms-sheet-toolbar">
      <Space size="small"><Button icon={<PlusIcon width={16} height={16} />} disabled={mutation.isPending || disableAdd || (!!onPageChange && page > 1)} onClick={addRow}>新增行</Button><Button type="text" icon={<DownloadIcon width={16} height={16} />} disabled={!rows.length || mutation.isPending} onClick={exportCsv}>{sectioned ? '导出当前表 CSV' : onPageChange ? '导出本页 CSV' : '导出 CSV'}</Button></Space>
      <Space size="middle" wrap>
        {dirty && <span className="forms-unsaved">有未保存的更改{stats.created ? ` · 新增 ${stats.created}` : ''}{stats.updated ? ` · 修改 ${stats.updated}` : ''}{stats.deleted ? ` · 删除 ${stats.deleted}` : ''}</span>}
        {saved && !dirty && <span className="forms-saved">已保存</span>}
        {dirty && <Button type="text" icon={<UndoIcon width={16} height={16} />} disabled={mutation.isPending} onClick={reset}>撤销</Button>}
        <Button type={dirty ? 'primary' : 'default'} icon={<SaveIcon width={16} height={16} />} disabled={!dirty} loading={mutation.isPending} onClick={save}>保存修改</Button>
      </Space>
    </div>
    {total > submissions.length && <div className="forms-sheet-notice">{onPageChange ? `当前显示第 ${(page - 1) * pageSize + 1}—${(page - 1) * pageSize + submissions.length} 条，共 ${total} 条记录。${dirty ? '请先保存或撤销本页修改，再翻页。' : ''}` : `当前显示最近 ${submissions.length} 条，共 ${total} 条记录。`}</div>}
    <div className={`forms-sheet-scroll${onPageChange && total > pageSize ? ' hgxt-paged-viewport' : ''}`} style={onPageChange && total > pageSize ? pagedViewportStyle(pageSize, rowHeight, sectioned ? sectionedHeaderHeight : 68) : undefined} ref={scrollRef} aria-busy={mutation.isPending} onScroll={(event) => handleScroll(event.currentTarget)}>
      <table className={`forms-sheet-table${sectioned ? ' forms-sheet-sectioned' : ''}`} style={{ minWidth: leadingWidth + fieldWidths.reduce((a, b) => a + b, 0) + (showLiveRemaining ? remainingWidth : 0) }}>
        <colgroup><col style={{ width: rowNoWidth }} />{includeParking && <col style={{ width: parkingWidth }} />}<col style={{ width: actionWidth }} />{fieldWidths.map((width, index) => <col key={visibleSchema[index].id} style={{ width }} />)}{showLiveRemaining && <col style={{ width: remainingWidth }} />}</colgroup>
        <thead>{sectioned ? <>
          <tr>
            <th className="forms-sheet-sticky forms-sheet-sticky-0" rowSpan={2}>#</th>
            {includeParking && <th className="forms-sheet-sticky" style={{ left: rowNoWidth }} rowSpan={2}>停车记录</th>}
            <th className="forms-sheet-sticky" style={{ left: rowNoWidth + (includeParking ? parkingWidth : 0) }} rowSpan={2}>操作</th>
            <th className="forms-sheet-sticky forms-sheet-date" style={{ left: leadingWidth, width: dateWidth, minWidth: dateWidth }} rowSpan={2}>日期</th>
            {productGroups.map((group, index) => {
              const field = dataFields[group.start];
              const merged = group.count === 1 && mergedHeaderFields.has(field.id);
              return <th key={`${group.key}-${group.start}`} colSpan={group.count} rowSpan={merged ? 2 : undefined} className={`forms-sheet-group forms-sheet-product-tone-${index % 2}`} title={group.title}>{group.title}{merged && field.unit && <small>{field.unit}</small>}</th>;
            })}
            {showLiveRemaining && <th rowSpan={2}>当前剩余</th>}
          </tr><tr>
            {dataFields.map((field, index) => mergedHeaderFields.has(field.id) ? null : <th key={field.id} title={field.title} className={`forms-sheet-field forms-sheet-tone-${groupIndexes[index + 1] % 2}`} style={{ width: fieldWidths[index + 1], minWidth: fieldWidths[index + 1] }}>{field.title}{field.unit && <small>{field.unit}</small>}</th>)}
          </tr>
        </> : <><tr>
          <th className="forms-sheet-sticky forms-sheet-sticky-0" rowSpan={2}>#</th>
          {includeParking && <th className="forms-sheet-sticky" style={{ left: rowNoWidth }} rowSpan={2}>停车记录</th>}
          <th className="forms-sheet-sticky" style={{ left: rowNoWidth + (includeParking ? parkingWidth : 0) }} rowSpan={2}>操作</th>
          {groups.map((group, index) => <th key={`${group.title}-${index}`} colSpan={group.count} title={group.title} className={`forms-sheet-group forms-sheet-tone-${index % 2}`}>{group.count > 1 ? group.title : ''}</th>)}
          {showLiveRemaining && <th className="forms-sheet-group" colSpan={1}>时间</th>}
        </tr><tr>
          {visibleSchema.map((field, index) => <th key={field.id} title={field.title} className={`forms-sheet-field forms-sheet-tone-${groupIndexes[index] % 2} ${index === 0 ? 'forms-sheet-sticky forms-sheet-date' : ''}`} style={{ ...(index === 0 ? { left: leadingWidth } : {}), width: fieldWidths[index], minWidth: fieldWidths[index] }}>{field.title}{field.unit && <small>{field.unit}</small>}</th>)}
          {showLiveRemaining && <th className="forms-sheet-field" style={{ width: remainingWidth, minWidth: remainingWidth }}>当前剩余</th>}
        </tr></>}</thead>
        <tbody>
          {!rows.length && <tr><td className="forms-sheet-empty" colSpan={tableColSpan}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据，点击「新增行」开始录入" /></td></tr>}
          {sectioned && renderStart > 0 && <tr className="forms-sheet-spacer" style={{ height: renderStart * rowHeight }}><td colSpan={tableColSpan} style={{ height: renderStart * rowHeight }} /></tr>}
          {renderedRows.map((row, renderedIndex) => {
            const index = renderStart + renderedIndex;
            return <tr key={row.key}>
            <td className="forms-sheet-sticky forms-sheet-sticky-0 forms-sheet-rowno">{onPageChange ? (page - 1) * pageSize + index + 1 : index + 1}</td>
            {includeParking && <td className="forms-sheet-sticky forms-sheet-parking" style={{ left: rowNoWidth }}><Button size="small" disabled={mutation.isPending} onClick={() => setParkingKey(row.key)}>{parseParking(row.data.parkingRecords, String(row.data[primaryDateField(schema)?.id ?? ''] ?? '')).length ? `${parseParking(row.data.parkingRecords, String(row.data[primaryDateField(schema)?.id ?? ''] ?? '')).length} 条记录` : '无记录'}</Button></td>}
            <td className="forms-sheet-sticky forms-sheet-action" style={{ left: rowNoWidth + (includeParking ? parkingWidth : 0) }}><Popconfirm title="删除这行数据？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => removeRow(row)}><Button type="text" size="small" danger disabled={mutation.isPending} aria-label={`删除第 ${index + 1} 行`} icon={<TrashIcon width={16} height={16} />} /></Popconfirm></td>
            {visibleSchema.map((field, col) => {
              const active = editing?.key === row.key && editing.col === col;
              const changed = !!row.id && !cellValuesEqual(field, row.data[field.id], row.original[field.id]);
              return <td key={field.id} ref={active ? activeCellRef : undefined} title={displaySheetCell(row.data[field.id])} className={`forms-sheet-cell forms-sheet-tone-${groupIndexes[col] % 2} ${col === 0 ? 'forms-sheet-sticky forms-sheet-date' : ''} ${changed ? 'forms-sheet-changed' : ''} ${active ? 'forms-sheet-active' : ''}`} style={col === 0 ? { left: leadingWidth } : undefined} onPointerDown={(event) => { if (!active && !mutation.isPending) { event.preventDefault(); if (field.id === 'field_notes') setNotesEditor({ rowKey: row.key, value: displaySheetCell(row.data[field.id]) }); else switchTo({ key: row.key, col }); } }}>
                {active ? field.multiple && field.options
                  ? <Select mode="multiple" autoFocus defaultOpen showSearch optionFilterProp="label" aria-label={`第 ${index + 1} 行 ${field.title}`} className="forms-sheet-multiselect" popupMatchSelectWidth={false} maxTagCount={1} placeholder="选择部门" disabled={mutation.isPending} value={parseDepartmentNames(draft)} options={field.options} onChange={(values) => setDraft(values.join(','))} onBlur={() => finishEditing({ key: row.key, col })} />
                  : field.type === 'select'
                  ? <select ref={inputRef as React.RefObject<HTMLSelectElement>} aria-label={`第 ${index + 1} 行 ${field.title}`} disabled={mutation.isPending} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => finishEditing({ key: row.key, col })} onKeyDown={handleCellKeyDown}><option value="">请选择</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  : <input ref={inputRef as React.RefObject<HTMLInputElement>} aria-label={`第 ${index + 1} 行 ${field.title}`} disabled={mutation.isPending} type={field.type === 'date' ? 'date' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} value={draft} onInput={(e) => setDraft(e.currentTarget.value)} onChange={(e) => setDraft(e.target.value)} onBlur={() => finishEditing({ key: row.key, col })} onKeyDown={handleCellKeyDown} />
                  : <span>{displaySheetCell(row.data[field.id]) || '\u00a0'}</span>}
              </td>;
            })}
            {showLiveRemaining && <td className="forms-sheet-computed">{currentRemaining(row.data.dueDate)}</td>}
          </tr>;
          })}
          {sectioned && renderEnd < rows.length && <tr className="forms-sheet-spacer" style={{ height: (rows.length - renderEnd) * rowHeight }}><td colSpan={tableColSpan} style={{ height: (rows.length - renderEnd) * rowHeight }} /></tr>}
        </tbody>
      </table>
    </div>
    {onPageChange && total > pageSize && <div className="forms-sheet-pagination"><PageNavigator page={page} pageSize={pageSize} total={total} disabled={dirty || mutation.isPending} onChange={onPageChange} /></div>}
    {parkingRow && <ParkingEditor key={parkingRow.key} initial={parseParking(parkingRow.data.parkingRecords, String(parkingRow.data[primaryDateField(schema)?.id ?? ''] ?? ''))} date={String(parkingRow.data[primaryDateField(schema)?.id ?? ''] ?? '')} onClose={() => setParkingKey(null)} onSave={(records) => { const value = serializeParking(records); if (value !== parkingRow.data.parkingRecords) { replaceRows(rowsRef.current.map((row) => row.key === parkingRow.key ? { ...row, data: { ...row.data, parkingRecords: value } } : row)); setSaved(false); } setParkingKey(null); }} />}
    <Modal title={schema.find((field) => field.id === 'field_notes')?.title ?? '备注'} open={!!notesEditor} okText="确定" cancelText="取消" onCancel={() => setNotesEditor(null)} onOk={() => {
      if (!notesEditor) return;
      const field = schema.find((item) => item.id === 'field_notes');
      if (!field) return;
      const parsed = parseSheetCell(field, notesEditor.value);
      if ('error' in parsed) { message.warning(parsed.error); return; }
      replaceRows(rowsRef.current.map((row) => row.key === notesEditor.rowKey ? { ...row, data: { ...row.data, field_notes: parsed.value } } : row));
      setSaved(false);
      setNotesEditor(null);
    }}>
      <Input.TextArea rows={10} maxLength={1000} showCount value={notesEditor?.value ?? ''} onChange={(event) => setNotesEditor((current) => current ? { ...current, value: event.target.value } : null)} />
    </Modal>
  </div>;
}

