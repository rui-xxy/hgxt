import { useEffect, useMemo, useState } from 'react';
import { App as AntApp } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { energySummary, workshopOverview } from '../../api/production';
import { Dash, ExportButton, Kpi, Seg, Spark, Stepper, downloadCsv, fmt, pctChange } from './dash-ui';

type Tab = 'el' | 'st' | 'wa';
type Values = Array<number | null>;

const TABS: Array<{ key: Tab; label: string; unit: string; unitPer: string }> = [
  { key: 'el', label: '电', unit: 'kWh', unitPer: 'kWh/t' },
  { key: 'st', label: '蒸汽', unit: 't', unitPer: 't/t' },
  { key: 'wa', label: '水', unit: 't', unitPer: 't/t' },
];

const sum = (a: Values): number => a.reduce<number>((s, v) => s + (v ?? 0), 0);
const lastIdx = (a: Values): number => {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] !== null) return i;
  return -1;
};
const prevIdx = (a: Values, before: number): number => {
  for (let i = before - 1; i >= 0; i--) if (a[i] !== null) return i;
  return -1;
};
const norm = (name: string) => name.replace(/车间$/, '');

interface EnergyRow {
  name: string;
  values: Values;
  /** 对齐 values 的日产量（算单耗）；无产量口径为 null */
  production: Values | null;
}

