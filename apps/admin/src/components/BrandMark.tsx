import { useId } from 'react';

export function BrandMark({ size = 28 }: { size?: number }) {
  const id = useId();
  const fill = `${id}-fill`;
  const shine = `${id}-shine`;
  const onBrand = 'var(--hg-on-brand)';
  return (
    <svg className="hg-brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--hg-brand-from)' }} />
          <stop offset="1" style={{ stopColor: 'var(--hg-brand-to)' }} />
        </linearGradient>
        <linearGradient id={shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: onBrand, stopOpacity: 0.28 }} />
          <stop offset="0.55" style={{ stopColor: onBrand, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${fill})`} />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="8.5"
        fill={`url(#${shine})`}
        style={{ stroke: onBrand, strokeOpacity: 0.16 }}
      />
      <path
        d="M11 9.5v13M21 14.5v8M11 16h10"
        style={{ stroke: onBrand }}
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="21" cy="9.9" r="2.1" style={{ fill: onBrand }} />
    </svg>
  );
}
