-- 热电日报增加可选停车标记；历史记录不回填，空值沿用原供汽口径。
UPDATE "Form" AS form
SET "schema" = jsonb_insert(
  form."schema", '{1}',
  '{"id":"field_sulfuric_stopped","title":"硫酸是否停车","type":"select","group":"蒸汽流量计","width":132,"options":[{"label":"是","value":"是"}]}'::jsonb
)
WHERE form."code" = 'thermal_daily'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(form."schema") AS field
    WHERE field->>'id' = 'field_sulfuric_stopped'
  );
