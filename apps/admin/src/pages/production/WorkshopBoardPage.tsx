import { useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SulfuricDaySummary } from '@hgxt/shared';
import { sulfuricSummary, tankLevels, workshopOverview } from '../../api/production';
import { Dash, ExportButton, Kpi, MonthBars, PALETTE, Seg, Stepper, downloadCsv, fmt, pctChange } from './dash-ui';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const dayLabel = (d: string) => `${d.slice(5)} 周${WEEK[new Date(`${d}T00:00:00`).getDay()]}`;

const TITLES: Record<string, string> = {
  sulfuric: '硫酸车间',
  aminosulfonic: '氨基磺酸车间',
  magnesium: '硫酸镁车间',
  hydrotalcite: '水滑石车间',
  anthraquinone: '二乙基蒽醌车间',
};

type AcidKey = 'acid98' | 'acid93' | 'reagent' | 'fuming';
/** 四酸：名称 / 色 / 折 98 系数（发烟 ×105/98） */
const ACIDS: Array<{ key: AcidKey; name: string; color: string; fold: number }> = [
  { key: 'acid98', name: '98% 酸', color: PALETTE.brand, fold: 1 },
  { key: 'acid93', name: '93% 酸', color: PALETTE.acid93, fold: 1 },
  { key: 'reagent', name: '试剂酸', color: PALETTE.reagent, fold: 1 },
  { key: 'fuming', name: '发烟硫酸', color: PALETTE.fuming, fold: 105 / 98 },
];

/** 储罐分组配色 */
function groupColor(material: string, index: number): string {
  if (material.includes('发烟')) return PALETTE.fuming;
  if (material.includes('试剂')) return PALETTE.reagent;
  if (material.includes('双氧水')) return PALETTE.gray;
  if (material.includes('93')) return PALETTE.acid93;
  if (material.includes('98')) return PALETTE.brand;
  return [PALETTE.brand, PALETTE.fuming, PALETTE.reagent, PALETTE.gray][index % 4];
}

const signed = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));

type DetailTab = 'prod' | 'stock' | 'power';

