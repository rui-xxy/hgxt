/** 事项表当前可选的部门。历史名称留在原记录中，不并入现行部门。 */
export const CURRENT_DEPARTMENTS = [
  '氨基磺酸生产部',
  '工艺技术部',
  '总经办',
  '审计部',
  '技术研发部',
  '仓储物流部',
  '安环部',
  '人资行政部',
  '丰联生产部',
  '硫酸生产部',
  '品质部',
  '二乙基蒽醌生产部',
  '硫酸镁生产部',
  '设备工程部',
  '营销部',
  '财务部',
  '水滑石生产部',
] as const;

const aliases: Record<string, string> = {
  '2-EAQ生产部': '二乙基蒽醌生产部',
  '新材料生产部': '水滑石生产部',
};

/** 数据表沿用逗号分隔的存储格式，读写时去重并识别已确认的旧称。 */
export function parseDepartmentNames(value: string): string[] {
  return [...new Set(value.split(/[,，、]/).map((name) => aliases[name.trim()] ?? name.trim()).filter(Boolean))];
}

export function normalizeDepartmentValue(value: string): string {
  return parseDepartmentNames(value).join(',');
}
