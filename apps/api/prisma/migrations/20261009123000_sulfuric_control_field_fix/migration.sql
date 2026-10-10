-- 中控 03：酸水接水归属酸浓缩，保持原字段 ID 和历史值。
UPDATE "Form" AS form
SET "schema" = (
  SELECT jsonb_agg(
    CASE WHEN field->>'id' = 'field_AQ'
      THEN jsonb_set(field, '{section}', '"酸浓缩"'::jsonb)
      ELSE field
    END ORDER BY ordinal
  )
  FROM jsonb_array_elements(form."schema") WITH ORDINALITY AS fields(field, ordinal)
)
WHERE form."code" = 'sulfuric_control_acid'
  AND jsonb_typeof(form."schema") = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(form."schema") AS fields(field)
    WHERE field->>'id' = 'field_AQ'
  );

-- 中控 01：在晚班入炉矿的水分后补铅、锌，不覆盖已有填写记录或自定义字段。
UPDATE "Form" AS form
SET "schema" = (
  SELECT jsonb_agg(item ORDER BY ordinal, slot)
  FROM (
    SELECT field AS item, ordinal, 0 AS slot
    FROM jsonb_array_elements(form."schema") WITH ORDINALITY AS fields(field, ordinal)
    UNION ALL
    SELECT '{"id":"field_night_pb","title":"铅（%）","type":"number","group":"矿样·干吸·风机","section":"矿样","subgroup":"入炉矿  (晚班)","width":136,"step":0.01}'::jsonb,
           ordinal, 1
    FROM jsonb_array_elements(form."schema") WITH ORDINALITY AS fields(field, ordinal)
    WHERE field->>'id' = 'field_O'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(form."schema") AS existing(field)
        WHERE existing.field->>'id' = 'field_night_pb'
      )
    UNION ALL
    SELECT '{"id":"field_night_zn","title":"锌（%）","type":"number","group":"矿样·干吸·风机","section":"矿样","subgroup":"入炉矿  (晚班)","width":136,"step":0.01}'::jsonb,
           ordinal, 2
    FROM jsonb_array_elements(form."schema") WITH ORDINALITY AS fields(field, ordinal)
    WHERE field->>'id' = 'field_O'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(form."schema") AS existing(field)
        WHERE existing.field->>'id' = 'field_night_zn'
      )
  ) AS ordered_items(item, ordinal, slot)
)
WHERE form."code" = 'sulfuric_control_assay'
  AND jsonb_typeof(form."schema") = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(form."schema") AS fields(field)
    WHERE field->>'id' = 'field_O'
  );
