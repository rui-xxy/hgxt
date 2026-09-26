import { useEffect, useState } from 'react';
import { App, Card, Input, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Role, type FormDTO } from '@hgxt/shared';
import { listForms } from '../../api/forms';
import { useMe } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import './forms.css';

export function FormsPage() {
  const { message } = App.useApp();
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
          // 标题与「预览」都是数据查看入口（仅管理员）；USER 只保留「填写」
          { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true, render: (title: string, form) => isAdmin ? <Link className="forms-list-link" to={`/forms/${form.id}`}>{title}</Link> : <span>{title}</span> },
          { title: '最新填写时间', dataIndex: 'latestEntryDate', key: 'latestEntryDate', width: 180, render: (date: string | null) => date ?? <span className="forms-muted">暂无填写</span> },
          ...(isAdmin ? [{ title: '预览', key: 'preview', width: 100, render: (_: unknown, form: FormDTO) => <Link className="forms-list-link" to={`/forms/${form.id}`}>预览</Link> }] : []),
          { title: '表单', key: 'fill', width: 100, render: (_: unknown, form: FormDTO) => <Link className="forms-list-link" to={`/form-fill/${form.id}`}>填写</Link> },
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
