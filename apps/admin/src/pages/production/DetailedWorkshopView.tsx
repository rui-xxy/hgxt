import { useState, type CSSProperties } from 'react';
import type { DetailedWorkshopDay, DetailedWorkshopResult, WorkshopMetricDefinition, WorkshopStockDefinition } from '@hgxt/shared';
import { PALETTE, Seg, downloadCsv, fmt, fmtRecorded } from './dash-ui';

type Entry = { kind: 'day'; date: string; index: number } | { kind: 'summary'; month: string };
const sumOrNull = (values: Array<number | null | undefined>): number | null => {
  const present = values.filter((value): value is number => value !== null && value !== undefined);
  return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
};
const rateOf = (used: number | null | undefined, production: number | null | undefined) =>
  used !== null && used !== undefined && production !== null && production !== undefined && production > 0 ? used / production : null;
const accent = (color: string): CSSProperties => ({ '--group-accent': color } as CSSProperties);
const quantity = (value: number | null | undefined, unit: string) =>
  value === null || value === undefined ? '—' : `${fmtRecorded(value)} ${unit}`;

/** 两路蒸汽都实录后才展示总量，避免把缺测当作零。 */
function steamTotal(medium: number | null | undefined, low: number | null | undefined): number | null {
  return medium === null || medium === undefined || low === null || low === undefined ? null : medium + low;
}

export function hydrotalciteSteamTotal(day: DetailedWorkshopDay | undefined): number | null {
  return steamTotal(day?.metrics.mediumSteam, day?.metrics.lowSteam);
}

export function detailMetricColor(metric: WorkshopMetricDefinition, index: number, metrics: WorkshopMetricDefinition[]): string {
  const peers = metrics.filter((item) => item.category === metric.category);
  const position = peers.findIndex((item) => item.key === metric.key);
  const colors = metric.category === 'energy'
    ? [PALETTE.brand, PALETTE.acid93, PALETTE.reagent, PALETTE.gray]
    : [PALETTE.fuming, PALETTE.gray, PALETTE.reagent, PALETTE.acid93, PALETTE.brand];
  return colors[(position < 0 ? index : position) % colors.length];
}

function stockColor(item: WorkshopStockDefinition, index: number, items: WorkshopStockDefinition[]): string {
  const peers = items.filter((stock) => stock.kind === item.kind);
  const position = peers.findIndex((stock) => stock.key === item.key);
  const colors = item.kind === 'finished'
    ? [PALETTE.brand, PALETTE.acid93, PALETTE.reagent, PALETTE.gray]
    : [PALETTE.fuming, PALETTE.gray, PALETTE.reagent, PALETTE.acid93, PALETTE.brand];
  return colors[(position < 0 ? index : position) % colors.length];
}

export function DetailedWorkshopPanel({ data, days }: {
  data: DetailedWorkshopResult;
  days: Array<DetailedWorkshopDay | undefined>;
}) {
  const [section, setSection] = useState('energy');
  const energy = data.metrics.filter((metric) => metric.category === 'energy');
  const raw = data.metrics.filter((metric) => metric.category === 'raw');
  const sections = data.code === 'anthraquinone' ? [
    { key: 'energy', label: '能源', metrics: energy },
    { key: 'raw', label: '主要原料', metrics: raw.slice(0, 5) },
    { key: 'aux', label: '辅助材料', metrics: raw.slice(5) },
  ] : [
    { key: 'energy', label: '能源', metrics: energy },
    { key: 'raw', label: '原辅料', metrics: raw },
  ];
  return <div className="amino-panel">
    {data.code === 'anthraquinone' && <Seg options={sections.map(({ key, label }) => ({ value: key, label }))} value={section} onChange={setSection} />}
    {sections.filter(({ key }) => data.code !== 'anthraquinone' || key === section).map(({ key, label, metrics }) => {
      if (!metrics.length) return null;
      return <div key={key} className="amino-panel-group">
        <div className="amino-panel-heading">{label}<span>消耗</span></div>
        {metrics.map((metric) => {
          const used = sumOrNull(days.map((day) => day?.metrics[metric.key]));
          const color = detailMetricColor(metric, 0, data.metrics);
          return <div className="amino-panel-row" key={metric.key} style={accent(color)}>
            <span className="amino-panel-name"><i style={{ background: color }} />{metric.name}</span>
            <strong>{quantity(used, metric.unit)}</strong>
          </div>;
        })}
      </div>;
    })}
  </div>;
}

