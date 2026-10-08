-- 销售预算沿用原数值，只将产品口径与生产报表字段统一。
-- 若某年度新旧名称并存，新名称已录入的月份优先，其余月份保留旧预算。
UPDATE "SalesBudget" AS current_budget
SET "months" = COALESCE(legacy_budget."months", '{}'::jsonb) || COALESCE(current_budget."months", '{}'::jsonb),
    "updatedAt" = CURRENT_TIMESTAMP
FROM "SalesBudget" AS legacy_budget,
  (VALUES ('烟酸', '发烟硫酸'), ('优质酸', '试剂酸'), ('蒸汽', '外供蒸汽')) AS names(old_name, new_name)
WHERE legacy_budget."product" = names.old_name
  AND current_budget."product" = names.new_name
  AND current_budget."year" = legacy_budget."year";

DELETE FROM "SalesBudget" AS legacy_budget
USING "SalesBudget" AS current_budget,
  (VALUES ('烟酸', '发烟硫酸'), ('优质酸', '试剂酸'), ('蒸汽', '外供蒸汽')) AS names(old_name, new_name)
WHERE legacy_budget."product" = names.old_name
  AND current_budget."product" = names.new_name
  AND current_budget."year" = legacy_budget."year";

UPDATE "SalesBudget" AS legacy_budget
SET "product" = names.new_name,
    "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES ('烟酸', '发烟硫酸'), ('优质酸', '试剂酸'), ('蒸汽', '外供蒸汽')) AS names(old_name, new_name)
WHERE legacy_budget."product" = names.old_name;
