import { useEffect, useMemo, useState } from 'react';
import { App as AntApp } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { sulfuricSummary, tankLevels, workshopOverview } from '../../api/production';
import { Dash, Kpi, MonthBars, Seg, fmt, pctChange } from './dash-ui';
import './dash.css';

/** 四酸的构成配色（design/11 构成面板） */
const MATERIAL_COLORS: Record<string, string> = {
  acid98: '#2F55A4',
  acid93: '#B3261E',
  reagent: '#2E6A45',
  fuming: '#C98500',
};
const MATERIAL_NAMES: Record<string, string> = {
  acid98: '98酸',
  acid93: '93酸',
  reagent: '试剂酸',
  fuming: '发烟硫酸',
};

const TITLES: Record<string, string> = {
  sulfuric: '硫酸车间',
  aminosulfonic: '氨基磺酸车间',
  magnesium: '硫酸镁车间',
  hydrotalcite: '水滑石车间',
  anthraquinone: '二乙基蒽醌车间',
};

export function WorkshopBoardPage() {
  const { message } = AntApp.useApp();
  const [code, setCode] = useState('sulfuric');
  const [range, setRange] = useState('30d');
  const [selected, setSelected] = useState<string | null>(null);

  const overview = useQuery({ queryKey: ['production', 'workshops', 120], queryFn: () => workshopOverview(120) });
  const sulfuric = useQuery({ queryKey: ['production', 'sulfuric', 120], queryFn: () => sulfuricSummary(120), enabled: code === 'sulfuric' });
  const tanks = useQuery({ queryKey: ['production', 'tanks'], queryFn: tankLevels, enabled: code === 'sulfuric' });
  useEffect(() => { if (overview.error) message.error(overview.error.message); }, [overview.error, message]);

  const workshops = overview.data?.workshops ?? [];
  const workshop = workshops.find((w) => w.code === code) ?? workshops[0];
  const allDates = useMemo(() => overview.data?.dates ?? [], [overview.data]);

  // 近30天 / 本月 两种口径（本月 = 当前自然月；都来自一次 120 天请求）
  const visible = useMemo(() => {
    const start = Math.max(0, allDates.length - 30);
    if (range === 'month') {
      const now = new Date();
      const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const idx = allDates.map((d, i) => ({ d, i })).filter((x) => x.d.startsWith(prefix));
      return idx.length ? idx : allDates.slice(start).map((d, i) => ({ d, i: start + i }));
    }
    return allDates.slice(start).map((d, i) => ({ d, i: start + i }));
  }, [allDates, range]);

  const series = workshop ? visible.map(({ d, i }) => ({ label: d, value: workshop.values[i] ?? null })) : [];
  const last = series.length ? series[series.length - 1].value : null;
  const prev = series.length > 1 ? series[series.length - 2].value : null;
  const monthValues = series.map((s) => s.value).filter((v): v is number => v !== null);
  const monthTotal = monthValues.reduce((s, v) => s + v, 0);
  const monthAvg = monthValues.length ? monthTotal / monthValues.length : null;

  const activeDate = selected ?? series[series.length - 1]?.label ?? null;
  const sulfuricDay = sulfuric.data?.days.find((d) => d.date === activeDate);
  const isSulfuric = code === 'sulfuric';

  // 构成 tooltip：硫酸按四酸展开
  const tooltipOf = (label: string) => {
    if (!isSulfuric) return null;
    const day = sulfuric.data?.days.find((d) => d.date === label);
    if (!day?.production) return null;
    return (Object.keys(MATERIAL_NAMES) as string[]).map((k) => ({
      name: MATERIAL_NAMES[k],
      value: `${fmt(day.production![k as 'acid98' | 'acid93' | 'reagent' | 'fuming'], 1)} t`,
      color: MATERIAL_COLORS[k],
    }));
  };

  return (
    <Dash>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="wstabs" role="tablist" aria-label="车间">
          {workshops.map((w) => (
            <button key={w.code} role="tab" className={w.code === code ? 'on' : ''} onClick={() => { setCode(w.code); setSelected(null); }}>
              {w.name}
            </button>
          ))}
        </div>
        <div className="pager">
          <span className="num">{workshops.findIndex((w) => w.code === code) + 1} / {workshops.length}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0 16px' }}>
        <h1 className="h1" style={{ fontSize: 28, flex: 1, margin: 0 }}>{TITLES[code] ?? '车间版面'}</h1>
        <Seg options={[{ label: '近 30 天', value: '30d' }, { label: '本月', value: 'month' }]} value={range} onChange={setRange} />
      </div>

      {workshop ? (
        <div className="kpis" style={{ gridTemplateColumns: `repeat(${isSulfuric ? 6 : 4}, minmax(0, 1fr))` }}>
          <Kpi label="今日产量" value={fmt(last, 0)} unit={isSulfuric ? 't·折98' : 't'} delta={pctChange(last, prev)} sub={activeDate ?? ''} />
          <Kpi label="本月累计" value={fmt(monthTotal, 0)} unit="t" sub={`${monthValues.length} 个有效日`} />
          <Kpi label="月均日产" value={fmt(monthAvg, 0)} unit="t" sub={range === 'month' ? '本月口径' : '近 30 天口径'} />
          <Kpi label="产线" value={TITLES[code]?.replace('车间', '') ?? '—'} sub={workshop.unit} />
          {isSulfuric && <Kpi label="当前库存" value={fmt(sulfuricDay?.inventory?.total ?? null, 0)} unit="t" sub="四酸合计（真实罐容）" />}
          {isSulfuric && <Kpi label="今日电耗" value={fmt(sulfuricDay?.electricity?.total ?? null, 0)} unit="kWh" sub="硫酸自有 4 表" />}
        </div>
      ) : null}

      {workshop ? (
        <div className="card" style={{ marginTop: 16, padding: '18px 20px' }}>
          <div className="split">
            <div className="left">
              <div className="ct" style={{ marginBottom: 14 }}>
                <b>日产量</b>
                <span>{range === 'month' ? '本月' : '近 30 天'} · 点击柱子查看当天构成</span>
                <div className="r lg">
                  <span><i style={{ width: 12, height: 0, borderTop: '1px dashed var(--ink3)', borderRadius: 0, verticalAlign: 3 }} />月均 {fmt(monthAvg, 0)}</span>
                  <span><i style={{ background: 'var(--brand)' }} />选中日</span>
                </div>
              </div>
              <MonthBars
                data={series}
                unit={workshop.unit}
                tooltipOf={tooltipOf}
                selected={selected}
                onSelect={(label) => setSelected((prevSelected) => (prevSelected === label ? null : label))}
              />
            </div>
            <div className="right">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>当天构成</span>
                <span className="faint" style={{ fontSize: 12 }}>{activeDate ?? '—'}</span>
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="faint" style={{ fontSize: 12 }}>{isSulfuric ? '折 98 产量' : '当日产量'}</div>
                <div className="kv" style={{ fontSize: 28 }}>
                  {fmt(isSulfuric ? (sulfuricDay?.production?.total98Equivalent ?? null) : last, 1)}
                  <small>t</small>
                </div>
              </div>
              {isSulfuric && sulfuricDay?.production ? (
                <div style={{ marginTop: 8, borderTop: '1px solid var(--line)' }}>
                  {(Object.keys(MATERIAL_NAMES) as string[]).map((k) => {
                    const v = sulfuricDay.production![k as keyof typeof sulfuricDay.production] as number;
                    const maxComp = Math.max(1, Math.abs(sulfuricDay.production!.total98Equivalent));
                    return (
                      <div className="sp-row" key={k} style={{ display: 'block' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <i style={{ width: 8, height: 8, borderRadius: 2, background: MATERIAL_COLORS[k], display: 'inline-block', flex: 'none' }} />
                            <span style={{ fontWeight: 500 }}>{MATERIAL_NAMES[k]}</span>
                          </div>
                          <span className="num" style={{ fontWeight: 600 }}>{fmt(v, 1)}</span>
                        </div>
                        <div className="bar-in" style={{ marginTop: 5, height: 4 }}>
                          <i style={{ width: `${Math.min(100, (Math.abs(v) / maxComp) * 100)}%`, background: MATERIAL_COLORS[k] }} />
                        </div>
                        <div className="sp-sub">
                          <span>销售流出</span>
                          <span className="num">{fmt(sulfuricDay.production!.flow[k as keyof typeof sulfuricDay.production.flow] ?? 0, 1)} t</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {!isSulfuric && last !== null ? (
                <div style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--brand)', display: 'inline-block', flex: 'none' }} />
                      <span style={{ fontWeight: 500 }}>{TITLES[code]?.replace('车间', '')} 产量</span>
                    </div>
                    <span className="num" style={{ fontWeight: 600 }}>{fmt(last, 1)}</span>
                  </div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>表单上报值</div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isSulfuric && tanks.data?.groups.length ? (
        <div className="card" style={{ marginTop: 16, padding: '18px 20px' }}>
          <div className="ct" style={{ marginBottom: 14 }}>
            <b>储罐液位 · {tanks.data.date}</b>
            <span>库存 t = 液位% × 罐容 × 密度（真实罐容）</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px 48px' }}>
            {tanks.data.groups.map((g) => (
              <div className="igrp" key={g.material}>
                <div className="ih">
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--brand)', display: 'inline-block' }} />
                  <span style={{ fontWeight: 600 }}>{g.material}</span>
                  <span className="num" style={{ marginLeft: 'auto', fontWeight: 600 }}>{fmt(g.totalTons, 1)} t</span>
                </div>
                {g.tanks.map((t) => (
                  <div className="lvl" key={t.fieldId}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                    <div className="trk">
                      <i style={{ width: `${t.levelPercent ?? 0}%`, background: 'var(--brand)' }} />
                    </div>
                    <span className="num">{t.levelPercent === null ? '—' : `${t.levelPercent}%`}</span>
                    <span className="num" style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(t.tons, 1)} t</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 16, padding: '18px 20px 10px' }}>
        <div className="ct" style={{ marginBottom: 10 }}>
          <b>明细</b>
          <span>近 10 个有效归属日</span>
        </div>
        <table className="dt">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>日期</th>
              <th>产量 t</th>
              {isSulfuric ? <th>库存 t</th> : null}
              {isSulfuric ? <th>电耗 kWh</th> : null}
              <th style={{ textAlign: 'left' }}>备注</th>
            </tr>
          </thead>
          <tbody>
            {series.slice(-10).reverse().map((s) => {
              const day = isSulfuric ? sulfuric.data?.days.find((d) => d.date === s.label) : undefined;
              return (
                <tr key={s.label}>
                  <td style={{ textAlign: 'left', fontWeight: 500 }} className="num">{s.label}</td>
                  <td>{fmt(isSulfuric ? (day?.production?.total98Equivalent ?? null) : s.value, 1)}</td>
                  {isSulfuric ? <td>{fmt(day?.inventory?.total ?? null, 0)}</td> : null}
                  {isSulfuric ? <td>{day?.electricity ? fmt(day.electricity.total, 0) : '跨天'}</td> : null}
                  <td style={{ textAlign: 'left' }} className="muted">
                    {isSulfuric ? (day?.production ? (day.production.gapDays > 0 ? `跨 ${day.production.gapDays} 天累计` : '') : '液位不完整') : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {isSulfuric && sulfuricDay?.production ? (
          <div style={{ padding: '8px 0 12px' }}>
            <div className="faint" style={{ fontSize: 12, marginBottom: 4 }}>折 98 计算过程（{sulfuricDay.date}）</div>
            <div className="calc" style={{ position: 'static', width: 'auto', pointerEvents: 'auto', transform: 'none' }}>
              <div className="cb" style={{ borderTop: 0 }}>
                <div className="cbh">四酸独立差值法 · 折 98<b>{fmt(sulfuricDay.production.total98Equivalent, 1)} t</b></div>
                <div className="cl"><span>98酸</span><span>库存差 + 销售流出</span><span>{fmt(sulfuricDay.production.acid98, 1)}</span></div>
                <div className="cl"><span>93酸</span><span>销售流出（无罐，占位 0）</span><span>{fmt(sulfuricDay.production.acid93, 1)}</span></div>
                <div className="cl"><span>试剂酸</span><span>库存差 + 销售流出</span><span>{fmt(sulfuricDay.production.reagent, 1)}</span></div>
                <div className="cl"><span>发烟硫酸</span><span>(库存差 + 流出) × 105/98</span><span>{fmt(sulfuricDay.production.fuming, 1)}</span></div>
                <div className="cl"><span>=</span><span>{sulfuricDay.production.gapDays > 0 ? `跨 ${sulfuricDay.production.gapDays} 天累计差值` : '连续日差值'}</span><span /></div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Dash>
  );
}
