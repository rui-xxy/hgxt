import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, http, loginOk, resetDbWithAdmin } from './utils';

describe('普通用户页面权限', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  let userId: string;

  const asAdmin = () => `Bearer ${adminToken}`;
  const asUser = () => `Bearer ${userToken}`;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDbWithAdmin(app.get(PrismaService));
    adminToken = (await loginOk(http(app))).accessToken;
    const created = await http(app).post('/api/users').set('Authorization', asAdmin())
      .send({ username: 'viewer', name: '查看员', password: 'Pass@12345', role: 'USER' }).expect(201);
    userId = created.body.id;
    userToken = (await loginOk(http(app), 'viewer', 'Pass@12345')).accessToken;
  });

  afterAll(async () => { await app.close(); });

  it('所有登录用户可查看车间、能源和物料；未登录仍须认证', async () => {
    for (const path of ['/api/production/sulfuric/control', '/api/production/workshops', '/api/production/energy', '/api/production/materials']) {
      await http(app).get(path).expect(401);
      await http(app).get(path).set('Authorization', asUser()).expect(200);
    }
  });

  it('计划与维修仍须授权，非法权限值不能保存', async () => {
    await http(app).get('/api/production/plan').set('Authorization', asUser()).expect(403);
    await http(app).get('/api/maintenance/records').set('Authorization', asUser()).expect(403);
    await http(app).get('/api/forms').set('Authorization', asUser()).expect(403);
    await http(app).patch(`/api/users/${userId}`).set('Authorization', asAdmin())
      .send({ pagePermissions: ['forms'] }).expect(400);
    await http(app).patch(`/api/users/${userId}`).set('Authorization', asAdmin())
      .send({ pagePermissions: ['board'] }).expect(400);
    await http(app).patch(`/api/users/${userId}`).set('Authorization', asAdmin())
      .send({ pagePermissions: null }).expect(400);
  });

  it('管理员分配后，同一登录会话立即获得对应页面；撤销后立即失效', async () => {
    const updated = await http(app).patch(`/api/users/${userId}`).set('Authorization', asAdmin())
      .send({ pagePermissions: ['plan', 'maintenance'] }).expect(200);
    expect(updated.body.pagePermissions).toEqual(['plan', 'maintenance']);
    const me = await http(app).get('/api/auth/me').set('Authorization', asUser()).expect(200);
    expect(me.body.pagePermissions).toEqual(['plan', 'maintenance']);
    await http(app).get('/api/production/sulfuric/control').set('Authorization', asUser()).expect(200);
    await http(app).get('/api/maintenance/records').set('Authorization', asUser()).expect(200);
    await http(app).get('/api/production/plan').set('Authorization', asUser()).expect(200);
    await http(app).get('/api/production/energy').set('Authorization', asUser()).expect(200);
    await http(app).get('/api/forms').set('Authorization', asUser()).expect(403);
    await http(app).get('/api/production/plan/settings').set('Authorization', asUser()).expect(403);
    await http(app).post('/api/production/plan/settings').set('Authorization', asUser()).send({}).expect(403);

    await http(app).patch(`/api/users/${userId}`).set('Authorization', asAdmin())
      .send({ pagePermissions: [] }).expect(200);
    await http(app).get('/api/production/sulfuric/control').set('Authorization', asUser()).expect(200);
    await http(app).get('/api/production/plan').set('Authorization', asUser()).expect(403);
    await http(app).get('/api/maintenance/records').set('Authorization', asUser()).expect(403);
  });
});
