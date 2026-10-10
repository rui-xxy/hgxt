import { App, Button, Card, Input, Result, Select, Skeleton, Spin } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { getForm, listSubmissions } from '../../api/forms';
import { PageHeader } from '../../components/PageHeader';
import { DataSheet } from './components/DataSheet';
import './forms.css';

export async function loadFormSubmissions(id: string, page: number, pageSize: number, filters: { keyword: string; progress: string }, sectioned: boolean) {
  if (!sectioned) return listSubmissions(id, page, pageSize, filters);
  const first = await listSubmissions(id, 1, 1000, filters);
  const remainingPages = Math.ceil(first.total / 1000) - 1;
  if (remainingPages <= 0) return first;
  const rest = await Promise.all(Array.from({ length: remainingPages }, (_, index) => listSubmissions(id, index + 2, 1000, filters)));
  return { ...first, items: [...first.items, ...rest.flatMap((result) => result.items)] };
}

export function FormDataPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [progress, setProgress] = useState('');
  const [sheetDirty, setSheetDirty] = useState(false);
  const scrollPositionRef = useRef({ left: 0, top: 0 });
  useEffect(() => { scrollPositionRef.current = { left: 0, top: 0 }; }, [id]);
  const { message } = App.useApp();
  const form = useQuery({ queryKey: ['forms', id], queryFn: () => getForm(id), enabled: !!id });
  const isFenglian = form.data?.code === 'fenglian_daily';
  const isSulfuricControl = form.data?.code?.startsWith('sulfuric_control_') ?? false;
  const isSectioned = isFenglian || isSulfuricControl;
  const pageSize = form.data?.entryMode === 'sheet' ? 100 : 1000;
  const submissions = useQuery({
    queryKey: ['forms', id, 'submissions', page, pageSize, keyword, progress],
    queryFn: () => loadFormSubmissions(id, page, pageSize, { keyword, progress }, isSectioned),
    enabled: !!id && !!form.data && form.data.code !== 'maintenance_log' && !isSulfuricControl,
    refetchOnWindowFocus: false,
    placeholderData: (previousData, previousQuery) => previousQuery?.queryKey[1] === id ? previousData : undefined,
  });
  useEffect(() => { const error = form.error ?? submissions.error; if (error) message.error(error.message); }, [form.error, submissions.error, message]);
  if (form.isLoading) return <Skeleton active />;
  if (form.data?.code === 'maintenance_log') return <Navigate to="/maintenance/records" replace />;
  if (isSulfuricControl) return <Navigate to="/forms/sulfuric-control" replace />;
  if (submissions.isLoading) return <Skeleton active />;
  if (!form.data || !submissions.data) return <Result status="404" title="表单不存在" extra={<Link to="/forms">返回表单列表</Link>} />;

  return <>
    <PageHeader
      title={<><Link to="/forms" aria-label="返回表单列表" className="forms-back"><ArrowLeft size={20} strokeWidth={1.6} /></Link>{form.data.title}</>}
      extra={form.data.entryMode === 'form' ? <Button onClick={() => navigate(`/form-fill/${id}`)}>预览表单</Button> : undefined}
    />
    <Card styles={{ body: { padding: 0 } }}>
      {form.data.entryMode === 'sheet' && !isSulfuricControl && <div className="forms-sheet-filters">
        <Input.Search
          placeholder="搜索事项、部门、负责人、来源"
          aria-label="搜索事项"
          disabled={sheetDirty}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            if (!event.target.value) { setKeyword(''); setPage(1); }
          }}
          onSearch={(value) => { setKeyword(value.trim()); setPage(1); }}
          allowClear
          className="forms-sheet-search"
        />
        <Select
          aria-label="筛选进度"
          disabled={sheetDirty}
          value={progress || undefined}
          placeholder="全部进度"
          allowClear
          options={['已完成', '进行中', '延期完成', '搁置', '延期'].map((value) => ({ label: value, value }))}
          onChange={(value) => { setProgress(value ?? ''); setPage(1); }}
          className="forms-sheet-progress"
        />
      </div>}
      <Spin spinning={submissions.isPlaceholderData} delay={150}>
        <DataSheet
          key={submissions.data.items.map((item) => `${item.id}:${item.updatedAt}`).join('|')}
          formId={id}
          formTitle={form.data.title}
          parkingEnabled={form.data.parkingEnabled}
          schema={form.data.schema}
          sectioned={isSectioned}
          submissions={submissions.data.items}
          total={submissions.data.total}
          showLiveRemaining={form.data.schema.some((field) => field.id === 'remainingAtExport')}
          page={submissions.data.page}
          pageSize={submissions.data.pageSize}
          disableAdd={!!keyword || !!progress}
          onDirtyChange={setSheetDirty}
          onPageChange={form.data.entryMode === 'sheet' && !isSectioned ? (nextPage) => {
            scrollPositionRef.current = { left: 0, top: 0 };
            setPage(nextPage);
          } : undefined}
          scrollPositionRef={scrollPositionRef}
        />
      </Spin>
    </Card>
  </>;
}
