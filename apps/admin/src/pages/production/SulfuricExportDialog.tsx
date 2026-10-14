import { useState } from 'react';
import { App as AntApp, Modal, Select } from 'antd';
import type { SulfuricDaySummary } from '@hgxt/shared';
import { DownloadIcon } from '../../components/icons';
import { Seg } from './dash-ui';
import { SULFURIC_EXPORT_OPTIONS, type SulfuricExportPeriod, type SulfuricExportSection } from './sulfuricExportData';

export function SulfuricExportDialog({ days, currentMonth, onClose }: {
  days: SulfuricDaySummary[];
  currentMonth: string;
  onClose: () => void;
}) {
  const { message } = AntApp.useApp();
  const months = [...new Set(days.flatMap((day) => [day.productionDate.slice(0, 7), day.date.slice(0, 7), ...day.parkingRecords.map((record) => record.start.slice(0, 7))]))].sort().reverse();
  const availableMonths = months.includes(currentMonth) ? months : [currentMonth, ...months].sort().reverse();
  const years = [...new Set(availableMonths.map((item) => item.slice(0, 4)))].sort().reverse();
  const [scope, setScope] = useState<SulfuricExportPeriod['type']>('month');
  const [exportMonth, setExportMonth] = useState(currentMonth);
  const [exportYear, setExportYear] = useState(currentMonth.slice(0, 4));
  const [sections, setSections] = useState<SulfuricExportSection[]>(SULFURIC_EXPORT_OPTIONS.map((option) => option.value));
  const [busy, setBusy] = useState(false);
  const allSelected = sections.length === SULFURIC_EXPORT_OPTIONS.length;

  const toggle = (section: SulfuricExportSection) => {
    setSections((current) => current.includes(section) ? current.filter((value) => value !== section) : [...current, section]);
  };
  const exportFile = async () => {
    if (!sections.length) { message.warning('请至少选择一个分项'); return; }
    if (!days.length) { message.warning('暂无可导出的记录'); return; }
    const period: SulfuricExportPeriod = scope === 'all' ? { type: 'all' } : { type: scope, value: scope === 'month' ? exportMonth : exportYear };
    setBusy(true);
    try {
      const { downloadSulfuricExcel } = await import('./sulfuricExcel');
      await downloadSulfuricExcel(days, period, sections);
      message.success('Excel 文件已开始下载');
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? `导出失败：${error.message}` : '导出失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return <Modal
    title="导出硫酸车间明细"
    open
    onCancel={onClose}
    footer={null}
    width={560}
    destroyOnHidden
    className="workshop-export-dialog"
  >
    <div className="workshop-export-field">
      <div className="workshop-export-label">统计范围</div>
      <Seg options={[{ label: '月份', value: 'month' }, { label: '年份', value: 'year' }, { label: '全部', value: 'all' }]} value={scope} onChange={(value) => setScope(value as SulfuricExportPeriod['type'])} />
      <div className="workshop-export-period">
        {scope === 'month' ? <Select aria-label="选择导出月份" value={exportMonth} onChange={setExportMonth} options={availableMonths.map((item) => ({ value: item, label: `${item.slice(0, 4)} 年 ${Number(item.slice(5))} 月` }))} /> : null}
        {scope === 'year' ? <Select aria-label="选择导出年份" value={exportYear} onChange={setExportYear} options={years.map((item) => ({ value: item, label: `${item} 年` }))} /> : null}
        {scope === 'all' ? <span className="workshop-export-all">导出系统中全部已录入的硫酸车间数据</span> : null}
      </div>
    </div>
    <div className="workshop-export-field">
      <div className="workshop-export-heading">
        <div className="workshop-export-label">导出分项</div>
        <button type="button" className="workshop-export-select-all" aria-pressed={allSelected} onClick={() => setSections(allSelected ? [] : SULFURIC_EXPORT_OPTIONS.map((option) => option.value))}>{allSelected ? '取消全选' : '全选'}</button>
      </div>
      <div className="workshop-export-sections">
        {SULFURIC_EXPORT_OPTIONS.map((option) => <label key={option.value} className="workshop-export-section">
          <input type="checkbox" checked={sections.includes(option.value)} onChange={() => toggle(option.value)} />
          <span>{option.label}</span>
        </label>)}
      </div>
      <p className="workshop-export-note">每个分项生成一张工作表，按月汇总并保留每日原始记录。</p>
    </div>
    <div className="workshop-export-footer">
      <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>取消</button>
      <button type="button" className="btn primary" onClick={exportFile} disabled={busy || !sections.length || !days.length}>
        <DownloadIcon width={16} height={16} />{busy ? '正在生成…' : '导出 Excel'}
      </button>
    </div>
  </Modal>;
}
