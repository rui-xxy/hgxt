import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { App, Button, Card, Input, Segmented, Space, Table } from 'antd';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { Role, type FormDTO } from '@hgxt/shared';
import { listForms } from '../../api/forms';
import { useMe } from '../../api/hooks';
import { TablePageFooter } from '../../components/PageNavigator';
import { PageHeader } from '../../components/PageHeader';
import { pagedViewportStyle } from '../../styles/pagedViewport';
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
  const tableRef = useRef<HTMLDivElement>(null);
  const query = useQuery({
    queryKey: ['forms', 'list', page, pageSize, keyword, category],
    queryFn: () => listForms({ page, pageSize, keyword, category }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (query.error) message.error(query.error.message); }, [query.error, message]);
  useLayoutEffect(() => {
    const body = tableRef.current?.querySelector<HTMLElement>('.ant-table-body');
    if (body) body.scrollTop = 0;
  }, [page, pageSize, keyword, category]);

  return <>
    <PageHeader title="总览" />
    <Card className="hgxt-surface" styles={{ body: { padding: 0 } }}>
      <div className="forms-category-bar">
        <Segmented
          value={category || '全部'}
          options={['全部', '生产', '设备', '人资', '品质', '总经办']}
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
      <div ref={tableRef}><Table<FormDTO>
        className="hgxt-paged-table"
        style={pagedViewportStyle(pageSize, 55)}
        rowKey="id"
        loading={query.isFetching}
        scroll={{ y: 'var(--hgxt-paged-viewport-height)', scrollToFirstRowOnChange: true }}
        dataSource={query.data?.items ?? []}
        columns={[
          { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true, render: (title: string) => <span className="forms-list-title">{title}</span> },
          { title: '分类', dataIndex: 'category', key: 'category', width: 96 },
          { title: '记录', dataIndex: 'submissionCount', key: 'submissionCount', width: 96, render: (count: number) => <span className="mono">{count.toLocaleString('zh-CN')}</span> },
          { title: '最新填写日期', dataIndex: 'latestEntryDate', key: 'latestEntryDate', width: 168, render: (date: string | null, form: FormDTO) => form.entryMode === 'sheet' ? <span className="forms-muted">—</span> : date ? <span className="mono forms-date-value">{date}</span> : <span className="forms-muted">暂无填写</span> },
          {
            title: '操作',
            key: 'actions',
            width: 136,
            fixed: 'right',
            render: (_: unknown, form: FormDTO) => <Space size={4}>
              {(isAdmin || form.code === 'maintenance_log') && <Button type="link" size="small" onClick={() => navigate(form.code === 'maintenance_log' ? '/maintenance/records' : `/forms/${form.id}`)}>{form.entryMode === 'sheet' ? '打开表格' : '数据'}</Button>}
              {form.entryMode === 'form' && <Button type="link" size="small" onClick={() => navigate(form.code === 'maintenance_log' ? '/maintenance/new' : `/form-fill/${form.id}`)}>填写</Button>}
              {!isAdmin && form.entryMode === 'sheet' && <span className="forms-muted">仅管理员</span>}
            </Space>,
          },
        ]}
        pagination={false}
      /></div>
      <TablePageFooter page={page} pageSize={pageSize} total={query.data?.total ?? 0}
        onChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size); }} />
    </Card>
  </>;
}

