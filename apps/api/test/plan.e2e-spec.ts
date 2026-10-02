import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, http, loginOk, resetDbWithAdmin } from './utils';
import { parsePlanTarget, planTargetDeviation } from '@hgxt/shared';

/**
 * 计划与完成的口径护栏：
 * 1. 年度坐标系：查 2025 时 asOf / 当月实际 / 周对比必须落在 2025，绝不混入 2026 最新数据
 * 2. 自动拆分：月合计严格等于年度计划（largest-remainder）
 * 3. 保存是单事务：非法行整体 400 且库里不留半截
 * 4. 单耗目标区间（85 – 95）：低于下限、高于上限、区间内三种偏离
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
    await submitForm(sales.id, { field_date: '2025-12-29', field_acid98_sales: 5 });
    await submitForm(sales.id, { field_date: '2026-01-02', field_acid98_sales: 500 });
    await submitForm(finished.id, { field_date: '2025-12-29', field_amino_sales: 4, field_amino_stock: 50 });
    await submitForm(finished.id, { field_date: '2026-01-02', field_amino_sales: 400, field_amino_stock: 999 });
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
    expect(amino.monthPlan).toBe(10); // 120 × 31/365 → largest-remainder
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

  it('自动拆分：12 个月合计严格等于年度计划', async () => {
    const res = await http(app).get('/api/production/plan/settings?year=2025')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row = res.body.rows.find((r: { workshop: string }) => r.workshop === '氨基磺酸');
    expect(row.months.every((m: { manual: boolean }) => !m.manual)).toBe(true);
    expect(row.monthTotal).toBe(120);
    expect(row.months.reduce((s: number, m: { value: number }) => s + m.value, 0)).toBe(120);
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

  it('单耗目标区间语义：区间内偏离 0、超上限为正、低于下限为负', async () => {
    const range = parsePlanTarget('85 – 95');
    expect(range).toEqual({ min: 85, max: 95 });
    expect(planTargetDeviation(90, range)).toBe(0);
    expect(planTargetDeviation(100, range)).toBe(5.3);
    expect(planTargetDeviation(80, range)).toBe(-5.9);
    expect(parsePlanTarget('乱填 abc')).toEqual({ min: null, max: null });

    await http(app).post('/api/production/plan/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        year: 2026,
        rows: [{ workshop: '硫酸', annual: 1000, months: Array.from({ length: 12 }, () => null) }],
        targets: [{ workshop: '硫酸', material: '电', unit: 'kWh/t', target: '85 – 95' }],
      })
      .expect(201);

    await http(app).post('/api/production/plan/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        year: 2026,
        rows: [{ workshop: '硫酸', annual: 1000, months: Array.from({ length: 12 }, () => null) }],
        targets: [{ workshop: '硫酸', material: '电', unit: 'kWh/t', target: '乱填 abc' }],
      })
      .expect(400);

    const res = await http(app).get('/api/production/plan?year=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const electricity = res.body.energyConsumption.find(
      (r: { workshop: string; material: string }) => r.workshop === '硫酸' && r.material === '电',
    );
    expect(electricity.targetMin).toBe(85);
    expect(electricity.targetMax).toBe(95);

    const settings = await http(app).get('/api/production/plan/settings?year=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(settings.body.targets.find((t: { workshop: string; material: string }) => t.workshop === '硫酸' && t.material === '电').target).toBe('85 – 95');
    expect(settings.body.targets.some((t: { workshop: string; material: string }) => t.workshop === '氨基磺酸' && t.material === '尿素')).toBe(true);
  });
});
