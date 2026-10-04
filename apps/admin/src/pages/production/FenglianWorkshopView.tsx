import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { FenglianSummaryResult, FormField } from '@hgxt/shared';
import { PALETTE, Seg, fmt } from './dash-ui';

type Day = FenglianSummaryResult['days'][number];
type Entry = { kind: 'day'; date: string; index: number } | { kind: 'summary'; month: string };
export interface FenglianSelection { group: string; section?: string }

const sumOrNull = (values: Array<number | null | undefined>) => {
  const present = values.filter((value): value is number => value !== null && value !== undefined);
  return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
};
const number = (day: Day | undefined, field: string) => day?.values[field] ?? null;
const accent = (color: string): CSSProperties => ({ '--group-accent': color } as CSSProperties);
const colorOf = (section: string) => section === '产成品' ? PALETTE.brand : section === '原辅料' ? PALETTE.fuming : PALETTE.reagent;
const isClosing = (field: FormField) => /库存|剩余|累计读数/.test(field.title);

export function fenglianVisibleFields(fields: FormField[], selection: FenglianSelection): FormField[] {
  const groups = [...new Set(fields.map((field) => field.group ?? '其他'))];
  const group = groups.includes(selection.group) ? selection.group : groups[0];
  const sections = [...new Set(fields.filter((field) => field.group === group).map((field) => field.section ?? '其他'))];
  const section = selection.section && sections.includes(selection.section) ? selection.section : sections[0] ?? '其他';
  const bySubgroup = new Map<string, FormField[]>();
  for (const field of fields.filter((item) => item.group === group && (item.section ?? '其他') === section)) {
    const subgroup = field.subgroup ?? '其他';
    bySubgroup.set(subgroup, [...(bySubgroup.get(subgroup) ?? []), field]);
  }
  return [...bySubgroup.values()].flat();
}

export function FenglianPanel({ days }: { days: Array<Day | undefined> }) {
  const [tab, setTab] = useState('production');
  const production = [
    { name: '三车间湿料产量', field: 'field_201', unit: 't', color: PALETTE.brand },
    { name: '标准厂房干燥量', field: 'field_dry_drying', unit: 't', color: PALETTE.acid93 },
    { name: '标准厂房打包数', field: 'field_204', unit: 't', color: PALETTE.reagent },
    { name: '标准厂房销量', field: 'field_205', unit: 't', color: PALETTE.fuming },
  ];
  const utilities = [
    { name: '水表累计读数', field: 'field_water_cumulative', unit: '', color: PALETTE.reagent },
    { name: '电表累计读数', field: 'field_electricity_cumulative', unit: '', color: PALETTE.brand },
    { name: '天然气耗用', field: 'field_gas_consumption', unit: 'm³', color: PALETTE.fuming },
    { name: '液氮耗用', field: 'field_nitrogen_consumption', unit: 't', color: PALETTE.acid93 },
  ];
  const rows = tab === 'production' ? production : utilities;
  return <div className="amino-panel">
    <Seg options={[{ label: '生产', value: 'production' }, { label: '水电气', value: 'utilities' }]} value={tab} onChange={setTab} />
    <div className="amino-panel-group">
      <div className="amino-panel-heading">{tab === 'production' ? '生产与耗用' : '水电气'}<span>{days.length > 1 ? '本期' : '当日'}</span></div>
      {rows.map((row) => <div className="amino-panel-row" key={row.field} style={accent(row.color)}>
        <span className="amino-panel-name"><i style={{ background: row.color }} />{row.name}</span>
        <strong>{fmt(row.field.includes('cumulative')
          ? [...days].reverse().find((day) => number(day, row.field) !== null)?.values[row.field] ?? null
          : sumOrNull(days.map((day) => number(day, row.field))), 3)} {row.unit && <small>{row.unit}</small>}</strong>
      </div>)}
    </div>
  </div>;
}

