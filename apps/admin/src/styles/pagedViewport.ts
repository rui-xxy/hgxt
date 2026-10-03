import type { CSSProperties } from 'react';

// Reserve one viewport for content switched by pagination, filters or tabs.
// Extra rows scroll inside it, so controls and following cards stay in place.
export function stableViewportStyle(visibleRows: number, rowHeight: number, headerHeight = 0): CSSProperties {
  const contentHeight = Math.min(visibleRows * rowHeight + headerHeight, 704);
  return { '--hgxt-paged-viewport-height': `clamp(280px, calc(100dvh - 320px), ${contentHeight}px)` } as CSSProperties;
}

export const pagedViewportStyle = stableViewportStyle;
