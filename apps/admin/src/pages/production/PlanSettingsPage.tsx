import { useEffect, useState } from 'react';
import { App as AntApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PLAN_TARGET_CATALOG } from '@hgxt/shared';
import type { PlanTargetRow, SalesBudgetRow } from '@hgxt/shared';
import { planSettings, savePlanSettings } from '../../api/production';
import { Dash, Stepper, fmt } from './dash-ui';
import './dash.css';

interface EditableRow {
  workshop: string;
  basis: string;
  annual: number;
  /** 12 个月：null=未填写 */
  months: Array<number | null>;
}

const TARGET_WORKSHOPS = [...new Set(PLAN_TARGET_CATALOG.map((metric) => metric.workshop))];
const MAX_TARGET_ROWS = Math.max(...PLAN_TARGET_CATALOG.map((metric) =>
  PLAN_TARGET_CATALOG.filter((entry) => entry.workshop === metric.workshop && entry.category === metric.category).length));
const formatBudget = (value: number | null): string => value === null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 3 });

export function PlanSettingsPage() {
  const { message } = AntApp.useApp();
  const { modal } = AntApp.useApp();
  const queryClient = useQueryClient();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const query = useQuery({ queryKey: ['production', 'plan-settings', year], queryFn: () => planSettings(year) });
  useEffect(() => { if (query.error) message.error(query.error.message); }, [query.error, message]);

  // 本地草稿：dirty 期间服务器数据不覆盖（后台 refetch/窗口聚焦不会再吃掉未保存的编辑）
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [targets, setTargets] = useState<PlanTargetRow[]>([]);
  const [salesBudgets, setSalesBudgets] = useState<SalesBudgetRow[]>([]);
  const [targetWorkshop, setTargetWorkshop] = useState('硫酸');
  const [syncedAt, setSyncedAt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  if (query.data && query.dataUpdatedAt !== syncedAt && !dirty) {
    setSyncedAt(query.dataUpdatedAt);
    setRows(query.data.rows.map((r) => ({
      workshop: r.workshop,
      basis: r.basis,
      annual: r.annual,
      months: [...r.months],
    })));
    setTargets(query.data.targets.map((t) => ({ ...t })));
    setSalesBudgets(query.data.salesBudgets.map((row) => ({ product: row.product, months: [...row.months] })));
  }

  const markDirty = (): void => {
    setDirty(true);
    setSavedOnce(false);
  };
  const changeYear = (next: number): void => {
    const doSwitch = (): void => {
      setYear(next);
      setRows([]);
      setTargets([]);
      setSalesBudgets([]);
      setDirty(false);
      setSavedOnce(false);
    };
    if (dirty) {
      modal.confirm({
        title: '有未保存的修改',
        content: `切换到 ${next} 年将放弃当前未保存的修改。`,
        okText: '放弃修改并切换',
        okButtonProps: { danger: true },
        cancelText: '留在本页',
        onOk: doSwitch,
      });
      return;
    }
    doSwitch();
  };

  const monthTotal = (r: { months: Array<number | null> }): number | null =>
    r.months.some((month) => month !== null)
      ? r.months.reduce<number>((sum, month) => sum + (month ?? 0), 0)
      : null;

  // 保存是一个原子动作：计划 + 单耗目标走同一个 API，后端单事务落库
  const saveMutation = useMutation({
    mutationFn: () => {
      const invalid = targets.find((target) => {
        const value = target.target.trim();
        return value !== '' && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value)) || Number(value) <= 0);
      });
      if (invalid) throw new Error(`${invalid.workshop} · ${invalid.material} 的单耗上限须为正数`);
      return savePlanSettings({
        year,
        rows: rows.map((r) => ({ workshop: r.workshop, annual: r.annual, months: r.months })),
        targets,
        salesBudgets,
      });
    },
    onSuccess: async () => {
      setDirty(false);
      setSavedOnce(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['production', 'plan', year], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['production', 'plan-settings', year], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['production', 'brief', year], exact: true }),
      ]);
      message.success('计划已保存，并已同步到看板');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const GRID = 'minmax(0,1.2fr) 104px repeat(12, minmax(0,1fr)) 92px';
  const SALES_GRID = 'minmax(0,1.4fr) repeat(12, minmax(0,1fr)) 92px';
  const TARGET_GRID = 'minmax(0,1.5fr) minmax(0,.8fr) minmax(0,1fr)';
  const workshops = TARGET_WORKSHOPS;

  return (
    <Dash>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <h1 className="h1" style={{ fontSize: 28, margin: 0 }}>
            生产计划
            {dirty ? <span className="st st-warn" style={{ marginLeft: 10, verticalAlign: 4 }}>未保存</span> : null}
          </h1>
        </div>
        <Stepper label={`${year} 年`} onPrev={() => changeYear(year - 1)} onNext={() => changeYear(year + 1)} />
        <button className="btn primary sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !rows.length || !dirty}>
          {saveMutation.isPending ? '保存中…' : savedOnce && !dirty ? '已保存' : '保存'}
        </button>
      </div>

      <div className="card enter d1" style={{ padding: '18px 20px 8px', overflowX: 'auto' }}>
        <div className="ct">
          <b>产量计划</b>
          <span>单位 t</span>
        </div>
        <div style={{ minWidth: 980, minHeight: 30 + TARGET_WORKSHOPS.length * 54 }}>
          <div className="prow phead" style={{ gridTemplateColumns: GRID }}>
            <span>车间 / 产品</span><span className="r">年度计划 t</span>
            {Array.from({ length: 12 }, (_, i) => <span key={i} className="r">{i + 1} 月</span>)}
            <span className="r">月合计</span>
          </div>
          {rows.map((r) => (
            <div className="prow" key={r.workshop} style={{ gridTemplateColumns: GRID }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{r.workshop}</div>
                  <div className="faint" style={{ fontSize: 11.5 }}>{r.basis}</div>
                </div>
                <input
                  className="pin"
                  style={{ fontWeight: 600 }}
                  aria-label={`${r.workshop} 年度计划（吨）`}
                  value={r.annual || ''}
                  placeholder="0"
                  inputMode="numeric"
                  step={1}
                  onChange={(e) => {
                    const v = e.target.value.trim() === '' ? 0 : Number(e.target.value);
                    if (!Number.isInteger(v) || v < 0) return;
                    setRows((cur) => cur.map((x) => (x.workshop === r.workshop ? { ...x, annual: v } : x)));
                    markDirty();
                  }}
                />
                {Array.from({ length: 12 }, (_, i) => (
                  <input
                    key={i}
                    className="pin monthly"
                    aria-label={`${r.workshop} ${i + 1} 月计划（吨）`}
                    value={r.months[i] === null ? '' : String(r.months[i])}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (raw === '') {
                        setRows((cur) => cur.map((x) => (x.workshop === r.workshop ? { ...x, months: x.months.map((m, j) => (j === i ? null : m)) } : x)));
                        markDirty();
                        return;
                      }
                      const v = Number(raw);
                      if (!Number.isFinite(v) || v < 0) return;
                      setRows((cur) => cur.map((x) => (x.workshop === r.workshop ? { ...x, months: x.months.map((m, j) => (j === i ? v : m)) } : x)));
                      markDirty();
                    }}
                  />
                ))}
                <span className="num r muted">{fmt(monthTotal(r), 2)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card enter d2" style={{ marginTop: 16, padding: '18px 20px 8px', overflowX: 'auto' }}>
        <div className="ct"><b>销售预算</b><span>单位 t</span></div>
        <div style={{ minWidth: 1240, minHeight: 30 + 12 * 54 }}>
          <div className="prow phead" style={{ gridTemplateColumns: SALES_GRID }}>
            <span>产品类型</span>
            {Array.from({ length: 12 }, (_, index) => <span key={index} className="r">{index + 1} 月</span>)}
            <span className="r">年合计</span>
          </div>
          {salesBudgets.map((row) => (
            <div className="prow" key={row.product} style={{ gridTemplateColumns: SALES_GRID }}>
              <strong>{row.product}</strong>
              {row.months.map((value, index) => (
                <input
                  key={index}
                  className="pin monthly"
                  aria-label={`${row.product} ${index + 1} 月销售预算（吨）`}
                  inputMode="decimal"
                  value={value === null ? '' : String(value)}
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    if (raw !== '' && (!/^\d*\.?\d*$/.test(raw) || !Number.isFinite(Number(raw)))) return;
                    setSalesBudgets((current) => current.map((item) => item.product === row.product
                      ? { ...item, months: item.months.map((month, monthIndex) => monthIndex === index ? raw === '' ? null : Number(raw) : month) }
                      : item));
                    markDirty();
                  }}
                />
              ))}
              <span className="num r muted">{formatBudget(monthTotal(row))}</span>
            </div>
          ))}
          <div className="prow phead" style={{ gridTemplateColumns: SALES_GRID }}>
            <strong>合计</strong>
            {Array.from({ length: 12 }, (_, index) => {
              const values = salesBudgets.map((row) => row.months[index]).filter((value): value is number => value !== null);
              return <strong key={index} className="num r">{values.length ? formatBudget(values.reduce((sum, value) => sum + value, 0)) : '—'}</strong>;
            })}
            <strong className="num r">{salesBudgets.some((row) => row.months.some((month) => month !== null)) ? formatBudget(salesBudgets.reduce((sum, row) => sum + (monthTotal(row) ?? 0), 0)) : '—'}</strong>
          </div>
        </div>
      </div>

      <div className="enter d2" style={{ marginTop: 16 }}>
        <div className="card" style={{ padding: '18px 20px' }}>
          <div className="ct">
            <b>单耗上限</b>
          </div>
          <div className="fbar" role="tablist" aria-label="车间">
            {workshops.map((workshop) => (
              <button
                key={workshop}
                type="button"
                role="tab"
                aria-selected={targetWorkshop === workshop}
                className={`chipbtn${targetWorkshop === workshop ? ' on' : ''}`}
                disabled={!rows.length}
                onClick={() => setTargetWorkshop(workshop)}
              >
                {workshop}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24 }}>
            {(['energy', 'material'] as const).map((category) => (
              <div key={category} style={{ minHeight: 60 + MAX_TARGET_ROWS * 54 }}>
                <div className="ct"><b>{category === 'energy' ? '能源' : '原辅料'}</b></div>
                <div className="prow phead" style={{ gridTemplateColumns: TARGET_GRID }}>
                  <span>指标</span><span>单位</span><span className="r">上限</span>
                </div>
                {PLAN_TARGET_CATALOG.filter((metric) => metric.workshop === targetWorkshop && metric.category === category).map((metric) => {
                  const target = targets.find((row) => row.workshop === metric.workshop && row.material === metric.material);
                  return (
                    <div className="prow" key={`${metric.workshop}-${metric.material}`} style={{ gridTemplateColumns: TARGET_GRID }}>
                      <span style={{ fontWeight: 500 }}>{metric.material}</span>
                      <span className="muted">{metric.unit}</span>
                      <input
                        className="pin monthly"
                        aria-label={`${metric.workshop} ${metric.material} 单耗上限（${metric.unit}）`}
                        value={target?.target ?? ''}
                        inputMode="decimal"
                        onChange={(event) => {
                          const value = event.target.value;
                          if (!/^\d*\.?\d*$/.test(value)) return;
                          setTargets((current) => current.map((row) => row.workshop === metric.workshop && row.material === metric.material
                            ? { ...row, target: value }
                            : row));
                          markDirty();
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dash>
  );
}
