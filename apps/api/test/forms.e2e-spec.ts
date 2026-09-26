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
    formId = (await prisma.form.create({ data: { title: '硫酸车间报表', schema, parkingEnabled: true } })).id;
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

  it('隐藏的日期字段缺省时由后端自动填当天', async () => {
    const res = await http(app).post(`/api/forms/${formId}/submissions`).set('Authorization', auth()).send({ data: { tank: 66 } }).expect(201);
    expect(res.body.data.field_date).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe('forms 权限模型（USER 只能填报，数据管理仅管理员）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let userToken: string;
  let formId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.formSubmission.deleteMany();
    await prisma.form.deleteMany();
    const { adminId } = await resetDbWithAdmin(prisma);
    const adminLogin = await loginOk(http(app));
    adminToken = adminLogin.accessToken;
    await http(app).post('/api/users').set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'worker', name: '填报员', password: 'Pass@12345', role: 'USER' }).expect(201);
    userToken = (await loginOk(http(app), 'worker', 'Pass@12345')).accessToken;
    formId = (await prisma.form.create({
      data: { title: '硫酸车间报表', parkingEnabled: true, schema: [
        { id: 'field_date', title: '日期', type: 'date', hidden: true, required: true },
        { id: 'tank', title: '液位', type: 'number', min: 0, max: 100 },
      ] },
    })).id;
    await prisma.formSubmission.create({ data: { formId, submitterId: adminId, data: { field_date: '2026-09-26', tank: 50 } } });
  });
  afterAll(async () => { await app.close(); });

  it('USER 可以：表单列表 / 表单定义 / 上次值 / 填报提交', async () => {
    await http(app).get('/api/forms').set('Authorization', `Bearer ${userToken}`).expect(200);
    await http(app).get(`/api/forms/${formId}`).set('Authorization', `Bearer ${userToken}`).expect(200);
    const latest = await http(app).get(`/api/forms/${formId}/submissions/latest`).set('Authorization', `Bearer ${userToken}`).expect(200);
    expect(latest.body.tank).toEqual({ value: 50, date: '2026-09-26' });
    await http(app).post(`/api/forms/${formId}/submissions`).set('Authorization', `Bearer ${userToken}`)
      .send({ data: { tank: 60 } }).expect(201);
  });

  it('USER 不可以：读历史提交 / 批量保存（含改、删）', async () => {
    await http(app).get(`/api/forms/${formId}/submissions`).set('Authorization', `Bearer ${userToken}`).expect(403);
    await http(app).post(`/api/forms/${formId}/submissions/batch`).set('Authorization', `Bearer ${userToken}`)
      .send({ created: [{ field_date: '2026-09-27', tank: 1 }], updated: [], deleted: [] }).expect(403);
  });
});

describe('forms 通用性（无日期字段 + 文本/选项/可选数字混合表单）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let formId: string;

  const inspectionSchema = [
    { id: 'device_name', title: '设备名称', type: 'text', required: true },
    { id: 'status', title: '运行状态', type: 'select', required: true, options: [{ label: '正常', value: 'ok' }, { label: '异常', value: 'fault' }] },
    { id: 'temperature', title: '温度', type: 'number', precision: 1, min: -20, max: 300 },
    { id: 'remark', title: '备注', type: 'text' },
  ];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.formSubmission.deleteMany();
    await prisma.form.deleteMany();
    await resetDbWithAdmin(prisma);
    token = (await loginOk(http(app))).accessToken;
    formId = (await prisma.form.create({ data: { title: '设备巡检表', schema: inspectionSchema } })).id;
  });
  afterAll(async () => { await app.close(); });
  const auth = () => `Bearer ${token}`;

  it('纯文本+选项提交成功；可选数字留空为 null', async () => {
    const res = await http(app).post(`/api/forms/${formId}/submissions`).set('Authorization', auth())
      .send({ data: { device_name: '1#反应釜', status: 'ok', remark: '运行平稳' } }).expect(201);
    expect(res.body.data.temperature).toBeNull();
    expect(res.body.data.remark).toBe('运行平稳');
  });

  it('required 文本/选项为空被拒；非法选项被拒；未知字段被拒', async () => {
    await http(app).post(`/api/forms/${formId}/submissions`).set('Authorization', auth())
      .send({ data: { device_name: '', status: 'ok' } }).expect(400);
    await http(app).post(`/api/forms/${formId}/submissions`).set('Authorization', auth())
      .send({ data: { device_name: 'X', status: 'bad' } }).expect(400);
    await http(app).post(`/api/forms/${formId}/submissions`).set('Authorization', auth())
      .send({ data: { device_name: 'X', status: 'ok', hacker: 1 } }).expect(400);
  });

  it('无日期字段的表单：latestEntryDate 为空、无主日期校验、排序按提交时间', async () => {
    const list = await http(app).get('/api/forms').set('Authorization', auth()).expect(200);
    const item = list.body.items.find((f: { title: string }) => f.title === '设备巡检表');
    expect(item.latestEntryDate).toBeNull();
    expect(item.parkingEnabled).toBe(false);
    const rows = await http(app).get(`/api/forms/${formId}/submissions`).set('Authorization', auth()).expect(200);
    expect(rows.body.items[0].data.device_name).toBe('1#反应釜');
    // 上次值接口同样可用（按提交时间）
    const latest = await http(app).get(`/api/forms/${formId}/submissions/latest`).set('Authorization', auth()).expect(200);
    expect(latest.body.device_name.value).toBe('1#反应釜');
  });
});
