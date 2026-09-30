import { useEffect } from 'react';
import { App, Card, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { EnergySeries } from '@hgxt/shared';
import { energySummary } from '../../api/production';
import { PageHeader } from '../../components/PageHeader';
import './production.css';

/** 序列的最后一个非空值（“今日”）与整段和（“近30天”） */
function latest(series: Array<number | null>): number | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] !== null) return series[i];
  return null;
}
function totalOf(series: Array<number | null>): number {
  return series.reduce<number>((s, v) => s + (v ?? 0), 0);
}

const num = (v: number | null, digits = 0): string =>
  v === null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits });

export function EnergyCenterPage() {
  const { message } = App.useApp();
  const query = useQuery({ queryKey: ['production', 'energy', 30], queryFn: () => energySummary(30) });
  useEffect(() => { if (query.error) message.error(query.error.message); }, [query.error, message]);
  const data = query.data;
  const lastDate = data ? data.dates[data.dates.length - 1] : '';

  const electricityToday = data ? latest(data.electricity.workshops.map((w) => latest(w.values))) : null;
  const steamInternalToday = data ? latest(data.steam.internal.map((w) => latest(w.values))) : null;
  const waterToday = data ? latest(data.water.workshops.map((w) => latest(w.values))) : null;
  const generationToday = data ? latest(data.electricity.generation) : null;
  const purchaseToday = data ? latest(data.electricity.purchase) : null;
  const selfGenRatio =
    generationToday !== null && purchaseToday !== null && electricityToday !== null && electricityToday > 0
      ? Math.round((generationToday / electricityToday) * 100)
      : null;

  const seriesColumns = (unit: string) => [
    { title: '车间 / 客户', dataIndex: 'name', key: 'name' },
    { title: `今日 ${unit}`, dataIndex: 'today', key: 'today', align: 'right' as const, render: (v: number | null) => num(v) },
    { title: `近30天累计 ${unit}`, dataIndex: 'total', key: 'total', align: 'right' as const, render: (v: number | null) => num(v) },
  ];
  const toRows = (series: EnergySeries[]) =>
    series.map((s) => ({ key: s.name, name: s.name, today: latest(s.values), total: totalOf(s.values) }));

  return <>
    <PageHeader title="能源中心" description={lastDate ? `电 · 汽 · 水 —— 截至 ${lastDate}` : '电 · 汽 · 水'} />
    <div className="prod-kpis">
      <div className="prod-kpi">
        <div className="prod-kpi-value">{electricityToday === null ? '—' : (electricityToday / 10000).toFixed(2)}<small>万 kWh</small></div>
        <div className="prod-kpi-name">今日用电 · 4 车间合计</div>
      </div>
      <div className="prod-kpi">
        <div className="prod-kpi-value">{num(steamInternalToday, 1)}<small>t</small></div>
        <div className="prod-kpi-name">今日用汽 · 5 车间内供（外供另计）</div>
      </div>
      <div className="prod-kpi">
        <div className="prod-kpi-value">{num(waterToday, 1)}<small>t</small></div>
        <div className="prod-kpi-name">今日用水 · 4 表合计</div>
      </div>
      <div className="prod-kpi">
        <div className="prod-kpi-value">{num(generationToday)}<small>kWh</small></div>
        <div className="prod-kpi-name">发电量 · 1# 冷凝机</div>
      </div>
      <div className="prod-kpi">
        <div className="prod-kpi-value">{num(purchaseToday)}<small>kWh</small></div>
        <div className="prod-kpi-name">外购电 · 2# 进线</div>
      </div>
      <div className="prod-kpi">
        <div className="prod-kpi-value">{selfGenRatio === null ? '—' : `${selfGenRatio}`}<small>%</small></div>
        <div className="prod-kpi-name">自发电占比 · 发电 ÷ 用电</div>
      </div>
    </div>

    <Card className="hgxt-surface" styles={{ body: { padding: 0 } }}>
      <div className="hgxt-toolbar"><span className="hgxt-toolbar-meta">各车间用电（kWh，读数差 × 倍率）</span></div>
      <Table size="small" pagination={false} loading={query.isLoading}
        dataSource={toRows(data?.electricity.workshops ?? [])}
        columns={seriesColumns('kWh')} />
      <div className="hgxt-toolbar" style={{ borderTop: '1px solid var(--hg-hairline)' }}>
        <span className="hgxt-toolbar-meta">蒸汽内供（t）—— 一家的汽是另一家的能</span>
      </div>
      <Table size="small" pagination={false} loading={query.isLoading}
        dataSource={toRows(data?.steam.internal ?? [])}
        columns={seriesColumns('t')} />
      <div className="hgxt-toolbar" style={{ borderTop: '1px solid var(--hg-hairline)' }}>
        <span className="hgxt-toolbar-meta">蒸汽外供客户（t，不计单耗）</span>
      </div>
      <Table size="small" pagination={false} loading={query.isLoading}
        dataSource={toRows(data?.steam.external ?? [])}
        columns={seriesColumns('t')} />
      <div className="hgxt-toolbar" style={{ borderTop: '1px solid var(--hg-hairline)' }}>
        <span className="hgxt-toolbar-meta">各车间用水（t）</span>
      </div>
      <Table size="small" pagination={false} loading={query.isLoading}
        dataSource={toRows(data?.water.workshops ?? [])}
        columns={seriesColumns('t')} />
    </Card>
  </>;
}
