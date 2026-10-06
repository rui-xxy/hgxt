import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from '../../components/icons';
import './dash.css';

/** 设计稿 11-13 的内容区包装 */
export function Dash({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`dash ${className}`.trim()}>{children}</div>;
}

/** 酸类 / 分组的固定色板（design/11） */
export const PALETTE = {
  brand: 'var(--brand)',
  acid93: '#EB6834',
  reagent: '#1BAF7A',
  fuming: '#EDA100',
  gray: '#8C8C86',
};

export const fmt = (v: number | null | undefined, digits = 0): string =>
  v === null || v === undefined ? '—' : v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** 车间原始值和汇总值最多显示三位小数，不补零，并清除求和后的浮点尾数。 */
export const fmtRecorded = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 3 });

/** 与上一期的变化百分比 */
export function pctChange(current: number | null | undefined, prev: number | null | undefined): number | null {
  if (current === null || current === undefined || prev === null || prev === undefined || prev === 0) return null;
  return +(((current - prev) / prev) * 100).toFixed(1);
}

/** KPI 瓦片里的迷你折线；tail>0 时：整条浅色 + 末 tail 段深色 + 末点实心（design/12） */
export function Spark({ values, w = 64, h = 26, tail = 0 }: { values: Array<number | null>; w?: number; h?: number; tail?: number }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return <svg width={w} height={h} style={{ display: 'block', flex: '0 0 auto' }} />;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => 2 + (i / Math.max(1, values.length - 1)) * (w - 4);
  const y = (v: number) => h - 3 - ((v - min) / span) * (h - 6);
  const line = (list: typeof pts) => list.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const stroke = { fill: 'none', strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const lastPt = pts[pts.length - 1];
  return (
    <svg width={w} height={h} style={{ display: 'block', flex: '0 0 auto' }} aria-hidden>
      {tail > 0 ? (
        <>
          <polyline {...stroke} stroke="var(--brand-soft)" strokeWidth={1.5} points={line(pts)} />
          <polyline {...stroke} stroke="var(--brand)" strokeWidth={1.8} points={line(pts.slice(-tail))} />
          <circle cx={x(lastPt.i)} cy={y(lastPt.v)} r={2.6} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
        </>
      ) : (
        <polyline {...stroke} stroke="var(--brand)" strokeWidth={1.6} points={line(pts)} />
      )}
    </svg>
  );
}

/** KPI 瓦片：标签 / 数值 + 迷你折线 / 变化 + 注释。good 决定涨跌的红绿（单耗类越低越好） */
export function Kpi({
  label,
  value,
  unit,
  delta,
  good = 'up',
  sub,
  spark,
  sparkTail = 0,
  sparkWidth,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: number | null;
  good?: 'up' | 'down';
  sub?: string;
  spark?: Array<number | null>;
  sparkTail?: number;
  sparkWidth?: number;
}) {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  const isGood = hasDelta && (good === 'up' ? delta >= 0 : delta <= 0);
  return (
    <div className="kpi">
      <div className="kl">{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: sparkWidth ? 4 : 8 }}>
        <div className="kv" style={{ whiteSpace: 'nowrap' }}>
          {value}
          {unit ? <small>{unit}</small> : null}
        </div>
        {spark ? <Spark values={spark} tail={sparkTail} w={sparkWidth} /> : null}
      </div>
      <div className="kd" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {hasDelta ? (
          <span className={isGood ? 'up' : 'dn'}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          </span>
        ) : null}
        {sub ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span> : null}
      </div>
    </div>
  );
}

