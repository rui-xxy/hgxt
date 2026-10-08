import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { OverviewService } from '../src/production/overview.service';
import { createTestApp, http, loginOk, resetDbWithAdmin } from './utils';
import { parsePlanUpperLimit, PLAN_TARGET_CATALOG } from '@hgxt/shared';

/**
 * 计划与完成的口径护栏：
 * 1. 年度坐标系：查 2025 时 asOf / 当月实际 / 周对比必须落在 2025，绝不混入 2026 最新数据
 * 2. 年度与月度计划分别录入，未填写的月份保持为空
 * 3. 保存是单事务：非法行整体 400 且库里不留半截
 * 4. 单耗指标覆盖看板全部能源与原辅料，上限独立设置；旧区间只取上限
 */
describe('production 计划与完成', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const schema = [
    { id: 'field_date', title: '日期', type: 'date', hidden: true, required: true },
    { id: 'field_production', title: '氨基磺酸产量', type: 'number', group: '生产' },
  ];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.formSubmission.deleteMany();
    await prisma.form.deleteMany();
    await prisma.productionPlan.deleteMany();
    await prisma.consumptionTarget.deleteMany();
    await prisma.salesBudget.deleteMany();
    await resetDbWithAdmin(prisma);
    token = (await loginOk(http(app))).accessToken;

    // 看板依赖硫酸表单与销售表单（sulfuricSummary 在缺表时抛 404）；测试库只需空壳
    await prisma.form.create({
      data: { title: '硫酸车间报表', code: 'sulfuric_daily', schema: [
        { id: 'field_date', title: '日期', type: 'date', hidden: true, required: true },
      ] as never },
    });
    const sales = await prisma.form.create({
      data: { title: '销售表', code: 'sales_daily', schema: [
        { id: 'field_date', title: '日期', type: 'date', hidden: true, required: true },
        { id: 'field_acid98_sales', title: '98酸销量', type: 'number', group: '销售' },
        { id: 'field_fuming_acid_sales', title: '发烟硫酸销量', type: 'number', group: '销售' },
        { id: 'field_reagent_acid_sales', title: '试剂酸销量', type: 'number', group: '销售' },
      ] as never },
    });
    const thermal = await prisma.form.create({
      data: { title: '热电车间报表', code: 'thermal_daily', schema: [
        { id: 'field_date', title: '日期', type: 'date', hidden: true, required: true },
      ] as never },
    });
    const finished = await prisma.form.create({
      data: { title: '产成品表', code: 'finished_products_daily', schema: [
        { id: 'field_date', title: '日期', type: 'date', hidden: true, required: true },
        { id: 'field_amino_sales', title: '氨基磺酸销量', type: 'number', group: '氨基磺酸' },
        { id: 'field_amino_stock', title: '氨基磺酸库存', type: 'number', group: '氨基磺酸' },
      ] as never },
    });

    const amino = await prisma.form.create({
      data: { title: '氨基磺酸车间生产日报', code: 'aminosulfonic_daily', schema: schema as never },
    });
    // 2025 年最后一天 与 2026 年第一天各一条：查 2025 绝不能把 2026 的量算进来
    const submit = async (date: string, production: number): Promise<void> => {
      await http(app).post(`/api/forms/${amino.id}/submissions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ data: { field_date: date, field_production: production } })
        .expect(201);
    };
    await submit('2025-12-28', 10);
    await submit('2025-12-29', 11);
    await submit('2026-01-02', 99);

    const submitForm = async (formId: string, data: Record<string, unknown>): Promise<void> => {
      await http(app).post(`/api/forms/${formId}/submissions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ data })
        .expect(201);
    };
    // 销量/产成品同样是填报日 D 归属 D-1；历史年度必须取 2025 的值，不得串 2026 最新库存。
    await submitForm(sales.id, { field_date: '2025-12-29', field_acid98_sales: 5,
      field_fuming_acid_sales: 7, field_reagent_acid_sales: 3 });
    await submitForm(sales.id, { field_date: '2026-01-02', field_acid98_sales: 500 });
    await submitForm(finished.id, { field_date: '2025-12-29', field_amino_sales: 4, field_amino_stock: 50 });
    await submitForm(finished.id, { field_date: '2026-01-02', field_amino_sales: 400, field_amino_stock: 999 });
    await prisma.formSubmission.createMany({ data: [
      { formId: thermal.id, data: { field_date: '2025-12-28', field_jianheng_steam: 100,
        field_xuguang_steam: 100, field_xinkesi_steam: 100, field_lihong_steam: 100,
        field_xiangshuo_steam: 100, field_fenglian_steam: 100, field_amino_steam: 100 } },
      { formId: thermal.id, data: { field_date: '2025-12-29', field_jianheng_steam: 101,
        field_xuguang_steam: 102, field_xinkesi_steam: 103, field_lihong_steam: 104,
        field_xiangshuo_steam: 105, field_fenglian_steam: 106, field_amino_steam: 200 } },
    ] });
  });
  afterAll(async () => { await app.close(); });

  it('年度坐标系：2025 看板的 asOf/月实际/年累计都落在 2025，不混入 2026', async () => {
    await http(app).post('/api/production/plan/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        year: 2025,
        rows: [{ workshop: '氨基磺酸', annual: 120, months: Array.from({ length: 12 }, () => null) }],
        targets: [],
      })
      .expect(201);

    const res = await http(app).get('/api/production/plan?year=2025')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const amino = res.body.completion.find((r: { workshop: string }) => r.workshop === '氨基磺酸');
    // 车间序列按归属日（=填报日 − 1）取数：12-28/12-29 填报 → 归属 12-27/12-28
    expect(res.body.asOf).toBe('2025-12-28');
    expect(amino.monthActual).toBe(21); // 12 月两天 10+11，不含 2026-01-02 的 99
    expect(amino.yearActual).toBe(21);
    expect(amino.monthPlan).toBeNull(); // 年度计划不会自动生成月度计划
    expect(res.body.timeProgress.pct).toBe(100); // 已结束年度
    const aminoSales = res.body.sales.find((r: { workshop: string }) => r.workshop === '氨基磺酸');
    expect(aminoSales.sales).toBe(4); // 12-29 填报归属 12-28；2026-01-02 的 400 不得混入
    expect(aminoSales.inventory).toBe(50); // 历史库存与 asOf 对齐，不得拿 2026 最新 999
    expect(aminoSales.inventoryDays).toBe(350); // 50 ÷ (4 / 28)，按当月截至 asOf 的 28 天算日均
    const aminoWeek = res.body.week.find((r: { workshop: string }) => r.workshop === '氨基磺酸');
    expect(aminoWeek.productionDailyThis).toHaveLength(7);
    expect(aminoWeek.productionDailyLast).toHaveLength(7);
    expect(aminoWeek.productionDailyThis).toEqual([0, 0, 0, 0, 0, 10, 11]);
    expect(aminoWeek.salesDailyThis).toEqual([0, 0, 0, 0, 0, 0, 4]);
  });

  it('2026 看板只含 2026 数据', async () => {
    const res = await http(app).get('/api/production/plan?year=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const amino = res.body.completion.find((r: { workshop: string }) => r.workshop === '氨基磺酸');
    expect(res.body.asOf).toBe('2026-01-01'); // 01-02 填报 → 归属 01-01
    expect(amino.yearActual).toBe(99);
  });

  it('年度计划不自动拆到月份；只汇总已填写的月计划', async () => {
    const res = await http(app).get('/api/production/plan/settings?year=2025')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row = res.body.rows.find((r: { workshop: string }) => r.workshop === '氨基磺酸');
    expect(row.annual).toBe(120);
    expect(row.months).toEqual(Array.from({ length: 12 }, () => null));
    expect(row.monthTotal).toBe(0);

    const months = Array.from({ length: 12 }, () => null) as Array<number | null>;
    months[0] = 12;
    months[11] = 20;
    const saved = await http(app).post('/api/production/plan/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2025, rows: [{ workshop: '氨基磺酸', annual: 240, months }], targets: [] })
      .expect(201);
    const updated = saved.body.rows.find((r: { workshop: string }) => r.workshop === '氨基磺酸');
    expect(updated.annual).toBe(240);
    expect(updated.months).toEqual(months);
    expect(updated.monthTotal).toBe(32);

    const board = await http(app).get('/api/production/plan?year=2025')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const amino = board.body.completion.find((r: { workshop: string }) => r.workshop === '氨基磺酸');
    expect(amino.monthPlan).toBe(20);
    expect(amino.months[0].plan).toBe(12);
    expect(amino.months[1].plan).toBeNull();
  });

  it('月计划独立生效：年度计划为 0 时，手工月计划仍进入计划与完成', async () => {
    const months = Array.from({ length: 12 }, () => null) as Array<number | null>;
    months[11] = 30;
    await http(app).post('/api/production/plan/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2025, rows: [{ workshop: '氨基磺酸', annual: 0, months }], targets: [] })
      .expect(201);

    const board = await http(app).get('/api/production/plan?year=2025')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const amino = board.body.completion.find((r: { workshop: string }) => r.workshop === '氨基磺酸');
    expect(amino.yearPlan).toBe(0);
    expect(amino.yearRate).toBeNull();
    expect(amino.monthPlan).toBe(30);
    expect(amino.monthRate).toBe(70);
    expect(amino.months[11].plan).toBe(30);
  });

  it('销售预算按产品和月份保存，并与同一归属期的销量对应', async () => {
    const months = Array.from({ length: 12 }, () => null) as Array<number | null>;
    months[11] = 40;
    await http(app).post('/api/production/plan/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        year: 2025,
        rows: [{ workshop: '氨基磺酸', annual: 0, months: Array.from({ length: 12 }, () => null) }],
        targets: [],
        salesBudgets: [{ product: '氨基磺酸', months }],
      })
      .expect(201);

    const settings = await http(app).get('/api/production/plan/settings?year=2025')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(settings.body.salesBudgets.find((row: { product: string }) => row.product === '氨基磺酸').months).toEqual(months);

    const brief = await http(app).get('/api/production/brief?year=2025')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const december = brief.body.productSalesHistory.months.find((period: { key: string }) => period.key === '2025-12');
    const amino = december.rows.find((row: { product: string }) => row.product === '氨基磺酸');
    expect(amino).toMatchObject({ budget: 40, sales: 4 });
    expect(brief.body.productSalesHistory.months[0].rows.find((row: { product: string }) => row.product === '氨基磺酸').budget).toBeNull();

    await http(app).post('/api/production/plan/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2025, rows: [{ workshop: '氨基磺酸', annual: 0, months: Array.from({ length: 12 }, () => null) }], targets: [], salesBudgets: [{ product: '未知产品', months }] })
      .expect(400);
    expect((await prisma.salesBudget.findUnique({ where: { year_product: { year: 2025, product: '氨基磺酸' } } }))?.months).toEqual({ '1': null, '2': null, '3': null, '4': null, '5': null, '6': null, '7': null, '8': null, '9': null, '10': null, '11': null, '12': 40 });
  });

  it('旧预算名称保留金额，发烟硫酸、试剂酸和外供蒸汽销量按统一口径统计', async () => {
    for (const [product, budget] of [['烟酸', 70], ['优质酸', 30], ['蒸汽', 210]] as const) {
      await prisma.salesBudget.create({ data: { year: 2025, product, months: { '12': budget } } });
    }

    const settings = await http(app).get('/api/production/plan/settings?year=2025')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const budgets = new Map(settings.body.salesBudgets.map((row: { product: string; months: Array<number | null> }) => [row.product, row.months[11]]));
    expect(budgets.get('发烟硫酸')).toBe(70);
    expect(budgets.get('试剂酸')).toBe(30);
    expect(budgets.get('外供蒸汽')).toBe(210);
    expect(budgets.has('烟酸')).toBe(false);
    expect(budgets.has('优质酸')).toBe(false);
    expect(budgets.has('蒸汽')).toBe(false);

    const brief = await http(app).get('/api/production/brief?year=2025')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const december = brief.body.productSalesHistory.months.find((period: { key: string }) => period.key === '2025-12');
    const rowOf = (product: string) => december.rows.find((row: { product: string }) => row.product === product);
    expect(rowOf('发烟硫酸')).toMatchObject({ budget: 70, sales: 7 });
    expect(rowOf('试剂酸')).toMatchObject({ budget: 30, sales: 3 });
    expect(rowOf('外供蒸汽')).toMatchObject({ budget: 210, sales: 21 });

    const months = Array.from({ length: 12 }, () => null) as Array<number | null>;
    months[11] = 71;
    await http(app).post('/api/production/plan/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2025, rows: [{ workshop: '氨基磺酸', annual: 0,
        months: Array.from({ length: 12 }, () => null) }], salesBudgets: [{ product: '发烟硫酸', months }] })
      .expect(201);
    expect(await prisma.salesBudget.findUnique({ where: { year_product: { year: 2025, product: '烟酸' } } })).toBeNull();
    expect((await prisma.salesBudget.findUnique({ where: { year_product: { year: 2025, product: '发烟硫酸' } } }))?.months)
      .toMatchObject({ '12': 71 });
  });

  it('保存校验：非法车间 / months 长度错 → 400，且库里不留半截', async () => {
    const before = await prisma.productionPlan.count();
    await http(app).post('/api/production/plan/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        year: 2025,
        rows: [
          { workshop: '氨基磺酸', annual: 200, months: Array.from({ length: 12 }, () => null) },
          { workshop: '不存在的车间', annual: 1, months: Array.from({ length: 12 }, () => null) },
        ],
        targets: [],
      })
      .expect(400);
    await http(app).post('/api/production/plan/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2025, rows: [{ workshop: '氨基磺酸', annual: 200, months: [1, 2, 3] }], targets: [] })
      .expect(400);
    await http(app).post('/api/production/plan/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2025, rows: [{ workshop: '氨基磺酸', annual: 200.5, months: Array.from({ length: 12 }, () => null) }], targets: [] })
      .expect(400);
    expect(await prisma.productionPlan.count()).toBe(before); // 校验失败的行一条都没落库
  });

  it('每车间列出实际单耗指标，只保存正数上限，旧区间仅使用上限', async () => {
    expect(parsePlanUpperLimit('85 – 95')).toBe(95);
    expect(parsePlanUpperLimit('≤ 0.660')).toBe(0.66);
    expect(parsePlanUpperLimit('乱填 abc')).toBeNull();

    const saveLimit = (target: string) => http(app).post('/api/production/plan/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        year: 2026,
        rows: [{ workshop: '硫酸', annual: 1000, months: Array.from({ length: 12 }, () => null) }],
        targets: [{ workshop: '硫酸', material: '电', unit: 'kWh/t', target }],
      });
    await saveLimit('92').expect(201);
    await saveLimit('85 – 95').expect(400);
    await saveLimit('0').expect(400);

    const board = await http(app).get('/api/production/plan?year=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const electricity = board.body.energyConsumption.find(
      (r: { workshop: string; material: string }) => r.workshop === '硫酸' && r.material === '电',
    );
    expect(electricity.target).toBe('≤ 92');
    expect(electricity.targetMax).toBe(92);
    const keyOf = (row: { workshop: string; material: string }) => `${row.workshop}|${row.material}`;
    expect(new Set([...board.body.energyConsumption, ...board.body.materialConsumption].map(keyOf)))
      .toEqual(new Set(PLAN_TARGET_CATALOG.map(keyOf)));

    const settings = await http(app).get('/api/production/plan/settings?year=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(settings.body.targets.map(keyOf)).toEqual(PLAN_TARGET_CATALOG.map(keyOf));
    expect(settings.body.targets.find((t: { workshop: string; material: string }) => t.workshop === '硫酸' && t.material === '电').target).toBe('92');
    expect(settings.body.targets.find((t: { workshop: string; material: string }) => t.workshop === '氨基磺酸' && t.material === '发烟硫酸').target).toBe('');

    await prisma.consumptionTarget.update({ where: { workshop_material: { workshop: '硫酸', material: '电' } }, data: { target: '85 – 95' } });
    const legacy = await http(app).get('/api/production/plan/settings?year=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(legacy.body.targets.find((t: { workshop: string; material: string }) => t.workshop === '硫酸' && t.material === '电').target).toBe('95');
    const legacyBoard = await http(app).get('/api/production/plan?year=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(legacyBoard.body.energyConsumption.find((row: { workshop: string; material: string }) => row.workshop === '硫酸' && row.material === '电').targetMax).toBe(95);

    await saveLimit('').expect(201);
    const cleared = await http(app).get('/api/production/plan/settings?year=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(cleared.body.targets.find((t: { workshop: string; material: string }) => t.workshop === '硫酸' && t.material === '电').target).toBe('');
    const clearedBoard = await http(app).get('/api/production/plan?year=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(clearedBoard.body.energyConsumption.find((row: { workshop: string; material: string }) => row.workshop === '硫酸' && row.material === '电').target).toBeNull();
  });

  it('蒽醌计划的产量、销量和库存都汇总粗品与精品', async () => {
    const anthra = await prisma.form.create({
      data: {
        title: '蒽醌生产部生产报表',
        code: 'anthraquinone_daily',
        schema: [
          { id: 'field_date', title: '日期', type: 'date', hidden: true, required: true },
          { id: 'field_crude_output', title: '粗品产量', type: 'number' },
          { id: 'field_crude_sales', title: '粗品销量', type: 'number' },
          { id: 'field_crude_stock', title: '粗品库存', type: 'number' },
          { id: 'field_fine_output', title: '精品产量', type: 'number' },
          { id: 'field_fine_sales', title: '精品销量', type: 'number' },
          { id: 'field_fine_stock', title: '精品库存', type: 'number' },
        ] as never,
      },
    });
    await prisma.formSubmission.create({
      data: {
        formId: anthra.id,
        data: {
          field_date: '2026-09-10',
          field_crude_output: 14,
          field_crude_sales: 3,
          field_crude_stock: 7,
          field_fine_output: 68.995,
          field_fine_sales: 20,
          field_fine_stock: 8,
        },
      },
    });

    const res = await http(app).get('/api/production/plan?year=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const completion = res.body.completion.find((row: { workshop: string }) => row.workshop === '二乙基蒽醌');
    const week = res.body.week.find((row: { workshop: string }) => row.workshop === '二乙基蒽醌');
    const sales = res.body.sales.find((row: { workshop: string }) => row.workshop === '二乙基蒽醌');
    expect(res.body.asOf).toBe('2026-09-10');
    expect(completion.basis).toBe('总产量');
    expect(completion.months[8].actual).toBe(82.995);
    expect(completion.yearActual).toBe(82.995);
    expect(week.productionThis).toBe(82.995);
    expect(sales.production).toBe(82.995);
    expect(sales.sales).toBe(23);
    expect(sales.inventory).toBe(15);
  });

  it('丰联按 Excel 行日期统计干料打包数、销量和库存', async () => {
    const fenglian = await prisma.form.create({
      data: { title: '丰联报表', code: 'fenglian_daily', schema: [
        { id: 'field_date', title: '日期', type: 'date', hidden: true, required: true },
        { id: 'field_204', title: '焦磷酸哌嗪打包数', type: 'number' },
        { id: 'field_205', title: '焦磷酸哌嗪销量', type: 'number' },
        { id: 'field_206', title: '焦磷酸哌嗪成品库存', type: 'number' },
      ] as never },
    });
    await prisma.formSubmission.create({
      data: { formId: fenglian.id, data: {
        field_date: '2026-09-11', field_204: 9, field_205: 28, field_206: 43.9,
      } },
    });
    await prisma.formSubmission.create({
      data: { formId: fenglian.id, data: { field_date: '2026-05-13', field_005: 14 } },
    });
    const byDate = await app.get(OverviewService).byDate('fenglian_daily');
    expect(byDate.has('2026-05-12')).toBe(true);
    expect(byDate.has('2026-09-11')).toBe(true);
    const res = await http(app).get('/api/production/plan?year=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const completion = res.body.completion.find((row: { workshop: string }) => row.workshop === '丰联');
    const sales = res.body.sales.find((row: { workshop: string }) => row.workshop === '丰联');
    expect(res.body.asOf).toBe('2026-09-11');
    expect(completion.months[8].actual).toBe(9);
    expect(sales.production).toBe(9);
    expect(sales.sales).toBe(28);
    expect(sales.inventory).toBe(43.9);
    const detail = await http(app).get('/api/production/fenglian?days=0')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.days.find((day: { date: string }) => day.date === '2026-09-11').values).toMatchObject({
      field_204: 9, field_205: 28, field_206: 43.9,
    });
    expect(detail.body.days.find((day: { date: string }) => day.date === '2026-05-12')).toBeTruthy();
  });
});
