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

  it('硫酸中控不同岗位同时填写同一天时合并成一条记录', async () => {
    const control = await prisma.form.create({ data: {
      title: '硫酸中控｜矿样·干吸·风机', code: 'sulfuric_control_assay', category: '品质', schema: [
        { id: 'field_date', title: '日期', type: 'date', required: true, hidden: true },
        { id: 'field_AK', title: '干燥酸浓', type: 'number', required: true },
        { id: 'field_AC', title: '动力波砷', type: 'number', required: true },
        { id: 'field_notes', title: '生产情况记录', type: 'text' },
      ],
    } });
    const submit = (data: Record<string, unknown>) => http(app).post(`/api/forms/${control.id}/submissions`)
      .set('Authorization', auth()).send({ data: { field_date: '2026-09-28', ...data } }).expect(201);
    const [first, second] = await Promise.all([submit({ field_AK: 94.48 }), submit({ field_AC: 0.31 })]);
    expect(first.body.id).toBe(second.body.id);
    const third = await submit({ field_notes: '生产正常' });
    expect(third.body.id).toBe(first.body.id);
    expect(third.body.data).toMatchObject({ field_date: '2026-09-28', field_AK: 94.48, field_AC: 0.31, field_notes: '生产正常' });
    expect(await prisma.formSubmission.count({ where: { formId: control.id } })).toBe(1);
    await http(app).post(`/api/forms/${control.id}/submissions`).set('Authorization', auth())
      .send({ data: { field_date: '2026-09-28' } }).expect(400);
  });

  it('编辑导入行时保留未修改的数字型文本和较长的历史记录', async () => {
    const legacy = await prisma.form.create({ data: { title: '混合字段历史报表', schema: [
      { id: 'field_date', title: '日期', type: 'date', required: true, hidden: true },
      { id: 'effectiveSulfur', title: '有效硫（%）', type: 'text' },
      { id: 'metric', title: '浓度', type: 'number' },
      { id: 'notes', title: '生产情况记录', type: 'text' },
    ] } });
    const historicalNote = '原始记录'.repeat(260);
    const row = await prisma.formSubmission.create({ data: { formId: legacy.id, data: {
      field_date: '2026-09-25', effectiveSulfur: 36.3, metric: 94.2, notes: historicalNote,
    } } });
    await http(app).post(`/api/forms/${legacy.id}/submissions/batch`).set('Authorization', auth()).send({
      created: [], updated: [{ id: row.id, data: {
        field_date: '2026-09-25', effectiveSulfur: 36.3, metric: 94.4, notes: historicalNote,
      } }], deleted: [],
    }).expect(201);
    const saved = await prisma.formSubmission.findUniqueOrThrow({ where: { id: row.id } });
    expect(saved.data).toMatchObject({ effectiveSulfur: 36.3, metric: 94.4, notes: historicalNote });
    await http(app).post(`/api/forms/${legacy.id}/submissions/batch`).set('Authorization', auth()).send({
      created: [], updated: [{ id: row.id, data: {
        field_date: '2026-09-25', effectiveSulfur: 37, metric: 94.4, notes: historicalNote,
      } }], deleted: [],
    }).expect(400);
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

  it('USER 不能看全部表单，但可通过已有链接填写表单', async () => {
    await http(app).get('/api/forms').set('Authorization', `Bearer ${userToken}`).expect(403);
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

describe('事项表：按分类显示、分页筛选并直接编辑数据', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let formId: string;
  let rowId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.formSubmission.deleteMany();
    await prisma.form.deleteMany();
    await resetDbWithAdmin(prisma);
    token = (await loginOk(http(app))).accessToken;
    const form = await prisma.form.create({ data: {
      title: '2026年事项表', code: 'matters_2026', category: '总经办', entryMode: 'sheet',
      schema: [
        { id: 'matter', title: '事项', type: 'text', required: true },
        { id: 'progress', title: '进度', type: 'select', required: true, options: [{ label: '进行中', value: '进行中' }, { label: '已完成', value: '已完成' }] },
        { id: 'startDate', title: '开始时间', type: 'date' },
        { id: 'department', title: '部门', type: 'text' },
      ],
    } });
    formId = form.id;
    for (const [index, matter] of ['设备检查', '设备检修', '月度报告'].entries()) {
      const row = await prisma.formSubmission.create({ data: {
        formId,
        data: { matter, progress: index === 2 ? '已完成' : '进行中', startDate: null, department: '总经办' },
        createdAt: new Date(`2026-09-0${index + 1}T00:00:00.000Z`),
      } });
      if (index === 1) rowId = row.id;
    }
  });
  afterAll(async () => { await app.close(); });
  const auth = () => `Bearer ${token}`;

  it('分类目录只返回总经办标题，且禁止走逐项填写接口', async () => {
    const list = await http(app).get('/api/forms?category=总经办').set('Authorization', auth()).expect(200);
    expect(list.body.items).toMatchObject([{ id: formId, category: '总经办', entryMode: 'sheet', submissionCount: 3 }]);
    await http(app).post(`/api/forms/${formId}/submissions`).set('Authorization', auth())
      .send({ data: { matter: '新增', progress: '进行中' } }).expect(400);
  });

  it('能跨页搜索事项并按进度筛选，空开始日期不阻止表格修改', async () => {
    const page = await http(app).get(`/api/forms/${formId}/submissions?page=2&pageSize=1&keyword=设备&progress=进行中`)
      .set('Authorization', auth()).expect(200);
    expect(page.body.total).toBe(2);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0].data.matter).toBe('设备检查');

    await http(app).post(`/api/forms/${formId}/submissions/batch`).set('Authorization', auth()).send({
      created: [],
      updated: [{ id: rowId, data: { matter: '设备检修完成', progress: '已完成', startDate: null, department: '总经办' } }],
      deleted: [],
    }).expect(201);
    const filtered = await http(app).get(`/api/forms/${formId}/submissions?keyword=设备&progress=已完成`)
      .set('Authorization', auth()).expect(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0].data.matter).toBe('设备检修完成');
  });

  it('新事项使用现行部门、识别已确认旧称，历史部门可原样保留', async () => {
    const form = await http(app).get(`/api/forms/${formId}`).set('Authorization', auth()).expect(200);
    const department = form.body.schema.find((field: { id: string }) => field.id === 'department');
    expect(department.multiple).toBe(true);
    expect(department.options).toHaveLength(17);
    expect(department.options).toContainEqual({ label: '水滑石生产部', value: '水滑石生产部' });
    expect(department.options).not.toContainEqual({ label: '新材料生产部', value: '新材料生产部' });

    const created = await http(app).post(`/api/forms/${formId}/submissions/batch`).set('Authorization', auth()).send({
      created: [{ matter: '跨部门事项', progress: '进行中', department: '2-EAQ生产部,硫酸生产部,2-EAQ生产部' }],
      updated: [], deleted: [],
    }).expect(201);
    expect(created.body.created).toBe(1);
    const rows = await http(app).get(`/api/forms/${formId}/submissions?keyword=跨部门事项`).set('Authorization', auth()).expect(200);
    expect(rows.body.items[0].data.department).toBe('二乙基蒽醌生产部,硫酸生产部');

    await http(app).post(`/api/forms/${formId}/submissions/batch`).set('Authorization', auth()).send({
      created: [{ matter: '水滑石事项', progress: '进行中', department: '新材料生产部,水滑石生产部' }],
      updated: [], deleted: [],
    }).expect(201);
    const waterSlagRows = await http(app).get(`/api/forms/${formId}/submissions?keyword=水滑石事项`).set('Authorization', auth()).expect(200);
    expect(waterSlagRows.body.items[0].data.department).toBe('水滑石生产部');

    await http(app).post(`/api/forms/${formId}/submissions/batch`).set('Authorization', auth()).send({
      created: [{ matter: '非现行部门', progress: '进行中', department: '水滑石项目组' }], updated: [], deleted: [],
    }).expect(400);

    const legacy = await prisma.formSubmission.create({ data: {
      formId, data: { matter: '历史任务', progress: '进行中', startDate: null, department: '生产技术部' },
    } });
    await http(app).post(`/api/forms/${formId}/submissions/batch`).set('Authorization', auth()).send({
      created: [], updated: [{ id: legacy.id, data: { matter: '历史任务已更新', progress: '进行中', startDate: null, department: '生产技术部' } }], deleted: [],
    }).expect(201);
    await http(app).post(`/api/forms/${formId}/submissions/batch`).set('Authorization', auth()).send({
      created: [], updated: [{ id: legacy.id, data: { matter: '历史任务已更新', progress: '进行中', startDate: null, department: '其他部门' } }], deleted: [],
    }).expect(400);
    const unchanged = await prisma.formSubmission.findUniqueOrThrow({ where: { id: legacy.id } });
    expect((unchanged.data as { department: string }).department).toBe('生产技术部');
  });
});
