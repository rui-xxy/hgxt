import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Empty, Modal, Skeleton } from 'antd';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormDTO, FormField, FormSubmissionDTO } from '@hgxt/shared';
import { Link, useSearchParams } from 'react-router';
import { controlCatalog, getForm, listSubmissions, patchControlValue } from '../../api/forms';
import { PageHeader } from '../../components/PageHeader';
import './sulfuric-control.css';

const PAGE_SIZE = 100;
const tabTitle = (title: string) => title.replace(/^硫酸中控\s*0[1-4]\s*[｜|]\s*/, '');
const weekday = (date: string) => new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(new Date(`${date}T12:00:00`));
const display = (value: unknown) => value === null || value === undefined || value === '' ? '' : String(value);
const spanGroups = <T,>(items: T[], keyOf: (item: T) => string) => {
  const groups: { title: string; count: number }[] = [];
  for (const item of items) {
    const title = keyOf(item);
    if (groups.at(-1)?.title === title) groups[groups.length - 1].count++;
    else groups.push({ title, count: 1 });
  }
  return groups;
};
type Column = { form: FormDTO; field: FormField };
type Editing = { date: string; column: Column; value: string };

export function SulfuricControlSummaryPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [exporting, setExporting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestedTab = searchParams.get('tab');
  const activeIndex = requestedTab && /^0[1-4]$/.test(requestedTab) ? Number(requestedTab) - 1 : 0;

  const catalog = useQuery({ queryKey: ['control', 'catalog'], queryFn: controlCatalog });
  const selected = catalog.data?.[activeIndex];
  const forms = useQuery({
    queryKey: ['control', 'forms', catalog.data?.map((item) => item.id).join(',')],
    queryFn: () => Promise.all((catalog.data ?? []).map((item) => getForm(item.id))),
    enabled: !!catalog.data,
  });
  const form = forms.data?.find((item) => item.id === selected?.id);
  const submissions = useInfiniteQuery({
    queryKey: ['control', 'submissions', selected?.id],
    queryFn: ({ pageParam }) => listSubmissions(selected!.id, pageParam, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.page * lastPage.pageSize < lastPage.total ? lastPage.page + 1 : undefined,
    enabled: !!selected,
    refetchOnWindowFocus: false,
  });

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [selected?.id]);
  const save = useMutation({
    mutationFn: patchControlValue,
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['control', 'submissions', variables.formId] });
      setEditing(null);
      message.success('已保存');
    },
    onError: (error) => message.error(error.message),
  });

  const columns = useMemo<Column[]>(() => form?.schema.filter((field) => !field.hidden && field.id !== 'field_date').map((field) => ({ form, field })) ?? [], [form]);
  const sections = useMemo(() => spanGroups(columns, ({ field }) => field.section ?? field.group ?? '生产记录'), [columns]);
  const groups = useMemo(() => spanGroups(columns, ({ field }) => `${field.section ?? field.group ?? '生产记录'}|${field.subgroup ?? field.section ?? field.group ?? '生产记录'}`), [columns]);
  const rowMap = useMemo(() => {
    const byDate = new Map<string, FormSubmissionDTO>();
    for (const row of submissions.data?.pages.flatMap((page) => page.items) ?? []) {
      const date = row.data.field_date;
      if (typeof date === 'string' && !byDate.has(date)) byDate.set(date, row);
    }
    return byDate;
  }, [submissions.data]);
  const dates = [...rowMap.keys()];
  const pendingCount = [...rowMap.values()].reduce((count, row) => count + columns.filter(({ field }) => row.data[field.id] === '待出').length, 0);
  const uncheckedCount = [...rowMap.values()].reduce((count, row) => count + columns.filter(({ field }) => row.data[field.id] === '不检').length, 0);
  const isNotes = selected?.code === 'sulfuric_control_notes';
  const sectionLabel = (title: string) => title.split('|').at(-1) ?? title;

  const editValue = () => {
    if (!editing) return;
    const { field, form: editForm } = editing.column;
    const raw = editing.value.trim();
    if (raw && raw !== '待出' && raw !== '不检' && field.type === 'number' && !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) {
      message.error('请输入数字、待出或不检');
      return;
    }
    save.mutate({ formId: editForm.id, date: editing.date, fieldId: field.id, value: raw || null });
  };

  const exportCsv = async () => {
    if (!selected || !columns.length) return;
    setExporting(true);
    try {
      const first = await listSubmissions(selected.id, 1, 1000);
      const pageCount = Math.ceil(first.total / 1000);
      const rest = pageCount > 1
        ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => listSubmissions(selected.id, index + 2, 1000)))
        : [];
      const byDate = new Map<string, FormSubmissionDTO>();
      for (const row of [first, ...rest].flatMap((page) => page.items)) {
        const date = row.data.field_date;
        if (typeof date === 'string' && !byDate.has(date)) byDate.set(date, row);
      }
      const header = ['记录日期', ...columns.map(({ field }) => `${field.section ?? ''} / ${field.subgroup ?? ''} / ${field.title}`)];
      const lines = [header, ...[...byDate].map(([date, row]) => [date, ...columns.map(({ field }) => display(row.data[field.id]))])];
      const csv = '\ufeff' + lines.map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `硫酸中控_${String(activeIndex + 1).padStart(2, '0')}_${tabTitle(selected.title)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const openEdit = (date: string, column: Column) => setEditing({ date, column, value: display(rowMap.get(date)?.data[column.field.id]) });
  const selectTab = (index: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', String(index + 1).padStart(2, '0'));
    setSearchParams(next);
    setEditing(null);
  };

  return <>
    <PageHeader title="化验数据汇总" description="按记录日期汇总，双击任一格可直接修改" extra={<Link to="/control-fill">手机填写端</Link>} />
    <main className="sc-summary">
      <div className="sc-summary-top"><nav className="sc-summary-tabs" aria-label="选择中控表单">
        {(catalog.data ?? []).map((item, index) => <button type="button" key={item.id} className={index === activeIndex ? 'active' : ''} aria-current={index === activeIndex ? 'page' : undefined} onClick={() => selectTab(index)}><span>{String(index + 1).padStart(2, '0')}</span>{tabTitle(item.title)}{forms.data?.[index] && <small>{forms.data[index].schema.filter((field) => !field.hidden && field.id !== 'field_date').length} 项</small>}</button>)}
      </nav><Button onClick={() => void exportCsv()} disabled={!columns.length} loading={exporting}>导出 CSV</Button></div>
      {!isNotes && <div className="sc-summary-legend"><span className="pending">待出</span> 结果未出 <span>不检</span> 本次不测 <span className="sc-summary-alert">超出名称标注范围</span> <span>空白 = 未填</span></div>}
      {(catalog.isLoading || forms.isLoading || submissions.isLoading) && <Skeleton active />}
      {(catalog.error || forms.error || submissions.error) && <Empty description={(catalog.error ?? forms.error ?? submissions.error)?.message ?? '加载失败'} />}
      {!!form && !!submissions.data && <>
        <div className="sc-summary-meta"><strong>{String(activeIndex + 1).padStart(2, '0')} · {tabTitle(form.title)}</strong><span>{isNotes ? `已加载 ${dates.length} / ${submissions.data.pages[0]?.total ?? 0} 条记录` : `${columns.length} 项 · 已加载 ${dates.length} / ${submissions.data.pages[0]?.total ?? 0} 条记录 · 待出 ${pendingCount} · 不检 ${uncheckedCount}`}</span></div>
        <div className="sc-summary-scroll" ref={scrollRef} onScroll={(event) => {
          const target = event.currentTarget;
          if (submissions.hasNextPage && !submissions.isFetchingNextPage && target.scrollHeight - target.scrollTop - target.clientHeight < 180) void submissions.fetchNextPage();
        }}>
          {isNotes ? <table className="sc-summary-table sc-notes-table"><colgroup><col className="sc-date-col" /><col /></colgroup><thead><tr><th className="sc-date-head">日期</th><th className="sc-notes-head">生产情况记录</th></tr></thead><tbody>{dates.map((date) => {
            const column = columns[0];
            if (!column) return null;
            const value = display(rowMap.get(date)?.data[column.field.id]);
            return <tr key={date}><th scope="row" className="sc-date-cell">{date.slice(5)} <small>{weekday(date)}</small></th><td className="sc-cell-notes" tabIndex={0} title={`${date} · 双击或按回车修改`} onDoubleClick={() => openEdit(date, column)} onKeyDown={(event) => { if (event.key === 'Enter') openEdit(date, column); }}>{value || <span className="sc-note-empty">未填写</span>}</td></tr>;
          })}</tbody></table> : <table className="sc-summary-table"><colgroup><col className="sc-date-col" />{columns.map(({ field }) => <col key={field.id} />)}</colgroup><thead>
            <tr><th rowSpan={3} className="sc-date-head">日期</th>{sections.map((group, index) => <th key={index} colSpan={group.count} className="sc-form-head">{group.title}</th>)}</tr>
            <tr>{groups.map((group, index) => <th key={index} colSpan={group.count}>{sectionLabel(group.title)}</th>)}</tr>
            <tr>{columns.map(({ field }) => <th key={field.id} title={field.title}>{field.title}</th>)}</tr>
          </thead><tbody>{dates.map((date) => <tr key={date}><th scope="row" className="sc-date-cell">{date.slice(5)} <small>{weekday(date)}</small></th>{columns.map((column) => {
            const value = rowMap.get(date)?.data[column.field.id];
            const current = display(value);
            const isPending = current === '待出', isUnchecked = current === '不检';
            const match = column.field.title.match(/(\d+(?:\.\d+)?)\s*[-－—～~]\s*(\d+(?:\.\d+)?)/);
            const outOfRange = match && (typeof value === 'number' || (typeof value === 'string' && /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))) && (Number(value) < Number(match[1]) || Number(value) > Number(match[2]));
            return <td key={column.field.id} className={isPending ? 'sc-cell-pending' : isUnchecked ? 'sc-cell-unchecked' : outOfRange ? 'sc-cell-alert' : ''} tabIndex={0} title={`${date} · ${column.field.title}：${current || '未填'}。双击或按回车修改`} onDoubleClick={() => openEdit(date, column)} onKeyDown={(event) => { if (event.key === 'Enter') openEdit(date, column); }}>{current}</td>;
          })}</tr>)}</tbody></table>}
          {dates.length === 0 && <Empty description="暂无填写记录" />}
          {submissions.hasNextPage && <div className="sc-summary-load"><Button loading={submissions.isFetchingNextPage} onClick={() => void submissions.fetchNextPage()}>加载更早记录</Button></div>}
        </div>
      </>}
    </main>
    <Modal title={editing ? `${editing.date} · ${editing.column.form.title} · ${editing.column.field.title}` : '修改'} open={!!editing} onCancel={() => setEditing(null)} onOk={editValue} okText="保存" okButtonProps={{ loading: save.isPending }} destroyOnHidden>
      {editing && <div className="sc-edit-body">{editing.column.field.id === 'field_notes' ? <textarea autoFocus maxLength={1000} aria-label="修改生产情况记录" value={editing.value} onChange={(event) => setEditing({ ...editing, value: event.target.value })} /> : <><input autoFocus aria-label="修改化验数据" inputMode="decimal" value={editing.value === '待出' || editing.value === '不检' ? '' : editing.value} onChange={(event) => setEditing({ ...editing, value: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') editValue(); }} /><div><Button onClick={() => setEditing({ ...editing, value: editing.value === '待出' ? '' : '待出' })}>待出</Button><Button onClick={() => setEditing({ ...editing, value: editing.value === '不检' ? '' : '不检' })}>不检</Button><Button onClick={() => setEditing({ ...editing, value: '' })}>清空</Button></div></>}{(editing.value === '待出' || editing.value === '不检') && <p>当前标记：{editing.value}</p>}</div>}
    </Modal>
  </>;
}
