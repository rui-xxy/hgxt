import equipmentRows from '../data/maintenanceEquipment.json';

/** 车间设备汇总.csv 的去重设备项；保留原车间名、设备名和规格型号。 */
export interface EquipmentItem {
  workshop: string;
  name: string;
  model: string;
}

export const equipmentCatalog: EquipmentItem[] = equipmentRows;

export const equipmentWorkshops = [...new Set(equipmentCatalog.map((item) => item.workshop))];

const searchable = (value: string) => value.toLocaleLowerCase().replace(/[\s·•\-_/（）()]+/g, '');

/** 输入设备名的一部分即可匹配；型号也可以帮助定位同名设备。 */
export function findEquipment(workshop: string, query: string, limit = 30): EquipmentItem[] {
  const words = query.trim().split(/\s+/).map(searchable).filter(Boolean);
  if (!workshop || words.length === 0) return [];
  return equipmentCatalog.filter((item) => {
    if (item.workshop !== workshop) return false;
    const name = searchable(item.name);
    const model = searchable(item.model);
    return words.every((word) => name.includes(word) || model.includes(word));
  }).sort((a, b) => {
    const firstWord = words[0];
    const score = (item: EquipmentItem) => searchable(item.name).startsWith(firstWord) ? 0 : searchable(item.name).includes(firstWord) ? 1 : 2;
    return score(a) - score(b) || a.name.localeCompare(b.name, 'zh-CN') || a.model.localeCompare(b.model, 'zh-CN');
  }).slice(0, limit);
}
