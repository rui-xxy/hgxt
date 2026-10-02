import { useLayoutEffect, useMemo, useRef, useState } from 'react';
<<<<<<< HEAD
import { App, Button, Empty, Popconfirm, Space } from 'antd';
import { Download, Plus, Save, Trash2, Undo2 } from 'lucide-react';
=======
import { App, Button, Popconfirm, Tooltip } from 'antd';
import { CheckIcon, DownloadIcon, PauseCircleIcon, PlusIcon, SaveIcon, TableIcon, TrashIcon, UndoIcon } from '../../../components/icons';
import { StatusView } from '../../../components/StatusView';
>>>>>>> claude/exciting-shannon-u2nwwv
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormData, FormField, FormSubmissionDTO, SaveFormSubmissionsBody } from '@hgxt/shared';
import { saveSubmissions } from '../../../api/forms';
import { ParkingEditor } from './ParkingEditor';
import { parseParking, serializeParking } from './parking';
import { cellValuesEqual, displaySheetCell, parseSheetCell, sheetDataEqual } from './sheetValues';

interface SheetRow { key: string; id?: string; data: FormData; original: FormData; }
interface Cell { key: string; col: number; }
interface Props { formId: string; formTitle: string; parkingEnabled: boolean; schema: FormField[]; submissions: FormSubmissionDTO[]; total: number; scrollPositionRef: { current: { left: number; top: number } }; }

const rowNoWidth = 48;
const parkingWidth = 118;
const actionWidth = 64;
const dateWidth = 128;

