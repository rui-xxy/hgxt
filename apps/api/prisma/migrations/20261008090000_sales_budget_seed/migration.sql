-- 用户提供的 2026 年 9 月、10 月销售预算。合计由明细计算，不单独存储。
INSERT INTO "SalesBudget" ("id", "year", "product", "months", "updatedAt") VALUES
  (gen_random_uuid()::text, 2026, '98%硫酸',      '{"9":4500,"10":1000}'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 2026, '烟酸',          '{"9":10700,"10":2260}'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 2026, '优质酸',        '{"9":6000,"10":3136}'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 2026, '蒸汽',          '{"9":14900,"10":5560}'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 2026, '氨基磺酸',      '{"9":1434,"10":1813}'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 2026, '硫酸镁',        '{"9":3000,"10":2800}'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 2026, '水滑石',        '{"9":542,"10":554}'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 2026, '蒽醌精品',      '{"9":60,"10":60}'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 2026, '焦磷酸哌嗪',    '{"9":175,"10":200}'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 2026, '无卤阻燃剂',    '{"9":35,"10":45}'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 2026, '阻燃母粒',      '{"9":170,"10":105}'::jsonb, CURRENT_TIMESTAMP);
