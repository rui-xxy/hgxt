import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { App as AntApp } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, Calendar, X } from 'lucide-react';
import { materialsSummary } from '../../api/production';
import { stableViewportStyle } from '../../styles/pagedViewport';
import { Dash, ExportButton, Seg, downloadCsv, fmt } from './dash-ui';

/** 可用天数进度条颜色（design/13：<7 天琥珀、<3 天红） */
function daysColor(days: number | null): string {
  if (days === null) return 'var(--line2)';
  if (days < 3) return 'var(--danger)';
  if (days < 7) return '#C98500';
  return 'var(--brand)';
}

export function MaterialsPage() {
  const { message } = AntApp.useApp();
  const query = useQuery({ queryKey: ['production', 'materials'], queryFn: materialsSummary });
  useEffect(() => { if (query.error) message.error(query.error.message); }, [query.error, message]);

  const data = query.data;
  const [filter, setFilter] = useState('all');
  const rawScrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (rawScrollRef.current) rawScrollRef.current.scrollTop = 0;
  }, [filter]);
  const all = data?.rawMaterials ?? [];
  const raws = all.filter((r) => (filter === 'alert' ? r.alert : true));
  const alertCount = all.filter((r) => r.alert).length;

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(`物料与库存-${data.date}.csv`, [
      ['物料', '车间', '库存 t', '今日购入 t', '今日耗用 t', '可用天数'],
      ...all.map((r) => [r.name, r.workshop, r.stock, r.purchase, r.consumption, r.daysOfUse]),
      [],
      ['产品', '产量 t', '销量 t', '库存 t', '产销率', '库存天数'],
      ...data.finishedProducts.map((p) => [p.name, p.production, p.sales, p.stock, p.salesRatio, p.stockDays]),
    ]);
  };

  return (
    <Dash>
      <div className="dh enter" style={{ alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="h1" style={{ fontSize: 26 }}>物料与库存</h1>
          <div className="sub" style={{ marginTop: 4 }}>原辅料进销存 · 产成品产销存 · 车间之间的物料往来</div>
        </div>
        <span className="chip"><Calendar size={14} strokeWidth={1.6} />{data?.date ?? '—'}</span>
        <ExportButton onClick={exportCsv} />
      </div>

      <div className="card enter d1" style={{ paddingBottom: 6 }}>
        <div className="ct">
          <b>原辅料库存{data ? ` · ${data.date.slice(5)}` : ''}</b>
          <span>可用天数 = 库存 ÷ 近 7 日平均耗用</span>
          <div className="r">
            <Seg
              options={[{ label: `全部 ${all.length}`, value: 'all' }, { label: `预警 ${alertCount}`, value: 'alert' }]}
              value={filter}
              onChange={setFilter}
            />
          </div>
        </div>
        <div className="hgxt-stable-viewport" ref={rawScrollRef} style={stableViewportStyle(8, 36, 40)}>
        <table className="dt">
          <thead>
            <tr>
              <th>物料</th>
              <th style={{ textAlign: 'left' }}>车间</th>
              <th>库存 t</th>
              <th>今日购入</th>
              <th>今日耗用</th>
              <th style={{ textAlign: 'left' }}>可用天数（满格 30 天）</th>
              <th style={{ textAlign: 'left' }}>预警</th>
            </tr>
          </thead>
          <tbody>
            {raws.map((r) => (
              <tr key={`${r.workshop}-${r.name}`}>
                <td style={{ fontWeight: 500 }}>{r.name}</td>
                <td className="muted" style={{ textAlign: 'left' }}>{r.workshop}</td>
                <td>{fmt(r.stock, 1)}</td>
                <td>{fmt(r.purchase, 1)}</td>
                <td>{fmt(r.consumption, 2)}</td>
                <td style={{ width: 260, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="bar-in" style={{ flex: 1 }}>
                      <i style={{ width: `${r.daysOfUse === null ? 0 : Math.min(100, (r.daysOfUse / 30) * 100)}%`, background: daysColor(r.daysOfUse) }} />
                    </div>
                    <span className="num" style={{ width: 52, textAlign: 'right' }}>{r.daysOfUse === null ? '—' : `${fmt(r.daysOfUse, 1)} 天`}</span>
                  </div>
                </td>
                <td style={{ textAlign: 'left', width: 120 }}>
                  {r.alert === 'low3' ? <span className="badge b-danger"><X size={13} strokeWidth={1.8} />低于 3 天</span>
                    : r.alert === 'low7' ? <span className="badge b-amber"><Bell size={13} strokeWidth={1.8} />低于 7 天</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!raws.length ? <div className="empty">{query.isLoading ? '加载中…' : '没有需要预警的物料'}</div> : null}
        </div>
      </div>

      <div className="enter d2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginTop: 16, alignItems: 'start' }}>
        <div className="card" style={{ paddingBottom: 6 }}>
          <div className="ct">
            <b>产成品产销存 · 今日</b>
            <span>t · 库存天数 = 库存 ÷ 日销量</span>
          </div>
          <table className="dt">
            <thead>
              <tr><th>产品</th><th>产量</th><th>销量</th><th>库存</th><th>产销率</th><th>库存天数</th></tr>
            </thead>
            <tbody>
              {(data?.finishedProducts ?? []).map((p) => (
                <tr key={p.name}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td>{fmt(p.production, 1)}</td>
                  <td>{fmt(p.sales, 1)}</td>
                  <td>{fmt(p.stock, 1)}</td>
                  <td>{p.salesRatio === null ? '—' : `${Math.round(p.salesRatio * 100)}%`}</td>
                  <td>{p.stockDays === null ? '—' : fmt(p.stockDays, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="ct">
            <b>车间间物料往来 · 今日</b>
            <span>一家的副产品是另一家的原料</span>
          </div>
          {(data?.internalFlows ?? []).map((f) => (
            <div
              key={`${f.from}-${f.to}-${f.material}`}
              style={{ display: 'grid', gridTemplateColumns: '96px 20px 130px 20px minmax(0, 1fr) 90px', alignItems: 'center', gap: 6, minHeight: 36, borderBottom: '1px solid var(--line)', fontSize: 14 }}
            >
              <span style={{ fontWeight: 500 }}>{f.from}</span>
              <span className="faint" style={{ display: 'flex' }}><ArrowRight size={14} strokeWidth={1.6} /></span>
              <span className="chip" style={{ justifySelf: 'start' }}>{f.material}</span>
              <span className="faint" style={{ display: 'flex' }}><ArrowRight size={14} strokeWidth={1.6} /></span>
              <span style={{ fontWeight: 500 }}>{f.to}</span>
              <span className="num" style={{ textAlign: 'right' }}>{fmt(f.quantity, 1)} t</span>
            </div>
          ))}
          <div className="faint" style={{ fontSize: 13, padding: '10px 0 4px' }}>酸的体积量已按密度折吨（发烟 1.92、93 酸 1.84）</div>
        </div>
      </div>
    </Dash>
  );
}
