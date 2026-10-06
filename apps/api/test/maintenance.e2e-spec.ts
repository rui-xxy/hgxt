import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, http, loginOk, resetDbWithAdmin } from './utils';

describe('设备维修原始记录', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    const prisma = app.get(PrismaService);
    await prisma.maintenanceRecord.deleteMany();
    await resetDbWithAdmin(prisma);
    token = (await loginOk(http(app))).accessToken;
  });
  afterAll(async () => { await app.close(); });

  const auth = () => `Bearer ${token}`;
  const row = {
    sourceDateText: '2025-12-29星期一',
    date: '2025-12-29',
    reportYear: 2026,
    reportMonth: 1,
    personnel: '甲、乙',
    department: '硫酸生产部',
    location: '一楼',
    equipmentModel: '/',
    workContent: '维修循环泵',
    workTimeText: '08:00-17:00',
    replacedParts: '/',
    faultType: '设备因素',
    faultCause: '设备本身质量问题',
    repairHours: 8,
    isRework: false,
    remarks: '',
  };

  it('保留跨自然年的统计归属月份与原始文本，并支持修改', async () => {
    await http(app).get('/api/maintenance/records').expect(401);
    const created = await http(app).post('/api/maintenance/records')
      .set('Authorization', auth()).send(row).expect(201);
    expect(created.body).toMatchObject({ ...row, sourceRow: null });
    const listed = await http(app).get('/api/maintenance/records?year=2026')
      .set('Authorization', auth()).expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].date).toBe('2025-12-29');
    const changed = await http(app).patch(`/api/maintenance/records/${created.body.id}`)
      .set('Authorization', auth()).send({ ...row, workTimeText: '08:00-16:30', repairHours: 77.5 }).expect(200);
    expect(changed.body.repairHours).toBe(7.5);
    const recalculated = await http(app).get('/api/maintenance/records?year=2026')
      .set('Authorization', auth()).expect(200);
    expect(recalculated.body[0].repairHours).toBe(7.5);
  });

  it('拒绝无效日期和归属月份，但允许显式保留历史异常日期原文', async () => {
    await http(app).post('/api/maintenance/records').set('Authorization', auth())
      .send({ ...row, date: '2026-02-30' }).expect(400);
    await http(app).post('/api/maintenance/records').set('Authorization', auth())
      .send({ ...row, reportMonth: 13 }).expect(400);
    const anomalous = await http(app).post('/api/maintenance/records').set('Authorization', auth())
      .send({ ...row, sourceDateText: '2026-09-330星期三', date: null, reportMonth: 9, workTimeText: '未记录', repairHours: -3 })
      .expect(201);
    expect(anomalous.body).toMatchObject({ date: null, reportMonth: 9, repairHours: -3 });
  });

  it('按时间段自动计算工时，并只扣除与午休重叠的部分', async () => {
    const cases = [
      ['08:00–17:00', 8],
      ['08:00–16:30', 7.5],
      ['11:30–12:30', 0.5],
      ['12:00–13:00', 0],
      ['13:00–17:00', 4],
      ['22:00–02:00', 4],
      ['11:30–01:00', 12.5],
    ] as const;
    for (const [workTimeText, expectedHours] of cases) {
      const created = await http(app).post('/api/maintenance/records')
        .set('Authorization', auth()).send({ ...row, workTimeText, repairHours: 77.5 }).expect(201);
      expect(created.body.repairHours).toBe(expectedHours);
    }
  });
});
