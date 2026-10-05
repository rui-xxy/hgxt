import { useMemo, useState, type CSSProperties } from 'react';
import { Alert, Button, DatePicker, Empty, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import type { MaintenanceRecord } from '../api/maintenance';
import { maintenanceApi } from '../api/maintenance';
import { DownloadIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import {
  hasParts, inPeriod, monthKey, numberText, peopleOf, percentText, primaryValue,
  recordsCsv, validHours, type MaintenancePeriod,
} from './MaintenanceData';
import './maintenance.css';

type DetailTab = 'people' | 'departments' | 'months';
type PeriodMode = 'month' | 'year' | 'custom';

interface MonthRow {
  key: string;
  year: number;
  month: number;
  records: MaintenanceRecord[];
  hours: number;
  parts: number;
  people: number;
  departments: number;
  rework: number;
}

function sumHours(records: MaintenanceRecord[]): number {
  return records.reduce((sum, record) => sum + (validHours(record) ?? 0), 0);
}

function monthRows(records: MaintenanceRecord[], period: MaintenancePeriod): MonthRow[] {
  const groups = new Map<string, MaintenanceRecord[]>();
  for (const record of records) {
    if (!inPeriod(record, period) || record.reportMonth < 1 || record.reportMonth > 12) continue;
    const key = monthKey(record.reportYear, record.reportMonth);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  if (period.kind === 'year') {
    const now = new Date();
    const endMonth = period.year === now.getFullYear() ? now.getMonth() + 1 : period.year < now.getFullYear() ? 12 : 1;
    for (let month = 1; month <= endMonth; month += 1) {
      const key = monthKey(period.year, month);
      if (!groups.has(key)) groups.set(key, []);
    }
  }
  if (period.kind === 'month') {
    const key = monthKey(period.year, period.month);
    if (!groups.has(key)) groups.set(key, []);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => ({
    key,
    year: Number(key.slice(0, 4)),
    month: Number(key.slice(5, 7)),
    records: rows,
    hours: sumHours(rows),
    parts: rows.filter(hasParts).length,
    people: new Set(rows.flatMap(peopleOf)).size,
    departments: new Set(rows.map((row) => row.department.trim()).filter(Boolean)).size,
    rework: rows.filter((row) => row.isRework).length,
  }));
}

function groupTop(records: MaintenanceRecord[], keyOf: (record: MaintenanceRecord) => string) {
  const groups = new Map<string, MaintenanceRecord[]>();
  for (const record of records) {
    const key = keyOf(record).trim();
    if (!key || key === '/' || key === '／') continue;
    const rows = groups.get(key) ?? [];
    rows.push(record);
    groups.set(key, rows);
  }
  return [...groups.entries()]
    .map(([name, rows]) => ({
      name,
      count: rows.length,
      department: primaryValue(rows.map((row) => row.department)),
      cause: primaryValue(rows.map((row) => row.faultCause)),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, 8);
}

function KpiCard({ label, value, unit, note }: { label: string; value: string; unit?: string; note: string }) {
  return <div className="maintenance-kpi">
    <div className="maintenance-kpi-label">{label}</div>
    <div className="maintenance-kpi-value">{value}<small>{unit}</small></div>
    <div className="maintenance-kpi-note" title={note}>{note}</div>
  </div>;
}

export function MaintenanceOverviewPage() {
  const query = useQuery({ queryKey: ['maintenance', 'records'], queryFn: maintenanceApi.list });
  const records = useMemo(() => query.data ?? [], [query.data]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('year');
  const [year, setYear] = useState(new Date().getFullYear());
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('people');
  const currentMonth = new Date().getMonth() + 1;
  const period: MaintenancePeriod = periodMode === 'custom' && customRange
    ? { kind: 'custom', start: customRange[0].format('YYYY-MM-DD'), end: customRange[1].format('YYYY-MM-DD') }
    : periodMode === 'month' ? { kind: 'month', year, month: currentMonth } : { kind: 'year', year };

  const selected = records.filter((record) => inPeriod(record, period));
  const months = monthRows(records, period);
  const maxMonth = Math.max(1, ...months.map((month) => month.records.length));
  const valid = selected.filter((record) => validHours(record) !== null);
  const totalHours = sumHours(selected);
  const partCount = selected.filter(hasParts).length;
  const qualityCount = selected.filter((record) => record.faultCause.includes('设备本身质量')).length;
  const reworkCount = selected.filter((record) => record.isRework).length;
  const people = new Set(selected.flatMap(peopleOf));
  const participationCount = selected.reduce((sum, record) => sum + peopleOf(record).length, 0);

  const causes = (() => {
    const map = new Map<string, MaintenanceRecord[]>();
    for (const record of selected) {
      const key = record.faultCause.trim() || '未填写';
      const rows = map.get(key) ?? [];
      rows.push(record);
      map.set(key, rows);
    }
    return [...map.entries()].map(([name, rows]) => ({
      name,
      count: rows.length,
      hours: sumHours(rows),
      validCount: rows.filter((row) => validHours(row) !== null).length,
    })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
  })();
  const factors = (() => {
    const counts = new Map<string, number>();
    for (const record of selected) {
      const key = record.faultType.trim() || '未填写';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const topLocations = groupTop(selected, (record) => record.location);
  const topModels = groupTop(selected, (record) => record.equipmentModel);
  const missingModelCount = selected.filter((record) => !record.equipmentModel.trim() || record.equipmentModel.trim() === '/' || record.equipmentModel.trim() === '／').length;

  const departmentRows = (() => {
    const groups = new Map<string, MaintenanceRecord[]>();
    for (const record of selected) {
      const key = record.department.trim() || '未填写';
      const rows = groups.get(key) ?? [];
      rows.push(record);
      groups.set(key, rows);
    }
    return [...groups.entries()].map(([name, rows]) => ({
      name,
      rows,
      count: rows.length,
      hours: sumHours(rows),
      people: new Set(rows.flatMap(peopleOf)).size,
      locations: new Set(rows.map((row) => row.location.trim()).filter(Boolean)).size,
      parts: rows.filter(hasParts).length,
    })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
  })();
  const peopleRows = (() => {
    const groups = new Map<string, MaintenanceRecord[]>();
    for (const record of selected) {
      for (const person of peopleOf(record)) {
        const rows = groups.get(person) ?? [];
        rows.push(record);
        groups.set(person, rows);
      }
    }
    return [...groups.entries()].map(([name, rows]) => ({
      name,
      count: rows.length,
      hours: sumHours(rows),
      validCount: rows.filter((row) => validHours(row) !== null).length,
      parts: rows.filter(hasParts).length,
      departments: new Set(rows.map((row) => row.department.trim()).filter(Boolean)).size,
      locations: new Set(rows.map((row) => row.location.trim()).filter(Boolean)).size,
      rework: rows.filter((row) => row.isRework).length,
    })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
  })();
  const heatmapRows = departmentRows.slice(0, 7);
  const maxHeat = Math.max(1, ...heatmapRows.flatMap((department) => months.map((month) => department.rows.filter((row) => monthKey(row.reportYear, row.reportMonth) === month.key).length)));

  if (query.isLoading) return <div className="maintenance-center"><Spin tip="正在读取维修记录" /></div>;
  if (query.error) return <Alert type="error" showIcon message="维修数据加载失败" description={query.error.message} action={<Button onClick={() => void query.refetch()}>重试</Button>} />;

  return <div className="maintenance-page">
    <PageHeader title="维修总览" extra={<div className="maintenance-header-actions">
      <div className="maintenance-period-switch" role="group" aria-label="统计范围">
        {([['month', '本月'], ['year', '本年'], ['custom', '自定义']] as const).map(([key, label]) =>
          <button key={key} type="button" className={periodMode === key ? 'is-active' : ''} onClick={() => setPeriodMode(key)}>{label}</button>)}
      </div>
      {periodMode === 'custom' ? <DatePicker.RangePicker aria-label="自定义日期范围" value={customRange} onChange={(value) => setCustomRange(value as [Dayjs, Dayjs] | null)} />
        : <div className="maintenance-year-stepper">
          <button type="button" aria-label="上一年" onClick={() => setYear(year - 1)}>‹</button><span>{year} 年</span>
          <button type="button" aria-label="下一年" onClick={() => setYear(year + 1)}>›</button>
        </div>}
      <Button icon={<DownloadIcon width={16} height={16} />} onClick={() => recordsCsv(selected)} disabled={!selected.length}>导出</Button>
    </div>} />

    {periodMode === 'custom' && !customRange ? <Alert type="info" showIcon message="请选择自定义日期范围" className="maintenance-inline-alert" /> : null}

    <div className="maintenance-kpis">
      <KpiCard label="维修次数" value={numberText(selected.length)} unit="条" note="一条日志计一次" />
      <KpiCard label="维修工时" value={numberText(totalHours, 2)} unit="h" note={`已填工时 ${valid.length} 条 · 均次 ${valid.length ? numberText(totalHours / valid.length, 2) : '—'} h`} />
      <KpiCard label="更换配件" value={numberText(partCount)} unit="条" note={percentText(partCount, selected.length)} />
      <KpiCard label="设备本身质量问题" value={percentText(qualityCount, selected.length)} note={`${numberText(qualityCount)} 条`} />
      <KpiCard label="返工" value={numberText(reworkCount)} unit="条" note={`返工率 ${percentText(reworkCount, selected.length)}`} />
      <KpiCard label="维修人员" value={numberText(people.size)} unit="人" note={`人均参与 ${people.size ? numberText(participationCount / people.size, 1) : '—'} 次`} />
    </div>

    <div className="maintenance-two-col">
      <section className="maintenance-panel" aria-labelledby="maintenance-month-title">
        <div className="maintenance-panel-heading"><h2 id="maintenance-month-title">月度维修</h2><span>条</span></div>
        {months.length ? <div className="maintenance-month-chart" style={{ '--hg-month-count': Math.min(months.length, 12) } as CSSProperties}>
          {months.map((month) => <div className="maintenance-month-column" key={month.key} title={`${month.key} · ${month.records.length} 条 · ${numberText(month.hours, 2)} h · 配件 ${month.parts} 条 · 人员 ${month.people} 人`}>
            <span>{month.records.length || '·'}</span>
            <div className="maintenance-month-track"><i className={month.year === new Date().getFullYear() && month.month === currentMonth ? 'is-current' : ''} style={{ height: `${(month.records.length / maxMonth) * 100}%` }} /></div>
            <small>{month.month}月</small>
          </div>)}
        </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="范围内没有维修记录" />}
        {months.length > 1 && months.length <= 12 ? <div className="maintenance-month-metrics" style={{ '--hg-month-count': months.length } as CSSProperties}>
          <span className="maintenance-month-metric-label">工时 h</span>{months.map((month) => <span key={month.key} title={`${numberText(month.hours, 2)} h`}>{numberText(month.hours, 0)}</span>)}
          <span className="maintenance-month-metric-label">配件</span>{months.map((month) => <span key={month.key}>{month.parts}</span>)}
        </div> : null}
      </section>

      <section className="maintenance-panel" aria-labelledby="maintenance-cause-title">
        <div className="maintenance-panel-heading"><h2 id="maintenance-cause-title">故障原因</h2><span>{numberText(selected.length)} 条</span></div>
        {factors.length ? <div className="maintenance-factor-summary">{factors.map(([name, count]) => <span key={name}>{name} {numberText(count)}</span>)}</div> : null}
        <div className="maintenance-cause-table">
          <div className="maintenance-cause-head"><span>原因</span><span>次数</span><span>占比</span><span>均工时</span></div>
          {causes.map((cause) => <div className="maintenance-cause-row" key={cause.name}>
            <div title={cause.name}>{cause.name}<i style={{ width: `${selected.length ? (cause.count / selected.length) * 100 : 0}%` }} /></div>
            <b>{numberText(cause.count)}</b><span>{percentText(cause.count, selected.length)}</span>
            <span>{cause.validCount ? numberText(cause.hours / cause.validCount, 2) : '—'}</span>
          </div>)}
          {!causes.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无原因数据" /> : null}
        </div>
      </section>
    </div>

    <div className="maintenance-two-col maintenance-top-row">
      {([['高频区域 TOP 8', topLocations, '区域 / 位置'], ['高频设备型号 TOP 8', topModels, '设备型号']] as const).map(([title, rows, firstHeader]) =>
        <section className="maintenance-panel" key={title}>
          <div className="maintenance-panel-heading"><h2>{title}</h2>{title.includes('型号') ? <span>{numberText(missingModelCount)} 条未填型号</span> : null}</div>
          <div className="maintenance-ranking-head"><span>{firstHeader}</span><span>部门</span><span>主要原因</span><span>次数</span></div>
          <div className="maintenance-ranking-body">{rows.map((row, index) => <div className="maintenance-ranking-row" key={row.name}>
            <span title={row.name}><em>{index + 1}</em>{row.name}</span><span title={row.department}>{row.department}</span>
            <span title={row.cause}>{row.cause}</span><b>{row.count}</b>
          </div>)}
          {!rows.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" /> : null}</div>
        </section>)}
    </div>

    <section className="maintenance-panel maintenance-full-panel">
      <div className="maintenance-panel-heading"><h2>部门 × 月份</h2><span>单元格颜色越深，维修记录越多</span></div>
      <div className="maintenance-heat-scroll"><div className="maintenance-heatmap" style={{ gridTemplateColumns: `minmax(5rem, 1.5fr) repeat(${months.length}, minmax(0, 1fr)) minmax(2.5rem, .7fr)` }}>
        <div className="maintenance-heat-head">部门</div>{months.map((month) => <div className="maintenance-heat-head" key={month.key}>{month.month}月</div>)}<div className="maintenance-heat-head">合计</div>
        {heatmapRows.map((department) => <div className="maintenance-heat-row" key={department.name}>
          <strong title={department.name}>{department.name}</strong>
          {months.map((month) => {
            const count = department.rows.filter((row) => monthKey(row.reportYear, row.reportMonth) === month.key).length;
            return <span key={month.key} style={{ '--hg-heat': `${count ? 6 + (count / maxHeat) * 27 : 0}%` } as CSSProperties} title={`${department.name} · ${month.key} · ${count} 条`}>{count || '·'}</span>;
          })}
          <b>{department.count}</b>
        </div>)}
      </div></div>
      {!heatmapRows.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无部门数据" /> : null}
    </section>

    <section className="maintenance-panel maintenance-full-panel">
      <div className="maintenance-panel-heading maintenance-detail-heading"><h2>明细</h2>
        <div className="maintenance-detail-tabs" role="tablist" aria-label="统计明细">
          {([['people', '维修人员'], ['departments', '部门'], ['months', '月度']] as const).map(([key, label]) =>
            <button type="button" role="tab" aria-selected={detailTab === key} className={detailTab === key ? 'is-active' : ''} key={key} onClick={() => setDetailTab(key)}>{label}</button>)}
        </div>
      </div>
      <div className="maintenance-detail-scroll"><table className="maintenance-detail-table">
        {detailTab === 'people' ? <><thead><tr><th>维修人员</th><th>维修次数</th><th>工时 h</th><th>平均单次 h</th><th>更换配件</th><th>涉及部门</th><th>涉及区域</th><th>返工</th></tr></thead>
          <tbody>{peopleRows.map((row) => <tr key={row.name}><th>{row.name}</th><td>{row.count}</td><td>{numberText(row.hours, 2)}</td><td>{row.validCount ? numberText(row.hours / row.validCount, 2) : '—'}</td><td>{row.parts}</td><td>{row.departments}</td><td>{row.locations}</td><td>{row.rework}</td></tr>)}</tbody></> : null}
        {detailTab === 'departments' ? <><thead><tr><th>部门</th><th>维修次数</th><th>占比</th><th>工时 h</th><th>维修人员</th><th>涉及区域</th><th>更换配件</th><th>人均次数</th></tr></thead>
          <tbody>{departmentRows.map((row) => <tr key={row.name}><th>{row.name}</th><td>{row.count}</td><td>{percentText(row.count, selected.length)}</td><td>{numberText(row.hours, 2)}</td><td>{row.people}</td><td>{row.locations}</td><td>{row.parts}</td><td>{row.people ? numberText(row.count / row.people, 1) : '—'}</td></tr>)}</tbody></> : null}
        {detailTab === 'months' ? <><thead><tr><th>月份</th><th>维修次数</th><th>环比</th><th>工时 h</th><th>维修人员</th><th>涉及部门</th><th>更换配件</th><th>返工</th></tr></thead>
          <tbody>{[...months].reverse().map((row) => {
            const previous = months.find((month) => month.key === monthKey(row.month === 1 ? row.year - 1 : row.year, row.month === 1 ? 12 : row.month - 1));
            const change = previous && previous.records.length > 0 ? ((row.records.length - previous.records.length) / previous.records.length) * 100 : null;
            return <tr key={row.key}><th>{row.year} 年 {row.month} 月</th><td>{row.records.length}</td><td>{change === null ? '—' : `${change >= 0 ? '+' : ''}${numberText(change, 1)}%`}</td><td>{numberText(row.hours, 2)}</td><td>{row.people}</td><td>{row.departments}</td><td>{row.parts}</td><td>{row.rework}</td></tr>;
          })}</tbody></> : null}
      </table>
      {!selected.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无明细" /> : null}</div>
    </section>
  </div>;
}
