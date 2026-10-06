export type PlanTargetCategory = 'energy' | 'material';

export interface PlanTargetMetric {
  workshop: string;
  material: string;
  unit: string;
  category: PlanTargetCategory;
  defaultLimit?: string;
}

/** 与计划看板中实际计算的单耗指标一致。 */
export const PLAN_TARGET_CATALOG: readonly PlanTargetMetric[] = [
  { workshop: '硫酸', material: '电', unit: 'kWh/t', category: 'energy', defaultLimit: '95' },
  { workshop: '硫酸', material: '水', unit: 'm³/t', category: 'energy' },
  { workshop: '硫酸', material: '硫铁矿', unit: 't/t', category: 'material', defaultLimit: '1.62' },
  { workshop: '硫酸', material: '双氧水', unit: 't/t', category: 'material' },
  { workshop: '氨基磺酸', material: '电', unit: 'kWh/t', category: 'energy' },
  { workshop: '氨基磺酸', material: '蒸汽', unit: 't/t', category: 'energy', defaultLimit: '1.55' },
  { workshop: '氨基磺酸', material: '水', unit: 'm³/t', category: 'energy' },
  { workshop: '氨基磺酸', material: '尿素', unit: 't/t', category: 'material', defaultLimit: '0.66' },
  { workshop: '氨基磺酸', material: '发烟硫酸', unit: 't/t', category: 'material' },
  { workshop: '硫酸镁', material: '电', unit: 'kWh/t', category: 'energy' },
  { workshop: '硫酸镁', material: '蒸汽', unit: 't/t', category: 'energy' },
  { workshop: '硫酸镁', material: '水', unit: 'm³/t', category: 'energy' },
  { workshop: '硫酸镁', material: '氧化镁', unit: 't/t', category: 'material', defaultLimit: '0.2' },
  { workshop: '硫酸镁', material: '93%酸+稀酸', unit: 't/t', category: 'material' },
  { workshop: '水滑石', material: '蒸汽', unit: 't/t', category: 'energy', defaultLimit: '2.2' },
  { workshop: '水滑石', material: '氢氧化铝', unit: 't/t', category: 'material' },
  { workshop: '水滑石', material: '纯碱', unit: 't/t', category: 'material' },
  { workshop: '二乙基蒽醌', material: '电', unit: 'kWh/t', category: 'energy' },
  { workshop: '二乙基蒽醌', material: '蒸汽', unit: 't/t', category: 'energy' },
  { workshop: '二乙基蒽醌', material: '水', unit: 'm³/t', category: 'energy' },
  { workshop: '二乙基蒽醌', material: '天然气', unit: 'm³/t', category: 'energy' },
  { workshop: '二乙基蒽醌', material: '苯酐', unit: 't/t', category: 'material', defaultLimit: '1.1' },
  { workshop: '二乙基蒽醌', material: '无水三氯化铝', unit: 't/t', category: 'material' },
  { workshop: '二乙基蒽醌', material: '甲苯', unit: 't/t', category: 'material' },
  { workshop: '丰联', material: '蒸汽', unit: 't/t', category: 'energy' },
  { workshop: '丰联', material: '85%磷酸', unit: 't/t', category: 'material', defaultLimit: '0.95' },
  { workshop: '丰联', material: '68哌嗪', unit: 't/t', category: 'material' },
];
