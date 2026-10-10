import { useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Modal, Skeleton } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormData, FormField } from '@hgxt/shared';
import { Link, useNavigate } from 'react-router';
import { controlCatalog, createSubmission, getForm } from '../../api/forms';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, FormsIcon, HistoryIcon, UserIcon } from '../../components/icons';
import './sulfuric-control-mobile.css';

const STORAGE_PREFIX = 'hgxt:control:entry:';
type LocalEntry = { values: Record<string, string>; status: 'draft' | 'submitted'; savedAt: string };
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const shiftDate = (date: string, days: number) => {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};
const storageKey = (id: string, date: string) => `${STORAGE_PREFIX}${id}:${date}`;
function readEntry(id: string, date: string): LocalEntry | null {
  try {
    const raw = localStorage.getItem(storageKey(id, date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalEntry;
    return parsed && typeof parsed.values === 'object' ? parsed : null;
  } catch { return null; }
}
function saveEntry(id: string, date: string, entry: LocalEntry) {
  localStorage.setItem(storageKey(id, date), JSON.stringify(entry));
}
function rangeOf(title: string): { min: number; max: number } | null {
  const match = title.match(/(\d+(?:\.\d+)?)\s*[-－—～~]\s*(\d+(?:\.\d+)?)/);
  return match ? { min: Number(match[1]), max: Number(match[2]) } : null;
}
const isValue = (value?: string) => value !== undefined && value.trim() !== '';
const isMarker = (value?: string) => value === '待出' || value === '不检';
const isDecimal = (value: string) => /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value);
const FIELD_SHORT_LABELS: Record<string, string> = { field_AK: '干燥', field_AL: '一吸', field_AM: '二吸', field_AN: '烟酸', field_AO: '洗涤塔' };
const NOTE_PHRASES = ['生产稳定', '交接班正常', '设备检修', '开停炉', '取样异常'];
const formNumber = (code?: string | null) => ({ sulfuric_control_assay: '01', sulfuric_control_washing: '02', sulfuric_control_acid: '03', sulfuric_control_notes: '04' })[code ?? ''] ?? '';
const shortTitle = (title: string) => title.replace(/^硫酸中控\s*\d+｜/, '');
const weekday = (date: string) => new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(new Date(`${date}T12:00:00`));
function ControlMobileNav({ active, pending }: { active: 'home' | 'pending' | 'me'; pending: number }) {
  return <nav className="sc-home-nav" aria-label="手机填报导航"><Link className={active === 'home' ? 'active' : ''} to="/control-fill"><FormsIcon width={20} height={20} /><span>填报</span></Link><Link className={active === 'pending' ? 'active' : ''} to="/control-fill/pending"><HistoryIcon width={20} height={20} /><span>待补录</span>{pending > 0 && <b>{pending}</b>}</Link><Link className={active === 'me' ? 'active' : ''} to="/control-fill/me"><UserIcon width={20} height={20} /><span>我的</span></Link></nav>;
}

export function SulfuricControlHomePage() {
  const catalog = useQuery({ queryKey: ['control', 'catalog'], queryFn: controlCatalog });
  const definitions = useQuery({
    queryKey: ['control', 'home-definitions', catalog.data?.map((item) => item.id).join(',')],
    queryFn: () => Promise.all((catalog.data ?? []).map((item) => getForm(item.id))),
    enabled: !!catalog.data,
  });
  const pendingCount = (() => {
    if (!catalog.data) return 0;
    const ids = new Set(catalog.data.map((item) => item.id));
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? '';
      if (!key.startsWith(STORAGE_PREFIX)) continue;
      const id = key.slice(STORAGE_PREFIX.length).split(':')[0];
      if (ids.has(id)) count += Object.values(readEntry(id, key.slice(-10))?.values ?? {}).filter((value) => value === '待出').length;
    }
    return count;
  })();
  const day = today();
  const cards = (catalog.data ?? []).map((item, index) => {
    const entry = readEntry(item.id, day);
    const fields = definitions.data?.find((form) => form.id === item.id)?.schema.filter((field) => !field.hidden && field.id !== 'field_date') ?? [];
    const filled = fields.filter((field) => isValue(entry?.values[field.id]) && !isMarker(entry?.values[field.id])).length;
    const pending = fields.filter((field) => entry?.values[field.id] === '待出').length;
    const unchecked = fields.filter((field) => entry?.values[field.id] === '不检').length;
    return { item, index, entry, total: fields.length, filled, pending, unchecked };
  });
  const total = cards.filter((card) => card.item.code !== 'sulfuric_control_notes').reduce((sum, card) => sum + card.total, 0);
  const filled = cards.filter((card) => card.item.code !== 'sulfuric_control_notes').reduce((sum, card) => sum + card.filled, 0);
  const unfilled = total - filled - cards.reduce((sum, card) => sum + card.pending + card.unchecked, 0);
  const todayDate = new Date(`${day}T12:00:00`);
  return <main className="sc-mobile-shell sc-mobile-home-shell"><section className="sc-home-hero"><div className="sc-home-brand"><b>硫</b>硫酸中控化验</div><h1><span>{todayDate.getMonth() + 1}<small>月</small>{todayDate.getDate()}<small>日</small></span><em>{weekday(day)}</em></h1></section>
    <section className="sc-home-stats"><Link to="/control-fill/pending"><strong>{pendingCount}</strong><small>待补录</small></Link><div><strong>{unfilled}</strong><small>今日未填</small></div><div><strong>{filled}<em>/{total}</em></strong><small>今日已填</small></div></section>
    <section className="sc-mobile-home"><h2>填报表单</h2>
      {(catalog.isLoading || definitions.isLoading) && <Skeleton active />}
      {cards.map(({ item, index, entry, total: cardTotal, filled: cardFilled, pending, unchecked }) => <Link className="sc-home-card" to={`/form-fill/${item.id}`} key={item.id}>
        <span className="sc-home-no">{String(index + 1).padStart(2, '0')}</span><span className="sc-home-detail"><span><strong>{shortTitle(item.title)}</strong><small className={entry?.status === 'draft' ? 'sc-status-draft' : undefined}>{entry?.status === 'draft' ? '已暂存' : entry?.status === 'submitted' ? '已提交' : ''}</small></span>
          {item.code !== 'sulfuric_control_notes' && <span className="sc-home-bar"><i className="sc-bar-filled" style={{ width: `${cardTotal ? cardFilled / cardTotal * 100 : 0}%` }} /><i className="sc-bar-pending" style={{ width: `${cardTotal ? pending / cardTotal * 100 : 0}%` }} /><i className="sc-bar-unchecked" style={{ width: `${cardTotal ? unchecked / cardTotal * 100 : 0}%` }} /></span>}
          <small>{item.code === 'sulfuric_control_notes' ? entry?.values.field_notes ? `今日已填 · ${entry.values.field_notes}` : '今日未填' : <>{cardFilled ? `已填 ${cardFilled}` : '待填写'}{pending ? ` · 待出 ${pending}` : ''}{unchecked ? ` · 不检 ${unchecked}` : ''}{cardTotal > cardFilled + pending + unchecked ? ` · 未填 ${cardTotal - cardFilled - pending - unchecked}` : ''}</>}</small>
        </span><ChevronRightIcon width={16} height={16} aria-hidden />
      </Link>)}
    </section>
    <ControlMobileNav active="home" pending={pendingCount} />
  </main>;
}

