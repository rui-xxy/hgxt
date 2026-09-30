import { useEffect } from 'react';
import { App, Card, Progress, Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { FinishedProductItem, InternalFlowItem, RawMaterialStockItem } from '@hgxt/shared';
import { materialsSummary } from '../../api/production';
import { PageHeader } from '../../components/PageHeader';
import './production.css';

const num = (v: number | null, digits = 1): string =>
  v === null || v === undefined ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits });

export function MaterialsPage() {
  const { message } = App.useApp();
  const query = useQuery({ queryKey: ['production', 'materials'], queryFn: materialsSummary });
  useEffect(() => { if (query.error) message.error(query.error.message); }, [query.error, message]);
  const data = query.data;
  const lowCount = data?.rawMaterials.filter((m) => m.alert).length ?? 0;

  return <>
    <PageHeader
      title="物料与库存"
      description={data ? `原辅料 ${data.rawMaterials.length} 项 · 预警 ${lowCount} 项 · 截至 ${data.date}` : '原辅料进销存 · 产成品产销存 · 车间间往来'}
    />

    <Card className="hgxt-surface" styles={{ body: { padding: 0 } }} style={{ marginBottom: 16 }}>
      <div className="hgxt-toolbar"><span className="hgxt-toolbar-meta">原辅料库存 · 可用天数 = 库存 ÷ 近 7 日平均耗用</span></div>
      <Table<RawMaterialStockItem>
        rowKey={(r) => `${r.workshop}-${r.name}`}
        size="small"
        loading={query.isLoading}
        dataSource={data?.rawMaterials ?? []}
        pagination={false}
        columns={[
          { title: '物料', dataIndex: 'name', key: 'name' },
          { title: '车间', dataIndex: 'workshop', key: 'workshop', width: 110 },
          { title: '库存 t', dataIndex: 'stock', key: 'stock', align: 'right', render: (v: number | null) => num(v) },
          { title: '今日购入', dataIndex: 'purchase', key: 'purchase', align: 'right', render: (v: number | null) => num(v) },
          { title: '今日耗用', dataIndex: 'consumption', key: 'consumption', align: 'right', render: (v: number | null) => num(v) },
          {
            title: '可用天数', key: 'daysOfUse', width: 220,
            render: (_: unknown, r: RawMaterialStockItem) => r.daysOfUse === null ? <span style={{ color: 'var(--hg-text3)' }}>—</span> : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Progress
                  percent={Math.min(100, Math.round((r.daysOfUse / 30) * 100))}
                  showInfo={false}
                  size={{ height: 6 }}
                  strokeColor={r.alert === 'low3' ? 'var(--hg-danger)' : r.alert === 'low7' ? 'var(--hg-warning)' : undefined}
                  trailColor="var(--hg-fill-strong)"
                />
                <span className="mono" style={{ minWidth: 42, textAlign: 'right' }}>{r.daysOfUse} 天</span>
              </div>
            ),
          },
          {
            title: '预警', key: 'alert', width: 88,
            render: (_: unknown, r: RawMaterialStockItem) =>
              r.alert === 'low3' ? <Tag color="error">低于 3 天</Tag>
              : r.alert === 'low7' ? <Tag color="warning">低于 7 天</Tag>
              : <span style={{ color: 'var(--hg-text3)' }}>—</span>,
          },
        ]}
      />
    </Card>

    <Card className="hgxt-surface" styles={{ body: { padding: 0 } }} style={{ marginBottom: 16 }}>
      <div className="hgxt-toolbar"><span className="hgxt-toolbar-meta">产成品产销存 · 库存天数 = 库存 ÷ 销量</span></div>
      <Table<FinishedProductItem>
        rowKey="name"
        size="small"
        loading={query.isLoading}
        dataSource={data?.finishedProducts ?? []}
        pagination={false}
        columns={[
          { title: '产品', dataIndex: 'name', key: 'name' },
          { title: '产量 t', dataIndex: 'production', key: 'production', align: 'right', render: (v: number | null) => num(v) },
          { title: '销量 t', dataIndex: 'sales', key: 'sales', align: 'right', render: (v: number | null) => num(v) },
          { title: '库存 t', dataIndex: 'stock', key: 'stock', align: 'right', render: (v: number | null) => num(v) },
          { title: '产销率', dataIndex: 'salesRatio', key: 'salesRatio', align: 'right', render: (v: number | null) => v === null ? '—' : `${Math.round(v * 100)}%` },
          { title: '库存天数', dataIndex: 'stockDays', key: 'stockDays', align: 'right', render: (v: number | null) => v === null ? '—' : `${v} 天` },
        ]}
      />
    </Card>

    <Card className="hgxt-surface" styles={{ body: { padding: 0 } }}>
      <div className="hgxt-toolbar"><span className="hgxt-toolbar-meta">车间间物料往来 · 一家的副产品是另一家的原料（t）</span></div>
      <Table<InternalFlowItem>
        rowKey={(r) => `${r.from}-${r.to}-${r.material}`}
        size="small"
        loading={query.isLoading}
        dataSource={data?.internalFlows ?? []}
        pagination={false}
        columns={[
          { title: '流出', dataIndex: 'from', key: 'from', width: 110 },
          { title: '流入', dataIndex: 'to', key: 'to', width: 110 },
          { title: '物料', dataIndex: 'material', key: 'material' },
          { title: '当日数量 t', dataIndex: 'quantity', key: 'quantity', align: 'right', render: (v: number | null) => num(v) },
        ]}
      />
    </Card>
  </>;
}
