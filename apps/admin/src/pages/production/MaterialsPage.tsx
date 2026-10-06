import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { App as AntApp } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, Calendar, X } from 'lucide-react';
import { materialsSummary } from '../../api/production';
import { stableViewportStyle } from '../../styles/pagedViewport';
import { Dash, ExportButton, Seg, downloadCsv, fmt, fmtRecorded } from './dash-ui';

/** 可用天数进度条颜色（design/13：<7 天琥珀、<3 天红） */
function daysColor(days: number | null): string {
  if (days === null) return 'var(--line2)';
  if (days < 3) return 'var(--danger)';
  if (days < 7) return '#C98500';
  return 'var(--brand)';
}

const WORKSHOP_ORDER = ['硫酸', '氨基磺酸', '硫酸镁', '水滑石', '蒽醌', '丰联', '环保'];
const workshopOf = (label: string): string => label.split('·')[0].replace(/(?:车间|产品)$/, '');
const workshopOptionsOf = (labels: string[]) =>
  [...new Set(labels.map(workshopOf))].sort((left, right) => {
    const leftOrder = WORKSHOP_ORDER.indexOf(left);
    const rightOrder = WORKSHOP_ORDER.indexOf(right);
    return (leftOrder < 0 ? WORKSHOP_ORDER.length : leftOrder) - (rightOrder < 0 ? WORKSHOP_ORDER.length : rightOrder)
      || left.localeCompare(right, 'zh-CN');
  }).map((name) => ({ value: name, label: name }));

