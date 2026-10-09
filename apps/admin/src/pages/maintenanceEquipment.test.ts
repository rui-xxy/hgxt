import { describe, expect, it } from 'vitest';
import { equipmentCatalog, equipmentWorkshops, findEquipment } from './maintenanceEquipment';

describe('维修设备目录', () => {
  it('保留 CSV 的设备范围及空型号', () => {
    expect(equipmentCatalog).toHaveLength(882);
    expect(equipmentWorkshops).toHaveLength(11);
    expect(equipmentCatalog.some((item) => !item.model)).toBe(true);
  });

  it('只在选定车间内按部分名称或型号匹配', () => {
    const matches = findEquipment('2-EAQ车间', '卸车泵');
    expect(matches.some((item) => item.name === '乙苯卸车泵' && item.model === 'CQL80-65-125')).toBe(true);
    expect(matches.every((item) => item.workshop === '2-EAQ车间')).toBe(true);
    expect(findEquipment('2-EAQ车间', 'cql 80')).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '乙苯卸车泵' }),
    ]));
    expect(findEquipment('', '卸车泵')).toEqual([]);
  });
});
