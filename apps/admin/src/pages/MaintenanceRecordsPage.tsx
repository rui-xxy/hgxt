import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Drawer, Empty, Input, Select, Spin, Table, type TableProps } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Role } from '@hgxt/shared';
import type { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router';
import { maintenanceApi, type MaintenanceRecord } from '../api/maintenance';
import { useMe } from '../api/hooks';
import { DownloadIcon, PencilIcon, PlusIcon, SearchIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { TablePageFooter } from '../components/PageNavigator';
import { displayDate, numberText, peopleOf, recordsCsv, suspiciousHours, uniqueOptions, validHours } from './MaintenanceData';
import './maintenance.css';

function sortRecords(a: MaintenanceRecord, b: MaintenanceRecord): number {
  const periodA = a.reportYear * 100 + a.reportMonth;
  const periodB = b.reportYear * 100 + b.reportMonth;
  if (periodA !== periodB) return periodB - periodA;
  if (a.date !== b.date) return (b.date ?? '').localeCompare(a.date ?? '');
  if (a.sourceRow !== b.sourceRow) return (b.sourceRow ?? 0) - (a.sourceRow ?? 0);
  return b.id.localeCompare(a.id);
}

function DetailItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="maintenance-detail-item"><span>{label}</span><strong className={mono ? 'mono' : ''}>{value || '—'}</strong></div>;
}

export function MaintenanceRecordsPage() {
  const navigate = useNavigate();
  const me = useMe();
  const query = useQuery({ queryKey: ['maintenance', 'records'], queryFn: maintenanceApi.list });
  const records = useMemo(() => query.data ?? [], [query.data]);
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [department, setDepartment] = useState<string | undefined>();
  const [cause, setCause] = useState<string | undefined>();
  const [person, setPerson] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const departmentOptions = useMemo(() => uniqueOptions(records.map((record) => record.department)), [records]);
  const causeOptions = useMemo(() => uniqueOptions(records.map((record) => record.faultCause)), [records]);
  const personOptions = useMemo(() => uniqueOptions(records.flatMap(peopleOf)), [records]);
  const filtered = useMemo(() => {
    const search = keyword.trim().toLocaleLowerCase();
    const start = dateRange?.[0].format('YYYY-MM-DD');
    const end = dateRange?.[1].format('YYYY-MM-DD');
    return records.filter((record) => {
      if (search && ![record.workContent, record.equipmentModel, record.replacedParts].some((value) => value.toLocaleLowerCase().includes(search))) return false;
      if (start && end && (record.date === null || record.date < start || record.date > end)) return false;
      if (department && record.department !== department) return false;
      if (cause && record.faultCause !== cause) return false;
      if (person && !peopleOf(record).includes(person)) return false;
      return true;
    }).sort(sortRecords);
  }, [records, keyword, dateRange, department, cause, person]);
  const totalHours = filtered.reduce((sum, record) => sum + (validHours(record) ?? 0), 0);
  const suspiciousCount = filtered.filter(suspiciousHours).length;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = selectedId ? records.find((record) => record.id === selectedId) ?? null : null;
  const related = selected?.equipmentModel.trim() && selected.equipmentModel.trim() !== '/' && selected.equipmentModel.trim() !== '／'
    ? records.filter((record) => record.id !== selected.id && record.equipmentModel === selected.equipmentModel && record.reportYear === selected.reportYear && record.reportMonth === selected.reportMonth).sort(sortRecords).slice(0, 5)
    : [];

  const columns: TableProps<MaintenanceRecord>['columns'] = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 124, render: (_value, record) => <span className={`maintenance-date-cell ${record.date ? 'mono' : 'maintenance-anomaly'}`} title={record.date ? undefined : `原始日期：${record.sourceDateText}`}>{displayDate(record)}</span> },
    { title: '工作内容', dataIndex: 'workContent', key: 'workContent', ellipsis: true, render: (value: string) => <strong className="maintenance-content-cell" title={value}>{value || '—'}</strong> },
    { title: '部门', dataIndex: 'department', key: 'department', width: 140, ellipsis: true, render: (value: string) => value || '—' },
    { title: '故障原因', dataIndex: 'faultCause', key: 'faultCause', width: 160, ellipsis: true, render: (value: string) => value || '未填写' },
    { title: '工时', dataIndex: 'repairHours', key: 'repairHours', width: 110, align: 'right', render: (value: number | null) => value === null ? '—' : value < 0 || value > 24 ? <span className="maintenance-anomaly" title="工时待核对，统计保留原值">{numberText(value, 2)} h *</span> : `${numberText(value, 2)} h` },
  ];

  const clearFilters = () => {
    setKeyword('');
    setDateRange(null);
    setDepartment(undefined);
    setCause(undefined);
    setPerson(undefined);
    setPage(1);
  };

  if (query.isLoading) return <div className="maintenance-center"><Spin tip="正在读取维修记录" /></div>;
  if (query.error) return <Alert type="error" showIcon message="维修记录加载失败" description={query.error.message} action={<Button onClick={() => void query.refetch()}>重试</Button>} />;

  return <div className="maintenance-page maintenance-records-page">
    <PageHeader title="维修记录" description="查看、筛选与维护原始维修日志" extra={<div className="maintenance-header-actions">
      <Button icon={<DownloadIcon width={16} height={16} />} disabled={!filtered.length} onClick={() => recordsCsv(filtered)}>导出 CSV</Button>
      <Button type="primary" icon={<PlusIcon width={16} height={16} />} onClick={() => navigate('/maintenance/new')}>维修登记</Button>
    </div>} />
    <div className="maintenance-filters">
      <Input aria-label="搜索维修记录" placeholder="搜索工作内容、型号、配件" prefix={<SearchIcon width={16} height={16} />} value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} allowClear className="maintenance-search" />
      <DatePicker.RangePicker aria-label="日期范围" value={dateRange} onChange={(value) => { setDateRange(value as [Dayjs, Dayjs] | null); setPage(1); }} />
      <Select aria-label="筛选部门" placeholder="部门：全部" allowClear showSearch optionFilterProp="label" value={department} options={departmentOptions.map((value) => ({ value, label: value }))} onChange={(value) => { setDepartment(value); setPage(1); }} className="maintenance-filter-select" />
      <Select aria-label="筛选故障原因" placeholder="原因：全部" allowClear showSearch optionFilterProp="label" value={cause} options={causeOptions.map((value) => ({ value, label: value }))} onChange={(value) => { setCause(value); setPage(1); }} className="maintenance-filter-select" />
      <Select aria-label="筛选维修人员" placeholder="人员：全部" allowClear showSearch optionFilterProp="label" value={person} options={personOptions.map((value) => ({ value, label: value }))} onChange={(value) => { setPerson(value); setPage(1); }} className="maintenance-filter-select" />
      <Button type="text" onClick={clearFilters}>清除筛选</Button>
      <div className="maintenance-result-count">共 {numberText(filtered.length)} 条 · 原值工时 {numberText(totalHours, 2)} h{suspiciousCount ? ` · ${suspiciousCount} 条工时待核对` : ''}</div>
    </div>
    <section className="maintenance-records-card" aria-label="维修记录列表">
      <Table<MaintenanceRecord>
        className="maintenance-records-table"
        size="middle"
        rowKey="id"
        columns={columns}
        dataSource={visible}
        pagination={false}
        scroll={{ x: 850, y: 640 }}
        rowClassName={(record) => record.id === selectedId ? 'maintenance-record-selected' : ''}
        onRow={(record) => ({ onClick: () => setSelectedId(record.id), tabIndex: 0, role: 'button', 'aria-label': `查看 ${displayDate(record)} 维修记录`, onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(record.id); } } })}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合条件的维修记录" /> }}
      />
      {filtered.length ? <TablePageFooter page={currentPage} pageSize={pageSize} total={filtered.length} onChange={setPage} onPageSizeChange={(nextSize) => { setPageSize(nextSize); setPage(1); }} />
        : <div className="hgxt-table-pagination"><span className="hgxt-table-pagination-count">共 0 条</span></div>}
    </section>

    <Drawer open={!!selected} onClose={() => setSelectedId(null)} title="维修记录详情" width="min(100vw, 440px)" className="maintenance-drawer" extra={selected && me.data?.role === Role.SUPER_ADMIN ? <Button icon={<PencilIcon width={16} height={16} />} onClick={() => navigate(`/maintenance/new?edit=${encodeURIComponent(selected.id)}`)}>编辑</Button> : null}>
      {selected ? <>
        <div className="maintenance-drawer-id mono">{selected.sourceRow === null ? '新登记' : `源表第 ${selected.sourceRow} 行`}</div>
        <h2>{selected.workContent || '未填写工作内容'}</h2>
        <div className="maintenance-drawer-tags"><span>{selected.faultType || '类型未填'}</span><span>{selected.faultCause || '原因未填'}</span>{selected.isRework ? <span className="maintenance-rework-tag">返工</span> : null}</div>
        <DetailItem label="日期" value={displayDate(selected)} mono />
        <DetailItem label="归属月份" value={`${selected.reportYear} 年 ${selected.reportMonth} 月`} mono />
        <DetailItem label="工作时间" value={selected.workTimeText} mono />
        <DetailItem label="维修工时" value={selected.repairHours === null ? '未填写' : `${numberText(selected.repairHours, 2)} h${suspiciousHours(selected) ? ' · 待核对' : ''}`} mono />
        <DetailItem label="部门" value={selected.department} />
        <DetailItem label="区域 / 位置" value={selected.location} />
        <DetailItem label="设备型号" value={selected.equipmentModel} mono />
        <DetailItem label="更换配件" value={selected.replacedParts} />
        <DetailItem label="维修人员" value={peopleOf(selected).join('、')} />
        {selected.remarks ? <DetailItem label="备注" value={selected.remarks} /> : null}
        {related.length ? <div className="maintenance-related"><h3>同型号当月其他记录 · {related.length} 条</h3>
          {related.map((record) => <button type="button" key={record.id} onClick={() => setSelectedId(record.id)}><span className="mono">{displayDate(record)}</span><span>{record.workContent || '未填写工作内容'}</span></button>)}
        </div> : null}
      </> : null}
    </Drawer>
  </div>;
}