export function WorkshopBoardPage() {
  const { message } = AntApp.useApp();
  const [code, setCode] = useState('sulfuric');
  const [range, setRange] = useState<'month' | '30d'>('month');
  const [month, setMonth] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<'day' | 'month'>('day');
  const [tab, setTab] = useState<DetailTab>('prod');
  const [hot, setHot] = useState<{ date: string; x: number; y: number } | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const overview = useQuery({ queryKey: ['production', 'workshops', 120], queryFn: () => workshopOverview(120) });
  const sulfuric = useQuery({ queryKey: ['production', 'sulfuric', 120], queryFn: () => sulfuricSummary(120), enabled: code === 'sulfuric' });
  const tanks = useQuery({ queryKey: ['production', 'tanks'], queryFn: tankLevels, enabled: code === 'sulfuric' });
  useEffect(() => { if (overview.error) message.error(overview.error.message); }, [overview.error, message]);

  const workshops = overview.data?.workshops ?? [];
  const workshop = workshops.find((w) => w.code === code) ?? workshops[0];
  const allDates = useMemo(() => overview.data?.dates ?? [], [overview.data]);
  const isSulfuric = code === 'sulfuric';

  const months = useMemo(() => [...new Set(allDates.map((d) => d.slice(0, 7)))], [allDates]);
  const monthKey = month && months.includes(month) ? month : months[months.length - 1];
  const monthIdx = months.indexOf(monthKey);

  const visible = useMemo(() => {
    if (range === '30d') {
      const start = Math.max(0, allDates.length - 30);
      return allDates.slice(start).map((d, i) => ({ d, i: start + i }));
    }
    return allDates.map((d, i) => ({ d, i })).filter((x) => x.d.startsWith(monthKey ?? ''));
  }, [allDates, range, monthKey]);

  const series = useMemo(
    () => (workshop ? visible.map(({ d, i }) => ({ label: d, value: workshop.values[i] ?? null })) : []),
    [workshop, visible],
  );
  const validSeries = series.filter((s) => s.value !== null) as Array<{ label: string; value: number }>;
  const fallbackDate = validSeries[validSeries.length - 1]?.label ?? series[series.length - 1]?.label ?? null;
  const activeDate = selected && series.some((s) => s.label === selected) ? selected : fallbackDate;
  const activeIdx = validSeries.findIndex((s) => s.label === activeDate);
  const activeValue = activeIdx >= 0 ? validSeries[activeIdx].value : null;
  const prevValue = activeIdx > 0 ? validSeries[activeIdx - 1].value : null;
  const total = validSeries.reduce((s, v) => s + v.value, 0);
  const avg = validSeries.length ? total / validSeries.length : null;
  const peak = validSeries.length ? Math.max(...validSeries.map((v) => v.value)) : null;

  const dayMap = useMemo(() => {
    const m = new Map<string, SulfuricDaySummary>();
    for (const d of sulfuric.data?.days ?? []) m.set(d.date, d);
    return m;
  }, [sulfuric.data]);
  const sDay = activeDate ? dayMap.get(activeDate) : undefined;
  const sDays = series.map((s) => dayMap.get(s.label));
  const prevDay = activeIdx > 0 ? dayMap.get(validSeries[activeIdx - 1].label) : undefined;

  const invSeries = sDays.map((d) => d?.inventory?.total ?? null);
  const elecSeries = sDays.map((d) => d?.electricity?.total ?? null);
  const unitOf = (d?: SulfuricDaySummary) => (d?.electricity && d.production?.total98Equivalent ? d.electricity.total / d.production.total98Equivalent : null);
  const unitSeries = sDays.map((d) => unitOf(d));
  const unitNow = unitOf(sDay);
  const unitValid = unitSeries.filter((v): v is number => v !== null);
  const unitAvg = unitValid.length ? unitValid.reduce((s, v) => s + v, 0) / unitValid.length : null;

  // 构成 tooltip / 右侧面板：硫酸按四酸展开
  const tooltipOf = (label: string) => {
    if (!isSulfuric) return null;
    const p = dayMap.get(label)?.production;
    if (!p) return null;
    return ACIDS.map((a) => ({ name: a.name, value: `${fmt(p[a.key] * a.fold, 1)} t`, color: a.color }));
  };

  const panelRows = useMemo(() => {
    const days = panelMode === 'day' ? [sDay] : sDays;
    return ACIDS.map((a) => {
      let prod = 0;
      let flow = 0;
      for (const d of days) {
        if (!d?.production) continue;
        prod += d.production[a.key];
        flow += d.production.flow[a.key];
      }
      return { ...a, prod: prod * a.fold, flow, delta: prod - flow };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelMode, sDay, dayMap, visible]);
  const panelTotal = panelRows.reduce((s, r) => s + r.prod, 0);
  const panelMax = Math.max(1, ...panelRows.map((r) => Math.abs(r.prod)));

  const monthLabel = monthKey ? `${monthKey.slice(0, 4)} 年 ${Number(monthKey.slice(5))} 月` : '—';
  const switchCode = (next: string) => { setCode(next); setSelected(null); setHot(null); setTab('prod'); };
  const idxOfCode = workshops.findIndex((w) => w.code === code);
  const step = (dir: number) => {
    if (!workshops.length) return;
    switchCode(workshops[(idxOfCode + dir + workshops.length) % workshops.length].code);
  };

  const exportCsv = () => {
    if (!workshop) return;
    if (isSulfuric && tab === 'prod') {
      downloadCsv(`硫酸车间-产量-${monthKey ?? ''}.csv`, [
        ['日期', ...ACIDS.map((a) => `${a.name} t`), '折98合计 t', ...ACIDS.map((a) => `${a.name}外销 t`)],
        ...sDays.map((d, i) => [series[i].label, ...ACIDS.map((a) => d?.production?.[a.key] ?? null), d?.production?.total98Equivalent ?? null, ...ACIDS.map((a) => d?.production?.flow[a.key] ?? null)]),
      ]);
    } else if (isSulfuric && tab === 'stock') {
      downloadCsv(`硫酸车间-库存-${monthKey ?? ''}.csv`, [['日期', '98% 酸 t', '发烟硫酸 t', '试剂酸 t', '合计 t'], ...sDays.map((d, i) => [series[i].label, d?.inventory?.acid98 ?? null, d?.inventory?.fuming ?? null, d?.inventory?.reagent ?? null, d?.inventory?.total ?? null])]);
    } else if (isSulfuric) {
      const meters = sDay?.electricity?.meters.map((m) => m.name) ?? [];
      downloadCsv(`硫酸车间-电耗-${monthKey ?? ''}.csv`, [['日期', ...meters.map((n) => `${n} kWh`), '合计 kWh'], ...sDays.map((d, i) => [series[i].label, ...meters.map((_, k) => d?.electricity?.meters[k]?.usage ?? null), d?.electricity?.total ?? null])]);
    } else {
      downloadCsv(`${TITLES[code]}-日产量-${monthKey ?? ''}.csv`, [['日期', '日产量 t'], ...series.map((s) => [s.label, s.value])]);
    }
  };

  const showCalc = (date: string, el: HTMLElement) => {
    const host = detailRef.current?.getBoundingClientRect();
    if (!host) return;
    const r = el.getBoundingClientRect();
    setHot({ date, x: Math.max(12, Math.min(r.right - host.left - 640, host.width - 652)), y: r.bottom - host.top + 6 });
  };
  const hotDay = hot ? dayMap.get(hot.date) : undefined;

  const kpiCount = isSulfuric ? 6 : 4;
  const rows = [...series].reverse();

  return (
    <Dash>
      <div className="enter" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="wstabs" role="tablist" aria-label="车间">
          {workshops.map((w) => (
            <button key={w.code} type="button" role="tab" className={w.code === code ? 'on' : ''} onClick={() => switchCode(w.code)}>
              {w.name}
            </button>
          ))}
        </div>
        <div className="pager">
          <button type="button" className="iconbtn" aria-label="上一个车间" onClick={() => step(-1)}><ChevronLeft size={16} strokeWidth={1.6} /></button>
          <span className="num">{idxOfCode + 1} / {workshops.length}</span>
          <button type="button" className="iconbtn" aria-label="下一个车间" onClick={() => step(1)}><ChevronRight size={16} strokeWidth={1.6} /></button>
        </div>
      </div>

      <div className="enter" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0 16px' }}>
        <h1 className="h1" style={{ fontSize: 28, flex: 1 }}>{TITLES[code] ?? '车间版面'}</h1>
        <Seg options={[{ label: '本月', value: 'month' }, { label: '近 30 天', value: '30d' }]} value={range} onChange={(v) => { setRange(v as 'month' | '30d'); setSelected(null); }} />
        <div style={{ opacity: range === 'month' ? 1 : 0.45, pointerEvents: range === 'month' ? 'auto' : 'none' }}>
          <Stepper
            label={monthLabel}
            onPrev={() => { setMonth(months[monthIdx - 1]); setSelected(null); }}
            onNext={() => { setMonth(months[monthIdx + 1]); setSelected(null); }}
            prevDisabled={monthIdx <= 0}
            nextDisabled={monthIdx >= months.length - 1}
          />
        </div>
        <ExportButton onClick={exportCsv} />
      </div>

      {workshop ? (
        <div className="kpis enter d1" style={{ gridTemplateColumns: `repeat(${kpiCount}, minmax(0, 1fr))` }}>
          <Kpi
            label={`${isSulfuric ? '折 98% 产量' : '日产量'} · ${activeDate?.slice(5) ?? '—'}`}
            value={fmt(activeValue, 1)}
            unit="t"
            delta={pctChange(activeValue, prevValue)}
            sub={`月累计 ${fmt(total, 0)} t`}
            spark={series.map((s) => s.value)}
          />
          {isSulfuric ? (
            <>
              <Kpi label="罐区库存" value={fmt(sDay?.inventory?.total ?? null, 0)} unit="t" delta={pctChange(sDay?.inventory?.total, prevDay?.inventory?.total)} sub="三种酸合计" spark={invSeries} />
              <Kpi label="电单耗" value={fmt(unitNow, 1)} unit="kWh/t" delta={pctChange(unitNow, unitOf(prevDay))} good="down" sub={unitAvg === null ? '' : `均值 ${fmt(unitAvg, 1)}`} spark={unitSeries} />
              <Kpi label="日用电" value={fmt(sDay?.electricity?.total ?? null, 0)} unit="kWh" delta={pctChange(sDay?.electricity?.total, prevDay?.electricity?.total)} good="down" sub="硫酸自有 4 表" spark={elecSeries} />
            </>
          ) : null}
          <Kpi label="月均日产" value={fmt(avg, 1)} unit="t" sub={`${validSeries.length} 个有效日`} />
          <Kpi label="峰值日产" value={fmt(peak, 1)} unit="t" sub={peak === null ? '' : validSeries.find((v) => v.value === peak)?.label.slice(5)} />
        </div>
      ) : null}

      {workshop ? (
        <div className="card enter d2" style={{ marginTop: 16, padding: '18px 20px' }}>
          <div className="split">
            <div className="left">
              <div className="ct" style={{ marginBottom: 14 }}>
                <b>日产量</b>
                <span>t{isSulfuric ? ' · 折 98% 合计' : ''} · 悬停查看构成，点击选中日期</span>
                <div className="r lg">
                  <span><i style={{ width: 12, height: 0, borderTop: '1px dashed var(--ink3)', borderRadius: 0, verticalAlign: 3 }} />月均 {fmt(avg, 0)}</span>
                  <span><i style={{ background: 'var(--brand)' }} />选中日</span>
                </div>
              </div>
              <MonthBars data={series} unit={workshop.unit} tooltipOf={tooltipOf} selected={activeDate} onSelect={setSelected} />
            </div>
            <div className="right">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{panelMode === 'day' ? (activeDate ? dayLabel(activeDate) : '—') : `${monthKey?.slice(5) ?? ''} 月累计`}</span>
                <Seg options={[{ label: '当日', value: 'day' }, { label: '本月', value: 'month' }]} value={panelMode} onChange={(v) => setPanelMode(v as 'day' | 'month')} />
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="faint" style={{ fontSize: 12 }}>{isSulfuric ? '折 98% 合计' : panelMode === 'day' ? '日产量' : '本月合计'}</div>
                <div className="kv" style={{ fontSize: 28 }}>
                  {fmt(isSulfuric ? panelTotal : panelMode === 'day' ? activeValue : total, 1)}
                  <small>t</small>
                </div>
              </div>
              {isSulfuric ? (
                <div style={{ marginTop: 8, borderTop: '1px solid var(--line)' }}>
                  {panelRows.map((r) => (
                    <div key={r.key}>
                      <div className="sp-row">
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <i style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: 'inline-block', flex: '0 0 auto' }} />
                            <span style={{ fontWeight: 500 }}>{r.name}</span>
                          </div>
                          <div className="bar-in" style={{ marginTop: 5, height: 4 }}>
                            <i style={{ width: `${Math.max(0, Math.min(100, (r.prod / panelMax) * 100))}%`, background: r.color }} />
                          </div>
                        </div>
                        <span className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.prod, 1)} t</span>
                      </div>
                      <div className="sp-sub"><span>外销</span><span className="num" style={{ textAlign: 'right' }}>{fmt(r.flow, 1)}</span></div>
                      <div className="sp-sub"><span>库存变化</span><span className="num" style={{ textAlign: 'right' }}>{signed(r.delta)}</span></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="stats">
                  <div><div className="sl">月均日产</div><div className="sv">{fmt(avg, 1)} t</div></div>
                  <div><div className="sl">峰值日产</div><div className="sv">{fmt(peak, 1)} t</div></div>
                  <div><div className="sl">有效日</div><div className="sv">{validSeries.length} 天</div></div>
                  <div><div className="sl">较月均</div><div className="sv">{activeValue !== null && avg ? `${pctChange(activeValue, avg)}%` : '—'}</div></div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isSulfuric && tanks.data?.groups.length ? (
        <div className="card enter d3" style={{ marginTop: 16, padding: '18px 20px' }}>
          <div className="ct" style={{ marginBottom: 14 }}>
            <b>罐区库存 · {dayLabel(tanks.data.date)}</b>
            <span>液位 × 罐容 × 密度 · 最近一次填报</span>
            <div className="r lg">
              <span><i style={{ background: 'var(--ink3)', width: 1, height: 10, borderRadius: 0 }} />20% / 90% 警戒线</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px 48px' }}>
            {tanks.data.groups.map((g, gi) => {
              const color = groupColor(g.material, gi);
              const cap = g.tanks.reduce((s, t) => s + t.capacity * t.density, 0);
              return (
                <div className="igrp" key={g.material}>
                  <div className="ih">
                    <i style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
                    <span style={{ fontWeight: 600 }}>{g.material}</span>
                    {cap > 0 ? <span className="faint" style={{ fontSize: 12 }}>库容率 {Math.round((g.totalTons / cap) * 100)}%</span> : null}
                    <span className="num" style={{ marginLeft: 'auto', fontWeight: 600 }}>{fmt(g.totalTons, 1)} t</span>
                  </div>
                  {g.tanks.map((t) => (
                    <div className="lvl" key={t.fieldId}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                      <div className="trk">
                        <i style={{ width: `${Math.max(0, Math.min(100, t.levelPercent ?? 0))}%`, background: color }} />
                        <b style={{ left: '20%' }} />
                        <b style={{ left: '90%' }} />
                      </div>
                      <span className="p">{t.levelPercent === null ? '—' : `${Math.round(t.levelPercent)}%`}</span>
                      <span className="t">{fmt(t.tons, 1)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="card enter d4" ref={detailRef} style={{ marginTop: 16, padding: '18px 20px 10px', position: 'relative' }}>
        <div className="ct" style={{ alignItems: 'center', marginBottom: 12 }}>
          <b style={{ fontSize: 15 }}>明细</b>
          {isSulfuric ? (
            <Seg
              className="tbtabs"
              options={[{ label: '产量', value: 'prod' }, { label: '库存', value: 'stock' }, { label: '电耗', value: 'power' }]}
              value={tab}
              onChange={(v) => { setTab(v as DetailTab); setHot(null); }}
            />
          ) : null}
          <div className="r"><span>单位 t · 点行切换日期</span></div>
        </div>
        <div className="scrolltbl" onMouseLeave={() => setHot(null)}>
          <table className="dt">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>日期</th>
                {!isSulfuric && <th>日产量 t</th>}
                {!isSulfuric && <th>较月均</th>}
                {isSulfuric && tab === 'prod' && <>{ACIDS.map((a) => <th key={a.key}>{a.name}</th>)}<th>折 98% 合计</th>{ACIDS.map((a) => <th key={`f${a.key}`}>{a.name}外销</th>)}</>}
                {isSulfuric && tab === 'stock' && <><th>98% 酸</th><th>发烟硫酸</th><th>试剂酸</th><th>合计</th></>}
                {isSulfuric && tab === 'power' && <>{(sDay?.electricity?.meters ?? []).map((m) => <th key={m.fieldId}>{m.name}</th>)}<th>合计 kWh</th></>}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const d = dayMap.get(s.label);
                const p = d?.production;
                return (
                  <tr key={s.label} className={`clickrow${s.label === activeDate ? ' on' : ''}`} style={s.label === activeDate ? { background: 'var(--brand-soft)' } : undefined} onClick={() => setSelected(s.label)}>
                    <td style={{ textAlign: 'left' }}>{dayLabel(s.label)}</td>
                    {!isSulfuric && <td>{fmt(s.value, 1)}</td>}
                    {!isSulfuric && <td className="muted">{s.value !== null && avg ? `${pctChange(s.value, avg)}%` : '—'}</td>}
                    {isSulfuric && tab === 'prod' && (
                      <>
                        {ACIDS.map((a) => <td key={a.key}>{fmt(p ? p[a.key] * a.fold : null, 1)}</td>)}
                        <td>
                          <span
                            className={`hotcell${hot?.date === s.label ? ' act' : ''}`}
                            onMouseEnter={(e) => p && showCalc(s.label, e.currentTarget)}
                          >
                            {fmt(p?.total98Equivalent ?? null, 1)}
                          </span>
                        </td>
                        {ACIDS.map((a) => <td key={`f${a.key}`}>{fmt(p ? p.flow[a.key] : null, 1)}</td>)}
                      </>
                    )}
                    {isSulfuric && tab === 'stock' && (
                      <><td>{fmt(d?.inventory?.acid98 ?? null, 1)}</td><td>{fmt(d?.inventory?.fuming ?? null, 1)}</td><td>{fmt(d?.inventory?.reagent ?? null, 1)}</td><td style={{ fontWeight: 600 }}>{fmt(d?.inventory?.total ?? null, 1)}</td></>
                    )}
                    {isSulfuric && tab === 'power' && (
                      <>{(sDay?.electricity?.meters ?? []).map((m, k) => <td key={m.fieldId}>{fmt(d?.electricity?.meters[k]?.usage ?? null, 0)}</td>)}<td style={{ fontWeight: 600 }}>{fmt(d?.electricity?.total ?? null, 0)}</td></>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {hot && hotDay?.production ? (
          <div className="calc" style={{ left: hot.x, top: hot.y }}>
            <div className="cb" style={{ borderTop: 0 }}>
              <div className="cbh">折 98% 合计 · {dayLabel(hot.date)}<b>{fmt(hotDay.production.total98Equivalent, 1)} t</b></div>
              {ACIDS.map((a, i) => (
                <div className="cl" key={a.key}>
                  <span className="op">{i === 0 ? '' : '+'}</span>
                  <span>{a.name} · {a.key === 'fuming' ? '(库存差 + 外销) × 105/98' : '库存差 + 外销'}</span>
                  <span>{fmt(hotDay.production![a.key] * a.fold, 1)}</span>
                </div>
              ))}
              <div className="cl"><span className="op">=</span><span>{hotDay.production.gapDays > 0 ? `跨 ${hotDay.production.gapDays} 天累计差值` : '连续日差值'}</span><span>{fmt(hotDay.production.total98Equivalent, 1)}</span></div>
            </div>
          </div>
        ) : null}
      </div>
    </Dash>
  );
}
