import { useState, type CSSProperties } from 'react';
import type { ThermalDaySummary, ThermalOutletDefinition, ThermalSummaryResult } from '@hgxt/shared';
import { PALETTE, Seg, fmtRecorded } from './dash-ui';

type ThermalGroup = 'external' | 'internal' | 'meters';
type DetailEntry = { kind: 'day'; date: string; index: number } | { kind: 'summary'; month: string };
const colors: Record<ThermalGroup, string> = { external: PALETTE.brand, internal: PALETTE.reagent, meters: PALETTE.fuming };
const accent = (color: string): CSSProperties => ({ '--group-accent': color } as CSSProperties);
const sum = (values: Array<number | null | undefined>) => {
  const present = values.filter((value): value is number => value !== null && value !== undefined);
  return present.length ? present.reduce((total, value) => total + value, 0) : null;
};
const quantity = (value: number | null | undefined, unit: string) => value === null || value === undefined ? '—' : `${fmtRecorded(value)} ${unit}`;
const meterDefinitions = [
  { key: 'generation', name: '1#冷凝机发电', unit: 'kWh' },
  { key: 'water', name: '总水表供水', unit: 'm³' },
  { key: 'steamMeter', name: '蒸汽总表', unit: 't' },
] as const;

export function ThermalPanel({ data, days }: { data: ThermalSummaryResult; days: Array<ThermalDaySummary | undefined> }) {
  const [group, setGroup] = useState<ThermalGroup>('external');
  const outlets = data.outlets.filter((item) => item.group === group);
  const stoppedDays = days.filter((day) => day?.sulfuricStopped).length;
  const stoppedDay = days.length === 1 && stoppedDays === 1;
  return <div className="amino-panel thermal-panel">
    <div className="amino-panel-group">
      <div className="amino-panel-heading">供汽来源<span className={stoppedDays ? 'thermal-stop-label' : ''}>{stoppedDays ? `硫酸停车 ${stoppedDays} 天` : '硫酸运行'}</span></div>
      <div className="amino-panel-row" style={accent(PALETTE.brand)}>
        <span className="amino-panel-name"><i />热电自供</span>
        <strong>{quantity(sum(days.map((day) => day?.selfSupply)), 't')}</strong>
      </div>
      <div className={`amino-panel-row thermal-source-row${stoppedDay ? ' is-stopped' : ''}`} style={accent('var(--hg-danger)')}>
        <span className="amino-panel-name"><i />建滔供气</span>
        <strong>{quantity(sum(days.map((day) => day?.jiantaoSupply)), 't')}</strong>
      </div>
    </div>
    <Seg options={[{ label: '外供', value: 'external' }, { label: '内供', value: 'internal' }, { label: '电与水', value: 'meters' }]} value={group} onChange={(value) => setGroup(value as ThermalGroup)} />
    <div className="amino-panel-group">
      <div className="amino-panel-heading">{group === 'external' ? '外供蒸汽' : group === 'internal' ? '内部供汽' : '其他计量'}<span>{group === 'meters' ? '计量值' : '供汽量'}</span></div>
      {group === 'meters' ? meterDefinitions.map((meter) => <div className="amino-panel-row" key={meter.key} style={accent(colors.meters)}>
        <span className="amino-panel-name"><i style={{ background: colors.meters }} />{meter.name}</span>
        <strong>{quantity(sum(days.map((day) => day?.[meter.key].value)), meter.unit)}</strong>
      </div>) : outlets.map((outlet) => <div className="amino-panel-row" key={outlet.key} style={accent(colors[group])}>
        <span className="amino-panel-name"><i style={{ background: colors[group] }} />{outlet.name}</span>
        <strong>{quantity(sum(days.map((day) => day?.outlets[outlet.key]?.value)), 't')}</strong>
      </div>)}
    </div>
  </div>;
}

