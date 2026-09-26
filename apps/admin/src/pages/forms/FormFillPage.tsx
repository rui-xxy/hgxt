import { useMemo, useState } from 'react';
import { App, Button, Empty, Input, Result, Skeleton } from 'antd';
import { CheckOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import type { FormData, FormField, FormLastValuesResult } from '@hgxt/shared';
import { createSubmission, getForm, latestValues } from '../../api/forms';
import { emptyParking, serializeParking, type ParkingRecord } from './components/parking';
import './forms.css';

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 字段是否已有效填写（number 走数值与范围校验，其余非空即可）——全类型通用 */
function isFilled(field: FormField, text: string | undefined): boolean {
  if (field.type === 'number') {
    if (!text?.trim()) return false;
    const value = Number(text);
    return Number.isFinite(value) && (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max);
  }
  return Boolean(text?.trim());
}

export function FormFillPage() {
  const { id = '' } = useParams();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const form = useQuery({ queryKey: ['forms', id], queryFn: () => getForm(id), enabled: !!id });
  // 上次值走专用接口（USER 可用；不再拉全部历史提交）
  const last = useQuery({ queryKey: ['forms', id, 'latest'], queryFn: () => latestValues(id), enabled: !!id, refetchOnWindowFocus: false });
  const [active, setActive] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [parking, setParking] = useState<ParkingRecord[]>([emptyParking(today())]);
  const [submitted, setSubmitted] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const submit = useMutation({
    mutationFn: (data: FormData) => createSubmission(id, data),
    onSuccess: async () => {
      setSubmitted(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['forms', id, 'latest'] }),
        queryClient.invalidateQueries({ queryKey: ['forms', id] }),
        queryClient.invalidateQueries({ queryKey: ['forms', 'list'] }),
      ]);
    },
    onError: (error) => message.error(error.message),
  });
  const grouped = useMemo(() => {
    const groups: { name: string; fields: FormField[] }[] = [];
    for (const field of form.data?.schema ?? []) {
      if (field.hidden) continue; // 只跳过隐藏字段；text/select/date 全类型参与填报
      const name = field.group ?? '其他';
      let group = groups.find((item) => item.name === name);
      if (!group) { group = { name, fields: [] }; groups.push(group); }
      group.fields.push(field);
    }
    return groups;
  }, [form.data?.schema]);
  // 进度通用化：以 required 字段为准（纯文本/混合表单都能正确工作；无必填字段随时可提交）
  const requiredFields = form.data?.schema.filter((field) => !field.hidden && field.required) ?? [];
  const filled = requiredFields.filter((field) => isFilled(field, values[field.id])).length;
  const enableParking = form.data?.parkingEnabled ?? false;
  const current = active || grouped[0]?.name;
  const previous: FormLastValuesResult = last.data ?? {};
  const patchParking = (index: number, part: Partial<ParkingRecord>) => setParking((items) => items.map((item, i) => i === index ? { ...item, ...part } : item));
  const handleSubmit = () => {
    if (!form.data || filled !== requiredFields.length) return;
    const data: FormData = {};
    for (const field of form.data.schema) {
      if (field.hidden && field.type === 'date') data[field.id] = today();
      else if (field.type === 'number') data[field.id] = values[field.id]?.trim() ? Number(values[field.id]) : null;
      else if (!field.hidden) data[field.id] = values[field.id]?.trim() ? values[field.id] : null;
    }
    if (enableParking) data.parkingRecords = serializeParking(parking);
    submit.mutate(data);
  };
  if (form.isLoading) return <div className="forms-fill-shell"><Skeleton active /></div>;
  if (!form.data) return <Result status="404" title="表单不存在" extra={<Link to="/forms">返回表单列表</Link>} />;
  if (submitted) return <div className="forms-fill-success"><div className="forms-fill-success-card"><div className="forms-fill-success-icon"><CheckOutlined /></div><h1>提交成功</h1><p>感谢您的填写，数据已记录</p><Button type="primary" block onClick={() => { setValues({}); setParking([emptyParking(today())]); setActive(''); setSubmitted(false); setFormKey((key) => key + 1); }}>再填一份</Button></div></div>;

  return <div className="forms-fill-shell" key={formKey}>
    <main className="forms-fill-panel">
      <header className="forms-fill-header"><h1>{form.data.title}</h1><span>{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</span></header>
      <nav className="forms-fill-tabs" aria-label="表单分组"><div className="forms-fill-tabs-inner">
        {grouped.map((group) => {
          const missing = group.fields.filter((field) => field.required && !isFilled(field, values[field.id])).length;
          return <button type="button" key={group.name} className={current === group.name ? 'active' : ''} onClick={() => setActive(group.name)}>{group.name}{missing > 0 && <b>{missing}</b>}</button>;
        })}
        {enableParking && <button type="button" className={current === '__parking' ? 'active' : ''} onClick={() => setActive('__parking')}>停车记录</button>}
      </div></nav>
      <section className="forms-fill-content">
        {grouped.find((group) => group.name === current)?.fields.map((field) => {
          const lastValue = previous[field.id];
          const value = values[field.id] ?? '';
          return <div className={`forms-fill-row ${value ? 'filled' : ''}`} key={field.id}>
            <div className="forms-fill-label"><strong>{field.title}{field.required && <em>*</em>}</strong>{field.description && <small>{field.description}</small>}</div>
            <div className="forms-fill-last"><small>上次{lastValue ? ` ${lastValue.date.slice(5).replace('-', '/')}` : ''}</small><strong>{lastValue?.value ?? '--'}</strong></div>
            <div className={`forms-fill-entry forms-fill-entry-${field.type}`}>
              {field.type === 'select' ? <select value={value} onChange={(e) => setValues((currentValues) => ({ ...currentValues, [field.id]: e.target.value }))}><option value="">--</option>{field.options?.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select> : <input aria-label={field.title} inputMode={field.type === 'number' ? 'decimal' : undefined} type={field.type === 'date' ? 'date' : 'text'} placeholder={field.placeholder ?? '--'} maxLength={200} value={value} onChange={(e) => { const next = e.target.value; if (field.type !== 'number' || next === '' || /^-?\d*\.?\d*$/.test(next)) setValues((currentValues) => ({ ...currentValues, [field.id]: next })); }} />}
              {field.suffix && <span>{field.suffix}</span>}
            </div>
          </div>;
        })}
        {current === '__parking' && <div className="forms-fill-parking"><strong>停车记录（可选）</strong><p>如当班存在停车、检修或切换，请单独记录时间和原因。</p>
          {parking.map((record, index) => <div className="forms-parking-card" key={index}>
            <div className="forms-parking-card-head"><strong>记录 {index + 1}</strong><Button type="link" danger size="small" onClick={() => setParking((items) => items.filter((_, i) => i !== index))}>删除</Button></div>
            <div className="forms-parking-grid">
              <label>开始日期<Input type="date" value={record.startDate} onChange={(e) => patchParking(index, { startDate: e.target.value })} /></label>
              <label>开始时间<Input type="time" value={record.startTime} onChange={(e) => patchParking(index, { startTime: e.target.value })} /></label>
              <label>结束日期<Input type="date" value={record.endDate} onChange={(e) => patchParking(index, { endDate: e.target.value })} /></label>
              <label>结束时间<Input type="time" value={record.endTime} onChange={(e) => patchParking(index, { endTime: e.target.value })} /></label>
            </div><label>原因<Input placeholder="请输入停车原因" value={record.reason} onChange={(e) => patchParking(index, { reason: e.target.value })} /></label>
          </div>)}
          {!parking.length && <Empty description="暂无停车记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          <Button block type="dashed" icon={<PlusOutlined />} onClick={() => setParking((items) => [...items, emptyParking(today())])}>新增停车记录</Button>
        </div>}
      </section>
      <footer className="forms-fill-footer"><Button type="primary" block size="large" disabled={filled !== requiredFields.length} loading={submit.isPending} onClick={handleSubmit}>{requiredFields.length > 0 ? `确认并提交 (${filled}/${requiredFields.length})` : '确认并提交'}</Button></footer>
    </main>
  </div>;
}

