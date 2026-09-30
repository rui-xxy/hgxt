import { useEffect, useRef, useState } from 'react';
import './dash.css';

/** 设计稿 dash 内容区包装（变量 + 字体 + 布局来自 design/00） */
export function Dash({ children }: { children: React.ReactNode }) {
  return (
    <div className="dash" style={{ padding: '4px 0 40px' }}>
      {children}
    </div>
  );
}

/** KPI 瓦片（kpis 网格内） */
export function Kpi({
  label,
  value,
  unit,
  delta,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  /** 与前日比：正数▲绿/负数▼红（d 图标由 dn/up 类决定） */
  delta?: number | null;
  sub?: string;
}) {
  return (
    <div className="kpi">
      <div className="kl">{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div className="kv" style={{ whiteSpace: 'nowrap' }}>
          {value}
          {unit ? <small>{unit}</small> : null}
        </div>
      </div>
      <div className="kd" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {delta !== undefined && delta !== null && Number.isFinite(delta) ? (
          <span className={delta >= 0 ? 'up' : 'dn'}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          </span>
        ) : null}
        {sub ? <span>{sub}</span> : null}
      </div>
    </div>
  );
}

/** 段控（seg 容器内的一组按钮） */
export function Seg({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 与前一日的变化百分比 */
export function pctChange(current: number | null | undefined, prev: number | null | undefined): number | null {
  if (current === null || current === undefined || prev === null || prev === undefined || prev === 0) return null;
  return +(((current - prev) / prev) * 100).toFixed(1);
}

export const fmt = (v: number | null | undefined, digits = 0): string =>
  v === null || v === undefined ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits });

export interface BarDatum {
  label: string;
  value: number | null;
}

/**
 * 设计稿的月柱状图：横向网格 + y 轴刻度 + 柱顶数值（稀疏）+ 月均虚线 +
 * 悬停 tooltip（当日构成）+ 点击选中（品牌色）。宽度自适应容器。
 */
export function MonthBars({
  data,
  unit,
  tooltipOf,
  selected,
  onSelect,
}: {
  data: BarDatum[];
  unit: string;
  /** 悬停 tooltip 的构成行；不传则只显示数值 */
  tooltipOf?: (label: string) => Array<{ name: string; value: string; color: string }> | null;
  selected: string | null;
  onSelect: (label: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(320, el.clientWidth - 8));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const H = 300;
  const padL = 46;
  const padB = 26;
  const padT = 18;
  const plotW = Math.max(60, width - padL - 6);
  const plotH = H - padT - padB;
  const values = data.map((d) => d.value).filter((v): v is number => v !== null);
  const rawMax = Math.max(1, ...values);
  const step = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const max = Math.ceil(rawMax / (step / 2)) * (step / 2);
  const yOf = (v: number) => padT + plotH - (v / max) * plotH;
  const n = data.length || 1;
  const slot = plotW / n;
  const barW = Math.max(4, Math.min(26, slot * 0.58));
  const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
    const v = (max / gridCount) * i;
    return { v, y: yOf(v), label: v >= 10000 ? `${(v / 10000).toFixed(1)}万` : String(Math.round(v)) };
  });
  const active = hover ?? selected;
  const tipRows = tooltipOf && active ? tooltipOf(active) : null;
  const tipX = active ? padL + data.findIndex((d) => d.label === active) * slot + slot / 2 : 0;
  const showValueLabel = (i: number) => slot >= 38 || data[i].label === active || data[i].label === selected;

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <div className="bars" style={{ width, height: H, position: 'relative', maxWidth: '100%' }} onMouseLeave={() => setHover(null)}>
        {gridLines.map((g) => (
          <div key={g.v}>
            <div className="gl" style={{ top: g.y, left: padL, width: plotW }} />
            <div className="yl" style={{ top: g.y - 8 }}>{g.label}</div>
          </div>
        ))}
        {avg > 0 ? <div className="avg" style={{ top: yOf(avg), left: padL, width: plotW }} /> : null}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const h = d.value === null ? 0 : Math.max(1, padT + plotH - yOf(d.value));
          const isActive = d.label === active;
          return (
            <div key={d.label}>
              <div
                className="cbar"
                style={{
                  left: x,
                  top: d.value === null ? padT + plotH - 2 : yOf(d.value),
                  width: barW,
                  height: h,
                  background: isActive ? 'var(--brand)' : 'var(--line2)',
                }}
              />
              {d.value !== null && showValueLabel(i) ? (
                <div className="bv" style={{ left: x + barW / 2, top: yOf(d.value) - 16, transform: 'translateX(-50%)', color: isActive ? 'var(--brand)' : undefined, fontWeight: isActive ? 600 : 400 }}>
                  {d.value >= 10000 ? (d.value / 10000).toFixed(1) + '万' : Math.round(d.value).toLocaleString()}
                </div>
              ) : null}
            </div>
          );
        })}
        {data.map((d, i) => {
          const everyX = slot < 22 ? 5 : slot < 40 ? 3 : 1;
          return (
            <div key={`x${d.label}`}>
              {i % everyX === 0 ? <div className="xl" style={{ left: padL + i * slot + slot / 2, top: padT + plotH + 6, transform: 'translateX(-50%)' }}>{d.label.slice(5)}</div> : null}
              <div
                className="hit"
                style={{ left: padL + i * slot, top: 0, width: slot, height: H }}
                onMouseEnter={() => setHover(d.label)}
                onClick={() => onSelect(d.label)}
              />
            </div>
          );
        })}
        {active && (tipRows || data.find((d) => d.label === active)?.value !== null) ? (
          <div className="tip" style={{ left: Math.min(Math.max(tipX, 120), width - 120), top: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{active}</div>
            {tipRows ? (
              tipRows.map((r) => (
                <div className="tr" key={r.name}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: 'inline-block' }} />
                  <span className="muted">{r.name}</span>
                  <b>{r.value}</b>
                </div>
              ))
            ) : (
              <div className="tr">
                <span className="muted">{unit}</span>
                <b>{fmt(data.find((d) => d.label === active)?.value ?? null, 1)}</b>
              </div>
            )}
            <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>点击查看当天构成</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