export function MaterialsPage() {
  const { message } = AntApp.useApp();
  const query = useQuery({ queryKey: ['production', 'materials'], queryFn: materialsSummary });
  useEffect(() => { if (query.error) message.error(query.error.message); }, [query.error, message]);

  const data = query.data;
  const [filter, setFilter] = useState('all');
  const [rawWorkshop, setRawWorkshop] = useState<string | null>(null);
  const [productWorkshop, setProductWorkshop] = useState<string | null>(null);
  const rawScrollRef = useRef<HTMLDivElement>(null);
  const productScrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const viewport = rawScrollRef.current;
    if (viewport) { viewport.scrollTop = 0; viewport.scrollLeft = 0; }
  }, [filter, rawWorkshop]);
  useLayoutEffect(() => {
    const viewport = productScrollRef.current;
    if (viewport) { viewport.scrollTop = 0; viewport.scrollLeft = 0; }
  }, [productWorkshop]);
  const rawAll = data?.rawMaterials ?? [];
  const productAll = data?.finishedProducts ?? [];
  const rawWorkshopOptions = workshopOptionsOf(rawAll.map((item) => item.workshop));
  const productWorkshopOptions = workshopOptionsOf(productAll.map((item) => item.workshop));
  const selectedRawWorkshop = rawWorkshopOptions.find((option) => option.value === rawWorkshop)?.value ?? rawWorkshopOptions[0]?.value;
  const selectedProductWorkshop = productWorkshopOptions.find((option) => option.value === productWorkshop)?.value ?? productWorkshopOptions[0]?.value;
  const all = rawAll.filter((item) => workshopOf(item.workshop) === selectedRawWorkshop);
  const raws = all.filter((r) => (filter === 'alert' ? r.alert : true));
  const alertCount = all.filter((r) => r.alert).length;
  const products = productAll.filter((item) => workshopOf(item.workshop) === selectedProductWorkshop);
  const flows = data?.internalFlows ?? [];

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(`物料与库存-${data.date}.csv`, [
      ['物料', '车间', '单位', '库存日期', '库存', '购耗日期', '购入', '耗用', '可用天数'],
      ...raws.map((r) => [r.name, r.workshop, r.unit, r.stockDate, r.stock, r.activityDate, r.purchase, r.consumption, r.daysOfUse]),
      [],
      ['产品', '车间', '产销日期', '产量 t', '销量 t', '库存日期', '库存 t', '产销率', '库存天数'],
      ...products.map((p) => [p.name, p.workshop, p.activityDate, p.production, p.sales, p.stockDate, p.stock, p.salesRatio, p.stockDays]),
    ]);
  };

  return (
    <Dash>
      <div className="dh enter" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="h1" style={{ fontSize: 26 }}>物料与库存</h1>
        </div>
        <span className="chip"><Calendar size={14} strokeWidth={1.6} />最新记录 {data?.date ?? '—'}</span>
        <ExportButton onClick={exportCsv} />
      </div>

      <div className="card enter d1" style={{ paddingBottom: 6 }}>
        <div className="ct" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <b>原辅料库存</b>
          <div className="r" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Seg
              options={[{ label: `全部 ${all.length}`, value: 'all' }, { label: `预警 ${alertCount}`, value: 'alert' }]}
              value={filter}
              onChange={setFilter}
            />
          </div>
        </div>
        <div className="fbar" role="group" aria-label="筛选原辅料车间">
          {rawWorkshopOptions.map((option) => (
            <button key={option.value} type="button" className={`chipbtn${selectedRawWorkshop === option.value ? ' on' : ''}`}
              aria-pressed={selectedRawWorkshop === option.value}
              onClick={() => { setRawWorkshop(option.value); setFilter('all'); }}>{option.label}</button>
          ))}
        </div>
        <div className="hgxt-stable-viewport" ref={rawScrollRef} style={stableViewportStyle(8, 36, 40)}>
        <table className="dt materials-table materials-raw-table">
          <colgroup>
            <col style={{ width: '19%' }} /><col style={{ width: '13%' }} /><col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} /><col style={{ width: '16%' }} /><col style={{ width: '9%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>物料</th>
              <th style={{ textAlign: 'left' }}>车间</th>
              <th>库存日</th>
              <th>库存</th>
              <th>购耗日</th>
              <th>购入</th>
              <th>耗用</th>
              <th>可用天数（满格 30 天）</th>
              <th>预警</th>
            </tr>
          </thead>
          <tbody>
            {raws.map((r) => (
              <tr key={`${r.workshop}-${r.name}`}>
                <td title={r.name} style={{ fontWeight: 500 }}>{r.name}</td>
                <td className="muted" title={r.workshop} style={{ textAlign: 'left' }}>{r.workshop}</td>
                <td className="muted">{r.stockDate || '—'}</td>
                <td>{fmtRecorded(r.stock)} {r.stock === null ? '' : r.unit}</td>
                <td className="muted">{r.activityDate}</td>
                <td>{fmtRecorded(r.purchase)} {r.purchase === null ? '' : r.unit}</td>
                <td>{fmtRecorded(r.consumption)} {r.consumption === null ? '' : r.unit}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="bar-in" style={{ flex: 1 }}>
                      <i style={{ width: `${r.daysOfUse === null ? 0 : Math.min(100, (r.daysOfUse / 30) * 100)}%`, background: daysColor(r.daysOfUse) }} />
                    </div>
                    <span className="num" style={{ width: 52, textAlign: 'right' }}>{r.daysOfUse === null ? '—' : `${fmt(r.daysOfUse, 1)} 天`}</span>
                  </div>
                </td>
                <td>
                  {r.alert === 'low3' ? <span className="badge b-danger"><X size={13} strokeWidth={1.8} />低于 3 天</span>
                    : r.alert === 'low7' ? <span className="badge b-amber"><Bell size={13} strokeWidth={1.8} />低于 7 天</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!raws.length ? <div className="empty">{query.isLoading ? '加载中…' : filter === 'alert' ? '没有需要预警的物料' : '暂无原辅料记录'}</div> : null}
        </div>
      </div>

      <div className="enter d2" style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <div className="card" style={{ paddingBottom: 6 }}>
          <div className="ct" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <b>产成品产销存</b>
          </div>
          <div className="fbar" role="group" aria-label="筛选产成品车间">
            {productWorkshopOptions.map((option) => (
              <button key={option.value} type="button" className={`chipbtn${selectedProductWorkshop === option.value ? ' on' : ''}`}
                aria-pressed={selectedProductWorkshop === option.value}
                onClick={() => setProductWorkshop(option.value)}>{option.label}</button>
            ))}
          </div>
          <div className="hgxt-stable-viewport" ref={productScrollRef} style={stableViewportStyle(8, 36, 40)}>
          <table className="dt materials-table materials-product-table">
            <colgroup>
              <col style={{ width: '22%' }} /><col style={{ width: '13%' }} /><col style={{ width: '11%' }} />
              <col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '11%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} />
            </colgroup>
            <thead>
              <tr><th>产品</th><th style={{ textAlign: 'left' }}>车间</th><th>产销日</th><th>产量</th><th>销量</th><th>库存日</th><th>库存</th><th>产销率</th><th>库存天数</th></tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.name}>
                  <td title={p.name} style={{ fontWeight: 500 }}>{p.name}</td>
                  <td className="muted" title={p.workshop} style={{ textAlign: 'left' }}>{p.workshop}</td>
                  <td className="muted">{p.activityDate}</td>
                  <td>{fmtRecorded(p.production)}</td>
                  <td>{fmtRecorded(p.sales)}</td>
                  <td className="muted">{p.stockDate || '—'}</td>
                  <td>{fmtRecorded(p.stock)}</td>
                  <td>{p.salesRatio === null ? '—' : `${Math.round(p.salesRatio * 100)}%`}</td>
                  <td>{p.stockDays === null ? '—' : fmt(p.stockDays, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!products.length ? <div className="empty">{query.isLoading ? '加载中…' : selectedProductWorkshop ? '该车间暂无产成品记录' : '暂无产成品记录'}</div> : null}
          </div>
        </div>

        <div className="card">
          <div className="ct">
            <b>车间间物料往来</b>
          </div>
          {flows.map((f) => (
            <div
              key={`${f.from}-${f.to}-${f.material}`}
              style={{ display: 'grid', gridTemplateColumns: '96px 20px 130px 20px minmax(0, 1fr) 90px 96px', alignItems: 'center', gap: 6, minHeight: 36, borderBottom: '1px solid var(--line)', fontSize: 14 }}
            >
              <span style={{ fontWeight: 500 }}>{f.from}</span>
              <span className="faint" style={{ display: 'flex' }}><ArrowRight size={14} strokeWidth={1.6} /></span>
              <span className="chip" style={{ justifySelf: 'start' }}>{f.material}</span>
              <span className="faint" style={{ display: 'flex' }}><ArrowRight size={14} strokeWidth={1.6} /></span>
              <span style={{ fontWeight: 500 }}>{f.to}</span>
              <span className="num" style={{ textAlign: 'right' }}>{fmt(f.quantity, 1)} t</span>
              <span className="muted num" style={{ textAlign: 'right' }}>{f.date}</span>
            </div>
          ))}
          {!flows.length ? <div className="empty">{query.isLoading ? '加载中…' : '暂无物料往来记录'}</div> : null}
          <div className="faint" style={{ fontSize: 13, padding: '10px 0 4px' }}>酸的体积量已按密度折吨（发烟 1.92、93 酸 1.84）</div>
        </div>
      </div>
    </Dash>
  );
}