export function SulfuricControlMePage() {
  const catalog = useQuery({ queryKey: ['control', 'catalog'], queryFn: controlCatalog });
  const ids = new Set((catalog.data ?? []).map((item) => item.id));
  let drafts = 0, pending = 0;
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index) ?? '';
    if (!key.startsWith(STORAGE_PREFIX)) continue;
    const [id, date] = key.slice(STORAGE_PREFIX.length).split(':');
    if (!ids.has(id)) continue;
    const entry = readEntry(id, date);
    if (entry?.status === 'draft') drafts++;
    pending += Object.values(entry?.values ?? {}).filter((value) => value === '待出').length;
  }
  return <main className="sc-mobile-shell"><header className="sc-mobile-header"><span /><div><strong>我的</strong><small>硫酸中控化验</small></div><span /></header><section className="sc-me-intro"><span>硫</span><div><strong>当前设备</strong><small>填写记录与暂存保存在这台设备</small></div></section><section className="sc-me-links"><Link to="/control-fill">四张填报表单 <ChevronRightIcon width={18} height={18} /></Link><Link to="/control-fill/pending">待补录 <span>{pending} 项</span><ChevronRightIcon width={18} height={18} /></Link><div>本机暂存 <span>{drafts} 份</span></div></section><p className="sc-me-tip">提交后的数据会进入后台总表；未提交的暂存内容只保存在当前浏览器。</p><ControlMobileNav active="me" pending={pending} /></main>;
}