export function EnergyCenterPage() {
  const { message } = AntApp.useApp();
  const [tab, setTab] = useState<Tab>('el');
  const [range, setRange] = useState<'month' | '30d'>('month');
  const [month, setMonth] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['production', 'energy', 120], queryFn: () => energySummary(120) });
  const overview = useQuery({ queryKey: ['production', 'workshops', 120], queryFn: () => workshopOverview(120) });
  useEffect(() => { if (query.error) message.error(query.error.message); }, [query.error, message]);

  const data = query.data;
  const dates = useMemo(() => data?.dates ?? [], [data]);
  const months = useMemo(() => [...new Set(dates.map((d) => d.slice(0, 7)))], [dates]);
  const monthKey = month && months.includes(month) ? month : months[months.length - 1];
  const monthIdx = months.indexOf(monthKey);
  const idx = useMemo(() => {
    if (range === '30d') return dates.map((_, i) => i).slice(-30);
    return dates.map((d, i) => ({ d, i })).filter((x) => x.d.startsWith(monthKey ?? '')).map((x) => x.i);
  }, [dates, range, monthKey]);
  const pick = (a: Values): Values => idx.map((i) => a[i] ?? null);

  /** 各车间日产量，按能源 dates 对齐 */
  const productionOf = useMemo(() => {
    const byDate = new Map<string, Map<string, number | null>>();
    const oDates = overview.data?.dates ?? [];
    for (const w of overview.data?.workshops ?? []) {
      const m = new Map<string, number | null>();
      oDates.forEach((d, i) => m.set(d, w.values[i] ?? null));
      byDate.set(norm(w.name), m);
    }
    return (name: string): Values | null => {
      const key = [...byDate.keys()].find((k) => k === norm(name) || norm(name).includes(k) || k.includes(norm(name)));
      if (!key) return null;
      return dates.map((d) => byDate.get(key)?.get(d) ?? null);
    };
  }, [overview.data, dates]);

  const rowsOf = (t: Tab): EnergyRow[] => {
    if (!data) return [];
    if (t === 'el') return data.electricity.workshops.map((w) => ({ name: w.name, values: w.values, production: productionOf(w.name) }));
    if (t === 'st') {
      return [
        ...data.steam.internal.map((w) => ({ name: w.name, values: w.values, production: productionOf(w.name) })),
        ...data.steam.external.map((w) => ({ name: `${w.name}（外供）`, values: w.values, production: null })),
      ];
    }
    return data.water.workshops.map((w) => ({ name: w.name, values: w.values, production: productionOf(w.name) }));
  };

  const totalSeries = (rows: EnergyRow[]): Values => dates.map((_, i) => {
    let any = false;
    let s = 0;
    for (const r of rows) {
      const v = r.values[i];
      if (v !== null && v !== undefined) { any = true; s += v; }
    }
    return any ? s : null;
  });

  const elRows = rowsOf('el');
  const stInternal = data ? data.steam.internal.map((w) => ({ name: w.name, values: w.values, production: null })) : [];
  const stExternal = data ? data.steam.external.map((w) => ({ name: w.name, values: w.values, production: null })) : [];
  const elTotal = pick(totalSeries(elRows));
  const stTotal = pick(totalSeries(stInternal));
  const stExtTotal = pick(totalSeries(stExternal));
  const waTotal = pick(totalSeries(rowsOf('wa')));
  const gen = pick(data?.electricity.generation ?? []);
  const buy = pick(data?.electricity.purchase ?? []);
  const selfRatio = gen.map((g, i) => (g !== null && elTotal[i] ? (g / (elTotal[i] as number)) * 100 : null));

  const kp = (series: Values) => {
    const i = lastIdx(series);
    const p = i >= 0 ? prevIdx(series, i) : -1;
    return { now: i >= 0 ? series[i] : null, delta: pctChange(i >= 0 ? series[i] : null, p >= 0 ? series[p] : null) };
  };
  const kEl = kp(elTotal);
  const kSt = kp(stTotal);
  const kWa = kp(waTotal);
  const kGen = kp(gen);
  const kBuy = kp(buy);
  const kSelf = kp(selfRatio);

  const tabInfo = TABS.find((t) => t.key === tab) ?? TABS[0];
  const rows = rowsOf(tab).map((r) => {
    const v = pick(r.values);
    const prod = r.production ? pick(r.production) : null;
    const todayI = lastIdx(v);
    const today = todayI >= 0 ? v[todayI] : null;
    const monthTotal = sum(v);
    const unitSeries: Values = prod ? v.map((x, i) => (x !== null && prod[i] ? x / (prod[i] as number) : null)) : [];
    const todayUnit = prod && todayI >= 0 ? unitSeries[todayI] : null;
    const monthProd = prod ? sum(v.map((x, i) => (x !== null ? prod[i] : null))) : 0;
    const monthUnit = prod && monthProd > 0 ? monthTotal / monthProd : null;
    return { ...r, today, monthTotal, unitSeries, todayUnit, monthUnit };
  });
  const maxMonth = Math.max(1, ...rows.map((r) => r.monthTotal));
  const todayAll = tab === 'el' ? kEl.now : tab === 'st' ? kSt.now : kWa.now;
  const monthAll = tab === 'el' ? sum(elTotal) : tab === 'st' ? sum(stTotal) : sum(waTotal);
  const digits = tab === 'el' ? 0 : 1;

  const monthLabel = monthKey ? `${monthKey.slice(0, 4)} 年 ${Number(monthKey.slice(5))} 月` : '—';
  const exportCsv = () => {
    downloadCsv(`能源中心-${tabInfo.label}-${monthKey ?? ''}.csv`, [
      ['车间', `今日用量 ${tabInfo.unit}`, `本月用量 ${tabInfo.unit}`, `今日单耗 ${tabInfo.unitPer}`, `本月单耗 ${tabInfo.unitPer}`],
      ...rows.map((r) => [r.name, r.today, r.monthTotal, r.todayUnit === null ? null : +r.todayUnit.toFixed(2), r.monthUnit === null ? null : +r.monthUnit.toFixed(2)]),
    ]);
  };

  return (
    <Dash>
      <div className="enter" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
        <h1 className="h1" style={{ fontSize: 28, flex: 1 }}>能源中心</h1>
        <Seg options={[{ label: '本月', value: 'month' }, { label: '近 30 天', value: '30d' }]} value={range} onChange={(v) => setRange(v as 'month' | '30d')} />
        <div style={{ opacity: range === 'month' ? 1 : 0.45, pointerEvents: range === 'month' ? 'auto' : 'none' }}>
          <Stepper
            label={monthLabel}
            onPrev={() => setMonth(months[monthIdx - 1])}
            onNext={() => setMonth(months[monthIdx + 1])}
            prevDisabled={monthIdx <= 0}
            nextDisabled={monthIdx >= months.length - 1}
          />
        </div>
        <ExportButton onClick={exportCsv} />
      </div>

      <div className="kpis enter d1">
        <Kpi label="今日用电" value={kEl.now === null ? '—' : fmt(kEl.now / 10000, 2)} unit="万kWh" delta={kEl.delta} good="down" sub={`${elRows.length} 个车间合计`} spark={elTotal} sparkTail={7} />
        <Kpi label="今日用汽" value={fmt(kSt.now, 1)} unit="t" delta={kSt.delta} good="down" sub={`${stInternal.length} 个车间内供 · 外供 ${fmt(kp(stExtTotal).now, 1)} t`} spark={stTotal} sparkTail={7} />
        <Kpi label="今日用水" value={fmt(kWa.now, 0)} unit="t" delta={kWa.delta} good="down" sub={`${data?.water.workshops.length ?? 0} 个车间合计`} spark={waTotal} sparkTail={7} />
        <Kpi label="发电量" value={kGen.now === null ? '—' : fmt(kGen.now / 10000, 2)} unit="万kWh" delta={kGen.delta} sub="1# 冷凝机" spark={gen} sparkTail={7} />
        <Kpi label="外购电" value={kBuy.now === null ? '—' : fmt(kBuy.now / 10000, 2)} unit="万kWh" delta={kBuy.delta} good="down" sub="2# 进线" spark={buy} sparkTail={7} />
        <Kpi label="自发电占比" value={fmt(kSelf.now, 1)} unit="%" delta={kSelf.delta} sub="发电 ÷ 总用电" spark={selfRatio} sparkTail={7} />
      </div>

      <div className="card enter d2" style={{ marginTop: 16, padding: '18px 20px 8px', position: 'relative' }}>
        <div className="ct" style={{ alignItems: 'center', marginBottom: 14 }}>
          <b style={{ fontSize: 15 }}>各车间能耗</b>
          <Seg className="tbtabs" options={TABS.map((t) => ({ label: t.label, value: t.key }))} value={tab} onChange={(v) => setTab(v as Tab)} />
          <div className="r">
            <div style={{ display: 'flex', gap: 24 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>今日合计 {tabInfo.unit} <b className="num" style={{ color: 'var(--ink)' }}>{fmt(todayAll, digits)}</b></span>
              <span className="muted" style={{ fontSize: 12.5 }}>{range === 'month' ? '本月' : '近 30 天'}合计 {tabInfo.unit} <b className="num" style={{ color: 'var(--ink)' }}>{fmt(monthAll, digits)}</b></span>
            </div>
          </div>
        </div>
        <div className="swap" key={tab}>
          <div className="erow ehead">
            <div>车间</div>
            <div>今日用量 {tabInfo.unit}</div>
            <div>{range === 'month' ? '本月' : '近 30 天'}用量 {tabInfo.unit}</div>
            <div>今日单耗 {tabInfo.unitPer}</div>
            <div>本月单耗</div>
            <div>较本月</div>
            <div>近 30 天单耗</div>
          </div>
          {rows.map((r) => {
            const diff = r.todayUnit !== null && r.monthUnit ? ((r.todayUnit - r.monthUnit) / r.monthUnit) * 100 : null;
            return (
              <div className="erow" key={r.name}>
                <div><div style={{ fontWeight: 500 }}>{r.name}</div></div>
                <div className="num">{fmt(r.today, digits)}</div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="bar-in" style={{ flex: 1, height: 8 }}>
                      <i style={{ width: `${Math.min(100, (r.monthTotal / maxMonth) * 100)}%`, background: 'var(--brand)' }} />
                    </div>
                    <span className="num" style={{ width: 76, textAlign: 'right' }}>{fmt(r.monthTotal, digits)}</span>
                  </div>
                </div>
                <div className="num" style={{ fontWeight: 600 }}>{r.todayUnit === null ? '—' : fmt(r.todayUnit, r.todayUnit < 10 ? 2 : r.todayUnit < 1000 ? 1 : 0)}</div>
                <div className="num muted">{r.monthUnit === null ? '—' : fmt(r.monthUnit, r.monthUnit < 10 ? 2 : r.monthUnit < 1000 ? 1 : 0)}</div>
                <div className="num">{diff === null ? '—' : <span className={diff <= 0 ? 'up' : 'dn'}>{diff <= 0 ? '▼' : '▲'} {Math.abs(diff).toFixed(1)}%</span>}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{r.unitSeries.length ? <Spark values={r.unitSeries} w={88} h={26} tail={7} /> : <span className="faint">—</span>}</div>
              </div>
            );
          })}
          {!rows.length ? <div className="empty">暂无数据</div> : null}
        </div>
        <div className="faint" style={{ fontSize: 12, padding: '10px 0 12px' }}>
          单耗 = 用量 ÷ 当日产量（硫酸为折 98%）；无产量口径的行（外供客户等）不计单耗。
        </div>
      </div>
    </Dash>
  );
}
