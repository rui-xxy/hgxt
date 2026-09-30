import { useEffect, useState } from 'react';
import { App, Card, Segmented, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { SulfuricDaySummary } from '@hgxt/shared';
import { sulfuricSummary, workshopOverview } from '../../api/production';
import { BarChart } from '../../components/BarChart';
import { PageHeader } from '../../components/PageHeader';
import './production.css';

/** 折98 计算过程的可读展开 */
function formulaOf(day: SulfuricDaySummary): string {
  const p = day.production;
  if (!p) return '当日或前日罐液位数据不完整，产量不可算';
  const e = (v: number) => v.toLocaleString();
  return (
    `折98 = 98酸(${e(p.acid98)}) + 93酸(${e(p.acid93)}) + 试剂酸(${e(p.reagent)}) + 发烟×105/98(${e(p.fuming)}) = ${e(p.total98Equivalent)} t` +
    (p.gapDays > 0 ? ` （跨 ${p.gapDays} 天累计差值）` : '') +
    ` · 销售流出：98酸 ${e(p.flow.acid98)} / 93酸 ${e(p.flow.acid93)} / 试剂 ${e(p.flow.reagent)} / 发烟 ${e(p.flow.fuming)}`
  );
}

export function WorkshopBoardPage() {
  const { message } = App.useApp();
  const [code, setCode] = useState('sulfuric');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const overview = useQuery({ queryKey: ['production', 'workshops', 30], queryFn: () => workshopOverview(30) });
  const sulfuric = useQuery({ queryKey: ['production', 'sulfuric', 30], queryFn: () => sulfuricSummary(30), enabled: code === 'sulfuric' });
  useEffect(() => { if (overview.error) message.error(overview.error.message); }, [overview.error, message]);

  const workshop = overview.data?.workshops.find((w) => w.code === code) ?? overview.data?.workshops[0];
  const selectedSulfuricDay = sulfuric.data?.days.find((d) => d.date === selectedDate);

  return <>
    <PageHeader
      title="车间版面"
      description={overview.data ? `近 ${overview.data.dates.length} 个归属日 · 点击柱子查看当日构成` : '各车间日产量'}
    />
    <Card className="hgxt-surface" styles={{ body: { padding: 16 } }}>
      <Segmented
        value={code}
        onChange={(v) => { setCode(v as string); setSelectedDate(null); }}
        options={(overview.data?.workshops ?? []).map((w) => ({ label: w.name, value: w.code }))}
      />
      <BarChart
        points={(overview.data?.dates ?? []).map((date, i) => ({ label: date, value: workshop?.values[i] ?? null }))}
        unit={workshop?.unit ?? 't'}
        selected={selectedDate}
        onSelect={setSelectedDate}
      />
    </Card>

    {selectedDate && (
      <Card className="hgxt-surface" styles={{ body: { padding: 0 } }} style={{ marginTop: 16 }}>
        <div className="hgxt-toolbar">
          <span className="hgxt-toolbar-meta">{selectedDate} 当日构成</span>
        </div>
        {code === 'sulfuric' ? (
          selectedSulfuricDay ? (
            <>
              <Table
                rowKey="material"
                size="small"
                pagination={false}
                dataSource={[
                  { key: 'acid98', material: '98酸', production: selectedSulfuricDay.production?.acid98 ?? null, stock: selectedSulfuricDay.inventory?.acid98 ?? null },
                  { key: 'acid93', material: '93酸', production: selectedSulfuricDay.production?.acid93 ?? null, stock: null },
                  { key: 'reagent', material: '试剂酸', production: selectedSulfuricDay.production?.reagent ?? null, stock: selectedSulfuricDay.inventory?.reagent ?? null },
                  { key: 'fuming', material: '发烟硫酸', production: selectedSulfuricDay.production?.fuming ?? null, stock: selectedSulfuricDay.inventory?.fuming ?? null },
                  {
                    key: 'total', material: '合计（折98）',
                    production: selectedSulfuricDay.production?.total98Equivalent ?? null,
                    stock: selectedSulfuricDay.inventory?.total ?? null,
                  },
                ]}
                columns={[
                  { title: '物料', dataIndex: 'material' },
                  { title: '产量 t', dataIndex: 'production', align: 'right', render: (v: number | null) => v?.toLocaleString() ?? '—' },
                  { title: '库存 t', dataIndex: 'stock', align: 'right', render: (v: number | null) => v?.toLocaleString() ?? '—' },
                ]}
              />
              <div style={{ padding: '0 16px 14px' }}>
                <div className="prod-day-detail">电耗：{selectedSulfuricDay.electricity ? `${selectedSulfuricDay.electricity.total.toLocaleString()} kWh（${selectedSulfuricDay.electricity.meters.map((m) => `${m.name} ${m.usage.toLocaleString()}`).join(' + ')}）` : '跨天，不拆分'}</div>
                <div className="prod-day-detail" style={{ marginTop: 8 }}>{formulaOf(selectedSulfuricDay)}</div>
              </div>
            </>
          ) : <div style={{ padding: 16, color: 'var(--hg-text3)' }}>该日不在近 30 天窗口内</div>
        ) : (
          <div style={{ padding: 16 }} className="prod-day-detail">
            {(() => {
              const idx = overview.data?.dates.indexOf(selectedDate) ?? -1;
              const value = idx >= 0 ? workshop?.values[idx] : null;
              return value === null || value === undefined
                ? `${selectedDate}：该车间当日无上报数据`
                : `${selectedDate}：${workshop?.name} ${value.toLocaleString()} ${workshop?.unit}（表单上报值）`;
            })()}
          </div>
        )}
      </Card>
    )}
  </>;
}
