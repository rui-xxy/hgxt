import type { FormData } from '@hgxt/shared';
import schema from './form-schemas/anthraquinone.json';

interface SourceRow {
  date: string;
  sourceRow: number;
  values: (number | null)[];
}

export interface AnthraquinoneSnapshot {
  from: string;
  to: string;
  sheets: {
    '2026': SourceRow[];
    '公用': SourceRow[];
    '干化': SourceRow[];
  };
}

const RAW_MATERIALS = [
  'toluene', 'ethylbenzene', 'chlorobenzene', 'phthalic_anhydride',
  'alcl3', 'carbon', 'lye', 'flake_caustic', 'granular_caustic',
] as const;

const MAIN_FIELDS = [
  'field_crude_output', 'field_crude_anti_solvent', null, null,
  'field_crude_sales', null, null, 'field_crude_stock', null, null,
  'field_dilute_output', 'field_dilute_out_v2006',
  'field_dilute_out_v2009b', 'field_dilute_stock',
  ...RAW_MATERIALS.flatMap((material) => [
    `field_${material}_purchase`, `field_${material}_consumption`, `field_${material}_stock`,
  ]),
] as const;

const UTILITY_FIELDS = [
  'field_fuming_sulfuric_flow', 'field_steam_meter', 'field_water_meter',
  'field_electricity_meter',
  'field_bag_25kg_purchase', 'field_bag_25kg_consumption', 'field_bag_25kg_stock',
  'field_bag_500kg_purchase', 'field_bag_500kg_consumption', 'field_bag_500kg_stock',
  'field_pallet_purchase', 'field_pallet_consumption', 'field_pallet_stock',
  'field_gas_recharge', 'field_gas_consumption', 'field_gas_meter',
  'field_aluminum_water_meter',
] as const;

const DRY_FIELDS = [
  'field_empty_drum_purchase', 'field_empty_drum_consumption', 'field_empty_drum_stock',
  'field_waste_alkali_drum_output', 'field_waste_alkali_drum_outbound', 'field_waste_alkali_drum_stock',
  'field_defoamer_purchase', 'field_defoamer_consumption', 'field_defoamer_stock',
] as const;

function sheetByDate(rows: SourceRow[], name: string, width: number, from: string, to: string): Map<string, SourceRow> {
  const result = new Map<string, SourceRow>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date < from || row.date > to) {
      throw new Error(`${name} 第 ${row.sourceRow} 行日期不属于 ${from} 至 ${to}`);
    }
    if (row.values.length !== width || row.values.some((value) => value !== null && (typeof value !== 'number' || !Number.isFinite(value)))) {
      throw new Error(`${name} 第 ${row.sourceRow} 行数据格式不正确`);
    }
    if (result.has(row.date)) throw new Error(`${name} 的 ${row.date} 日期重复`);
    result.set(row.date, row);
  }
  return result;
}

function sumWhenPresent(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : Number(((a ?? 0) + (b ?? 0)).toFixed(6));
}

/** Excel 每行日期就是业务日期；精品两个包装规格只在导入时合计。 */
export function buildAnthraquinoneRows(snapshot: AnthraquinoneSnapshot): FormData[] {
  const main = sheetByDate(snapshot.sheets['2026'], '2026', MAIN_FIELDS.length, snapshot.from, snapshot.to);
  const utility = sheetByDate(snapshot.sheets['公用'], '公用', UTILITY_FIELDS.length, snapshot.from, snapshot.to);
  const dry = sheetByDate(snapshot.sheets['干化'], '干化', DRY_FIELDS.length, snapshot.from, snapshot.to);
  const expectedDays = Math.round((Date.parse(`${snapshot.to}T00:00:00Z`) - Date.parse(`${snapshot.from}T00:00:00Z`)) / 86400000) + 1;
  if (!Number.isFinite(expectedDays) || main.size !== expectedDays || utility.size !== expectedDays) {
    throw new Error('主报表或公用报表的日期不完整');
  }
  const schemaIds = new Set(schema.map((field) => field.id));
  const dataRows: FormData[] = [];

  for (const date of [...main.keys()].sort()) {
    const m = main.get(date)!.values;
    const u = utility.get(date)?.values;
    const d = dry.get(date)?.values ?? Array<number | null>(DRY_FIELDS.length).fill(null);
    if (!u) throw new Error(`${date} 在公用工作表中缺失`);

    const data: FormData = { field_date: date };
    MAIN_FIELDS.forEach((field, index) => { if (field) data[field] = m[index]; });
    data.field_fine_output = sumWhenPresent(m[2], m[3]);
    data.field_fine_sales = sumWhenPresent(m[5], m[6]);
    data.field_fine_stock = sumWhenPresent(m[8], m[9]);
    UTILITY_FIELDS.forEach((field, index) => { data[field] = u[index]; });
    DRY_FIELDS.forEach((field, index) => { data[field] = d[index]; });
    if (Object.keys(data).length !== schemaIds.size || Object.keys(data).some((field) => !schemaIds.has(field))) {
      throw new Error(`${date} 的导入字段与蒽醌表单定义不一致`);
    }
    dataRows.push(data);
  }
  return dataRows;
}
