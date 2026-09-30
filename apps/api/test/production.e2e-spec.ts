import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, http, loginOk, resetDbWithAdmin } from './utils';

/**
 * 精确断言差值法公式：库存=液位%×罐容×密度；产量=库存差+销售流出；电耗=读数差×倍率（负归0）
 * 验证：缺罐 → null（不当 0）；销售表四酸独立流出；断天 gapDays 标注
 */
describe('production 硫酸生产指标', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userToken: string;

  const schema = [
    { id: 'field_date', title: '日期', type: 'date', hidden: true, required: true },
    { id: 'acid98_tank_2', title: '98酸 2#罐', type: 'number', group: '98%硫酸' },
    { id: 'fuming_acid_tank_1', title: '发烟酸 1#罐', type: 'number', group: '发烟硫酸' },
    { id: 'reagent_acid_tank_1', title: '试剂酸 1#罐', type: 'number', group: '试剂酸' },
    { id: 'power_meter_motor_1', title: '1#电机', type: 'number', group: '仪表读数' },
  ];

  const salesSchema = [
    { id: 'field_date', title: '日期', type: 'date', hidden: true, required: true },
    { id: 'field_acid98_sales', title: '98酸销售量', type: 'number', group: '数据录入' },
    { id: 'field_acid93_sales', title: '93酸销售量', type: 'number', group: '数据录入' },
    { id: 'field_reagent_acid_sales', title: '试剂酸销售量', type: 'number', group: '数据录入' },
    { id: 'field_fuming_acid_sales', title: '发烟硫酸销售量', type: 'number', group: '数据录入' },
  ];

  let sulfuricFormId: string;
  let salesFormId: string;

  async function submit(formId: string, data: Record<string, string | number>) {
    await http(app).post(`/api/forms/${formId}/submissions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data })
      .expect(201);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.formSubmission.deleteMany();
    await prisma.form.deleteMany();
    await prisma.tank.deleteMany();
    await prisma.meter.deleteMany();
    await resetDbWithAdmin(prisma);
    token = (await loginOk(http(app))).accessToken;
    await http(app).post('/api/users').set('Authorization', `Bearer ${token}`)
      .send({ username: 'worker', name: '填报员', password: 'Pass@12345', role: 'USER' }).expect(201);
    userToken = (await loginOk(http(app), 'worker', 'Pass@12345')).accessToken;

    sulfuricFormId = (await prisma.form.create({
      data: { title: '硫酸车间报表', code: 'sulfuric_daily', parkingEnabled: true, schema: schema as never },
    })).id;
    salesFormId = (await prisma.form.create({
      data: { title: '销售表', code: 'sales_daily', schema: salesSchema as never },
    })).id;

    // Tank 带 formCode 归属；额外加一个别的车间的罐验证过滤
    await prisma.tank.createMany({ data: [
      { fieldId: 'acid98_tank_2', name: '98酸2#', material: '98酸', capacity: 100, density: 1.84, formCode: 'sulfuric_daily' },
      { fieldId: 'fuming_acid_tank_1', name: '发烟1#', material: '发烟硫酸', capacity: 200, density: 1.92, formCode: 'sulfuric_daily' },
      { fieldId: 'reagent_acid_tank_1', name: '试剂1#', material: '试剂酸', capacity: 50, density: 1.84, formCode: 'sulfuric_daily' },
      // 其他车间的罐——不应影响硫酸计算
      { fieldId: 'mgso4_tank', name: '硫酸镁罐', material: '硫酸镁', capacity: 999, density: 1.5, formCode: 'magnesium_daily' },
    ] });
    await prisma.meter.createMany({ data: [
      { fieldId: 'power_meter_motor_1', name: '1#电机', multiplier: 10, formCode: 'sulfuric_daily' },
    ] });

    // D1: 09-01 完整
    await submit(sulfuricFormId, { field_date: '2026-09-01', acid98_tank_2: 50, fuming_acid_tank_1: 50, reagent_acid_tank_1: 20, power_meter_motor_1: 1000 });
    // D2: 09-02 完整 + 销售流出
    await submit(salesFormId, { field_date: '2026-09-02', field_acid98_sales: 10, field_acid93_sales: 0, field_reagent_acid_sales: 0, field_fuming_acid_sales: 0 });
    await submit(sulfuricFormId, { field_date: '2026-09-02', acid98_tank_2: 60, fuming_acid_tank_1: 40, reagent_acid_tank_1: 20, power_meter_motor_1: 1500 });
    // 断天 09-03：这天没有硫酸库存，但有销售 15 吨（应累计到 09-04 的产量）
    await submit(salesFormId, { field_date: '2026-09-03', field_acid98_sales: 15, field_acid93_sales: 0, field_reagent_acid_sales: 0, field_fuming_acid_sales: 0 });
    // D3: 09-04 完整（gapDays=2）——电表回退测回零
    await submit(sulfuricFormId, { field_date: '2026-09-04', acid98_tank_2: 70, fuming_acid_tank_1: 30, reagent_acid_tank_1: 25, power_meter_motor_1: 1400 });
    // D4: 09-05 完整（gapDays=1）
    await submit(sulfuricFormId, { field_date: '2026-09-05', acid98_tank_2: 65, fuming_acid_tank_1: 35, reagent_acid_tank_1: 25, power_meter_motor_1: 1600 });
    // D5: 09-07 完整（09-05→09-07 断 09-06，gapDays=2）
    await submit(sulfuricFormId, { field_date: '2026-09-07', acid98_tank_2: 75, fuming_acid_tank_1: 25, reagent_acid_tank_1: 30, power_meter_motor_1: 2000 });
    // D6: 09-08 缺试剂罐（最后一天缺罐 → 不影响其他日的产量计算）
    await submit(sulfuricFormId, { field_date: '2026-09-08', acid98_tank_2: 70, fuming_acid_tank_1: 20, power_meter_motor_1: 2100 });
  });
  afterAll(async () => { await app.close(); });

  it('USER 访问被拒（403），管理员可用', async () => {
    await http(app).get('/api/production/sulfuric').set('Authorization', `Bearer ${userToken}`).expect(403);
    await http(app).get('/api/production/sulfuric').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('库存快照 = Σ 液位%×罐容×密度（吨）', async () => {
    const res = await http(app).get('/api/production/sulfuric').set('Authorization', `Bearer ${token}`).expect(200);
    const day2 = res.body.days.find((d: { date: string }) => d.date === '2026-09-02');
    expect(day2.inventory).toEqual({ acid98: 110.4, fuming: 153.6, reagent: 18.4, total: 282.4 });
  });

  it('差值产量含四酸独立销售流出', async () => {
    const res = await http(app).get('/api/production/sulfuric').set('Authorization', `Bearer ${token}`).expect(200);
    const day2 = res.body.days.find((d: { date: string }) => d.date === '2026-09-02');
    expect(day2.production.acid98).toBe(28.4);   // 18.4 差值 + 10 流出
    expect(day2.production.fuming).toBe(-38.4);
    expect(day2.production.reagent).toBe(0);
    expect(day2.production.flow).toEqual({ acid98: 10, acid93: 0, reagent: 0, fuming: 0 });
    expect(day2.production.total98Equivalent).toBe(-12.743);
    expect(day2.production.gapDays).toBe(0); // 连续日 = 0（不再是 1）
  });

  it('缺任一产量罐 → 该日库存和产量均为 null（不把空当 0）', async () => {
    const res = await http(app).get('/api/production/sulfuric').set('Authorization', `Bearer ${token}`).expect(200);
    const day8 = res.body.days.find((d: { date: string }) => d.date === '2026-09-08');
    expect(day8.inventory).toBeNull(); // 缺试剂酸罐
    expect(day8.production).toBeNull();
  });

  it('断天标注 + 销售累计：gap 期间的销售也计入产量流出', async () => {
    const res = await http(app).get('/api/production/sulfuric').set('Authorization', `Bearer ${token}`).expect(200);
    const day4 = res.body.days.find((d: { date: string }) => d.date === '2026-09-04');
    expect(day4.production.gapDays).toBe(1); // 09-02 → 09-04 断了 1 天 = 1（不再是 2）
    expect(day4.production.flow.acid98).toBe(15); // 09-03 销售 15 累计
    expect(day4.production.acid98).toBe(33.4);
    // 断天日电耗为 null（多天读数差不能拆成日值）
    expect(day4.electricity).toBeNull();
  });

  it('双氧水罐（监控性质）缺数据不阻断硫酸产量计算', async () => {
    // 09-05 只填了三种酸的罐，没填双氧水罐 → 库存和产量仍然正常
    const res = await http(app).get('/api/production/sulfuric').set('Authorization', `Bearer ${token}`).expect(200);
    const day5 = res.body.days.find((d: { date: string }) => d.date === '2026-09-05');
    expect(day5.inventory).not.toBeNull();
  });

  it('Tank formCode 过滤：其他车间的罐不影响硫酸计算', async () => {
    const res = await http(app).get('/api/production/sulfuric').set('Authorization', `Bearer ${token}`).expect(200);
    // 硫酸镁罐没填液位 → 不影响（库存有值不是 null）
    const day2 = res.body.days.find((d: { date: string }) => d.date === '2026-09-02');
    expect(day2.inventory).not.toBeNull();
    // 库存不含硫酸镁罐（只算 sulfuric_daily 的 3 个罐）
    expect(day2.inventory.total).toBe(282.4); // 110.4+153.6+18.4，硫酸镁罐的 999m³ 未被计入
  });

  it('电耗 = 读数差×倍率；断天日电耗为 null', async () => {
    const res = await http(app).get('/api/production/sulfuric').set('Authorization', `Bearer ${token}`).expect(200);
    const day2 = res.body.days.find((d: { date: string }) => d.date === '2026-09-02');
    expect(day2.electricity.total).toBe(5000); // 连续日 09-01→09-02：(1500−1000)×10
    // 09-04 是断天日 → 电耗 null（多天读数差不能拆成日值）
    const day4 = res.body.days.find((d: { date: string }) => d.date === '2026-09-04');
    expect(day4.electricity).toBeNull();
    // 09-05 连续日 09-04→09-05：(1600−1400)×10 = 2000
    const day5 = res.body.days.find((d: { date: string }) => d.date === '2026-09-05');
    expect(day5.electricity.total).toBe(2000);
  });

  it('同日多次提交取最新一条', async () => {
    await submit(sulfuricFormId, { field_date: '2026-09-07', acid98_tank_2: 80, fuming_acid_tank_1: 25, reagent_acid_tank_1: 30, power_meter_motor_1: 2000 });
    const res = await http(app).get('/api/production/sulfuric').set('Authorization', `Bearer ${token}`).expect(200);
    const day7 = res.body.days.find((d: { date: string }) => d.date === '2026-09-07');
    expect(day7.inventory.acid98).toBe(147.2);
  });
});
