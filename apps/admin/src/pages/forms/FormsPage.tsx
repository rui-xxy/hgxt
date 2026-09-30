import { useEffect, useState } from 'react';
import { App, Button, Input, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Role, type FormDTO } from '@hgxt/shared';
import { listForms } from '../../api/forms';
import { useMe } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { SearchIcon } from '../../components/icons';
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
    <PageHeader title="表单系统" meta={query.data ? query.data.total : undefined} />
    <div className="hg-list">
      <div className="hg-toolbar">
        <Input
          allowClear
          variant="filled"
          className="hg-search"
          prefix={<SearchIcon />}
          placeholder="搜索表单标题"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            if (!event.target.value) { setPage(1); setKeyword(''); }
          }}
          onPressEnter={() => { setPage(1); setKeyword(search.trim()); }}
        />
      </div>
      <Table<FormDTO>
        rowKey="id"
        loading={query.isLoading}
        dataSource={query.data?.items ?? []}
        columns={[
          {
            title: '表单',
            dataIndex: 'title',
            key: 'title',
            ellipsis: true,
            render: (title: string, form: FormDTO) => <div className="hg-cell-stack">
              <span className="hg-cell-primary">{title}</span>
              <span className="hg-cell-secondary tabular">{form.schema.filter((field) => !field.hidden).length} 个字段 · {form.submissionCount} 条记录</span>
            </div>,
          },
          {
            title: '最近填写',
            dataIndex: 'latestEntryDate',
            key: 'latestEntryDate',
            width: 168,
            render: (date: string | null) => date
              ? <span className="tabular hg-cell-muted">{date}</span>
              : <span className="hg-cell-empty">尚未填写</span>,
          },
          {
            title: <span className="hg-sr-only">操作</span>,
            key: 'actions',
            width: isAdmin ? 132 : 80,
            fixed: 'right',
            render: (_: unknown, form: FormDTO) => <div className="hg-row-actions">
              {isAdmin && <Button type="text" size="small" onClick={() => navigate(`/forms/${form.id}`)}>数据</Button>}
              <Button type="text" size="small" onClick={() => navigate(`/form-fill/${form.id}`)}>填写</Button>
            </div>,
          },
        ]}
        pagination={{
          current: page,
          pageSize,
          total: query.data?.total ?? 0,
          showSizeChanger: true,
          size: 'small',
          onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); },
        }}
      />
    </div>
  </>;
}
