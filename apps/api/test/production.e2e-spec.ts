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
    { id: 'tank_98-1', title: '98酸 2#罐', type: 'number', group: '98%硫酸' },
    { id: 'tank_fy-1', title: '发烟酸 1#罐', type: 'number', group: '发烟硫酸' },
    { id: 'tank_jp-1', title: '试剂酸 1#罐', type: 'number', group: '试剂酸' },
    { id: 'meter_3', title: '1#电机', type: 'number', group: '仪表读数' },
    { id: 'meter_amino', title: '氨基磺酸电表', type: 'number', group: '仪表读数' },
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
      { fieldId: 'tank_98-1', name: '98酸2#', material: '98酸', capacity: 100, density: 1.84, formCode: 'sulfuric_daily' },
      { fieldId: 'tank_fy-1', name: '发烟1#', material: '发烟硫酸', capacity: 200, density: 1.92, formCode: 'sulfuric_daily' },
      { fieldId: 'tank_jp-1', name: '试剂1#', material: '试剂酸', capacity: 50, density: 1.84, formCode: 'sulfuric_daily' },
      // 其他车间的罐——不应影响硫酸计算
      { fieldId: 'mgso4_tank', name: '硫酸镁罐', material: '硫酸镁', capacity: 999, density: 1.5, formCode: 'magnesium_daily' },
    ] });
    await prisma.meter.createMany({ data: [
      { fieldId: 'meter_3', name: '1#电机', multiplier: 10, formCode: 'sulfuric_daily' },
      { fieldId: 'meter_amino', name: '氨基磺酸电表', multiplier: 3000, formCode: 'sulfuric_daily' },
    ] });

    // D1: 09-01 完整
    await submit(sulfuricFormId, { field_date: '2026-09-01', 'tank_98-1': 50, 'tank_fy-1': 50, 'tank_jp-1': 20, 'meter_3': 1000, meter_amino: 100 });
    // D2: 09-02 完整 + 销售流出
    await submit(salesFormId, { field_date: '2026-09-02', field_acid98_sales: 10, field_acid93_sales: 0, field_reagent_acid_sales: 0, field_fuming_acid_sales: 0 });
    await submit(sulfuricFormId, { field_date: '2026-09-02', 'tank_98-1': 60, 'tank_fy-1': 40, 'tank_jp-1': 20, 'meter_3': 1500, meter_amino: 110 });
    // 断天 09-03：这天没有硫酸库存，但有销售 15 吨（应累计到 09-04 的产量）
    await submit(salesFormId, { field_date: '2026-09-03', field_acid98_sales: 15, field_acid93_sales: 0, field_reagent_acid_sales: 0, field_fuming_acid_sales: 0 });
    // D3: 09-04 完整（gapDays=2）——电表回退测回零
    await submit(sulfuricFormId, { field_date: '2026-09-04', 'tank_98-1': 70, 'tank_fy-1': 30, 'tank_jp-1': 25, 'meter_3': 1400 });
    // D4: 09-05 完整（gapDays=1）
    await submit(sulfuricFormId, { field_date: '2026-09-05', 'tank_98-1': 65, 'tank_fy-1': 35, 'tank_jp-1': 25, 'meter_3': 1600 });
    // D5: 09-07 完整（09-05→09-07 断 09-06，gapDays=2）
    await submit(sulfuricFormId, { field_date: '2026-09-07', 'tank_98-1': 75, 'tank_fy-1': 25, 'tank_jp-1': 30, 'meter_3': 2000 });
    // D6: 09-08 缺试剂罐（最后一天缺罐 → 不影响其他日的产量计算）
    await submit(sulfuricFormId, { field_date: '2026-09-08', 'tank_98-1': 70, 'tank_fy-1': 20, 'meter_3': 2100 });
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
    expect(day2.levels.find((level: { fieldId: string }) => level.fieldId === 'tank_98-1').levelPercent).toBe(60);
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
    expect(day2.production.calculation.previousReportDate).toBe('2026-09-01');
    const tankCalculation = day2.production.calculation.tanks.find((tank: { fieldId: string }) => tank.fieldId === 'tank_98-1');
    expect(tankCalculation).toMatchObject({
      previousLevelPercent: 50, currentLevelPercent: 60, capacity: 100, density: 1.84,
      previousTons: 92, currentTons: 110.4,
    });
    expect(tankCalculation.deltaTons).toBeCloseTo(18.4, 6);
    expect(day2.production.calculation.sales).toEqual([{
      date: '2026-09-02', values: { acid98: 10, acid93: 0, reagent: 0, fuming: 0 },
    }]);
  });

  it('缺任一产量罐 → 该日库存和产量均为 null（不把空当 0）', async () => {
    const res = await http(app).get('/api/production/sulfuric').set('Authorization', `Bearer ${token}`).expect(200);
    const day8 = res.body.days.find((d: { date: string }) => d.date === '2026-09-08');
    expect(day8.inventory).toBeNull(); // 缺试剂酸罐
    expect(day8.production).toBeNull();
    expect(day8.levels.find((level: { fieldId: string }) => level.fieldId === 'tank_jp-1').levelPercent).toBeNull();
  });

  it('断天标注 + 销售累计：gap 期间的销售也计入产量流出', async () => {
    const res = await http(app).get('/api/production/sulfuric').set('Authorization', `Bearer ${token}`).expect(200);
    const day4 = res.body.days.find((d: { date: string }) => d.date === '2026-09-04');
    expect(day4.production.gapDays).toBe(1); // 09-02 → 09-04 断了 1 天 = 1（不再是 2）
    expect(day4.production.flow.acid98).toBe(15); // 09-03 销售 15 累计
    expect(day4.production.acid98).toBe(33.4);
    expect(day4.production.calculation.sales.map((entry: { date: string }) => entry.date)).toEqual(['2026-09-03', '2026-09-04']);
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

  it('日用电含热电三台变压器，排除其他车间电表；水耗和双氧水耗用归属填报前一日', async () => {
    const thermal = await prisma.form.create({ data: {
      title: '热电车间', code: 'thermal_daily', schema: [
        { id: 'field_date', title: '日期', type: 'date', required: true },
        { id: 'field_transformer1', title: '1#变压器', type: 'number' },
        { id: 'field_transformer2', title: '2#变压器', type: 'number' },
        { id: 'field_transformer3', title: '3#变压器', type: 'number' },
        { id: 'field_water_meter', title: '总水表', type: 'number' },
      ] as never,
    } });
    const warehouse = await prisma.form.create({ data: {
      title: '原辅料', code: 'warehouse_daily', schema: [
        { id: 'field_date', title: '日期', type: 'date', required: true },
        { id: 'field_002', title: '双氧水耗用', type: 'number' },
        { id: 'field_016', title: '尿素购入', type: 'number' },
        { id: 'field_017', title: '尿素耗用', type: 'number' },
        { id: 'field_018', title: '尿素库存', type: 'number' },
      ] as never,
    } });
    await submit(thermal.id, { field_date: '2026-09-01', field_transformer1: 100, field_transformer2: 200, field_transformer3: 300, field_water_meter: 1000 });
    await submit(thermal.id, { field_date: '2026-09-02', field_transformer1: 102, field_transformer2: 203, field_transformer3: 304, field_water_meter: 1035 });
    await submit(warehouse.id, { field_date: '2026-09-02', field_002: 9.6 });

    const res = await http(app).get('/api/production/sulfuric').set('Authorization', `Bearer ${token}`).expect(200);
    const day = res.body.days.find((d: { date: string }) => d.date === '2026-09-02');
    expect(day.productionDate).toBe('2026-09-01');
    expect(day.electricity.total).toBe(23000); // 5000 + (2+3+4)×2000；氨基电表不计入
    expect(day.electricity.meters.map((m: { name: string }) => m.name)).not.toContain('氨基磺酸电表');
    expect(day.water).toBe(35);
    expect(day.peroxide).toBe(9.6);
    expect(res.body.days.find((d: { date: string }) => d.date === '2026-09-04').electricity).toBeNull();

    const energy = await http(app).get('/api/production/energy?days=0').set('Authorization', `Bearer ${token}`).expect(200);
    const index = energy.body.dates.indexOf('2026-09-01');
    expect(energy.body.electricity.workshops.find((item: { name: string }) => item.name === '硫酸').values[index]).toBe(23000);
  });

  it('同日多次提交取最新一条', async () => {
    await submit(sulfuricFormId, { field_date: '2026-09-07', 'tank_98-1': 80, 'tank_fy-1': 25, 'tank_jp-1': 30, 'meter_3': 2000 });
    const res = await http(app).get('/api/production/sulfuric').set('Authorization', `Bearer ${token}`).expect(200);
    const day7 = res.body.days.find((d: { date: string }) => d.date === '2026-09-07');
    expect(day7.inventory.acid98).toBe(147.2);
  });

  it('次日填报归属前一生产日，发烟酸产量计入两车间内部领用', async () => {
    const amino = await prisma.form.create({
      data: { title: '氨基磺酸', code: 'aminosulfonic_daily', schema: [
        { id: 'field_date', title: '日期', type: 'date', required: true },
        { id: 'field_production', title: '产量', type: 'number' },
        { id: 'field_urea', title: '尿素消耗', type: 'number' },
        { id: 'field_nitric_acid', title: '发烟硫酸消耗', type: 'number' },
        { id: 'field_steam_1', title: '蒸汽1#', type: 'number' },
        { id: 'field_steam_2', title: '蒸汽2#', type: 'number' },
        { id: 'field_steam_phase2', title: '二期蒸汽', type: 'number' },
        { id: 'field_water_meter', title: '水表', type: 'number' },
        { id: 'field_electricity_meter', title: '二期电表', type: 'number' },
      ] as never },
    });
    const anthraquinone = await prisma.form.create({
      data: { title: '蒽醌', code: 'anthraquinone_daily', schema: [
        { id: 'field_date', title: '日期', type: 'date', required: true },
        { id: 'field_fuming_sulfuric_flow', title: '发烟硫酸流量计', type: 'number' },
      ] as never },
    });
    await submit(amino.id, { field_date: '2026-09-02', field_nitric_acid: 2 });
    await submit(anthraquinone.id, { field_date: '2026-09-01', field_fuming_sulfuric_flow: 100 });
    await submit(anthraquinone.id, { field_date: '2026-09-02', field_fuming_sulfuric_flow: 103 });

    const res = await http(app).get('/api/production/sulfuric?days=0').set('Authorization', `Bearer ${token}`).expect(200);
    const day = res.body.days.find((d: { date: string }) => d.date === '2026-09-02');
    expect(day.productionDate).toBe('2026-09-01');
    expect(res.body.days.find((d: { date: string }) => d.date === '2026-09-01').productionDate).toBe('2026-08-31');
    expect(day.production.internalFuming).toEqual({ aminosulfonic: 3.84, anthraquinone: 5.76 });
    expect(day.production.calculation.aminosulfonic).toEqual([{ date: '2026-09-02', volumeM3: 2 }]);
    expect(day.production.calculation.anthraquinone).toEqual({ previousReadingM3: 100, currentReadingM3: 103, volumeM3: 3 });
    expect(day.production.fuming).toBe(-28.8);
    expect(day.production.total98Equivalent).toBe(-2.457);

    const workshops = await http(app).get('/api/production/workshops?days=0').set('Authorization', `Bearer ${token}`).expect(200);
    const idx = workshops.body.dates.indexOf('2026-09-01');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(workshops.body.workshops.find((w: { code: string }) => w.code === 'sulfuric').values[idx]).toBe(-2.457);
    const tanks = await http(app).get('/api/production/tanks?date=2026-09-01').set('Authorization', `Bearer ${token}`).expect(200);
    expect(tanks.body.groups.find((g: { material: string }) => g.material === '98酸').totalTons).toBe(110.4);
  });

  it('氨基磺酸消耗、库存按次日填报归属前一日，电表差值和发烟酸密度正确', async () => {
    const amino = await prisma.form.findUniqueOrThrow({ where: { code: 'aminosulfonic_daily' } });
    const warehouse = await prisma.form.findUniqueOrThrow({ where: { code: 'warehouse_daily' } });
    const finished = await prisma.form.create({ data: {
      title: '产成品', code: 'finished_products_daily', schema: [
        { id: 'field_date', title: '日期', type: 'date', required: true },
        { id: 'field_001', title: '氨基磺酸产量', type: 'number' },
        { id: 'field_002', title: '氨基磺酸销量', type: 'number' },
        { id: 'field_003', title: '氨基磺酸库存', type: 'number' },
      ] as never,
    } });
    await submit(amino.id, { field_date: '2026-09-01', field_steam_1: 100, field_steam_2: 200, field_steam_phase2: 300, field_water_meter: 1000, field_electricity_meter: 200 });
    await submit(amino.id, { field_date: '2026-09-02', field_production: 56, field_urea: 20, field_nitric_acid: 2,
      field_steam_1: 110, field_steam_2: 225, field_steam_phase2: 330, field_water_meter: 1040, field_electricity_meter: 203 });
    await submit(warehouse.id, { field_date: '2026-09-02', field_016: 15, field_017: 20, field_018: 123 });
    await submit(finished.id, { field_date: '2026-09-02', field_001: 56, field_002: 21, field_003: 77 });

    await http(app).get('/api/production/amino?days=0').set('Authorization', `Bearer ${userToken}`).expect(403);
    const res = await http(app).get('/api/production/amino?days=0').set('Authorization', `Bearer ${token}`).expect(200);
    const day = res.body.days.find((entry: { date: string }) => entry.date === '2026-09-01');
    expect(day).toMatchObject({
      production: 56, electricity: 36000, steam: 65, water: 40, urea: 20, fuming: 3.84,
      finishedProduction: 56, finishedSales: 21, finishedStock: 77,
      ureaPurchase: 15, ureaWarehouseConsumption: 20, ureaStock: 123, fumingStock: 153.6,
    });
    expect(res.body.days.find((entry: { date: string }) => entry.date === '2026-08-31').electricity).toBeNull();
  });

  it('硫酸镁、水滑石、蒽醌统一明细按归属日换算仪表、单列库存流量', async () => {
    const dateSchema = [{ id: 'field_date', title: '日期', type: 'date', required: true }];
    const magnesium = await prisma.form.create({ data: { title: '硫酸镁', code: 'magnesium_daily', schema: dateSchema as never } });
    const hydrotalcite = await prisma.form.create({ data: { title: '水滑石', code: 'hydrotalcite_daily', schema: dateSchema as never } });
    const anthraquinone = await prisma.form.findUniqueOrThrow({ where: { code: 'anthraquinone_daily' } });
    const warehouse = await prisma.form.findUniqueOrThrow({ where: { code: 'warehouse_daily' } });
    const finished = await prisma.form.findUniqueOrThrow({ where: { code: 'finished_products_daily' } });
    const put = async (formId: string, data: Record<string, string | number>) => {
      await prisma.formSubmission.create({ data: { formId, data: data as never } });
    };
    await put(magnesium.id, { field_date: '2026-09-01', field_electricity_phase1: 100, field_electricity_phase2: 200, field_steam_flow: 1000, field_water_meter: 500 });
    await put(magnesium.id, { field_date: '2026-09-02', field_mgso4_production: 120, field_mgo_consumption: 50,
      field_sulfuric_93: 10, field_amino_dilute_acid: 4, field_anthraquinone_dilute_acid: 2,
      field_electricity_phase1: 101, field_electricity_phase2: 202, field_steam_flow: 1030, field_water_meter: 525 });
    await put(hydrotalcite.id, { field_date: '2026-09-01', field_medium_pressure_steam: 10000, field_low_pressure_steam: 20000 });
    await put(hydrotalcite.id, { field_date: '2026-09-02', field_hg200_output: 10, field_hg201_output: 20,
      field_hg300_output: 5, field_hg205_output: 2, field_mgo: 8, field_aluminum_hydroxide: 6, field_soda_ash: 4,
      field_medium_pressure_steam: 13000, field_low_pressure_steam: 25000 });
    await put(anthraquinone.id, { field_date: '2026-09-01', field_fuming_sulfuric_flow: 100,
      field_electricity_meter: 20, field_gas_meter: 100, field_steam_meter: 200, field_water_meter: 300 });
    await put(anthraquinone.id, { field_date: '2026-09-02', field_crude_output: 8, field_fine_output: 2,
      field_crude_sales: 3, field_crude_stock: 18, field_fine_sales: 1, field_fine_stock: 5,
      field_toluene_purchase: 4, field_toluene_consumption: 2, field_toluene_stock: 12,
      field_fuming_sulfuric_flow: 103, field_electricity_meter: 21, field_gas_meter: 90,
      field_steam_meter: 207, field_water_meter: 315 });
    await put(warehouse.id, { field_date: '2026-09-02', field_019: 25, field_020: 50, field_021: 150,
      field_022: 12, field_023: 4, field_024: 40, field_025: 16, field_026: 8, field_027: 60,
      field_028: 18, field_029: 6, field_030: 70 });
    await put(finished.id, { field_date: '2026-09-02', field_004: 120, field_005: 30, field_006: 400,
      field_007: 10, field_008: 3, field_009: 50, field_010: 20, field_011: 4, field_012: 60,
      field_013: 5, field_014: 2, field_015: 30, field_016: 2, field_017: 1, field_018: 20 });

    await http(app).get('/api/production/workshops/magnesium/detail?days=0').set('Authorization', `Bearer ${userToken}`).expect(403);
    const getDay = async (code: string) => {
      const res = await http(app).get(`/api/production/workshops/${code}/detail?days=0`).set('Authorization', `Bearer ${token}`).expect(200);
      return res.body.days.find((day: { date: string }) => day.date === '2026-09-01');
    };
    const mg = await getDay('magnesium');
    expect(mg.production).toBe(120);
    expect(mg.metrics).toMatchObject({ electricity: 8200, steam: 30, water: 25, mgo: 50, sulfuric93: 10 });
    expect(mg.stocks).toMatchObject({ magnesium: { incoming: 120, outgoing: 30, closing: 400 },
      mgo: { incoming: 25, outgoing: 50, closing: 150 }, sulfuric93: { incoming: null, outgoing: 10, closing: null } });

    const hyd = await getDay('hydrotalcite');
    expect(hyd.production).toBe(37);
    expect(hyd.metrics).toMatchObject({ mediumSteam: 3, lowSteam: 5, mgo: 8, aluminum: 6, soda: 4 });
    expect(hyd.stocks).toMatchObject({ hg200: { incoming: 10, outgoing: 3, closing: 50 },
      soda: { incoming: 12, outgoing: 4, closing: 40 } });

    const aq = await getDay('anthraquinone');
    expect(aq.production).toBe(10);
    expect(aq.metrics).toMatchObject({ electricity: 600, steam: 7, water: 15, gas: 10, fuming: 5.76 });
    expect(aq.stocks).toMatchObject({ crude: { incoming: 8, outgoing: 3, closing: 18 },
      fine: { incoming: 2, outgoing: 1, closing: 5 }, toluene: { incoming: 4, outgoing: 2, closing: 12 },
      fuming: { incoming: null, outgoing: 5.76, closing: 153.6 } });
  });

  it('热电车间按次日填报读数差汇总十路供汽，并保留能源计量和断天状态', async () => {
    const thermal = await prisma.form.findUniqueOrThrow({ where: { code: 'thermal_daily' } });
    const put = async (data: Record<string, string | number>) => prisma.formSubmission.create({ data: { formId: thermal.id, data: data as never } });
    await put({ field_date: '2026-10-01', field_jianheng_steam: 100, field_xuguang_steam: 200,
      field_xinkesi_steam: 300, field_lihong_steam: 400, field_xiangshuo_steam: 500, field_fenglian_steam: 600,
      field_amino_steam: 1000, field_mgso4_steam: 2000, field_hydrotalcite_steam: 3000, field_deaq_steam: 4000,
      field_condenser_gen_active: 10, field_line2_active: 20, field_water_meter: 100, field_steam_meter: 500 });
    await put({ field_date: '2026-10-02', field_jianheng_steam: 110, field_xuguang_steam: 5,
      field_xinkesi_steam: 307, field_lihong_steam: 401, field_xiangshuo_steam: 502, field_fenglian_steam: 609,
      field_amino_steam: 1010, field_mgso4_steam: 2020, field_hydrotalcite_steam: 3003, field_deaq_steam: 4004,
      field_condenser_gen_active: 10.5, field_line2_active: 21, field_water_meter: 125, field_steam_meter: 580 });
    await put({ field_date: '2026-10-04', field_jianheng_steam: 130, field_water_meter: 150 });

    await http(app).get('/api/production/thermal?days=0').set('Authorization', `Bearer ${userToken}`).expect(403);
    const res = await http(app).get('/api/production/thermal?days=0').set('Authorization', `Bearer ${token}`).expect(200);
    const day = res.body.days.find((item: { date: string }) => item.date === '2026-10-01');
    expect(day).toMatchObject({ externalTotal: 34, internalTotal: 37, totalSupply: 71,
      generation: { previousReading: 10, currentReading: 10.5, delta: 0.5, value: 6000 },
      water: { value: 25 }, steamMeter: { value: 80 } });
    expect(day).not.toHaveProperty('purchase');
    expect(day.outlets.jianheng).toMatchObject({ previousReading: 100, currentReading: 110, value: 10 });
    expect(day.outlets.xuguang).toMatchObject({ previousReading: 200, currentReading: 5, delta: 5, value: 5, reset: true });
    expect(res.body.days.find((item: { date: string }) => item.date === '2026-10-03').totalSupply).toBeNull();
    const overview = await http(app).get('/api/production/workshops?days=0').set('Authorization', `Bearer ${token}`).expect(200);
    expect(overview.body.workshops.find((item: { code: string }) => item.code === 'thermal').values[overview.body.dates.indexOf('2026-10-01')]).toBe(71);
  });
});
