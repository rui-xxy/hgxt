-- 从现用的 02 表字段定义移除无名称的 AE 列；历史提交值保留在原始记录中。
UPDATE "Form" AS form
SET "schema" = (
  SELECT jsonb_agg(field ORDER BY ordinal)
  FROM jsonb_array_elements(form."schema") WITH ORDINALITY AS fields(field, ordinal)
  WHERE field->>'id' <> 'field_AE'
)
WHERE form."code" = 'sulfuric_control_washing'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(form."schema") AS field
    WHERE field->>'id' = 'field_AE'
  );
