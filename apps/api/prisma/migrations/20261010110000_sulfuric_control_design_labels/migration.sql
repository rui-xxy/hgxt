-- 与手机填写及合并总表设计稿统一展示名称和分组；字段 ID 与历史数据保持不变。
WITH corrections(code, field_id, title, subgroup) AS (
  VALUES
    ('sulfuric_control_assay', 'field_N', NULL, '入炉矿（晚班）'),
    ('sulfuric_control_assay', 'field_O', NULL, '入炉矿（晚班）'),
    ('sulfuric_control_assay', 'field_night_pb', NULL, '入炉矿（晚班）'),
    ('sulfuric_control_assay', 'field_night_zn', NULL, '入炉矿（晚班）'),
    ('sulfuric_control_assay', 'field_U', '铁（%）', NULL),
    ('sulfuric_control_assay', 'field_V', '水分（%）', NULL),
    ('sulfuric_control_assay', 'field_BD', '砷（mg/m³）', NULL),
    ('sulfuric_control_assay', 'field_BE', '氟（mg/m³）', NULL),
    ('sulfuric_control_assay', 'field_BG', '水分（g/m³）', NULL),
    ('sulfuric_control_assay', 'field_BH', '酸雾（g/m³）', NULL),
    ('sulfuric_control_washing', 'field_AA', '砷（mg/l）', NULL),
    ('sulfuric_control_washing', 'field_AB', '氟（mg/l）', NULL),
    ('sulfuric_control_washing', 'field_AC', '砷（mg/l）', '动力波'),
    ('sulfuric_control_washing', 'field_AD', '氟（mg/l）', '动力波'),
    ('sulfuric_control_washing', 'field_AE', NULL, '动力波'),
    ('sulfuric_control_acid', 'field_AX', '酸浓（%）', '试剂酸质量（中间槽）'),
    ('sulfuric_control_acid', 'field_AY', NULL, '试剂酸质量（中间槽）'),
    ('sulfuric_control_acid', 'field_AZ', NULL, '试剂酸质量（中间槽）'),
    ('sulfuric_control_acid', 'field_BA', NULL, '试剂酸质量（中间槽）')
), normalized AS (
  SELECT form.id,
    (SELECT jsonb_agg(
      CASE WHEN correction.field_id IS NULL THEN field
        ELSE jsonb_set(
          jsonb_set(field, '{title}', to_jsonb(COALESCE(correction.title, field->>'title'))),
          '{subgroup}', to_jsonb(COALESCE(correction.subgroup, field->>'subgroup'))
        ) END ORDER BY ordinal
      )
      FROM jsonb_array_elements(form."schema") WITH ORDINALITY AS fields(field, ordinal)
      LEFT JOIN corrections AS correction
        ON correction.code = form."code" AND correction.field_id = field->>'id'
    ) AS next_schema
  FROM "Form" AS form
  WHERE form."code" IN ('sulfuric_control_assay', 'sulfuric_control_washing', 'sulfuric_control_acid')
    AND jsonb_typeof(form."schema") = 'array'
)
UPDATE "Form" AS form
SET "schema" = normalized.next_schema
FROM normalized
WHERE form.id = normalized.id;
