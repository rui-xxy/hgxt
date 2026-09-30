import { App, Button, Card, Result, Skeleton } from 'antd';
import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { getForm, listSubmissions } from '../../api/forms';
import { PageHeader } from '../../components/PageHeader';
import { DataSheet } from './components/DataSheet';
import './forms.css';

export function FormDataPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const scrollPositionRef = useRef({ left: 0, top: 0 });
  useEffect(() => { scrollPositionRef.current = { left: 0, top: 0 }; }, [id]);
  const { message } = App.useApp();
  const form = useQuery({ queryKey: ['forms', id], queryFn: () => getForm(id), enabled: !!id });
  const submissions = useQuery({ queryKey: ['forms', id, 'submissions'], queryFn: () => listSubmissions(id), enabled: !!id, refetchOnWindowFocus: false });
  useEffect(() => { const error = form.error ?? submissions.error; if (error) message.error(error.message); }, [form.error, submissions.error, message]);
  if (form.isLoading || submissions.isLoading) return <Skeleton active />;
  if (!form.data || !submissions.data) return <Result status="404" title="表单不存在" extra={<Link to="/forms">返回表单列表</Link>} />;

  return <>
    <PageHeader
      title={<><Link to="/forms" aria-label="返回表单列表" className="forms-back"><ArrowLeft size={20} strokeWidth={1.6} /></Link>{form.data.title}</>}
      extra={<Button onClick={() => navigate(`/form-fill/${id}`)}>预览表单</Button>}
    />
    <Card styles={{ body: { padding: 0 } }}>
      <DataSheet
        key={submissions.data.items.map((item) => `${item.id}:${item.updatedAt}`).join('|')}
        formId={id}
        formTitle={form.data.title}
        parkingEnabled={form.data.parkingEnabled}
        schema={form.data.schema}
        submissions={submissions.data.items}
        total={submissions.data.total}
        scrollPositionRef={scrollPositionRef}
      />
    </Card>
  </>;
}