export function FenglianStockCards({ day }: { day: Day | undefined }) {
  const items = [
    { name: '三车间湿料', stock: 'field_203', incoming: 'field_201', outgoing: 'field_202', incomingLabel: '产量', outgoingLabel: '出库', unit: 't', color: PALETTE.brand },
    { name: '标准厂房干料', stock: 'field_206', incoming: 'field_204', outgoing: 'field_205', incomingLabel: '打包', outgoingLabel: '销量', unit: 't', color: PALETTE.acid93 },
    { name: '液氮', stock: 'field_nitrogen_stock', incoming: 'field_nitrogen_purchase', outgoing: 'field_nitrogen_consumption', incomingLabel: '购入', outgoingLabel: '耗用', unit: 't', color: PALETTE.reagent },
    { name: '天然气', stock: 'field_gas_stock', incoming: 'field_gas_purchase', outgoing: 'field_gas_consumption', incomingLabel: '购入', outgoingLabel: '耗用', unit: 'm³', color: PALETTE.fuming },
  ];
  return <div className="fenglian-stock-grid">
    {items.map((item) => <div className="amino-stock" key={item.name} style={accent(item.color)}>
      <span>{item.name}</span><strong>{fmt(number(day, item.stock), 3)} <small>{item.unit}</small></strong>
      <div className="amino-stock-flows"><span>{item.incomingLabel} <b>{fmt(number(day, item.incoming), 3)} {item.unit}</b></span><span>{item.outgoingLabel} <b>{fmt(number(day, item.outgoing), 3)} {item.unit}</b></span></div>
    </div>)}
  </div>;
}

export function FenglianTable({ data, entries, activeDate, onSelect, selection, onSelectionChange }: {
  data: FenglianSummaryResult;
  entries: Entry[];
  activeDate: string | null;
  onSelect: (date: string) => void;
  selection: FenglianSelection;
  onSelectionChange: (selection: FenglianSelection) => void;
}) {
  const groups = [...new Set(data.fields.map((field) => field.group ?? '其他'))];
  const group = groups.includes(selection.group) ? selection.group : groups[0];
  const sections = [...new Set(data.fields.filter((field) => field.group === group).map((field) => field.section ?? '其他'))];
  const section = selection.section && sections.includes(selection.section) ? selection.section : sections[0] ?? '其他';
  const fields = fenglianVisibleFields(data.fields, { group, section });
  const columnGroups = (titleOf: (field: FormField) => string, keyOf = titleOf) => fields.reduce<{ key: string; title: string; count: number }[]>((current, field) => {
    const key = keyOf(field);
    if (current.at(-1)?.key === key) current[current.length - 1].count += 1;
    else current.push({ key, title: titleOf(field), count: 1 });
    return current;
  }, []);
  const products = columnGroups((field) => field.subgroup ?? '其他');
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { scrollRef.current?.scrollTo({ left: 0, top: 0 }); }, [group, section]);
  const dayMap = new Map(data.days.map((day) => [day.date, day]));
  const fieldValue = (entry: Entry, field: FormField) => {
    if (entry.kind === 'day') return dayMap.get(entry.date)?.values[field.id] ?? null;
    const days = data.days.filter((day) => day.date.startsWith(entry.month));
    if (isClosing(field)) return [...days].reverse().find((day) => day.values[field.id] !== null)?.values[field.id] ?? null;
    return sumOrNull(days.map((day) => day.values[field.id]));
  };
  return <>
    <div className="fenglian-detail-switches">
      <div className="fenglian-switch-row"><Seg options={groups.map((name) => ({ label: name, value: name }))} value={group} onChange={(next) => onSelectionChange({ group: next, section: '' })} /></div>
      <div className="fenglian-switch-row"><Seg options={sections.map((name) => ({ label: name, value: name }))} value={section} onChange={(next) => onSelectionChange({ group, section: next })} /></div>
    </div>
    <div className="scrolltbl fenglian-scrolltbl" ref={scrollRef}>
      <table className="dt workshop-detail-table detailed-inventory">
        <thead><tr className="grp detail-material-head"><th rowSpan={2} className="detail-date-head">日期</th>
          {products.map((item) => <th key={item.key} colSpan={item.count} className="colored-group-head" style={accent(colorOf(section))}>{item.title}</th>)}</tr>
          <tr className="detail-subhead">{fields.map((field) => <th key={field.id} className="band-cell" style={accent(colorOf(field.section ?? ''))}>{field.title} {field.unit ?? ''}</th>)}</tr></thead>
        <tbody>
          {!entries.length && <tr><td colSpan={fields.length + 1} className="muted">所选日期内暂无数据</td></tr>}
          {entries.map((entry) => <tr key={entry.kind === 'summary' ? `summary-${entry.month}` : entry.date}
            className={entry.kind === 'summary' ? 'sum' : `clickrow${entry.date === activeDate ? ' on' : ''}`}
            onClick={entry.kind === 'day' ? () => onSelect(entry.date) : undefined}>
            <td>{entry.kind === 'summary' ? '月汇总' : entry.date.slice(5)}</td>
            {fields.map((field) => <td key={field.id} className="band-cell" style={accent(colorOf(field.section ?? ''))}>{fmt(fieldValue(entry, field), 3)}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </>;
}