export function ThermalTable({ data, tab, entries, activeDate, onSelect }: {
  data: ThermalSummaryResult;
  tab: 'prod' | 'consumption';
  entries: DetailEntry[];
  activeDate: string | null;
  onSelect: (date: string) => void;
}) {
  const dayMap = new Map(data.days.map((day) => [day.date, day]));
  const external = data.outlets.filter((outlet) => outlet.group === 'external');
  const internal = data.outlets.filter((outlet) => outlet.group === 'internal');
  const rows = entries.map((entry) => {
    const dates = entry.kind === 'summary' ? data.days.filter((day) => day.date.startsWith(entry.month)) : [];
    return { entry, days: entry.kind === 'summary' ? dates : [dayMap.get(entry.date)] };
  });
  const total = (days: Array<ThermalDaySummary | undefined>, field: 'externalTotal' | 'internalTotal' | 'totalSupply' | 'jiantaoSupply' | 'selfSupply') => sum(days.map((day) => day?.[field]));
  const meterTotal = (days: Array<ThermalDaySummary | undefined>, field: typeof meterDefinitions[number]['key']) => sum(days.map((day) => day?.[field].value));
  const outletTotal = (days: Array<ThermalDaySummary | undefined>, outlet: ThermalOutletDefinition) => sum(days.map((day) => day?.outlets[outlet.key]?.value));
  return <div className="scrolltbl">
    <table className="dt workshop-detail-table thermal-table">
      <thead>{tab === 'prod' ? <>
        <tr className="grp detail-group-head">
          <th rowSpan={2} className="detail-date-head">日期</th>
          <th rowSpan={2} className="detail-total-cell">总供汽 t</th>
          <th colSpan={3} className="colored-group-head" style={accent('var(--hg-danger)')}>供汽来源 · t</th>
          <th colSpan={external.length + 1} className="colored-group-head" style={accent(colors.external)}>外供蒸汽 · t</th>
          <th colSpan={internal.length + 1} className="colored-group-head" style={accent(colors.internal)}>内部供汽 · t</th>
        </tr>
        <tr className="detail-subhead">
          <th className="band-cell" style={accent('var(--hg-danger)')}>硫酸停车</th>
          <th className="band-cell" style={accent(PALETTE.brand)}>热电自供</th>
          <th className="band-cell" style={accent('var(--hg-danger)')}>建滔供气</th>
          {external.map((outlet) => <th key={outlet.key} className="band-cell" style={accent(colors.external)}>{outlet.name}</th>)}
          <th className="band-cell" style={accent(colors.external)}>外供合计</th>
          {internal.map((outlet) => <th key={outlet.key} className="band-cell" style={accent(colors.internal)}>{outlet.name}</th>)}
          <th className="band-cell" style={accent(colors.internal)}>内供合计</th>
        </tr>
      </> : <>
        <tr className="grp detail-group-head">
          <th rowSpan={2} className="detail-date-head">日期</th>
          <th colSpan={1} className="colored-group-head" style={accent(PALETTE.brand)}>电力 · kWh</th>
          <th colSpan={2} className="colored-group-head" style={accent(PALETTE.reagent)}>水 / 汽</th>
        </tr>
        <tr className="detail-subhead">
          {meterDefinitions.map((meter) => <th key={meter.key} className="band-cell" style={accent(meter.key === 'generation' ? PALETTE.brand : PALETTE.reagent)}>{meter.name} {meter.unit}</th>)}
        </tr>
      </>}</thead>
      <tbody>
        {!rows.length && <tr><td colSpan={tab === 'prod' ? external.length + internal.length + 7 : 4}>所选日期内暂无数据</td></tr>}
        {rows.map(({ entry, days }) => <tr key={entry.kind === 'summary' ? `sum-${entry.month}` : entry.date}
          className={`${entry.kind === 'summary' ? 'sum' : 'clickrow'}${entry.kind === 'day' && entry.date === activeDate ? ' on' : ''}`}
          onClick={entry.kind === 'day' ? () => onSelect(entry.date) : undefined}>
          <td>{entry.kind === 'summary' ? '合计' : entry.date.slice(5)}</td>
          {tab === 'prod' ? <>
            <td className="detail-total-cell">{fmtRecorded(total(days, 'totalSupply'))}</td>
            <td className="band-cell" style={accent('var(--hg-danger)')}>{entry.kind === 'summary' ? `${days.filter((day) => day?.sulfuricStopped).length} 天` : days[0]?.sulfuricStopped ? '是' : '—'}</td>
            <td className="band-cell" style={accent(PALETTE.brand)}>{fmtRecorded(total(days, 'selfSupply'))}</td>
            <td className="band-cell" style={accent('var(--hg-danger)')}>{fmtRecorded(total(days, 'jiantaoSupply'))}</td>
            {external.map((outlet) => <td key={outlet.key} className="band-cell" style={accent(colors.external)}>{fmtRecorded(outletTotal(days, outlet))}</td>)}
            <td className="band-cell" style={accent(colors.external)}>{fmtRecorded(total(days, 'externalTotal'))}</td>
            {internal.map((outlet) => <td key={outlet.key} className="band-cell" style={accent(colors.internal)}>{fmtRecorded(outletTotal(days, outlet))}</td>)}
            <td className="band-cell" style={accent(colors.internal)}>{fmtRecorded(total(days, 'internalTotal'))}</td>
          </> : meterDefinitions.map((meter) => <td key={meter.key} className="band-cell" style={accent(meter.key === 'generation' ? PALETTE.brand : PALETTE.reagent)}>{fmtRecorded(meterTotal(days, meter.key))}</td>)}
        </tr>)}
      </tbody>
    </table>
  </div>;
}
