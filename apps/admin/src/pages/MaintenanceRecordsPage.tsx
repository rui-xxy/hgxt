import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, DatePicker, Empty, Input, Modal, Select, Spin, Table, type TableProps } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Role } from '@hgxt/shared';
import type { Dayjs } from 'dayjs';
import { maintenanceApi, type MaintenanceRecord } from '../api/maintenance';
import { useMe } from '../api/hooks';
import { DownloadIcon, SearchIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { displayDate, numberText, peopleOf, recordsCsv, uniqueOptions, validHours } from './MaintenanceData';
import { MaintenanceNewPage } from './MaintenanceNewPage';
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
  const me = useMe();
  const query = useQuery({ queryKey: ['maintenance', 'records'], queryFn: maintenanceApi.list });
  const records = useMemo(() => query.data ?? [], [query.data]);
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [department, setDepartment] = useState<string | undefined>();
  const [cause, setCause] = useState<string | undefined>();
  const [person, setPerson] = useState<string | undefined>();
  const [visibleCount, setVisibleCount] = useState(80);
  const loadMoreRef = useRef<HTMLDivElement>(null);
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
  const visible = filtered.slice(0, visibleCount);
  const selected = selectedId ? records.find((record) => record.id === selectedId) ?? null : null;

  useEffect(() => {
    if (visibleCount >= filtered.length || !loadMoreRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount((count) => Math.min(count + 80, filtered.length));
    }, { rootMargin: '500px' });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [visibleCount, filtered.length]);

  const columns: TableProps<MaintenanceRecord>['columns'] = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 124, render: (_value, record) => <span className={`maintenance-date-cell ${record.date ? 'mono' : 'maintenance-anomaly'}`} title={record.date ? undefined : `原始日期：${record.sourceDateText}`}>{displayDate(record)}</span> },
    { title: '工作内容', dataIndex: 'workContent', key: 'workContent', ellipsis: true, render: (value: string) => <strong className="maintenance-content-cell" title={value}>{value || '—'}</strong> },
    { title: '部门', dataIndex: 'department', key: 'department', width: 140, responsive: ['md'], ellipsis: true, render: (value: string) => value || '—' },
    { title: '故障原因', dataIndex: 'faultCause', key: 'faultCause', width: 160, responsive: ['md'], ellipsis: true, render: (value: string) => value || '未填写' },
    { title: '维修工时', dataIndex: 'repairHours', key: 'repairHours', width: 110, responsive: ['sm'], align: 'right', render: (value: number | null) => value === null ? '—' : `${numberText(value, 2)} h` },
  ];

  const clearFilters = () => {
    setKeyword('');
    setDateRange(null);
    setDepartment(undefined);
    setCause(undefined);
    setPerson(undefined);
    setVisibleCount(80);
  };

  if (query.isLoading) return <div className="maintenance-center"><Spin tip="正在读取维修记录" /></div>;
  if (query.error) return <Alert type="error" showIcon message="维修记录加载失败" description={query.error.message} action={<Button onClick={() => void query.refetch()}>重试</Button>} />;

  return <div className="maintenance-page maintenance-records-page">
    <PageHeader title="维修记录" extra={<div className="maintenance-header-actions">
      <Button icon={<DownloadIcon width={16} height={16} />} disabled={!filtered.length} onClick={() => recordsCsv(filtered)}>导出 CSV</Button>
    </div>} />
    <div className="maintenance-filters">
      <Input aria-label="搜索维修记录" placeholder="搜索工作内容、型号、配件" prefix={<SearchIcon width={16} height={16} />} value={keyword} onChange={(event) => { setKeyword(event.target.value); setVisibleCount(80); }} allowClear className="maintenance-search" />
      <DatePicker.RangePicker aria-label="日期范围" value={dateRange} onChange={(value) => { setDateRange(value as [Dayjs, Dayjs] | null); setVisibleCount(80); }} />
      <Select aria-label="筛选部门" placeholder="部门：全部" allowClear showSearch optionFilterProp="label" value={department} options={departmentOptions.map((value) => ({ value, label: value }))} onChange={(value) => { setDepartment(value); setVisibleCount(80); }} className="maintenance-filter-select" />
      <Select aria-label="筛选故障原因" placeholder="原因：全部" allowClear showSearch optionFilterProp="label" value={cause} options={causeOptions.map((value) => ({ value, label: value }))} onChange={(value) => { setCause(value); setVisibleCount(80); }} className="maintenance-filter-select" />
      <Select aria-label="筛选维修人员" placeholder="人员：全部" allowClear showSearch optionFilterProp="label" value={person} options={personOptions.map((value) => ({ value, label: value }))} onChange={(value) => { setPerson(value); setVisibleCount(80); }} className="maintenance-filter-select" />
      <Button type="text" onClick={clearFilters}>清除筛选</Button>
      <div className="maintenance-result-count">共 {numberText(filtered.length)} 条 · {numberText(totalHours, 2)} h</div>
    </div>
    <section className="maintenance-records-card" aria-label="维修记录列表">
      <Table<MaintenanceRecord>
        className="maintenance-records-table"
        size="middle"
        rowKey="id"
        columns={columns}
        dataSource={visible}
        pagination={false}
        tableLayout="fixed"
        rowClassName={(record) => record.id === selectedId ? 'maintenance-record-selected' : ''}
        onRow={(record) => ({ onClick: () => setSelectedId(record.id), tabIndex: 0, role: 'button', 'aria-label': `${me.data?.role === Role.SUPER_ADMIN ? '编辑' : '查看'} ${displayDate(record)} 维修记录`, onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(record.id); } } })}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合条件的维修记录" /> }}
      />
      {visibleCount < filtered.length ? <div ref={loadMoreRef} className="maintenance-load-more" aria-label="继续向下加载维修记录" /> : null}
    </section>

    <Modal open={!!selected} onCancel={() => setSelectedId(null)} footer={null} title={me.data?.role === Role.SUPER_ADMIN ? null : '维修记录详情'} centered width={me.data?.role === Role.SUPER_ADMIN ? 'min(calc(100vw - 2rem), 60rem)' : 'min(calc(100vw - 2rem), 30rem)'} destroyOnHidden className={`maintenance-edit-modal ${me.data?.role === Role.SUPER_ADMIN ? 'maintenance-edit-modal-desktop' : ''}`}>
      {selected && me.data?.role === Role.SUPER_ADMIN ? <MaintenanceNewPage key={selected.id} editRecord={selected} onClose={() => setSelectedId(null)} desktop /> : selected ? <div className="maintenance-readonly-detail">
        <h2>{selected.workContent || '未填写工作内容'}</h2>
        <DetailItem label="日期" value={displayDate(selected)} mono />
        <DetailItem label="归属月份" value={`${selected.reportYear} 年 ${selected.reportMonth} 月`} mono />
        <DetailItem label="工作时间" value={selected.workTimeText} mono />
        <DetailItem label="维修工时" value={selected.repairHours === null ? '未填写' : `${numberText(selected.repairHours, 2)} h`} mono />
        <DetailItem label="部门" value={selected.department} />
        <DetailItem label="区域 / 位置" value={selected.location} />
        <DetailItem label="设备型号" value={selected.equipmentModel} mono />
        <DetailItem label="更换配件" value={selected.replacedParts} />
        <DetailItem label="维修人员" value={peopleOf(selected).join('、')} />
        {selected.remarks ? <DetailItem label="备注" value={selected.remarks} /> : null}
      </div> : null}
    </Modal>
  </div>;
}
