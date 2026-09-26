import { useEffect, useState } from 'react';
import { App, Button, Card, Input, Space, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Role, type FormDTO } from '@hgxt/shared';
import { listForms } from '../../api/forms';
import { useMe } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import './forms.css';

export function FormsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const me = useMe();
  const isAdmin = me.data?.role === Role.SUPER_ADMIN;
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = useQuery({
    queryKey: ['forms', 'list', page, pageSize, keyword],
    queryFn: () => listForms({ page, pageSize, keyword }),
  });
  useEffect(() => { if (query.error) message.error(query.error.message); }, [query.error, message]);

  return <>
    <PageHeader title="表单系统" />
    <Card styles={{ body: { padding: 0 } }}>
      <div className="forms-list-toolbar">
        <Input.Search
          placeholder="搜索表单标题"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onSearch={(value) => { setPage(1); setKeyword(value.trim()); }}
          allowClear
          style={{ width: 300, maxWidth: '100%' }}
        />
        <span className="forms-muted">共 {query.data?.total ?? 0} 个表单</span>
      </div>
      <Table<FormDTO>
        rowKey="id"
        loading={query.isLoading}
        dataSource={query.data?.items ?? []}
        columns={[
          { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true, render: (title: string) => <span className="forms-list-title">{title}</span> },
          { title: '最新填写时间', dataIndex: 'latestEntryDate', key: 'latestEntryDate', width: 168, render: (date: string | null) => date ? <span className="mono forms-date-value">{date}</span> : <span className="forms-muted">暂无填写</span> },
          {
            title: '操作',
            key: 'actions',
            width: isAdmin ? 136 : 80,
            fixed: 'right',
            render: (_: unknown, form: FormDTO) => <Space size={4}>
              {isAdmin && <Button type="link" size="small" onClick={() => navigate(`/forms/${form.id}`)}>数据</Button>}
              <Button type="link" size="small" onClick={() => navigate(`/form-fill/${form.id}`)}>填写</Button>
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