/** 主日期字段 = schema 中第一个 date 字段（数据归属日期）；无 date 字段的表单返回 undefined */
function primaryDateField(schema: FormField[]): FormField | undefined {
  return schema.find((field) => field.type === 'date');
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

export function DataSheet({ formId, formTitle, parkingEnabled, schema, submissions, total, scrollPositionRef }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const initial = useMemo(() => submissions.map((item): SheetRow => ({ key: item.id, id: item.id, data: { ...item.data }, original: { ...item.data } })), [submissions]);
  const [rows, setRows] = useState<SheetRow[]>(initial);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [editing, setEditing] = useState<Cell | null>(null);
  const [draft, setDraft] = useState('');
  const [parkingKey, setParkingKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const suppressBlur = useRef(false);
  const rowsRef = useRef(rows);
  const includeParking = parkingEnabled;
  const leadingWidth = rowNoWidth + actionWidth + (includeParking ? parkingWidth : 0);
  const fieldWidths = useMemo(() => schema.map((field) => field.type === 'date' ? dateWidth : field.width ?? 100), [schema]);
  const groups = schema.reduce<{ title: string; count: number }[]>((current, field) => {
    const title = field.group ?? '其他';
    if (current.at(-1)?.title === title) current[current.length - 1].count += 1;
    else current.push({ title, count: 1 });
    return current;
  }, []);
  let groupIndex = 0;
  const groupIndexes = schema.map((field, index) => {
    if (index > 0 && (field.group ?? '其他') !== (schema[index - 1].group ?? '其他')) groupIndex++;
    return groupIndex;
  });
  const parkingRow = rows.find((row) => row.key === parkingKey);
  const stats = { created: rows.filter((row) => !row.id).length, updated: rows.filter((row) => row.id && !sheetDataEqual(schema, row.data, row.original)).length, deleted: deleted.length };
  const editRow = editing && rows.find((row) => row.key === editing.key);
  const pendingField = editing && schema[editing.col];
  const pendingValue = pendingField ? parseSheetCell(pendingField, draft) : null;
  const pendingEdit = !!editing && !!editRow && !!pendingField && !!pendingValue &&
    ('error' in pendingValue || !cellValuesEqual(pendingField, editRow.data[pendingField.id], pendingValue.value));
  const dirty = stats.created + stats.updated + stats.deleted > 0 || pendingEdit;
  const mutation = useMutation({
    mutationFn: (body: SaveFormSubmissionsBody) => saveSubmissions(formId, body),
    onSuccess: async () => {
      setSaved(true);
      message.success('表格修改已保存');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['forms', formId, 'submissions'] }),
        queryClient.invalidateQueries({ queryKey: ['forms', formId] }),
        queryClient.invalidateQueries({ queryKey: ['forms', 'list'] }),
      ]);
    },
    onError: (error) => message.error(error.message),
  });

  const replaceRows = (next: SheetRow[]) => { rowsRef.current = next; setRows(next); };
  const commit = (cell: Cell, value: string) => {
    const field = schema[cell.col];
    const parsed = parseSheetCell(field, value);
    if ('error' in parsed) { message.warning(parsed.error); return false; }
    const current = rowsRef.current;
    const row = current.find((item) => item.key === cell.key);
    if (!row || cellValuesEqual(field, row.data[field.id], parsed.value)) return true;
    replaceRows(current.map((item) => item.key === cell.key ? { ...item, data: { ...item.data, [field.id]: parsed.value } } : item));
    setSaved(false);
    return true;
  };
  const enter = (key: string, col: number) => {
    const row = rowsRef.current.find((item) => item.key === key);
    if (!row) return;
    setDraft(row.data[schema[col].id] == null ? '' : String(row.data[schema[col].id]));
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
    const nextCol = Math.max(0, Math.min(schema.length - 1, editing.col + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0)));
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
    scrollRef.current?.scrollTo(scrollPositionRef.current);
  }, [scrollPositionRef]);
  useLayoutEffect(() => {
    if (!editing || !inputRef.current) return;
    const input = inputRef.current;
    const scroll = scrollRef.current;
    input.focus({ preventScroll: true });
    if (!scroll) return;
    const cell = input.closest('td');
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
    const data = Object.fromEntries(schema.map((field) => [field.id, field.type === 'date' ? dateValue : field.type === 'number' ? null : ''])) as FormData;
    const firstEntry = schema.findIndex((field) => field.id !== primary?.id);
    const col = firstEntry < 0 ? 0 : firstEntry;
    replaceRows([{ key, data, original: { ...data } }, ...rowsRef.current]);
    setDraft(String(data[schema[col].id] ?? ''));
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
  const exportCsv = () => {
    if (mutation.isPending) return;
    if (editing && !commit(editing, draft)) return;
    const headers = [...(includeParking ? ['停车记录'] : []), ...schema.map((field) => field.title)];
    const lines = rowsRef.current.map((row) => [...(includeParking ? [String(row.data.parkingRecords ?? '')] : []), ...schema.map((field) => displaySheetCell(row.data[field.id]))]);
    const escape = (value: string) => /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    const csv = [headers, ...lines].map((line) => line.map(escape).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${formTitle}_${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <div className="forms-sheet">
<<<<<<< HEAD
    <div className="forms-sheet-toolbar">
      <Space size="small"><Button icon={<Plus size={16} strokeWidth={1.6} />} disabled={mutation.isPending} onClick={addRow}>新增行</Button><Button type="text" icon={<Download size={16} strokeWidth={1.6} />} disabled={!rows.length || mutation.isPending} onClick={exportCsv}>导出 CSV</Button></Space>
      <Space size="middle" wrap>
        {dirty && <span className="forms-unsaved">有未保存的更改{stats.created ? ` · 新增 ${stats.created}` : ''}{stats.updated ? ` · 修改 ${stats.updated}` : ''}{stats.deleted ? ` · 删除 ${stats.deleted}` : ''}</span>}
        {saved && !dirty && <span className="forms-saved">已保存</span>}
        {dirty && <Button type="text" icon={<Undo2 size={16} strokeWidth={1.6} />} disabled={mutation.isPending} onClick={reset}>撤销</Button>}
        <Button type={dirty ? 'primary' : 'default'} icon={<Save size={16} strokeWidth={1.6} />} disabled={!dirty} loading={mutation.isPending} onClick={save}>保存修改</Button>
      </Space>
=======
    <div className="hg-toolbar forms-sheet-toolbar">
      <div className="hg-toolbar-group">
        <Button icon={<PlusIcon />} disabled={mutation.isPending} onClick={addRow}>新增行</Button>
        <Button type="text" icon={<DownloadIcon />} disabled={!rows.length || mutation.isPending} onClick={exportCsv}>导出 CSV</Button>
      </div>
      <div className="hg-toolbar-group">
        {dirty && <span className="hg-pill hg-pill-warning"><span className="hg-dot" />未保存{stats.created ? ` · 新增 ${stats.created}` : ''}{stats.updated ? ` · 修改 ${stats.updated}` : ''}{stats.deleted ? ` · 删除 ${stats.deleted}` : ''}</span>}
        {saved && !dirty && <span className="hg-pill hg-pill-success"><CheckIcon />已保存</span>}
        {dirty && <Button type="text" icon={<UndoIcon />} disabled={mutation.isPending} onClick={reset}>撤销</Button>}
        <Button type={dirty ? 'primary' : 'default'} icon={<SaveIcon />} disabled={!dirty} loading={mutation.isPending} onClick={save}>保存修改</Button>
      </div>
>>>>>>> claude/exciting-shannon-u2nwwv
    </div>
    {total > submissions.length && <div className="forms-sheet-notice">当前显示最近 {submissions.length} 条，共 {total} 条记录。</div>}
    <div className="forms-sheet-scroll" ref={scrollRef} aria-busy={mutation.isPending} onScroll={(event) => { scrollPositionRef.current = { left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }; }}>
      <table className="forms-sheet-table" style={{ minWidth: leadingWidth + fieldWidths.reduce((a, b) => a + b, 0) }}>
        <colgroup><col style={{ width: rowNoWidth }} />{includeParking && <col style={{ width: parkingWidth }} />}<col style={{ width: actionWidth }} />{fieldWidths.map((width, index) => <col key={schema[index].id} style={{ width }} />)}</colgroup>
        <thead><tr>
          <th className="forms-sheet-sticky forms-sheet-sticky-0" rowSpan={2}>#</th>
          {includeParking && <th className="forms-sheet-sticky" style={{ left: rowNoWidth }} rowSpan={2}>停车记录</th>}
          <th className="forms-sheet-sticky" style={{ left: rowNoWidth + (includeParking ? parkingWidth : 0) }} rowSpan={2}>操作</th>
          {groups.map((group, index) => <th key={`${group.title}-${index}`} colSpan={group.count} title={group.title} className={`forms-sheet-group forms-sheet-tone-${index % 2}`}>{group.count > 1 ? group.title : ''}</th>)}
        </tr><tr>
          {schema.map((field, index) => <th key={field.id} title={field.title} className={`forms-sheet-field forms-sheet-tone-${groupIndexes[index] % 2} ${index === 0 ? 'forms-sheet-sticky forms-sheet-date' : ''}`} style={{ ...(index === 0 ? { left: leadingWidth } : {}), width: fieldWidths[index], minWidth: fieldWidths[index] }}>{field.title}{field.unit && <small>{field.unit}</small>}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((row, index) => <tr key={row.key}>
            <td className="forms-sheet-sticky forms-sheet-sticky-0 forms-sheet-rowno">{index + 1}</td>
<<<<<<< HEAD
            {includeParking && <td className="forms-sheet-sticky forms-sheet-parking" style={{ left: rowNoWidth }}><Button size="small" disabled={mutation.isPending} onClick={() => setParkingKey(row.key)}>{parseParking(row.data.parkingRecords, String(row.data[primaryDateField(schema)?.id ?? ''] ?? '')).length ? `${parseParking(row.data.parkingRecords, String(row.data[primaryDateField(schema)?.id ?? ''] ?? '')).length} 条记录` : '无记录'}</Button></td>}
            <td className="forms-sheet-sticky forms-sheet-action" style={{ left: rowNoWidth + (includeParking ? parkingWidth : 0) }}><Popconfirm title="删除这行数据？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => removeRow(row)}><Button type="text" size="small" danger disabled={mutation.isPending} aria-label={`删除第 ${index + 1} 行`} icon={<Trash2 size={16} strokeWidth={1.6} />} /></Popconfirm></td>
=======
            {includeParking && <td className="forms-sheet-sticky forms-sheet-parking" style={{ left: rowNoWidth }}>{(() => { const count = parseParking(row.data.parkingRecords, String(row.data[primaryDateField(schema)?.id ?? ''] ?? '')).length; return <button type="button" className={`forms-sheet-parking-btn ${count ? 'has-records' : ''}`} disabled={mutation.isPending} onClick={() => setParkingKey(row.key)}><PauseCircleIcon />{count ? `${count} 条记录` : '无记录'}</button>; })()}</td>}
            <td className="forms-sheet-sticky forms-sheet-action" style={{ left: rowNoWidth + (includeParking ? parkingWidth : 0) }}><Popconfirm title="删除这行数据？" description="保存修改后生效" icon={<TrashIcon className="forms-sheet-confirm-icon" />} okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => removeRow(row)}><Tooltip title="删除这行" placement="right"><Button type="text" size="small" className="forms-sheet-delete" disabled={mutation.isPending} aria-label={`删除第 ${index + 1} 行`} icon={<TrashIcon />} /></Tooltip></Popconfirm></td>
>>>>>>> claude/exciting-shannon-u2nwwv
            {schema.map((field, col) => {
              const active = editing?.key === row.key && editing.col === col;
              const changed = !!row.id && !cellValuesEqual(field, row.data[field.id], row.original[field.id]);
              return <td key={field.id} className={`forms-sheet-cell forms-sheet-tone-${groupIndexes[col] % 2} ${col === 0 ? 'forms-sheet-sticky forms-sheet-date' : ''} ${changed ? 'forms-sheet-changed' : ''} ${active ? 'forms-sheet-active' : ''}`} style={col === 0 ? { left: leadingWidth } : undefined} onPointerDown={(event) => { if (!active && !mutation.isPending) { event.preventDefault(); switchTo({ key: row.key, col }); } }}>
                {active ? field.type === 'select'
                  ? <select ref={inputRef as React.RefObject<HTMLSelectElement>} aria-label={`第 ${index + 1} 行 ${field.title}`} disabled={mutation.isPending} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => finishEditing({ key: row.key, col })} onKeyDown={handleCellKeyDown}><option value="">请选择</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  : <input ref={inputRef as React.RefObject<HTMLInputElement>} aria-label={`第 ${index + 1} 行 ${field.title}`} disabled={mutation.isPending} type={field.type === 'date' ? 'date' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} value={draft} onInput={(e) => setDraft(e.currentTarget.value)} onChange={(e) => setDraft(e.target.value)} onBlur={() => finishEditing({ key: row.key, col })} onKeyDown={handleCellKeyDown} />
                  : <span>{displaySheetCell(row.data[field.id]) || '\u00a0'}</span>}
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
      {!rows.length && <div className="forms-sheet-empty"><StatusView compact icon={<TableIcon />} title="还没有数据" description="点击「新增行」开始录入" /></div>}
    </div>
    {parkingRow && <ParkingEditor key={parkingRow.key} initial={parseParking(parkingRow.data.parkingRecords, String(parkingRow.data[primaryDateField(schema)?.id ?? ''] ?? ''))} date={String(parkingRow.data[primaryDateField(schema)?.id ?? ''] ?? '')} onClose={() => setParkingKey(null)} onSave={(records) => { const value = serializeParking(records); if (value !== parkingRow.data.parkingRecords) { replaceRows(rowsRef.current.map((row) => row.key === parkingRow.key ? { ...row, data: { ...row.data, parkingRecords: value } } : row)); setSaved(false); } setParkingKey(null); }} />}
  </div>;
}

