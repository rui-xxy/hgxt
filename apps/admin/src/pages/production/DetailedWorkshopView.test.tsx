import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DetailedWorkshopDay, DetailedWorkshopResult } from '@hgxt/shared';
import { DetailedWorkshopTable, hydrotalciteSteamTotal } from './DetailedWorkshopView';

const day = (mediumSteam: number | null, lowSteam: number | null): DetailedWorkshopDay => ({
  date: '2026-10-01', production: 20,
  metrics: { mediumSteam, lowSteam }, stocks: {},
});

describe('水滑石蒸汽合计', () => {
  it('中压与低压日量相加，零值作为有效读数', () => {
    expect(hydrotalciteSteamTotal(day(2.5, 1.25))).toBe(3.75);
    expect(hydrotalciteSteamTotal(day(0, 1.25))).toBe(1.25);
  });

  it('任一路缺测时不把缺测值当成零', () => {
    expect(hydrotalciteSteamTotal(day(null, 1.25))).toBeNull();
    expect(hydrotalciteSteamTotal(day(2.5, null))).toBeNull();
  });

  it('月合计行用两路蒸汽月汇总之和计算单耗', () => {
    const data: DetailedWorkshopResult = {
      code: 'hydrotalcite', productionLabel: '水滑石合计产量', stockItems: [],
      metrics: [
        { key: 'mediumSteam', name: '中压蒸汽', unit: 't', category: 'energy', featured: true },
        { key: 'lowSteam', name: '低压蒸汽', unit: 't', category: 'energy', featured: true },
      ],
      days: [day(2.5, 1.25), { ...day(0.5, 2), date: '2026-10-02', production: 10 }],
    };
    const html = renderToStaticMarkup(<DetailedWorkshopTable data={data} tab="prod"
      entries={[{ kind: 'summary', month: '2026-10' }]} activeDate={null} onSelect={() => {}} />);
    expect(html).toContain('蒸汽合计 t');
    expect(html).toContain('合计单耗 t/t');
    expect(html).toContain('>6.25</td>');
    expect(html).toContain('>0.21</td>');
  });
});
