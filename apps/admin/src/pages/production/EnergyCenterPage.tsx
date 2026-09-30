import { useEffect, useMemo, useState } from 'react';
import { App as AntApp } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { energySummary, workshopOverview } from '../../api/production';
import { Dash, Kpi, Seg, fmt, pctChange } from './dash-ui';
import './dash.css';

type Tab = 'el' | 'st' | 'wa';

const last = (a: Array<number | null>): number | null => {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] !== null) return a[i];
  return null;
};
const secondLast = (a: Array<number | null>): number | null => {
  let seen = 0;
  for (let i = a.length - 1; i >= 0; i--) {
    if (a[i] !== null) {
      seen++;
      if (seen === 2) return a[i];
    }
  }
  return null;
};
const totalOf = (a: Array<number | null>): number => a.reduce<number>((s, v) => s + (v ?? 0), 0);

/** 电耗行：含单耗（对应该车间当日/当月产量） */
function ElectricityRow({
  name,
  values,
  production,
}: {
  name: string;
  values: Array<number | null>;
  production: Array<number | null>;
}) {
  const today = last(values);
  const month = totalOf(values);
  const maxMonth = 1;
  const todayProd = last(production);
  const monthProd = totalOf(production);
  const unitToday = today !== null && todayProd ? +(today / todayProd).toFixed(1) : null;
  const unitMonth = monthProd > 0 ? +(month / monthProd).toFixed(1) : null;
  return (
    <div className="erow">
      <div><div style={{ fontWeight: 500 }}>{name}</div></div>
      <div className="num">{fmt(today)}</div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="bar-in" style={{ flex: 1, height: 8 }}>
            <i style={{ width: `${Math.min(100, (month / maxMonth) * 100)}%`, background: '#2F55A4' }} />
          </div>
          <span className="num" style={{ width: 76, textAlign: 'right' }}>{fmt(month)}</span>
        </div>
      </div>
      <div className="num" style={{ fontWeight: 600 }}>{unitToday === null ? '—' : fmt(unitToday, 1)}</div>
      <div className="num muted">{unitMonth === null ? '—' : fmt(unitMonth, 1)}</div>
      <div className="num">{unitToday !== null && unitMonth !== null && unitMonth !== 0
        ? <span className={unitToday <= unitMonth ? 'up' : 'dn'}>{unitToday <= unitMonth ? '▼' : '▲'} {Math.abs(((unitToday - unitMonth) / unitMonth) * 100).toFixed(1)}%</span>
        : '—'}</div>
    </div>
  );
}

function SeriesRow({ name, values, unit }: { name: string; values: Array<number | null>; unit: string }) {
  const today = last(values);
  const month = totalOf(values);
  return (
    <div className="erow">
      <div><div style={{ fontWeight: 500 }}>{name}</div></div>
      <div className="num">{fmt(today, 1)}</div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="bar-in" style={{ flex: 1, height: 8 }}>
            <i style={{ width: '100%', background: '#2F55A4' }} />
          </div>
          <span className="num" style={{ width: 76, textAlign: 'right' }}>{fmt(month, 1)}</span>
        </div>
      </div>
      <div className="num muted">{unit}</div>
      <div className="num muted">—</div>
      <div className="num muted">—</div>
    </div>
  );
}

