import { describe, expect, it } from 'vitest';
import source from '../prisma/data/matters-2026.json';
import { isMatterIn2026 } from '../prisma/import-matters';

describe('2026 年事项表导入范围', () => {
  it('保留跨年事项与 2026 年无计划完成日的事项', () => {
    const rows = source.rows.filter(isMatterIn2026);
    expect(rows).toHaveLength(2864);
    expect(rows.filter((row) => row[6]?.startsWith('2025-') && row[7]?.startsWith('2026-'))).toHaveLength(39);
    expect(rows.filter((row) => row[6]?.startsWith('2026-') && !row[7])).toHaveLength(155);
    expect(rows.some((row) => row[6]?.startsWith('2024-') && row[7]?.startsWith('2024-'))).toBe(false);
  });
});