export function DetailedWorkshopStockCards({ data, day }: { data: DetailedWorkshopResult; day: DetailedWorkshopDay | undefined }) {
  return <>
    {(['finished', 'raw'] as const).map((kind) => {
      const items = data.stockItems.filter((item) => item.kind === kind);
      if (!items.length) return null;
      return <div className="detailed-stock-group" key={kind}>
        <div className="detailed-stock-heading">{kind === 'finished' ? '产成品' : '原辅料'}</div>
        <div className="amino-stock-grid">
          {items.map((item) => {
            const value = day?.stocks[item.key];
            return <div key={item.key} className="amino-stock" style={accent(stockColor(item, 0, data.stockItems))}>
              <span>{item.name}</span>
              <strong>{quantity(value?.closing, item.unit)}</strong>
              <div className="amino-stock-flows">
                <span>{item.incomingLabel} <b>{quantity(value?.incoming, item.unit)}</b></span>
                <span>{item.outgoingLabel} <b>{quantity(value?.outgoing, item.unit)}</b></span>
              </div>
              {item.note ? <div className="detailed-stock-note">{item.note}</div> : null}
            </div>;
          })}
        </div>
      </div>;
    })}
  </>;
}

export function DetailedWorkshopTable({ data, tab, entries, activeDate, onSelect }: {
  data: DetailedWorkshopResult;
  tab: 'prod' | 'inventory';
  entries: Entry[];
  activeDate: string | null;
  onSelect: (date: string) => void;
}) {
  const dayMap = new Map(data.days.map((day) => [day.date, day]));
  const energy = data.metrics.filter((metric) => metric.category === 'energy');
  const raw = data.metrics.filter((metric) => metric.category === 'raw');
  const showSteamTotal = data.code === 'hydrotalcite';
  const finished = data.stockItems.filter((item) => item.kind === 'finished');
  const stockRaw = data.stockItems.filter((item) => item.kind === 'raw');
  const showDay = (entry: Entry) => entry.kind === 'day' ? dayMap.get(entry.date) : undefined;
  const cellStyle = (color: string) => ({ className: 'band-cell', style: accent(color) });
  return <div className="scrolltbl">
    <table className={`dt workshop-detail-table${tab === 'inventory' ? ' detailed-inventory' : ''}`}>
      <thead>{tab === 'prod' ? <>
        <tr className="grp detail-group-head">
          <th rowSpan={2} className="detail-date-head">日期</th><th rowSpan={2}>{data.productionLabel} t</th>
          {energy.length > 0 && <th colSpan={energy.length * 2 + (showSteamTotal ? 2 : 0)} className="colored-group-head" style={accent(PALETTE.brand)}>能源消耗</th>}
          {raw.length > 0 && <th colSpan={raw.length * 2} className="colored-group-head" style={accent(PALETTE.fuming)}>原辅料消耗</th>}
        </tr>
        <tr className="detail-subhead">{energy.flatMap((metric) => {
          const color = detailMetricColor(metric, 0, data.metrics);
          return [<th key={`${metric.key}-used`} {...cellStyle(color)}>{metric.name} {metric.unit}</th>,
            <th key={`${metric.key}-rate`} {...cellStyle(color)}>单耗 {metric.unit}/t</th>];
        })}
          {showSteamTotal && <><th {...cellStyle(PALETTE.brand)}>蒸汽合计 t</th><th {...cellStyle(PALETTE.brand)}>合计单耗 t/t</th></>}
          {raw.flatMap((metric) => {
            const color = detailMetricColor(metric, 0, data.metrics);
            return [<th key={`${metric.key}-used`} {...cellStyle(color)}>{metric.name} {metric.unit}</th>,
              <th key={`${metric.key}-rate`} {...cellStyle(color)}>单耗 {metric.unit}/t</th>];
          })}</tr>
      </> : <>
        <tr className="grp detail-group-head"><th rowSpan={3} className="detail-date-head">日期</th>
          {finished.length > 0 && <th colSpan={finished.length * 3} className="colored-group-head" style={accent(PALETTE.brand)}>产成品</th>}
          {stockRaw.length > 0 && <th colSpan={stockRaw.length * 3} className="colored-group-head" style={accent(PALETTE.fuming)}>原辅料</th>}
        </tr>
        <tr className="grp detail-material-head">{data.stockItems.map((item) => <th key={item.key} colSpan={3} className="colored-group-head" style={accent(stockColor(item, 0, data.stockItems))}>{item.name}</th>)}</tr>
        <tr className="detail-subhead">{data.stockItems.flatMap((item) => {
          const color = stockColor(item, 0, data.stockItems);
          return [<th key={`${item.key}-in`} {...cellStyle(color)}>{item.incomingLabel} {item.unit}</th>,
            <th key={`${item.key}-out`} {...cellStyle(color)}>{item.outgoingLabel} {item.unit}</th>,
            <th key={`${item.key}-stock`} {...cellStyle(color)}>期末库存 {item.unit}</th>];
        })}</tr>
      </>}</thead>
      <tbody>
        {!entries.length && <tr><td colSpan={tab === 'prod' ? 2 + data.metrics.length * 2 + (showSteamTotal ? 2 : 0) : 1 + data.stockItems.length * 3} className="muted">所选日期内暂无数据</td></tr>}
        {entries.map((entry) => {
          const monthDays = entry.kind === 'summary' ? data.days.filter((day) => day.date.startsWith(entry.month)) : [];
          const day = showDay(entry);
          const days = entry.kind === 'summary' ? monthDays : [day];
          const production = entry.kind === 'summary' ? sumOrNull(monthDays.map((item) => item.production)) : day?.production ?? null;
          const steamUsed = showSteamTotal
            ? steamTotal(sumOrNull(days.map((item) => item?.metrics.mediumSteam)), sumOrNull(days.map((item) => item?.metrics.lowSteam)))
            : null;
          const latestStock = (key: string) => [...monthDays].reverse().find((item) => item.stocks[key]?.closing !== null && item.stocks[key]?.closing !== undefined)?.stocks[key]?.closing ?? null;
          return <tr key={entry.kind === 'summary' ? `summary-${entry.month}` : entry.date}
            className={entry.kind === 'summary' ? 'sum' : `clickrow${entry.date === activeDate ? ' on' : ''}`}
            onClick={entry.kind === 'day' ? () => onSelect(entry.date) : undefined}>
            <td>{entry.kind === 'summary' ? '合计' : entry.date.slice(5)}</td>
            {tab === 'prod' ? <>
              <td>{fmtRecorded(production)}</td>
              {energy.flatMap((metric) => {
                const used = sumOrNull(days.map((item) => item?.metrics[metric.key]));
                const color = detailMetricColor(metric, 0, data.metrics);
                return [<td key={`${metric.key}-used`} {...cellStyle(color)}>{fmtRecorded(used)}</td>,
                  <td key={`${metric.key}-rate`} {...cellStyle(color)}>{fmt(rateOf(used, production), metric.unit === 'kWh' ? 1 : 2)}</td>];
              })}
              {showSteamTotal && <><td className="band-cell" style={accent(PALETTE.brand)}>{fmtRecorded(steamUsed)}</td>
                <td className="band-cell" style={accent(PALETTE.brand)}>{fmt(rateOf(steamUsed, production), 2)}</td></>}
              {raw.flatMap((metric) => {
                const used = sumOrNull(days.map((item) => item?.metrics[metric.key]));
                const color = detailMetricColor(metric, 0, data.metrics);
                return [<td key={`${metric.key}-used`} {...cellStyle(color)}>{fmtRecorded(used)}</td>,
                  <td key={`${metric.key}-rate`} {...cellStyle(color)}>{fmt(rateOf(used, production), metric.unit === 'kWh' ? 1 : 2)}</td>];
              })}
            </> : data.stockItems.flatMap((item) => {
              const values = day?.stocks[item.key];
              const incoming = entry.kind === 'summary' ? sumOrNull(monthDays.map((itemDay) => itemDay.stocks[item.key]?.incoming)) : values?.incoming ?? null;
              const outgoing = entry.kind === 'summary' ? sumOrNull(monthDays.map((itemDay) => itemDay.stocks[item.key]?.outgoing)) : values?.outgoing ?? null;
              const closing = entry.kind === 'summary' ? latestStock(item.key) : values?.closing ?? null;
              const color = stockColor(item, 0, data.stockItems);
              return [<td key={`${item.key}-in`} {...cellStyle(color)}>{fmtRecorded(incoming)}</td>,
                <td key={`${item.key}-out`} {...cellStyle(color)}>{fmtRecorded(outgoing)}</td>,
                <td key={`${item.key}-stock`} {...cellStyle(color)}>{fmtRecorded(closing)}</td>];
            })}
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

export function downloadDetailedWorkshopCsv(data: DetailedWorkshopResult, tab: 'prod' | 'inventory', start: string, end: string): void {
  const days = data.days.filter((day) => day.date >= start && day.date <= end);
  const title = `${data.code === 'magnesium' ? '硫酸镁' : data.code === 'hydrotalcite' ? '水滑石' : '蒽醌'}车间`;
  if (tab === 'prod') {
    const energy = data.metrics.filter((metric) => metric.category === 'energy');
    const raw = data.metrics.filter((metric) => metric.category === 'raw');
    downloadCsv(`${title}-产量与消耗-${start}_${end}.csv`, [
      ['日期', `${data.productionLabel} t`, ...energy.flatMap((metric) => [`${metric.name}消耗 ${metric.unit}`, `${metric.name}单耗 ${metric.unit}/t`]),
        ...(data.code === 'hydrotalcite' ? ['蒸汽合计 t', '蒸汽合计单耗 t/t'] : []),
        ...raw.flatMap((metric) => [`${metric.name}消耗 ${metric.unit}`, `${metric.name}单耗 ${metric.unit}/t`])],
      ...days.map((day) => [day.date, day.production,
        ...energy.flatMap((metric) => [day.metrics[metric.key] ?? null, rateOf(day.metrics[metric.key], day.production)]),
        ...(data.code === 'hydrotalcite' ? [hydrotalciteSteamTotal(day), rateOf(hydrotalciteSteamTotal(day), day.production)] : []),
        ...raw.flatMap((metric) => [day.metrics[metric.key] ?? null, rateOf(day.metrics[metric.key], day.production)])]),
    ]);
  } else {
    downloadCsv(`${title}-库存-${start}_${end}.csv`, [
      ['日期', ...data.stockItems.flatMap((item) => [`${item.name}${item.incomingLabel} ${item.unit}`, `${item.name}${item.outgoingLabel} ${item.unit}`, `${item.name}期末库存 ${item.unit}`])],
      ...days.map((day) => [day.date, ...data.stockItems.flatMap((item) => [day.stocks[item.key]?.incoming ?? null, day.stocks[item.key]?.outgoing ?? null, day.stocks[item.key]?.closing ?? null])]),
    ]);
  }
}
