import { describe, expect, it } from 'vitest';
import source from '../prisma/data/sulfuric-control-2025-2026.json';
import schema from '../prisma/form-schemas/sulfuric-control.json';
import assaySchema from '../prisma/form-schemas/sulfuric-control-assay.json';
import washingSchema from '../prisma/form-schemas/sulfuric-control-washing.json';
import acidSchema from '../prisma/form-schemas/sulfuric-control-acid.json';
import notesSchema from '../prisma/form-schemas/sulfuric-control-notes.json';
import manifest from '../prisma/form-schemas/manifest.json';
import { buildSulfuricControlRows, type SulfuricControlSnapshot } from '../prisma/import-sulfuric-control';

describe('硫酸中控 Excel 数据提取', () => {
  it('四张品质表单覆盖原有字段并补充晚班入炉矿铅锌检测，生产情况记录独立成表', () => {
    const parts = [assaySchema, washingSchema, acidSchema, notesSchema];
    const fieldIds = parts.flatMap((part) => part.slice(1).map((field) => field.id));
    expect(fieldIds).toHaveLength(new Set(fieldIds).size);
    expect(fieldIds.sort()).toEqual([...schema.slice(1).map((field) => field.id), 'field_night_pb', 'field_night_zn'].sort());
    expect(assaySchema.filter((field) => field.subgroup === '入炉矿（晚班）').map((field) => field.title)).toEqual([
      '有效硫（%）', '水分（%）', '铅（%）', '锌（%）',
    ]);
    expect(assaySchema.find((field) => field.id === 'field_BG')?.title).toBe('水分（g/m³）');
    expect(washingSchema.find((field) => field.id === 'field_AC')?.subgroup).toBe('动力波');
    expect(acidSchema.find((field) => field.id === 'field_AX')?.subgroup).toBe('试剂酸质量（中间槽）');
    expect(acidSchema.find((field) => field.id === 'field_AQ')?.section).toBe('酸浓缩');
    expect(acidSchema.some((field) => field.id === 'field_notes')).toBe(false);
    expect(notesSchema.at(-1)).toMatchObject({ id: 'field_notes', title: '生产情况记录' });
    expect(manifest.filter((entry) => entry.code.startsWith('sulfuric_control_'))).toHaveLength(4);
    expect(manifest.filter((entry) => entry.code.startsWith('sulfuric_control_')).every((entry) => entry.category === '品质')).toBe(true);
  });

  it('按 A 列日期映射重点指标，空白维持缺测，原备注逐条保留', () => {
    const rows = buildSulfuricControlRows(source as unknown as SulfuricControlSnapshot, schema as never);
    expect(rows).toHaveLength(635);
    expect(rows[0].field_date).toBe('2025-01-01');
    expect(rows.at(-1)?.field_date).toBe('2026-09-29');
    const day = rows.find((row) => row.field_date === '2026-09-27');
    expect(day).toMatchObject({ field_B: 36.3, field_F: 35.7, field_G: 8.75,
      field_AK: 94.41, field_AL: 98.44, field_AM: 98.06, field_AN: 104.76,
      field_AV: 39.92, field_AW: 1.98, field_AX: 96.61, field_BB: 8.1 });
    expect(day).not.toHaveProperty('field_J');
    expect(rows.at(-1)).not.toHaveProperty('field_AK');
    expect(String(rows.at(-1)?.field_notes).split('\n')).toHaveLength(3);
    expect(schema.some((field) => field.id === 'field_BL')).toBe(false);
    expect(schema.find((field) => field.id === 'field_BB')?.section).toBe('风机出口');
    expect(schema.find((field) => field.id === 'field_AC')?.group).toBe('动力波·水洗塔');
    expect(schema.find((field) => field.id === 'field_AX')?.group).toBe('预干燥·酸浓缩·尾吸·试剂酸');
    expect(schema.at(-1)).toMatchObject({ id: 'field_notes', title: '生产情况记录', group: '生产情况记录' });
  });
});
