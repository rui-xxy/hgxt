import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, DatePicker, Empty, Input, Modal, Select, Spin, Table, type TableProps } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Role } from '@hgxt/shared';
import type { Dayjs } from 'dayjs';
import { Link } from 'react-router';
import { maintenanceApi, type MaintenanceRecord } from '../api/maintenance';
import { useMe } from '../api/hooks';
import { ArrowLeftIcon, DownloadIcon, SearchIcon } from '../components/icons';
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
  const tableShellRef = useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const departmentOptions = useMemo(() => uniqueOptions(records.map((record) => record.department)), [records]);
  const causeOptions = useMemo(() => uniqueOptions(records.map((record) => record.faultCause)), [records]);
  const personOptions = useMemo(() => uniqueOptions(records.flatMap(peopleOf)), [records]);
  const filtered = useMemo(() => {
    const search = keyword.trim().toLocaleLowerCase();
    const start = dateRange?.[0].format('YYYY-MM-DD');
    const end = dateRange?.[1].format('YYYY-MM-DD');
    return records.filter((record) => {
      if (search && ![record.workContent, record.workshop, record.equipmentName, record.equipmentModel, record.replacedParts].some((value) => value.toLocaleLowerCase().includes(search))) return false;
      if (start && end && (record.date === null || record.date < start || record.date > end)) return false;
      if (department && record.department !== department) return false;
      if (cause && record.faultCause !== cause) return false;
      if (person && !peopleOf(record).includes(person)) return false;
      return true;
    }).sort(sortRecords);
  }, [records, keyword, dateRange, department, cause, person]);
  const totalHours = filtered.reduce((sum, record) => sum + (validHours(record) ?? 0), 0);
  const selected = selectedId ? records.find((record) => record.id === selectedId) ?? null : null;

  useLayoutEffect(() => {
    tableShellRef.current?.querySelector<HTMLElement>('.ant-table-tbody-virtual-holder')?.scrollTo({ top: 0 });
  }, [keyword, dateRange, department, cause, person]);

  const columns: TableProps<MaintenanceRecord>['columns'] = [
    { title: '#', key: 'index', width: 60, fixed: 'left', align: 'center', render: (_value, _record, index) => <span className="mono maintenance-row-number">{index + 1}</span> },
    { title: '日期', dataIndex: 'date', key: 'date', width: 132, fixed: 'left', align: 'center', render: (_value, record) => <span className={`maintenance-date-cell ${record.date ? 'mono' : 'maintenance-anomaly'}`} title={record.date ? undefined : `原始日期：${record.sourceDateText}`}>{displayDate(record)}</span> },
    { title: '工作内容', dataIndex: 'workContent', key: 'workContent', width: 420, ellipsis: true, render: (value: string) => <strong className="maintenance-content-cell" title={value}>{value || '—'}</strong> },
    { title: '维修人员', dataIndex: 'personnel', key: 'personnel', width: 150, align: 'center', ellipsis: true, render: (_value, record) => peopleOf(record).join('、') || '—' },
    { title: '所属部门', dataIndex: 'department', key: 'department', width: 170, align: 'center', ellipsis: true, render: (value: string) => value || '—' },
    { title: '区域 / 位置', dataIndex: 'location', key: 'location', width: 160, align: 'center', ellipsis: true, render: (value: string) => value || '—' },
    { title: '车间', dataIndex: 'workshop', key: 'workshop', width: 180, align: 'center', ellipsis: true, render: (value: string) => value || '—' },
    { title: '设备名称', dataIndex: 'equipmentName', key: 'equipmentName', width: 190, align: 'center', ellipsis: true, render: (value: string) => value || '—' },
    { title: '规格型号', dataIndex: 'equipmentModel', key: 'equipmentModel', width: 150, align: 'center', ellipsis: true, render: (value: string) => value || '—' },
    { title: '工作时间', dataIndex: 'workTimeText', key: 'workTimeText', width: 150, align: 'center', ellipsis: true, render: (value: string) => <span className="mono">{value || '—'}</span> },
    { title: '维修工时 h', dataIndex: 'repairHours', key: 'repairHours', width: 115, align: 'center', render: (value: number | null) => <span className="mono">{value === null ? '—' : numberText(value, 2)}</span> },
    { title: '故障原因', dataIndex: 'faultCause', key: 'faultCause', width: 170, align: 'center', ellipsis: true, render: (value: string) => value || '未填写' },
    { title: '更换配件', dataIndex: 'replacedParts', key: 'replacedParts', width: 190, align: 'center', ellipsis: true, render: (value: string) => value || '—' },
  ];

  const clearFilters = () => {
    setKeyword('');
    setDateRange(null);
    setDepartment(undefined);
    setCause(undefined);
    setPerson(undefined);
  };

  if (query.isLoading) return <div className="maintenance-center"><Spin tip="正在读取维修记录" /></div>;
  if (query.error) return <Alert type="error" showIcon message="维修记录加载失败" description={query.error.message} action={<Button onClick={() => void query.refetch()}>重试</Button>} />;

  return <div className="maintenance-page maintenance-records-page">
    <PageHeader title={<><Link to="/forms?category=设备" aria-label="返回设备表单" className="maintenance-records-back"><ArrowLeftIcon width={20} height={20} /></Link>维修记录</>} extra={<div className="maintenance-header-actions">
      <Button icon={<DownloadIcon width={16} height={16} />} disabled={!filtered.length} onClick={() => recordsCsv(filtered)}>导出 CSV</Button>
    </div>} />
    <section ref={tableShellRef} className="maintenance-records-card" aria-label="维修记录列表">
      <div className="maintenance-filters">
        <Input aria-label="搜索维修记录" placeholder="搜索内容、设备、型号" prefix={<SearchIcon width={16} height={16} />} value={keyword} onChange={(event) => setKeyword(event.target.value)} allowClear className="maintenance-search" />
        <DatePicker.RangePicker aria-label="日期范围" value={dateRange} onChange={(value) => setDateRange(value as [Dayjs, Dayjs] | null)} />
        <Select aria-label="筛选部门" placeholder="部门：全部" allowClear showSearch optionFilterProp="label" value={department} options={departmentOptions.map((value) => ({ value, label: value }))} onChange={setDepartment} className="maintenance-filter-select" />
        <Select aria-label="筛选故障原因" placeholder="原因：全部" allowClear showSearch optionFilterProp="label" value={cause} options={causeOptions.map((value) => ({ value, label: value }))} onChange={setCause} className="maintenance-filter-select" />
        <Select aria-label="筛选维修人员" placeholder="人员：全部" allowClear showSearch optionFilterProp="label" value={person} options={personOptions.map((value) => ({ value, label: value }))} onChange={setPerson} className="maintenance-filter-select" />
        <Button type="text" onClick={clearFilters}>清除筛选</Button>
        <div className="maintenance-result-count">共 {numberText(filtered.length)} 条 · {numberText(totalHours, 2)} h</div>
      </div>
      <Table<MaintenanceRecord>
        className="maintenance-records-table"
        size="small"
        bordered
        virtual
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        pagination={false}
        scroll={{ x: 2300, y: 580, scrollToFirstRowOnChange: true }}
        tableLayout="fixed"
        rowClassName={(record) => record.id === selectedId ? 'maintenance-record-selected' : ''}
        onRow={(record) => ({ onClick: () => setSelectedId(record.id), tabIndex: 0, role: 'button', 'aria-label': `${me.data?.role === Role.SUPER_ADMIN ? '编辑' : '查看'} ${displayDate(record)} 维修记录`, onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(record.id); } } })}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合条件的维修记录" /> }}
      />
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
        <DetailItem label="车间" value={selected.workshop} />
        <DetailItem label="设备名称" value={selected.equipmentName} />
        <DetailItem label="规格型号" value={selected.equipmentModel} mono />
        <DetailItem label="更换配件" value={selected.replacedParts} />
        <DetailItem label="维修人员" value={peopleOf(selected).join('、')} />
        {selected.remarks ? <DetailItem label="备注" value={selected.remarks} /> : null}
      </div> : null}
    </Modal>
  </div>;
}
