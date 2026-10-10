-- 水洗塔酸浓与双氧水含量归入 03 尾气水洗塔；保留 02 的历史动力波排量值，但停止展示和录入。
UPDATE "Form" AS form
SET "schema" = (
  SELECT jsonb_agg(
    CASE WHEN field->>'id' = 'field_date' THEN field
      ELSE jsonb_set(field, '{group}', '"动力波"'::jsonb) END
    ORDER BY ordinal
  )
  FROM jsonb_array_elements(form."schema") WITH ORDINALITY AS fields(field, ordinal)
  WHERE field->>'id' NOT IN ('field_AF', 'field_AT', 'field_AU')
),
"title" = '硫酸中控 02｜动力波',
"description" = '动力波分析'
WHERE form."code" = 'sulfuric_control_washing';

UPDATE "Form" AS form
SET "schema" = (
  SELECT jsonb_agg(
    CASE WHEN field->>'id' = 'field_date' THEN field
      ELSE jsonb_set(field, '{group}', '"预干燥·酸浓缩·尾吸·尾气水洗塔·试剂酸"'::jsonb) END
    ORDER BY ordinal
  )
  FROM jsonb_array_elements(
    jsonb_insert(
      jsonb_insert(form."schema", '{7}',
        '{"id":"field_AT","title":"酸浓%","type":"number","group":"预干燥·酸浓缩·尾吸·尾气水洗塔·试剂酸","section":"尾气水洗塔","subgroup":"尾气水洗塔稀酸","width":136,"step":0.01}'::jsonb),
      '{8}',
      '{"id":"field_AU","title":"双氧水含量%","type":"number","group":"预干燥·酸浓缩·尾吸·尾气水洗塔·试剂酸","section":"尾气水洗塔","subgroup":"尾气水洗塔稀酸","width":136,"step":0.01}'::jsonb
    )
  ) WITH ORDINALITY AS fields(field, ordinal)
),
"title" = '硫酸中控 03｜预干燥·酸浓缩·尾吸·尾气水洗塔·试剂酸',
"description" = '预干燥、酸浓缩、尾吸塔、尾气水洗塔与试剂酸分析'
WHERE form."code" = 'sulfuric_control_acid'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(form."schema") AS field WHERE field->>'id' = 'field_AT'
  );

-- 同一归属日如有多次提交，取 02 最新一条，将其水洗塔值并入 03；03 已有同名值时保留 03 的值。
WITH source_rows AS (
  SELECT DISTINCT ON (submission."data"->>'field_date')
    submission."data"->>'field_date' AS record_date,
    jsonb_strip_nulls(jsonb_build_object(
      'field_AT', submission."data"->'field_AT',
      'field_AU', submission."data"->'field_AU'
    )) AS moved_values,
    submission."submitterId"
  FROM "FormSubmission" AS submission
  JOIN "Form" AS form ON form.id = submission."formId"
  WHERE form."code" = 'sulfuric_control_washing'
    AND (submission."data" ? 'field_AT' OR submission."data" ? 'field_AU')
  ORDER BY submission."data"->>'field_date', submission."updatedAt" DESC, submission."createdAt" DESC
)
UPDATE "FormSubmission" AS target
SET "data" = source_rows.moved_values || target."data",
    "updatedAt" = NOW()
FROM source_rows, "Form" AS form
WHERE form."code" = 'sulfuric_control_acid'
  AND target."formId" = form.id
  AND target."data"->>'field_date' = source_rows.record_date;

WITH source_rows AS (
  SELECT DISTINCT ON (submission."data"->>'field_date')
    submission."data"->>'field_date' AS record_date,
    jsonb_strip_nulls(jsonb_build_object(
      'field_AT', submission."data"->'field_AT',
      'field_AU', submission."data"->'field_AU'
    )) AS moved_values,
    submission."submitterId"
  FROM "FormSubmission" AS submission
  JOIN "Form" AS form ON form.id = submission."formId"
  WHERE form."code" = 'sulfuric_control_washing'
    AND (submission."data" ? 'field_AT' OR submission."data" ? 'field_AU')
  ORDER BY submission."data"->>'field_date', submission."updatedAt" DESC, submission."createdAt" DESC
)
INSERT INTO "FormSubmission" ("id", "formId", "data", "submitterId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, acid.id,
  jsonb_build_object('field_date', source_rows.record_date) || source_rows.moved_values,
  source_rows."submitterId", NOW(), NOW()
FROM source_rows
JOIN "Form" AS acid ON acid."code" = 'sulfuric_control_acid'
WHERE source_rows.moved_values <> '{}'::jsonb
  AND NOT EXISTS (
    SELECT 1 FROM "FormSubmission" AS target
    WHERE target."formId" = acid.id AND target."data"->>'field_date' = source_rows.record_date
  );

UPDATE "FormSubmission" AS submission
SET "data" = submission."data" - 'field_AT' - 'field_AU',
    "updatedAt" = NOW()
FROM "Form" AS form
WHERE form.id = submission."formId"
  AND form."code" = 'sulfuric_control_washing'
  AND (submission."data" ? 'field_AT' OR submission."data" ? 'field_AU');
