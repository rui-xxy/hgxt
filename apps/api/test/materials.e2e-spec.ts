import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, http, loginOk, resetDbWithAdmin } from './utils';
import warehouseSchema from '../prisma/form-schemas/warehouse.json';
import finishedSchema from '../prisma/form-schemas/finished-products.json';
import anthraquinoneSchema from '../prisma/form-schemas/anthraquinone.json';
import fenglianSchema from '../prisma/form-schemas/fenglian.json';

describe('物料与库存：来源完整性及填报日期口径', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.formSubmission.deleteMany();
    await prisma.form.deleteMany();
    await prisma.tank.deleteMany();
    await prisma.meter.deleteMany();
    await resetDbWithAdmin(prisma);
    token = (await loginOk(http(app))).accessToken;

    const forms = await Promise.all([
      prisma.form.create({ data: { title: '硫酸', code: 'sulfuric_daily', schema: [{ id: 'field_date', title: '日期', type: 'date', required: true }] } }),
      prisma.form.create({ data: { title: '仓库', code: 'warehouse_daily', schema: warehouseSchema as never } }),
      prisma.form.create({ data: { title: '产成品', code: 'finished_products_daily', schema: finishedSchema as never } }),
      prisma.form.create({ data: { title: '蒽醌', code: 'anthraquinone_daily', schema: anthraquinoneSchema as never } }),
      prisma.form.create({ data: { title: '丰联', code: 'fenglian_daily', schema: fenglianSchema as never } }),
    ]);
    const byCode = new Map(forms.map((form) => [form.code, form.id]));
    const put = (code: string, data: Record<string, string | number | null>) =>
      prisma.formSubmission.create({ data: { formId: byCode.get(code)!, data } });
    await put('warehouse_daily', { field_date: '2026-10-05', field_001: 2, field_002: 3, field_003: 10 });
    await put('warehouse_daily', { field_date: '2026-10-06', field_001: 4, field_002: 5, field_003: 7 });
    await put('finished_products_daily', { field_date: '2026-10-05', field_001: 10, field_002: 8, field_003: 20 });
    await put('finished_products_daily', { field_date: '2026-10-06', field_001: 12, field_002: 9, field_003: 23 });
    await put('anthraquinone_daily', { field_date: '2026-10-05', field_bag_25kg_stock: 50 });
    await put('anthraquinone_daily', {
      field_date: '2026-10-06', field_toluene_purchase: 1.25, field_toluene_consumption: 0.5,
      field_toluene_stock: 8.75, field_crude_output: 2.5, field_crude_sales: 1.2, field_crude_stock: 6.3,
      field_fine_output: 1.5, field_fine_stock: 4.2,
    });
    await put('fenglian_daily', {
      field_date: '2026-10-06', field_004: 3.25, field_005: 2, field_006: 7.5,
      field_3500_high_output: 4, field_3500_high_sales: 3, field_3500_high_stock: 12,
      field_204: 5, field_205: 4, field_206: 15,
    });
  });

  afterAll(async () => { await app.close(); });

  it('展示仓库、蒽醌、丰联的原辅料和各来源的产成品', async () => {
    const res = await http(app).get('/api/production/materials').set('Authorization', `Bearer ${token}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { rawMaterials, finishedProducts } = res.body;
    expect(rawMaterials.length).toBeGreaterThan(10);
    expect(rawMaterials).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '甲苯', workshop: '蒽醌·原辅料', stock: 8.75 }),
      expect.objectContaining({ name: '85%磷酸', workshop: '丰联·三车间', stock: 7.5 }),
      expect.objectContaining({ name: '25kg包装袋', unit: '个' }),
    ]));
    expect(finishedProducts.length).toBeGreaterThan(10);
    expect(finishedProducts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '二乙基蒽醌粗品', production: 2.5 }),
      expect.objectContaining({ name: '3500阻燃母粒（优）', production: 4, stock: 12 }),
      expect.objectContaining({ name: '焦磷酸哌嗪成品', production: 5, sales: 4 }),
    ]));
  });

  it('10 月 6 日库存对应 10 月 5 日购耗和产销，空白不补零', async () => {
    const res = await http(app).get('/api/production/materials').set('Authorization', `Bearer ${token}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const raw = res.body.rawMaterials.find((row: { name: string }) => row.name === '双氧水');
    expect(raw).toMatchObject({ stockDate: '2026-10-06', activityDate: '2026-10-05', stock: 7, purchase: 4, consumption: 5 });
    const product = res.body.finishedProducts.find((row: { name: string }) => row.name === '氨基磺酸');
    expect(product).toMatchObject({ stockDate: '2026-10-06', activityDate: '2026-10-05', production: 12, sales: 9, stock: 23 });
    const fine = res.body.finishedProducts.find((row: { name: string }) => row.name === '二乙基蒽醌精品');
    expect(fine.sales).toBeNull();
    const bag = res.body.rawMaterials.find((row: { name: string }) => row.name === '25kg包装袋');
    expect(bag).toMatchObject({ stockDate: '2026-10-05', stock: 50, activityDate: '2026-10-06', purchase: null });
  });
});