export function EnergyCenterPage() {
  const { message } = AntApp.useApp();
  const [tab, setTab] = useState<Tab>('el');
  const query = useQuery({ queryKey: ['production', 'energy', 30], queryFn: () => energySummary(30) });
  const overview = useQuery({ queryKey: ['production', 'workshops', 120], queryFn: () => workshopOverview(120) });
  useEffect(() => { if (query.error) message.error(query.error.message); }, [query.error, message]);

  const data = query.data;
  // 车间日产量（单耗分母）：能源 dates 与 workshops dates 对齐取交集尾部
  const productionOf = useMemo(() => {
    const map = new Map<string, Array<number | null>>();
    const wDates = overview.data?.dates ?? [];
    for (const w of overview.data?.workshops ?? []) {
      map.set(w.name, wDates.slice(-30).map((_, i) => w.values[wDates.length - 30 + i] ?? null));
    }
    return map;
  }, [overview.data]);

  const elSum = data?.electricity.workshops.map((w) => last(w.values) ?? 0).reduce((s, v) => s + v, 0) ?? null;
  const elSumPrev = data?.electricity.workshops.map((w) => secondLast(w.values) ?? 0).reduce((s, v) => s + v, 0);
  const elMonth = data?.electricity.workshops.map((w) => totalOf(w.values)).reduce((s, v) => s + v, 0);
  const stInternal = data ? last(data.steam.internal.map((s) => last(s.values) ?? 0).map((v) => v)) : null;
  const stInternalToday = data ? data.steam.internal.reduce((s, w) => s + (last(w.values) ?? 0), 0) : null;
  const stExternalToday = data ? data.steam.external.reduce((s, w) => s + (last(w.values) ?? 0), 0) : null;
  const waterToday = data ? data.water.workshops.reduce((s, w) => s + (last(w.values) ?? 0), 0) : null;
  const waterPrev = data ? data.water.workshops.reduce((s, w) => s + (secondLast(w.values) ?? 0), 0) : null;
  const generation = data ? last(data.electricity.generation) : null;
  const generationPrev = data ? secondLast(data.electricity.generation) : null;
  const purchase = data ? last(data.electricity.purchase) : null;
  const selfRatio = generation !== null && elSum ? Math.round((generation / elSum) * 100) : null;

  const headFor = (t: Tab): string => {
    if (t === 'el') return `今日合计 ${fmt(elSum)} kWh · 近 30 天 ${fmt(elMonth)} kWh`;
    if (t === 'st') return `今日内供 ${fmt(stInternalToday, 1)} t · 外供 ${fmt(stExternalToday, 1)} t`;
    return `今日合计 ${fmt(waterToday, 1)} t`;
  };

  return (
    <Dash>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
        <h1 className="h1" style={{ fontSize: 28, flex: 1, margin: 0 }}>能源中心</h1>
        <Seg options={[{ label: '近 30 天', value: '30d' }]} value="30d" onChange={() => undefined} />
      </div>

      <div className="kpis">
        <Kpi label="今日用电" value={elSum === null ? '—' : (elSum / 10000).toFixed(2)} unit="万kWh" delta={pctChange(elSum, elSumPrev)} sub="4 个车间合计" />
        <Kpi label="今日用汽" value={fmt(stInternalToday, 1)} unit="t" sub="5 个车间内供（外供另计）" />
        <Kpi label="今日用水" value={fmt(waterToday, 1)} unit="t" delta={pctChange(waterToday, waterPrev)} sub="4 表合计" />
        <Kpi label="发电量" value={fmt(generation)} unit="kWh" delta={pctChange(generation, generationPrev)} sub="1# 冷凝机 ×12000" />
        <Kpi label="外购电" value={fmt(purchase)} unit="kWh" sub="2# 进线 ×12000" />
        <Kpi label="自发电占比" value={selfRatio === null ? '—' : String(selfRatio)} unit="%" sub="发电 ÷ 用电" />
      </div>

      <div className="card" style={{ marginTop: 16, padding: '18px 20px 8px' }}>
        <div className="ct" style={{ alignItems: 'center', marginBottom: 14 }}>
          <b style={{ fontSize: 15 }}>各车间能耗</b>
          <div className="tbtabs" role="tablist" aria-label="能源类别" style={{ marginLeft: 10 }}>
            <button role="tab" className={tab === 'el' ? 'on' : ''} onClick={() => setTab('el')}>电</button>
            <button role="tab" className={tab === 'st' ? 'on' : ''} onClick={() => setTab('st')}>汽</button>
            <button role="tab" className={tab === 'wa' ? 'on' : ''} onClick={() => setTab('wa')}>水</button>
          </div>
          <div className="r"><span className="muted" style={{ fontSize: 12.5 }}>{headFor(tab)}</span></div>
        </div>

        {tab === 'el' ? (
          <div>
            <div className="erow ehead"><div>车间</div><div>今日用量 kWh</div><div>近 30 天用量 kWh</div><div>今日单耗 kWh/t</div><div>月均单耗</div><div>较月均</div></div>
            {(data?.electricity.workshops ?? []).map((w) => (
              <ElectricityRow key={w.name} name={w.name} values={w.values} production={productionOf.get(w.name) ?? []} />
            ))}
            <div className="faint" style={{ fontSize: 12, padding: '8px 0 12px' }}>
              单耗 = 用电 ÷ 当日产量（硫酸为折98）；硫酸镁 09-19 后停报、蒽醌近期未填产量时单耗显示 —
            </div>
          </div>
        ) : null}
        {tab === 'st' ? (
          <div>
            <div className="erow ehead"><div>车间 / 客户</div><div>今日用量 t</div><div>近 30 天用量 t</div><div>类别</div><div /><div /></div>
            {(data?.steam.internal ?? []).map((s) => <SeriesRow key={`i-${s.name}`} name={s.name} values={s.values} unit="内供" />)}
            {(data?.steam.external ?? []).map((s) => <SeriesRow key={`e-${s.name}`} name={s.name} values={s.values} unit="外供客户" />)}
            <div className="faint" style={{ fontSize: 12, padding: '8px 0 12px' }}>外供蒸汽不计单耗</div>
          </div>
        ) : null}
        {tab === 'wa' ? (
          <div>
            <div className="erow ehead"><div>车间</div><div>今日用量 t</div><div>近 30 天用量 t</div><div>表位</div><div /><div /></div>
            {(data?.water.workshops ?? []).map((s) => <SeriesRow key={s.name} name={s.name} values={s.values} unit="独立水表" />)}
          </div>
        ) : null}
        {stInternal === null && !data ? <div style={{ padding: 20 }} className="faint">加载中…</div> : null}
      </div>
    </Dash>
  );
}
