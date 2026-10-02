import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import schema from '../form-schemas/matters-2026.json';
import { importMatters } from '../import-matters';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('缺少 DATABASE_URL');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const form = await prisma.form.upsert({
    where: { code: 'matters_2026' },
    update: { category: '总经办', entryMode: 'sheet' },
    create: {
      code: 'matters_2026',
      title: '2026年事项表',
      category: '总经办',
      entryMode: 'sheet',
      description: '事项跟踪表',
      schema,
    },
  });
  const imported = await importMatters(prisma, form.id);
  console.log(imported ? `已导入 ${imported} 条事项` : '事项表已有数据，未覆盖现有修改');
  // 只迁移已经确认同义的旧称；其他历史部门保留原文。
  const renamed = await prisma.$executeRaw`
    UPDATE "FormSubmission"
    SET data = jsonb_set(data, '{department}', to_jsonb(replace(data->>'department', '2-EAQ生产部', '二乙基蒽醌生产部')), true)
    WHERE "formId" = ${form.id} AND data->>'department' LIKE '%2-EAQ生产部%'
  `;
  if (renamed) console.log(`已统一 ${renamed} 条二乙基蒽醌部门名称`);

  const waterSlagRenamed = await prisma.$executeRaw`
    WITH normalized AS (
      SELECT submission.id,
        (
          SELECT string_agg(name, ',' ORDER BY first_position)
          FROM (
            SELECT name, min(position) AS first_position
            FROM (
              SELECT CASE WHEN btrim(part) = '新材料生产部' THEN '水滑石生产部' ELSE btrim(part) END AS name,
                position
              FROM regexp_split_to_table(submission.data->>'department', '[,，、]')
                WITH ORDINALITY AS parts(part, position)
            ) names
            WHERE name <> ''
            GROUP BY name
          ) unique_names
        ) AS department
      FROM "FormSubmission" submission
      WHERE submission."formId" = ${form.id}
        AND submission.data->>'department' LIKE '%新材料生产部%'
    )
    UPDATE "FormSubmission" submission
    SET data = jsonb_set(submission.data, '{department}', to_jsonb(normalized.department), true)
    FROM normalized
    WHERE submission.id = normalized.id
  `;
  if (waterSlagRenamed) console.log(`已统一 ${waterSlagRenamed} 条水滑石部门名称`);
}

void main().finally(() => prisma.$disconnect());
