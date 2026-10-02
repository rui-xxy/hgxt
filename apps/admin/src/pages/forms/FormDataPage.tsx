import { App, Button, Skeleton } from 'antd';
import { useEffect, useRef } from 'react';
<<<<<<< HEAD
import { ArrowLeft } from 'lucide-react';
=======
>>>>>>> claude/exciting-shannon-u2nwwv
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { getForm, listSubmissions } from '../../api/forms';
import { PageHeader } from '../../components/PageHeader';
import { StatusView } from '../../components/StatusView';
import { ArrowLeftIcon, EyeIcon, FileSearchIcon } from '../../components/icons';
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
  if (!form.data || !submissions.data) return <StatusView
    icon={<FileSearchIcon />}
    title="表单不存在"
    description="它可能已被删除，或链接有误。"
    actions={<Link to="/forms"><Button icon={<ArrowLeftIcon />}>返回表单列表</Button></Link>}
  />;

  return <>
    <PageHeader
<<<<<<< HEAD
      title={<><Link to="/forms" aria-label="返回表单列表" className="forms-back"><ArrowLeft size={20} strokeWidth={1.6} /></Link>{form.data.title}</>}
      extra={<Button onClick={() => navigate(`/form-fill/${id}`)}>预览表单</Button>}
=======
      back={{ to: '/forms', label: '返回表单列表' }}
      title={form.data.title}
      meta={`${submissions.data.total} 条记录`}
      extra={<Button icon={<EyeIcon />} onClick={() => navigate(`/form-fill/${id}`)}>预览表单</Button>}
>>>>>>> claude/exciting-shannon-u2nwwv
    />
    <div className="hg-surface">
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
    </div>
  </>;
}
