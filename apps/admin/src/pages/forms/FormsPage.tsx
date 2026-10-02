import { useEffect, useState } from 'react';
import { App, Button, Card, Input, Segmented, Space, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { Role, type FormDTO } from '@hgxt/shared';
import { listForms } from '../../api/forms';
import { useMe } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import './forms.css';

export function FormsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get('category') ?? '';
  const me = useMe();
  const isAdmin = me.data?.role === Role.SUPER_ADMIN;
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const query = useQuery({
    queryKey: ['forms', 'list', page, pageSize, keyword, category],
    queryFn: () => listForms({ page, pageSize, keyword, category }),
  });
  useEffect(() => { if (query.error) message.error(query.error.message); }, [query.error, message]);

  return <>
    <PageHeader title="总览" />
    <Card className="hgxt-surface" styles={{ body: { padding: 0 } }}>
      <div className="forms-category-bar">
        <Segmented
          value={category || '全部'}
          options={['全部', '生产', '人资', '品质', '总经办']}
          onChange={(value) => {
            setPage(1);
            setSearchParams(value === '全部' ? {} : { category: value });
          }}
        />
      </div>
      <div className="hgxt-toolbar">
        <Input.Search
          placeholder="搜索表单标题"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onSearch={(value) => { setPage(1); setKeyword(value.trim()); }}
          allowClear
          className="hgxt-toolbar-search"
        />
        <span className="hgxt-toolbar-meta">共 {query.data?.total ?? 0} 个标题</span>
      </div>
      <Table<FormDTO>
        rowKey="id"
        loading={query.isLoading}
        dataSource={query.data?.items ?? []}
        columns={[
          { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true, render: (title: string) => <span className="forms-list-title">{title}</span> },
          { title: '分类', dataIndex: 'category', key: 'category', width: 96 },
          { title: '记录', dataIndex: 'submissionCount', key: 'submissionCount', width: 96, render: (count: number) => <span className="mono">{count.toLocaleString('zh-CN')}</span> },
          { title: '最新填写日期', dataIndex: 'latestEntryDate', key: 'latestEntryDate', width: 168, render: (date: string | null, form: FormDTO) => form.entryMode === 'sheet' ? <span className="forms-muted">—</span> : date ? <span className="mono forms-date-value">{date}</span> : <span className="forms-muted">暂无填写</span> },
          {
            title: '操作',
            key: 'actions',
            width: isAdmin ? 136 : 90,
            fixed: 'right',
            render: (_: unknown, form: FormDTO) => <Space size={4}>
              {isAdmin && <Button type="link" size="small" onClick={() => navigate(`/forms/${form.id}`)}>{form.entryMode === 'sheet' ? '打开表格' : '数据'}</Button>}
              {form.entryMode === 'form' && <Button type="link" size="small" onClick={() => navigate(`/form-fill/${form.id}`)}>填写</Button>}
              {!isAdmin && form.entryMode === 'sheet' && <span className="forms-muted">仅管理员</span>}
            </Space>,
          },
        ]}
        pagination={{
          current: page,
          pageSize,
          total: query.data?.total ?? 0,
          showSizeChanger: true,
          onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); },
        }}
      />
    </Card>
  </>;
}

