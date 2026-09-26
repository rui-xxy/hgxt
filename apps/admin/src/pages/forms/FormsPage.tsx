import { useEffect, useState } from 'react';
import { App, Card, Input, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { FormDTO } from '@hgxt/shared';
import { listForms } from '../../api/forms';
import { PageHeader } from '../../components/PageHeader';
import './forms.css';

export function FormsPage() {
  const { message } = App.useApp();
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
          { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true, render: (title: string, form) => <Link className="forms-list-link" to={`/forms/${form.id}`}>{title}</Link> },
          { title: '最新填写时间', dataIndex: 'latestEntryDate', key: 'latestEntryDate', width: 180, render: (date: string | null) => date ?? <span className="forms-muted">暂无填写</span> },
          { title: '预览', key: 'preview', width: 100, render: (_, form) => <Link className="forms-list-link" to={`/forms/${form.id}`}>预览</Link> },
          { title: '表单', key: 'fill', width: 100, render: (_, form) => <Link className="forms-list-link" to={`/form-fill/${form.id}`}>填写</Link> },
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
