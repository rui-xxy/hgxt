/**
 * 轻量日柱状图（CSS 实现，不引入图表库）：
 * 每根柱=一个归属日，悬停看数值，点击选中；null（断天/缺数据）画成基线刻度。
 */
export interface BarPoint {
  label: string;
  value: number | null;
}

export function BarChart({
  points,
  unit,
  selected,
  onSelect,
}: {
  points: BarPoint[];
  unit: string;
  selected?: string | null;
  onSelect?: (label: string) => void;
}) {
  const max = Math.max(1, ...points.map((p) => p.value ?? 0));
  return (
    <div className="prod-chart" role="img" aria-label="日柱状图">
      {points.map((p) => {
        const isSelected = selected === p.label;
        const ratio = p.value === null ? 0 : p.value / max;
        return (
          <button
            type="button"
            key={p.label}
            className={`prod-bar-col${isSelected ? ' is-selected' : ''}`}
            title={p.value === null ? `${p.label}：无数据` : `${p.label}：${p.value.toLocaleString()} ${unit}`}
            onClick={() => onSelect?.(p.label)}
          >
            <span className="prod-bar-track">
              {p.value === null
                ? <span className="prod-bar-null" />
                : <span className="prod-bar" style={{ height: `${Math.max(2, ratio * 100)}%` }} />}
            </span>
            <span className="prod-bar-label">{p.label.slice(5)}</span>
          </button>
        );
      })}
    </div>
  );
}
