import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Role, UserStatus } from '@hgxt/shared';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, http, loginOk, resetDbWithAdmin } from './utils';

describe('users 用户与权限（A2/A4/E1/E2/E3）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDbWithAdmin(prisma);
    adminToken = (await loginOk(http(app))).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // 返回 supertest 原始链（保留 .expect 链式调用），adminToken 在调用时读取
  const createUser = (body: Record<string, unknown>) =>
    http(app).post('/api/users').set('Authorization', `Bearer ${adminToken}`).send(body);

  it('未登录访问用户列表 401', async () => {
    const res = await http(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('USER 角色访问 /users 403', async () => {
    const created = await createUser({
      username: 'zhangsan',
      name: '张三',
      password: 'Zhang@12345',
      role: Role.USER,
    }).expect(201);
    userId = created.body.id;

    const login = await http(app).post('/api/auth/login').send({ username: 'zhangsan', password: 'Zhang@12345' });
    const res = await http(app).get('/api/users').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('E1：非法 username 被后端参数校验拒绝', async () => {
    const res = await createUser({ username: '@@@@', name: '非法', password: 'Pass@12345', role: Role.USER });
    expect(res.status).toBe(400);
  });

  it('E2：username 入库统一小写，大小写变体视为重复（409）', async () => {
    const created = await createUser({
      username: 'LiLei',
      name: '李雷',
      password: 'Pass@12345',
      role: Role.USER,
    }).expect(201);
    expect(created.body.username).toBe('lilei');

    const dup = await createUser({
      username: 'LILEI',
      name: '李雷2',
      password: 'Pass@12345',
      role: Role.USER,
    });
    expect(dup.status).toBe(409);
  });

  it('成员接口不接收或返回邮箱；手机号支持缺省和清空', async () => {
    const created = await createUser({
      username: 'hanmei',
      name: '韩梅梅',
      password: 'Pass@12345',
      role: Role.USER,
      phone: '13800000001',
      email: 'HanMei@Example.COM',
    }).expect(201);
    expect(created.body).not.toHaveProperty('email');
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(saved.email).toBeNull();

    // 缺省 = 不修改
    await http(app)
      .patch(`/api/users/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '韩梅梅2' })
      .expect(200);
    let detail = await http(app).get(`/api/users/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.phone).toBe('13800000001');
    expect(detail.body).not.toHaveProperty('email');

    // null = 清空
    await http(app)
      .patch(`/api/users/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: null })
      .expect(200);
    detail = await http(app).get(`/api/users/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.phone).toBeNull();
  });

  it('关键字搜索不区分大小写', async () => {
    const res = await http(app).get('/api/users?keyword=ZHANG').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.some((u: { username: string }) => u.username === 'zhangsan')).toBe(true);
  });

  it('不能禁用当前登录账号（400）', async () => {
    const me = await http(app).get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`);
    const res = await http(app)
      .patch(`/api/users/${me.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: UserStatus.DISABLED });
    expect(res.status).toBe(400);
  });

  it('A4：不能把最后一个管理员降级 / 禁用', async () => {
    const me = await http(app).get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`);
    const demote = await http(app)
      .patch(`/api/users/${me.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: Role.USER });
    expect(demote.status).toBe(400);
    expect(demote.body.message).toContain('至少');

    // 组合场景：admin2 在岗时禁用 admin（允许）→ admin2 成为唯一在岗管理员 →
    // 此时 admin2 自降角色必须被拒，否则系统归零
    const second = await createUser({
      username: 'admin2',
      name: '管理员2',
      password: 'Pass@12345',
      role: Role.SUPER_ADMIN,
    });
    expect(second.status).toBe(201);

    const admin2Login = await http(app)
      .post('/api/auth/login')
      .send({ username: 'admin2', password: 'Pass@12345' });
    const admin2Token = admin2Login.body.accessToken;

    // admin2 禁用 admin：自己还在岗，允许
    const disableAdmin = await http(app)
      .patch(`/api/users/${me.body.id}/status`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ status: UserStatus.DISABLED });
    expect(disableAdmin.status).toBe(200);

    // admin2 已是唯一在岗管理员，自降被拒
    const demoteLast = await http(app)
      .patch(`/api/users/${second.body.id}`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ role: Role.USER });
    expect(demoteLast.status).toBe(400);
    expect(demoteLast.body.message).toContain('至少');

    // admin2 自禁也走"最后一个管理员"检查（注意：它先命中"不能禁用自己"，
    // 该分支由独立用例覆盖；这里验证组合操作后系统仍有一个在岗管理员）
    const activeAdmins = await prisma.user.count({
      where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
    });
    expect(activeAdmins).toBe(1);

    // 清理：恢复 admin，删除 admin2
    await prisma.user.update({ where: { id: me.body.id }, data: { status: 'ACTIVE' } });
    await prisma.user.delete({ where: { id: second.body.id } });
  });

  it('A4：存在其他管理员时允许降级/禁用', async () => {
    const second = await createUser({
      username: 'tempadmin',
      name: '临时管理员',
      password: 'Pass@12345',
      role: Role.SUPER_ADMIN,
    }).expect(201);

    const demote = await http(app)
      .patch(`/api/users/${second.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: Role.USER });
    expect(demote.status).toBe(200);

    const disable = await http(app)
      .patch(`/api/users/${second.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: UserStatus.DISABLED });
    expect(disable.status).toBe(200);

    await prisma.user.delete({ where: { id: second.body.id } });
  });

  it('删除用户：正常删除 / 不能删自己 / 表单提交保留且提交人置空', async () => {
    // 创建一个临时用户并提交一条表单数据
    const temp = await createUser({
      username: 'deleteme',
      name: '待删除',
      password: 'Pass@12345',
      role: Role.USER,
    }).expect(201);
    const form = await prisma.form.findFirst({ where: { code: 'sulfuric_daily' } });
    if (form) {
      await prisma.formSubmission.create({
        data: { formId: form.id, submitterId: temp.body.id, data: { field_date: '2026-09-01', some_field: 1 } },
      });
    }

    // 不能删自己
    const me = await http(app).get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`);
    const selfDelete = await http(app)
      .delete(`/api/users/${me.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(selfDelete.status).toBe(400);

    // 正常删除
    const res = await http(app)
      .delete(`/api/users/${temp.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    // 用户已删
    const check = await prisma.user.findUnique({ where: { id: temp.body.id } });
    expect(check).toBeNull();

    // RefreshToken 级联删
    const tokens = await prisma.refreshToken.count({ where: { userId: temp.body.id } });
    expect(tokens).toBe(0);

    // 表单提交记录保留，submitterId 置空
    if (form) {
      const sub = await prisma.formSubmission.findFirst({ where: { formId: form.id } });
      expect(sub).not.toBeNull();
      expect(sub?.submitterId).toBeNull();
    }
  });

  it('A2：重置密码后旧 Access Token 立即失效（不等 15 分钟过期）', async () => {
    const login = await http(app).post('/api/auth/login').send({ username: 'zhangsan', password: 'Zhang@12345' });
    const oldToken = login.body.accessToken;
    const oldRefresh = login.body.refreshToken;

    // 重置前可用
    await http(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`).expect(200);

    await http(app)
      .post(`/api/users/${userId}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'NewPass@67890' })
      .expect(201);

    // 重置后：旧 Access 立即 401（authVersion 不匹配）
    const me = await http(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
    expect(me.status).toBe(401);

    // 旧 refresh 也失效
    const refresh = await http(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh });
    expect(refresh.status).toBe(401);

    // 新密码可登录，旧密码不行
    await http(app).post('/api/auth/login').send({ username: 'zhangsan', password: 'NewPass@67890' }).expect(200);
    await http(app).post('/api/auth/login').send({ username: 'zhangsan', password: 'Zhang@12345' }).expect(401);
  });

  it('禁用用户后旧 Access Token 立即失效、不能重登', async () => {
    const login = await http(app).post('/api/auth/login').send({ username: 'zhangsan', password: 'NewPass@67890' });
    const token = login.body.accessToken;

    await http(app)
      .patch(`/api/users/${userId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: UserStatus.DISABLED })
      .expect(200);

    expect((await http(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    const relogin = await http(app).post('/api/auth/login').send({ username: 'zhangsan', password: 'NewPass@67890' });
    expect(relogin.status).toBe(403);

    // 恢复启用，供后续用例
    await http(app)
      .patch(`/api/users/${userId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: UserStatus.ACTIVE })
      .expect(200);
  });

  it('弱密码被参数校验拒绝（400）', async () => {
    const res = await createUser({ username: 'shortpw', name: '短密码', password: '123', role: Role.USER });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain('密码至少 8 位');
  });

  it('B6：响应带基础安全头（Swagger 挂载属 main.ts 职责，由手工回归覆盖）', async () => {
    const res = await http(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('种子之外的直连数据库场景', () => {
  it('A2：伪造 ver 不匹配的 JWT 立即被拒（含旧版无 ver 的 token）', async () => {
    const app = await createTestApp();
    const prisma = app.get(PrismaService);
    await resetDbWithAdmin(prisma);
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });

    const { JwtService } = await import('@nestjs/jwt');
    const jwt = app.get(JwtService);
    const stale = await jwt.signAsync({ sub: admin.id, username: 'admin', role: 'SUPER_ADMIN' });
    const res = await http(app).get('/api/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(res.status).toBe(401);

    await app.close();
  });

  it('admin 登录种子可用（回归）', async () => {
    const app = await createTestApp();
    const prisma = app.get(PrismaService);
    await resetDbWithAdmin(prisma);
    await loginOk(http(app));
    await app.close();
  });
});
