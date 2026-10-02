import { useEffect, useState } from 'react';
import { App as AntApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { splitAnnual } from '@hgxt/shared';
import type { PlanTargetRow } from '@hgxt/shared';
import { planSettings, savePlanSettings } from '../../api/production';
import { Dash, Stepper, fmt } from './dash-ui';
import './dash.css';

interface EditableRow {
  workshop: string;
  basis: string;
  annual: number;
  /** 12 个月：null=自动（largest-remainder 拆分，合计严格等于年度） */
  months: Array<number | null>;
}

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
  const [syncedAt, setSyncedAt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  if (query.data && query.dataUpdatedAt !== syncedAt && !dirty) {
    setSyncedAt(query.dataUpdatedAt);
    setRows(query.data.rows.map((r) => ({
      workshop: r.workshop,
      basis: r.basis,
      annual: r.annual,
      months: r.months.map((m) => (m.manual ? m.value : null)),
    })));
    setTargets(query.data.targets.map((t) => ({ ...t })));
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

  const autoMonths = (r: EditableRow): number[] => splitAnnual(r.annual, year);
  const monthValue = (r: EditableRow, i: number): number =>
    r.months[i] !== null ? (r.months[i] as number) : autoMonths(r)[i];
  const monthTotal = (r: EditableRow): number =>
    Array.from({ length: 12 }, (_, i) => monthValue(r, i)).reduce((s, v) => s + v, 0);
  const mismatch = rows.filter((r) => monthTotal(r) !== r.annual && (r.annual > 0 || r.months.some((m) => m !== null)));

  // 保存是一个原子动作：计划 + 单耗目标走同一个 API，后端单事务落库
  const saveMutation = useMutation({
    mutationFn: () =>
      savePlanSettings({
        year,
        rows: rows.map((r) => ({ workshop: r.workshop, annual: r.annual, months: r.months })),
        targets,
      }),
    onSuccess: async () => {
      setDirty(false);
      setSavedOnce(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['production', 'plan', year], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['production', 'plan-settings', year], exact: true }),
      ]);
      if (mismatch.length) {
        message.success(`计划已保存；${mismatch.length} 个车间月合计与年度计划不一致。月度计划已生效，年度指标仍按年度计划计算。`);
      } else {
        message.success('计划已保存，并已同步到“计划与完成”');
      }
    },
    onError: (error: Error) => message.error(error.message),
  });

  const copyPrevYear = async (): Promise<void> => {
    const prev = await planSettings(year - 1);
    setRows((current) =>
      current.map((r, i) => {
        const src = prev.rows.find((p) => p.workshop === r.workshop) ?? prev.rows[i];
        return src ? { ...r, annual: src.annual, months: src.months.map((m) => (m.manual ? m.value : null)) } : r;
      }),
    );
    markDirty();
    message.success(`已复制 ${year - 1} 年计划（未保存）`);
  };

  const GRID = 'minmax(0,1.2fr) 104px repeat(12, minmax(0,1fr)) 92px';

  return (
    <Dash>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <h1 className="h1" style={{ fontSize: 28, margin: 0 }}>
            生产计划
            {dirty ? <span className="st st-warn" style={{ marginLeft: 10, verticalAlign: 4 }}>未保存</span> : null}
          </h1>
          <div className="sub">年度计划录入后按天数自动拆到各月（合计严格等于年度），可逐月调整；灰色为自动拆分值</div>
        </div>
        <Stepper label={`${year} 年`} onPrev={() => changeYear(year - 1)} onNext={() => changeYear(year + 1)} />
        <button className="btn ghost sm" onClick={() => void copyPrevYear()}>复制 {year - 1} 年</button>
        <button
          className="btn secondary sm"
          onClick={() => {
            setRows((current) => current.map((r) => ({ ...r, months: Array.from({ length: 12 }, () => null) })));
            markDirty();
          }}
        >
          按天数重新拆分
        </button>
        <button className="btn primary sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !rows.length || !dirty}>
          {saveMutation.isPending ? '保存中…' : savedOnce && !dirty ? '已保存' : '保存'}
        </button>
      </div>

      <div className="card enter d1" style={{ padding: '18px 20px 8px', overflowX: 'auto' }}>
        <div className="ct">
          <b>产量计划</b>
          <span>单位 t</span>
          <div className="r">
            {mismatch.length ? (
              <span className="st st-warn" title="允许保存：月度计划按月值生效；年度完成率仍按年度计划计算">{mismatch.map((r) => `${r.workshop} 月合计 ${fmt(monthTotal(r), 0)} ≠ 年度 ${fmt(r.annual, 0)}`).join('；')}</span>
            ) : null}
          </div>
        </div>
        <div style={{ minWidth: 980 }}>
          <div className="prow phead" style={{ gridTemplateColumns: GRID }}>
            <span>车间 / 产品</span><span className="r">年度计划 t</span>
            {Array.from({ length: 12 }, (_, i) => <span key={i} className="r">{i + 1} 月</span>)}
            <span className="r">月合计</span>
          </div>
          {rows.map((r) => {
            const auto = autoMonths(r);
            return (
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
                {Array.from({ length: 12 }, (_, i) => {
                  const manual = r.months[i] !== null;
                  return (
                    <input
                      key={i}
                      className={`pin${manual ? ' edit' : ' auto'}`}
                      aria-label={`${r.workshop} ${i + 1} 月计划（吨）${manual ? '，手工值' : '，自动拆分'}`}
                      value={manual ? String(r.months[i]) : (r.annual > 0 ? String(auto[i]) : '')}
                      placeholder="0"
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
                  );
                })}
                <span className={`num r${monthTotal(r) !== r.annual ? ' dn' : ' muted'}`}>{fmt(monthTotal(r), 0)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="enter d2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, marginTop: 16 }}>
        <div className="card" style={{ padding: '18px 20px 8px' }}>
          <div className="ct">
            <b>单耗目标</b>
          </div>
          <div className="prow phead" style={{ gridTemplateColumns: '120px minmax(0,1fr) 80px 140px' }}>
            <span>车间</span><span>指标</span><span>单位</span><span>目标</span>
          </div>
          {targets.map((t, i) => (
            <div className="prow" key={`${t.workshop}-${t.material}`} style={{ gridTemplateColumns: '120px minmax(0,1fr) 80px 140px' }}>
              <span style={{ fontWeight: 600 }}>{t.workshop}</span>
              <span>{t.material}</span>
              <span className="muted">{t.unit}</span>
              <input
                className="pin edit"
                aria-label={`${t.workshop} ${t.material} 单耗目标`}
                value={t.target}
                placeholder="如 ≤ 0.660 或 85 – 95"
                onChange={(e) => {
                  setTargets((cur) => cur.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)));
                  markDirty();
                }}
              />
            </div>
          ))}
          <div className="faint" style={{ fontSize: 12, padding: '8px 8px 10px' }}>支持区间（85 – 95）与上限（≤ 0.660）：区间内视为达标，超出上限或低于下限才计偏离</div>
        </div>
        <div className="card" style={{ padding: '18px 20px' }}>
          <div className="ct"><b>口径说明</b></div>
          {[
            '时间进度 = 已过天数 ÷ 全年天数（已结束年度为 100%）',
            '按进度应完成 = 年度计划 × 时间进度',
            '达成 = 累计完成率 ≥ 时间进度（容差 ±2 个百分点显示为「持平」）',
            '月度完成率 = 当月累计产量 ÷ 当月计划',
            '硫酸按折 98% 计、水滑石为 4 个牌号合计、蒽醌为精品、丰联为焦磷酸哌嗪',
          ].map((s) => (
            <div key={s} style={{ display: 'flex', gap: 8, padding: '7px 0', fontSize: 13, color: 'var(--ink2)', borderBottom: '1px solid var(--line)' }}>
              <span style={{ color: 'var(--brand)' }}>·</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </Dash>
  );
}
