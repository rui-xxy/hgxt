import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, http, loginOk, resetDbWithAdmin } from './utils';

const schema = [
  { id: 'field_date', title: '日期', type: 'date', group: '基础', hidden: true, required: true },
  { id: 'tank', title: '液位', type: 'number', group: '硫酸', min: 0, max: 100, precision: 1 },
];

describe('forms 表单填写与数据表格', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let formId: string;
  let firstId: string;
  let secondId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.formSubmission.deleteMany();
    await prisma.form.deleteMany();
    await resetDbWithAdmin(prisma);
    token = (await loginOk(http(app))).accessToken;
    formId = (await prisma.form.create({ data: { title: '硫酸车间报表', schema } })).id;
  });
  afterAll(async () => { await app.close(); });

  const auth = () => `Bearer ${token}`;

  it('表单列表要求登录，并显示字段定义', async () => {
    await http(app).get('/api/forms').expect(401);
    const list = await http(app).get('/api/forms').set('Authorization', auth()).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].latestEntryDate).toBeNull();
    const detail = await http(app).get(`/api/forms/${formId}`).set('Authorization', auth()).expect(200);
    expect(detail.body.schema).toEqual(schema);
  });

  it('填写校验日期、数值范围，并保存停车记录', async () => {
    await http(app).post(`/api/forms/${formId}/submissions`).set('Authorization', auth()).send({ data: { field_date: '2026-02-30', tank: 22 } }).expect(400);
    await http(app).post(`/api/forms/${formId}/submissions`).set('Authorization', auth()).send({ data: { field_date: '2026-09-26', tank: 101 } }).expect(400);
    const first = await http(app).post(`/api/forms/${formId}/submissions`).set('Authorization', auth()).send({ data: { field_date: '2026-09-26', tank: 23.5, parkingRecords: '[{"start":"2026-09-26T10:00","end":"2026-09-26T11:00","reason":"检修"}]' } }).expect(201);
    firstId = first.body.id;
    const second = await http(app).post(`/api/forms/${formId}/submissions`).set('Authorization', auth()).send({ data: { field_date: '2026-09-24', tank: 30 } }).expect(201);
    secondId = second.body.id;
    expect(first.body.data.parkingRecords).toContain('检修');
  });

  it('最新填写时间取内容日期，表格按内容日期倒序', async () => {
    const list = await http(app).get('/api/forms').set('Authorization', auth()).expect(200);
    expect(list.body.items[0].latestEntryDate).toBe('2026-09-26');
    const rows = await http(app).get(`/api/forms/${formId}/submissions`).set('Authorization', auth()).expect(200);
    expect(rows.body.items.map((row: { id: string }) => row.id)).toEqual([firstId, secondId]);
  });

  it('表格可批量新增、修改、删除', async () => {
    const saved = await http(app).post(`/api/forms/${formId}/submissions/batch`).set('Authorization', auth()).send({
      created: [{ field_date: '2026-09-27', tank: 44 }],
      updated: [{ id: firstId, data: { field_date: '2026-09-26', tank: 24 } }],
      deleted: [secondId],
    }).expect(201);
    expect(saved.body).toEqual({ created: 1, updated: 1, deleted: 1 });
    const rows = await http(app).get(`/api/forms/${formId}/submissions`).set('Authorization', auth()).expect(200);
    expect(rows.body.total).toBe(2);
    expect(rows.body.items[0].data.field_date).toBe('2026-09-27');
    expect(rows.body.items.find((row: { id: string }) => row.id === firstId).data.tank).toBe(24);
  });

  it('不能修改其他表单的记录，失败时整批不落库', async () => {
    const other = await prisma.form.create({ data: { title: '其他表单', schema } });
    const foreign = await prisma.formSubmission.create({ data: { formId: other.id, data: { field_date: '2026-09-01', tank: 10 } } });
    const before = await prisma.formSubmission.count({ where: { formId } });
    await http(app).post(`/api/forms/${formId}/submissions/batch`).set('Authorization', auth()).send({
      created: [{ field_date: '2026-09-28', tank: 11 }],
      updated: [{ id: foreign.id, data: { field_date: '2026-09-01', tank: 20 } }],
      deleted: [],
    }).expect(404);
    expect(await prisma.formSubmission.count({ where: { formId } })).toBe(before);
  });
});
