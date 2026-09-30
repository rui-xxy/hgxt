import { useEffect, useState } from 'react';
import { App as AntApp } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { FinishedProductItem, RawMaterialStockItem } from '@hgxt/shared';
import { materialsSummary } from '../../api/production';
import { Dash, Seg, fmt } from './dash-ui';
import './dash.css';

/** 可用天数进度条颜色（design/13：<7 天琥珀、<3 天红） */
function daysColor(days: number | null): string {
  if (days === null) return 'var(--line2)';
  if (days < 3) return 'var(--danger)';
  if (days < 7) return '#C98500';
  return '#2F55A4';
}

export function MaterialsPage() {
  const { message } = AntApp.useApp();
  const query = useQuery({ queryKey: ['production', 'materials'], queryFn: materialsSummary });
  useEffect(() => { if (query.error) message.error(query.error.message); }, [query.error, message]);

  const data = query.data;
  const [filter, setFilter] = useState('all');
  const raws = (data?.rawMaterials ?? []).filter((r) => (filter === 'alert' ? r.alert : true));
  const alertCount = data?.rawMaterials.filter((r) => r.alert).length ?? 0;

  return (
    <Dash>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
        <h1 className="h1" style={{ fontSize: 28, flex: 1, margin: 0 }}>物料与库存</h1>
        <span className="faint" style={{ fontSize: 12.5 }}>原辅料进销存 · 产成品产销存 · 车间之间的物料往来</span>
      </div>

      <div className="card" style={{ paddingBottom: 6 }}>
        <div className="ct">
          <b>原辅料库存{data ? ` · ${data.date}` : ''}</b>
          <span>可用天数 = 库存 ÷ 近 7 日平均耗用</span>
          <div className="r">
            <Seg
              options={[{ label: `全部 ${data?.rawMaterials.length ?? 0}`, value: 'all' }, { label: `预警 ${alertCount}`, value: 'alert' }]}
              value={filter}
              onChange={setFilter}
            />
          </div>
        </div>
        <table className="dt">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>物料</th>
              <th style={{ textAlign: 'left' }}>车间</th>
              <th>库存 t</th>
              <th>今日购入</th>
              <th>今日耗用</th>
              <th style={{ textAlign: 'left' }}>可用天数（满格 30 天）</th>
              <th style={{ textAlign: 'left' }}>预警</th>
            </tr>
          </thead>
          <tbody>
            {raws.map((r: RawMaterialStockItem) => (
              <tr key={`${r.workshop}-${r.name}`}>
                <td style={{ textAlign: 'left', fontWeight: 500 }}>{r.name}</td>
                <td style={{ textAlign: 'left' }} className="muted">{r.workshop}</td>
                <td>{fmt(r.stock, 1)}</td>
                <td>{fmt(r.purchase, 1)}</td>
                <td>{fmt(r.consumption, 2)}</td>
                <td style={{ width: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="bar-in" style={{ flex: 1 }}>
                      <i style={{ width: `${r.daysOfUse === null ? 0 : Math.min(100, (r.daysOfUse / 30) * 100)}%`, background: daysColor(r.daysOfUse) }} />
                    </div>
                    <span className="num" style={{ width: 44, textAlign: 'right' }}>{r.daysOfUse === null ? '—' : `${r.daysOfUse} 天`}</span>
                  </div>
                </td>
                <td style={{ textAlign: 'left' }}>
                  {r.alert === 'low3' ? <span className="badge b-danger">低于 3 天</span>
                    : r.alert === 'low7' ? <span className="badge b-amber">低于 7 天</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16, paddingBottom: 6 }}>
        <div className="ct">
          <b>产成品产销存{data ? ` · ${data.date}` : ''}</b>
          <span>库存天数 = 库存 ÷ 销量</span>
        </div>
        <table className="dt">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>产品</th>
              <th>产量 t</th>
              <th>销量 t</th>
              <th>库存 t</th>
              <th>产销率</th>
              <th>库存天数</th>
            </tr>
          </thead>
          <tbody>
            {(data?.finishedProducts ?? []).map((p: FinishedProductItem) => (
              <tr key={p.name}>
                <td style={{ textAlign: 'left', fontWeight: 500 }}>{p.name}</td>
                <td>{fmt(p.production, 1)}</td>
                <td>{fmt(p.sales, 1)}</td>
                <td>{fmt(p.stock, 1)}</td>
                <td>{p.salesRatio === null ? '—' : `${Math.round(p.salesRatio * 100)}%`}</td>
                <td>{p.stockDays === null ? '—' : `${p.stockDays} 天`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16, paddingBottom: 12 }}>
        <div className="ct">
          <b>车间间物料往来{data ? ` · ${data.date}` : ''}</b>
          <span>一家的副产品是另一家的原料</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, padding: '4px 0' }}>
          {(data?.internalFlows ?? []).map((f) => (
            <div key={`${f.from}-${f.to}-${f.material}`} className="sp-row" style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 500 }}>{f.from} <span className="muted">→</span> {f.to}</span>
                <span className="num" style={{ fontWeight: 600 }}>{fmt(f.quantity, 1)} t</span>
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{f.material}（当日）</div>
            </div>
          ))}
        </div>
        <div className="faint" style={{ fontSize: 12, padding: '4px 0 8px' }}>酸的体积量已按密度折吨（发烟 1.92、93酸 1.84）</div>
      </div>
    </Dash>
  );
}
