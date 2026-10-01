import type { CSSProperties } from 'react';
import { Modal } from 'antd';
import type { SulfuricDaySummary, SulfuricFlow } from '@hgxt/shared';
import { fmt, PALETTE } from './dash-ui';

const MATERIALS = [
  { material: '98酸', title: '98% 酸', color: PALETTE.brand },
  { material: '发烟硫酸', title: '发烟硫酸', color: PALETTE.fuming },
  { material: '试剂酸', title: '试剂酸', color: PALETTE.reagent },
];
const accent = (color: string): CSSProperties => ({ '--group-accent': color } as CSSProperties);
const precise = (value: number): string => value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
const entered = (value: number | null): string => value === null ? '未填' : precise(value);

export function SulfuricCalculationModal({ day, onClose }: { day: SulfuricDaySummary | null; onClose: () => void }) {
  const production = day?.production;
  if (!day || !production) return null;

  const calculation = production.calculation;
  if (!calculation) {
    return <Modal title="产量计算过程" open onCancel={onClose} footer={null}>当前接口未返回计算明细，请刷新页面后重试。</Modal>;
  }

  const deltaOf = (material: string) => calculation.tanks
    .filter((tank) => tank.material === material)
    .reduce((sum, tank) => sum + tank.deltaTons, 0);
  const acid98Delta = deltaOf('98酸');
  const fumingDelta = deltaOf('发烟硫酸');
  const reagentDelta = deltaOf('试剂酸');
  const aminoVolume = calculation.aminosulfonic.reduce((sum, entry) => sum + (entry.volumeM3 ?? 0), 0);
  const aminoTons = production.internalFuming.aminosulfonic ?? 0;
  const anthraquinoneTons = production.internalFuming.anthraquinone ?? 0;
  const acid98Raw = acid98Delta + production.flow.acid98;
  const reagentRaw = reagentDelta + production.flow.reagent;
  const fumingRaw = fumingDelta + production.flow.fuming + aminoTons + anthraquinoneTons;
  const fumingEquivalent = fumingRaw * (105 / 98);
  const rawTotal = acid98Raw + production.flow.acid93 + reagentRaw + fumingEquivalent;
  const salesKeys: Array<{ key: keyof SulfuricFlow; name: string }> = [
    { key: 'acid98', name: '98% 酸' }, { key: 'acid93', name: '93% 酸' },
    { key: 'reagent', name: '试剂酸' }, { key: 'fuming', name: '发烟硫酸' },
  ];

  return (
    <Modal
      title={`折 98% 产量计算 · ${day.productionDate}`}
      open
      onCancel={onClose}
      footer={null}
      width={960}
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
      destroyOnHidden
    >
      <div className="production-calc">
        <div className="pc-overview">
          <div><span>液位填报</span><strong>{calculation.previousReportDate} → {day.date}</strong></div>
          <div><span>生产归属</span><strong>{day.productionDate}</strong></div>
          <div><span>折 98% 合计</span><strong>{fmt(production.total98Equivalent, 3)} t</strong></div>
        </div>
        {production.gapDays > 0 && (
          <p className="pc-note">两次液位填报相隔 {production.gapDays + 1} 天；下面的库存变化和流出量是这段期间的累计值，不能拆成单日值。</p>
        )}

        <section className="pc-section">
          <h3>1. 液位 → 逐罐库存变化</h3>
          <p className="pc-note">每罐库存 = 液位 ÷ 100 × 罐容 × 密度；库存变化 = 后库存 − 前库存。双氧水监测罐不参与硫酸产量计算。</p>
          {MATERIALS.map((group) => {
            const rows = calculation.tanks.filter((tank) => tank.material === group.material);
            return (
              <div className="pc-group" key={group.material}>
                <div className="pc-group-title" style={accent(group.color)}>
                  <b>{group.title}</b><span>库存变化合计 {precise(deltaOf(group.material))} t</span>
                </div>
                <div className="pc-table-wrap">
                  <table className="pc-table">
                    <thead><tr>
                      <th>储罐</th><th>前液位 %</th><th>后液位 %</th><th>罐容 m³</th><th>密度 t/m³</th>
                      <th>前库存 t</th><th>后库存 t</th><th>变化 t</th>
                    </tr></thead>
                    <tbody>{rows.map((tank) => <tr key={tank.fieldId}>
                      <td>{tank.name}<small className="pc-expression">({precise(tank.currentLevelPercent)} − {precise(tank.previousLevelPercent)}) ÷ 100 × {precise(tank.capacity)} × {precise(tank.density)}</small></td>
                      <td>{precise(tank.previousLevelPercent)}</td><td>{precise(tank.currentLevelPercent)}</td>
                      <td>{precise(tank.capacity)}</td><td>{precise(tank.density)}</td>
                      <td>{precise(tank.previousTons)}</td><td>{precise(tank.currentTons)}</td><td>{precise(tank.deltaTons)}</td>
                    </tr>)}</tbody>
                    <tfoot><tr className="pc-total"><td colSpan={7}>本组逐罐变化合计</td><td>{precise(deltaOf(group.material))}</td></tr></tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </section>

        <section className="pc-section">
          <h3>2. 外销与内部领用</h3>
          <p className="pc-note">外销取两次液位填报之间各日销售表的数值；未填的项目按 0 计，仍标明“未填”。</p>
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead><tr><th>销售填报日</th>{salesKeys.map(({ key, name }) => <th key={key}>{name} t</th>)}</tr></thead>
              <tbody>
                {calculation.sales.map((entry) => <tr key={entry.date}>
                  <td>{entry.date}</td>{salesKeys.map(({ key }) => <td key={key}>{entered(entry.values[key])}</td>)}
                </tr>)}
                <tr className="pc-total"><td>外销合计</td>{salesKeys.map(({ key }) => <td key={key}>{precise(production.flow[key])}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <div className="pc-internal">
            <div>
              <b>氨基磺酸领用</b>
              {calculation.aminosulfonic.map((entry) => <p key={entry.date}>{entry.date} 填报：{entered(entry.volumeM3)} m³</p>)}
              <strong>{precise(aminoVolume)} m³ × {precise(calculation.fumingDensity)} t/m³ = {precise(aminoTons)} t</strong>
              {production.internalFuming.aminosulfonic === null && <p className="pc-note">缺少有效填报，本次按 0 计。</p>}
            </div>
            <div>
              <b>蒽醌领用 · 累计流量计</b>
              <p>前读数 {entered(calculation.anthraquinone.previousReadingM3)} m³ → 后读数 {entered(calculation.anthraquinone.currentReadingM3)} m³</p>
              <strong>差值 {entered(calculation.anthraquinone.volumeM3)} m³ × {precise(calculation.fumingDensity)} t/m³ = {precise(anthraquinoneTons)} t</strong>
              {production.internalFuming.anthraquinone === null && <p className="pc-note">读数缺失或回退，本次按 0 计。</p>}
            </div>
          </div>
        </section>

        <section className="pc-section">
          <h3>3. 库存变化 + 流出 = 各酸产量</h3>
          <div className="pc-formula" style={accent(PALETTE.brand)}><b>98% 酸</b><span>{precise(acid98Delta)} + {precise(production.flow.acid98)} = {precise(acid98Raw)} t</span><strong>产量 {fmt(production.acid98, 3)} t</strong></div>
          <div className="pc-formula" style={accent(PALETTE.acid93)}><b>93% 酸</b><span>无独立储罐，直接取外销 {precise(production.flow.acid93)} t</span><strong>产量 {fmt(production.acid93, 3)} t</strong></div>
          <div className="pc-formula" style={accent(PALETTE.reagent)}><b>试剂酸</b><span>{precise(reagentDelta)} + {precise(production.flow.reagent)} = {precise(reagentRaw)} t</span><strong>产量 {fmt(production.reagent, 3)} t</strong></div>
          <div className="pc-formula" style={accent(PALETTE.fuming)}><b>发烟硫酸</b><span>{precise(fumingDelta)} + {precise(production.flow.fuming)} + {precise(aminoTons)} + {precise(anthraquinoneTons)} = {precise(fumingRaw)} t</span><strong>产量 {fmt(production.fuming, 3)} t</strong></div>
        </section>

        <section className="pc-section pc-final">
          <h3>4. 只在总产量处折 98%</h3>
          <p>发烟硫酸折标：{precise(fumingRaw)} × 105 ÷ 98 = <strong>{precise(fumingEquivalent)} t</strong></p>
          <p>总产量：{precise(acid98Raw)} + {precise(production.flow.acid93)} + {precise(reagentRaw)} + {precise(fumingEquivalent)} = {precise(rawTotal)} t</p>
          <div className="pc-result"><span>折 98% 合计</span><strong>{fmt(production.total98Equivalent, 3)} t</strong></div>
          <p className="pc-note">中间值按原始精度参与计算，表格产量显示到 0.1 t，本面板的最终结果显示到 0.001 t。</p>
        </section>
      </div>
    </Modal>
  );
}