/** 段控（.seg / .tbtabs 共用） */
export function Seg({
  options,
  value,
  onChange,
  className = 'seg',
}: {
  options: Array<{ label: string; value: string; disabled?: boolean }>;
  value: string;
  onChange: (value: string) => void;
  className?: 'seg' | 'tbtabs';
}) {
  return (
    <div className={className}>
      {options.map((o) => (
        <button key={o.value} type="button" disabled={o.disabled} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 月份步进器（‹ 2026 年 9 月 ›） */
export function Stepper({ label, onPrev, onNext, prevDisabled, nextDisabled, prevLabel = '上一个月', nextLabel = '下一个月' }: { label: string; onPrev: () => void; onNext: () => void; prevDisabled?: boolean; nextDisabled?: boolean; prevLabel?: string; nextLabel?: string }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={prevLabel} onClick={onPrev} disabled={prevDisabled}>
        <ChevronLeftIcon width={16} height={16} />
      </button>
      <span>{label}</span>
      <button type="button" aria-label={nextLabel} onClick={onNext} disabled={nextDisabled}>
        <ChevronRightIcon width={16} height={16} />
      </button>
    </div>
  );
}

/** 把二维数据导出为 CSV（带 BOM，Excel 直接打开不乱码） */
export function downloadCsv(filename: string, rows: Array<Array<string | number | null>>): void {
  const body = rows
    .map((r) => r.map((c) => (c === null ? '' : `"${String(c).replace(/"/g, '""')}"`)).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportButton({ onClick, label = '导出' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn ghost sm" onClick={onClick}>
      <DownloadIcon width={15} height={15} />
      {label}
    </button>
  );
}

export interface BarDatum {
  label: string;
  value: number | null;
}

/** 取略大于 raw 的整齐刻度上限（4 等分后刻度为整数倍） */
function niceMax(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  for (const c of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) {
    if (c * mag >= raw * 1.08) return c * mag;
  }
  return 10 * mag;
}

/**
 * 设计稿的月柱状图：横向网格 + y 轴刻度 + 柱顶数值 + 月均虚线 + 图下构成图例 +
 * 点击选中（品牌色，其余为浅品牌色）。宽度自适应容器。
 */
export function MonthBars({
  data,
  unit,
  tooltipOf,
  selected,
  onSelect,
  height = 400,
  valueDigits = 0,
  sourcePrecision = false,
  showAverage = true,
  axisLabelOf = (label: string) => label.slice(5),
  tooltipTitleOf = (label: string) => label,
}: {
  data: BarDatum[];
  unit: string;
  tooltipOf?: (label: string) => Array<{ name: string; value: string; color: string }> | null;
  selected: string | null;
  onSelect: (label: string) => void;
  height?: number;
  valueDigits?: number;
  sourcePrecision?: boolean;
  showAverage?: boolean;
  axisLabelOf?: (label: string) => string;
  tooltipTitleOf?: (label: string) => string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(320, el.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const padL = 40;
  const padB = 24;
  const padT = 22;
  const plotW = Math.max(60, width - padL);
  const plotH = height - padT - padB;
  const values = data.map((d) => d.value).filter((v): v is number => v !== null);
  const max = niceMax(Math.max(1, ...values));
  const yOf = (v: number) => padT + plotH - (v / max) * plotH;
  const n = data.length || 1;
  const slot = plotW / n;
  const barW = Math.max(4, Math.min(28, slot * 0.72));
  const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  const displayValue = (value: number) => sourcePrecision ? fmtRecorded(value) : fmt(value, valueDigits);
  const occupied = data.flatMap((item, index) => item.value === null ? [] : [index]);
  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const v = (max / 4) * i;
    return { v, y: yOf(v), label: sourcePrecision ? fmtRecorded(v) : valueDigits ? fmt(v, valueDigits) : Math.round(v).toLocaleString() };
  });
  const active = hover;
  const activeItem = data.find((d) => d.label === active);
  const tipRows = tooltipOf && active ? tooltipOf(active) : null;
  const tipX = active ? padL + data.findIndex((d) => d.label === active) * slot + slot / 2 : 0;
  const everyX = slot < 18 ? 5 : slot < 34 ? 5 : 1;

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <div className="bars" style={{ width, height, maxWidth: '100%' }} onMouseLeave={() => setHover(null)}>
        {gridLines.map((g) => (
          <div key={g.v}>
            <div className="gl" style={{ top: g.y }} />
            <div className="yl" style={{ top: g.y }}>{g.label}</div>
          </div>
        ))}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const isSel = d.label === selected;
          const label = d.value === null ? '' : displayValue(d.value);
          const nearestLabelGap = Math.min(...occupied.filter((index) => index !== i).map((index) => Math.abs(index - i) * slot), Infinity);
          const showLabel = isSel || d.label === hover || (!sourcePrecision ? slot >= 15 : nearestLabelGap >= label.length * 6 + 6);
          return (
            <div key={d.label}>
              {d.value !== null ? (
                <>
                  <div
                    className="cbar"
                    style={{
                      left: x,
                      top: yOf(d.value),
                      width: barW,
                      height: Math.max(1, padT + plotH - yOf(d.value)),
                      background: isSel || d.label === hover ? 'var(--brand)' : 'color-mix(in srgb, var(--brand) 32%, var(--bg))',
                    }}
                  />
                  {showLabel ? (
                    <div className="bv" style={{ left: x + barW / 2, top: yOf(d.value) - 16, color: isSel ? 'var(--ink)' : 'var(--ink2)', fontWeight: isSel ? 600 : 400 }}>
                      {label}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
        {showAverage && avg > 0 ? <div className="avg" style={{ top: yOf(avg) }} /> : null}
        {data.map((d, i) => (
          <div key={`x${d.label}`}>
            {i % everyX === 0 ? <div className="xl" style={{ left: padL + i * slot + slot / 2, top: padT + plotH + 8 }}>{axisLabelOf(d.label)}</div> : null}
            <div
              className="hit"
              style={{ left: padL + i * slot, top: 0, width: slot, height: padT + plotH }}
              onMouseEnter={() => setHover(d.label)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(d.label)}
            />
          </div>
        ))}
        {active && activeItem && activeItem.value !== null ? (
          <div className="tip" style={{ left: Math.min(Math.max(tipX - 85, 4), Math.max(4, width - 220)) }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{tooltipTitleOf(active)}</div>
            {tipRows ? (
              tipRows.map((row) => (
                <div className="tr" key={row.name}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: row.color, display: 'inline-block' }} />
                  <span className="muted">{row.name}</span>
                  <b>{row.value}</b>
                </div>
              ))
            ) : (
              <div className="tr"><span className="muted">{unit}</span><b>{sourcePrecision ? fmtRecorded(activeItem.value) : fmt(activeItem.value, valueDigits || 1)}</b></div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