export function SulfuricControlPendingPage() {
  const { message } = App.useApp();
  const catalog = useQuery({ queryKey: ['control', 'catalog'], queryFn: controlCatalog });
  const [version, setVersion] = useState(0);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState('');
  const [filter, setFilter] = useState('all');
  const entries = (() => {
    void version;
    if (!catalog.data) return [];
    const ids = new Map(catalog.data.map((item) => [item.id, item]));
    const result: { id: string; date: string; fieldId: string; title: string }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? '';
      if (!key.startsWith(STORAGE_PREFIX)) continue;
      const [id, date] = key.slice(STORAGE_PREFIX.length).split(':');
      const form = ids.get(id);
      if (!form || !date) continue;
      for (const [fieldId, value] of Object.entries(readEntry(id, date)?.values ?? {})) {
        if (value === '待出') result.push({ id, date, fieldId, title: form.title });
      }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  })();
  const fieldForms = useQuery({
    queryKey: ['control', 'pending-fields', catalog.data?.map((item) => item.id).join(',')],
    queryFn: () => Promise.all((catalog.data ?? []).map((item) => getForm(item.id))),
    enabled: !!catalog.data,
  });
  const fieldName = (id: string, fieldId: string) => fieldForms.data?.find((form) => form.id === id)?.schema.find((field) => field.id === fieldId)?.title ?? fieldId;
  const submit = async (item: typeof entries[number], value: string) => {
    const field = fieldForms.data?.find((form) => form.id === item.id)?.schema.find((entry) => entry.id === item.fieldId);
    if (!field) return;
    const trimmed = value.trim();
    if (!trimmed || (field.type === 'number' && trimmed !== '不检' && !isDecimal(trimmed))) { message.error('请输入数值，或选择不检'); return; }
    setSaving(`${item.id}:${item.date}:${item.fieldId}`);
    try {
      await createSubmission(item.id, { field_date: item.date, [item.fieldId]: trimmed });
      const previous = readEntry(item.id, item.date);
      saveEntry(item.id, item.date, { values: { ...previous?.values, [item.fieldId]: trimmed }, status: previous?.status ?? 'submitted', savedAt: new Date().toISOString() });
      setVersion((current) => current + 1);
      message.success('已补录到原记录日期');
    } catch (error) { message.error(error instanceof Error ? error.message : '补录失败'); }
    finally { setSaving(''); }
  };
  const filtered = filter === 'all' ? entries : entries.filter((item) => item.id === filter);
  const byDate = new Map<string, typeof entries>();
  for (const entry of filtered) byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry]);
  return <main className="sc-mobile-shell"><header className="sc-mobile-header"><Link to="/control-fill" aria-label="返回"><ChevronLeftIcon width={20} height={20} /></Link><div><strong>待补录</strong><small>硫酸中控化验</small></div><span /></header>
    <section className="sc-pending-head"><h1>待补录 <span>{entries.length}</span></h1><p>先显示较早的记录，结果写回原来的记录日期</p><nav aria-label="筛选表单"><button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部</button>{(catalog.data ?? []).filter((item) => item.code !== 'sulfuric_control_notes').map((item) => <button type="button" key={item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}>{formNumber(item.code)}</button>)}</nav></section>
    <section className="sc-pending-list">{filtered.length === 0 ? <Empty description="暂无待补录项目" /> : [...byDate].map(([date, dayEntries]) => <div className="sc-pending-day" key={date}><h2>{date.slice(5)} <small>{weekday(date)}</small><em>{Math.round((new Date(`${today()}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) / 86_400_000)} 天</em></h2>{dayEntries.map((item) => {
        const key = `${item.id}:${item.date}:${item.fieldId}`;
        return <div className="sc-pending-card" key={key}><small>{formNumber((catalog.data ?? []).find((form) => form.id === item.id)?.code)} · {shortTitle(item.title)}</small><strong>{fieldName(item.id, item.fieldId)}</strong>
          <div><input aria-label={`${item.date} ${fieldName(item.id, item.fieldId)}`} inputMode="decimal" placeholder="输入结果" value={edits[key] ?? ''} onChange={(event) => setEdits((current) => ({ ...current, [key]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') void submit(item, edits[key] ?? ''); }} />
            <Button onClick={() => void submit(item, '不检')}>不检</Button><Button type="primary" loading={saving === key} onClick={() => void submit(item, edits[key] ?? '')}>保存</Button></div>
        </div>;
      })}</div>)}
    </section>
    <ControlMobileNav active="pending" pending={entries.length} />
  </main>;
}

export function SulfuricControlMobilePage({ id }: { id: string }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useQuery({ queryKey: ['forms', id], queryFn: () => getForm(id), enabled: !!id });
  const [date, setDate] = useState(today);
  const [values, setValues] = useState<Record<string, string>>(() => readEntry(id, today())?.values ?? {});
  const [status, setStatus] = useState<'draft' | 'submitted' | ''>(() => readEntry(id, today())?.status ?? '');
  const [dirty, setDirty] = useState(false);
  const [section, setSection] = useState('');
  const [subgroup, setSubgroup] = useState('');
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const fields = useMemo(() => form.data?.schema.filter((field) => !field.hidden && field.id !== 'field_date') ?? [], [form.data]);
  const sections = [...new Set(fields.map((field) => field.section ?? field.group ?? '生产记录'))];
  const activeSection = sections.includes(section) ? section : sections[0];
  const sectionFields = fields.filter((field) => (field.section ?? field.group ?? '生产记录') === activeSection);
  const groups = [...new Set(sectionFields.map((field) => field.subgroup ?? activeSection))];
  const activeGroup = groups.includes(subgroup) ? subgroup : groups[0];
  const visibleFields = sectionFields.filter((field) => (field.subgroup ?? activeSection) === activeGroup);
  const allGroups = sections.flatMap((name) => [...new Set(fields.filter((field) => (field.section ?? field.group ?? '生产记录') === name).map((field) => field.subgroup ?? name))].map((group) => ({ section: name, group })));
  const groupIndex = allGroups.findIndex((group) => group.section === activeSection && group.group === activeGroup);
  const answered = fields.filter((field) => isValue(values[field.id])).length;
  const filled = fields.filter((field) => isValue(values[field.id]) && !isMarker(values[field.id])).length;
  const pending = fields.filter((field) => values[field.id] === '待出').length;
  const unchecked = fields.filter((field) => values[field.id] === '不检').length;
  const isNotes = form.data?.code === 'sulfuric_control_notes';
  const save = useMutation({ mutationFn: (payload: FormData) => createSubmission(id, payload) });
  const patch = (fieldId: string, value: string) => { setValues((current) => ({ ...current, [fieldId]: value })); setDirty(true); };
  const changeDate = (next: string) => {
    if (!next || next > today() || next === date) return;
    const applyDate = () => { const entry = readEntry(id, next); setDate(next); setValues(entry?.values ?? {}); setStatus(entry?.status ?? ''); setDirty(false); };
    if (!dirty) { applyDate(); return; }
    Modal.confirm({ title: '当前修改尚未暂存', content: '切换日期会放弃未保存的修改。', okText: '切换日期', cancelText: '继续填写', onOk: applyDate });
  };
  const leave = () => {
    if (!dirty) { navigate('/control-fill'); return; }
    Modal.confirm({ title: '当前修改尚未暂存', content: '返回将放弃未保存的修改。', okText: '返回', cancelText: '继续填写', onOk: () => navigate('/control-fill') });
  };
  const saveDraft = () => { saveEntry(id, date, { values, status: 'draft', savedAt: new Date().toISOString() }); setStatus('draft'); setDirty(false); message.success('已在当前设备暂存'); };
  const submitNow = async () => {
    if (!answered) { message.warning('请先填写至少一项'); return; }
    const invalid = fields.find((field) => isValue(values[field.id]) && !isMarker(values[field.id]) && field.type === 'number' && !isDecimal(values[field.id]));
    if (invalid) { message.error(`${invalid.title}需要填写数字`); return; }
    const outOfRange = fields.filter((field) => {
      const range = rangeOf(field.title), value = values[field.id];
      return range && isValue(value) && !isMarker(value) && (Number(value) < range.min || Number(value) > range.max);
    });
    const blanks = fields.length - answered;
    if (outOfRange.length || blanks) {
      const proceed = await new Promise<boolean>((resolve) => Modal.confirm({ title: '确认提交', content: <>{outOfRange.length > 0 && <p>{outOfRange.length} 项超出名称标注的范围：{outOfRange.map((field) => field.title).join('、')}</p>}{blanks > 0 && <p>还有 {blanks} 项未填写。</p>}</>, okText: '继续提交', cancelText: '返回检查', onOk: () => resolve(true), onCancel: () => resolve(false) }));
      if (!proceed) return;
    }
    const payload: FormData = { field_date: date };
    for (const field of fields) {
      const value = values[field.id]?.trim();
      if (value) payload[field.id] = value;
    }
    try {
      await save.mutateAsync(payload);
      saveEntry(id, date, { values, status: 'submitted', savedAt: new Date().toISOString() });
      setStatus('submitted'); setDirty(false); message.success('提交成功');
      void queryClient.invalidateQueries({ queryKey: ['forms', id] });
    } catch (error) { message.error(error instanceof Error ? error.message : '提交失败'); }
  };
  if (form.isLoading) return <main className="sc-mobile-shell"><Skeleton active /></main>;
  if (!form.data) return <Empty description="表单不存在" />;
  return <main className="sc-mobile-shell"><header className="sc-mobile-header"><button type="button" onClick={leave} aria-label="返回"><ChevronLeftIcon width={20} height={20} /></button><div><strong>{shortTitle(form.data.title)}</strong><small>表单 {formNumber(form.data.code)} · {dirty ? '有修改未保存' : status === 'draft' ? '已暂存' : status === 'submitted' ? '已提交' : '未填写'}</small></div><span /></header>
    <section className="sc-mobile-date"><small>记录日期 · 按样品所属的那天选</small><div className="sc-date-main"><strong>{date}<span>{weekday(date)}</span></strong><label className="sc-date-picker"><CalendarIcon width={20} height={20} aria-hidden /><input type="date" aria-label="记录日期" value={date} max={today()} onChange={(event) => changeDate(event.target.value)} /></label></div>
      <div className="sc-mobile-shortcuts">{[0, -1, -2].map((offset) => <button type="button" key={offset} className={date === shiftDate(today(), offset) ? 'active' : ''} onClick={() => changeDate(shiftDate(today(), offset))}>{offset === 0 ? '今天' : offset === -1 ? '昨天' : '前天'}</button>)}{!isNotes && <span>待出 <b>{pending}</b> 不检 <b>{unchecked}</b></span>}</div>
    </section>
    {!isNotes && <nav className="sc-mobile-sections" role="tablist" aria-label="分区">{sections.map((name) => <button type="button" role="tab" aria-selected={activeSection === name} key={name} className={activeSection === name ? 'active' : ''} onClick={() => { setSection(name); setSubgroup(''); }}>{name}<small>{fields.filter((field) => (field.section ?? field.group ?? '生产记录') === name).length}</small></button>)}</nav>}
    {!isNotes && groups.length > 1 && <nav className="sc-mobile-groups" role="tablist" aria-label="分组" style={{ gridTemplateColumns: `repeat(${Math.min(groups.length, 4)}, minmax(0, 1fr))` }}>{groups.map((name) => {
      const groupFields = sectionFields.filter((field) => (field.subgroup ?? activeSection) === name);
      return <button type="button" role="tab" aria-selected={activeGroup === name} key={name} className={activeGroup === name ? 'active' : ''} onClick={() => setSubgroup(name)}><span>{name.length > 5 ? name.replace('（', '\n（') : name}</span>{groupFields.some((field) => values[field.id] === '待出') && <i /> }<small>{groupFields.filter((field) => isValue(values[field.id]) && !isMarker(values[field.id])).length}/{groupFields.length}</small></button>;
    })}</nav>}
    <section className="sc-mobile-fields"><div className="sc-mobile-card">{!isNotes && <h2>{activeGroup} <span>{activeGroup !== activeSection && activeSection}</span><small>已填 <b>{visibleFields.filter((field) => isValue(values[field.id]) && !isMarker(values[field.id])).length}</b> / {visibleFields.length}</small></h2>}
      {visibleFields.map((field: FormField) => field.id === 'field_notes' ? <div className="sc-mobile-notes" key={field.id}><label htmlFor={`sc-${field.id}`}>生产情况记录</label><textarea id={`sc-${field.id}`} maxLength={1000} value={values[field.id] ?? ''} placeholder="记录当天的生产情况、设备情况、取样或检测异常等" onChange={(event) => patch(field.id, event.target.value)} /><div className="sc-notes-meta"><span>常用语，点一下插入</span><span>{(values[field.id] ?? '').length} 字</span></div><div className="sc-notes-phrases">{NOTE_PHRASES.map((phrase) => <button type="button" key={phrase} onClick={() => patch(field.id, `${(values[field.id] ?? '').trimEnd()}${values[field.id]?.trim() ? '；' : ''}${phrase}`)}>{phrase}</button>)}</div></div> : <div className={`sc-mobile-field${isValue(values[field.id]) && !isMarker(values[field.id]) ? ' has-value' : ''}${(() => { const range = rangeOf(field.title); return range && isValue(values[field.id]) && !isMarker(values[field.id]) && (Number(values[field.id]) < range.min || Number(values[field.id]) > range.max) ? ' is-bad' : ''; })()}`} key={field.id}><div className="sc-mobile-field-content"><label htmlFor={`sc-${field.id}`}>{FIELD_SHORT_LABELS[field.id] ?? field.title}</label>{rangeOf(field.title) && <small>范围 {rangeOf(field.title)?.min} – {rangeOf(field.title)?.max}</small>}{!isValue(values[field.id]) || isMarker(values[field.id]) ? <div className="sc-mobile-markers">{['待出', '不检'].map((marker) => <button type="button" key={marker} className={values[field.id] === marker ? 'active' : ''} aria-pressed={values[field.id] === marker} onClick={() => patch(field.id, values[field.id] === marker ? '' : marker)}>{marker}</button>)}</div> : null}</div>
        <div className="sc-mobile-field-main">{isMarker(values[field.id]) ? <button type="button" className={values[field.id] === '待出' ? 'pending' : 'unchecked'} onClick={() => patch(field.id, '')} aria-label={`${field.title}：${values[field.id]}，点按取消`}>{values[field.id]}</button> : <input className="sc-mobile-value-input" id={`sc-${field.id}`} inputMode="decimal" type="text" placeholder="填写" value={values[field.id] ?? ''} onChange={(event) => patch(field.id, event.target.value)} onKeyDown={(event) => { if (event.key !== 'Enter') return; const inputs = [...document.querySelectorAll<HTMLInputElement>('.sc-mobile-value-input')]; inputs[inputs.indexOf(event.currentTarget) + 1]?.focus(); }} />}</div>
      </div>)}
    </div>{!isNotes && groupIndex >= 0 && groupIndex < allGroups.length - 1 && <button type="button" className="sc-mobile-next" onClick={() => { const next = allGroups[groupIndex + 1]; setSection(next.section); setSubgroup(next.group); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><span>下一组</span>{allGroups[groupIndex + 1].group} <ChevronRightIcon width={16} height={16} /></button>}</section>
    <footer className="sc-mobile-footer"><div>{isNotes ? dirty ? '有修改未保存' : status === 'draft' ? '已暂存' : status === 'submitted' ? '已提交' : '未填写' : <>已填 <strong>{filled}</strong> / {fields.length}<span className="sc-mobile-progress"><i style={{ width: `${fields.length ? (filled / fields.length) * 100 : 0}%` }} /></span></>}</div><Button onClick={saveDraft}>暂存</Button><Button type="primary" loading={save.isPending} onClick={() => void submitNow()}>提交</Button></footer>
  </main>;
}

