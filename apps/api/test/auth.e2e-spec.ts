import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, http, loginOk, resetDbWithAdmin, backdateRevocation, ADMIN_PASSWORD } from './utils';

describe('auth 认证（A1/A2 轮换原子性与会话失效）', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDbWithAdmin(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('错误密码登录被拒（401，不泄露账号是否存在）', async () => {
    const res = await http(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong-pass' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('用户名或密码错误');
  });

  it('登录成功返回双 token 与用户信息', async () => {
    const res = await http(app).post('/api/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.role).toBe('SUPER_ADMIN');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('E2：用户名大小写不敏感登录（ADMIN 也能登录）', async () => {
    const res = await http(app).post('/api/auth/login').send({ username: 'ADMIN', password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
  });

  describe('A1：Refresh Token 原子轮换', () => {
    it('正常轮换：旧 token 作废、新 token 可用', async () => {
      const session = await loginOk(http(app));
      const res = await http(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.refreshToken).not.toBe(session.refreshToken);

      // 旧 token 顺序复用：宽限期内被拒，但不连坐（新 token 仍可用）
      const reuse = await http(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
      expect(reuse.status).toBe(401);
      const again = await http(app).post('/api/auth/refresh').send({ refreshToken: res.body.refreshToken });
      expect(again.status).toBe(200);
    });

    it('并发轮换：同一个旧 token 恰好一个成功，且只净增一套新 token', async () => {
      const session = await loginOk(http(app));
      const activeBefore = await prisma.refreshToken.count({
        where: { userId: session.user.id, revokedAt: null },
      });

      const [a, b] = await Promise.all([
        http(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken }),
        http(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken }),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 401]);

      // 原子性验证：轮换是「一换一」（旧作废 + 新签发）。
      // 若无原子轮换，输家也会各自换出一套 → 净增 1。
      const activeAfter = await prisma.refreshToken.count({
        where: { userId: session.user.id, revokedAt: null },
      });
      expect(activeAfter - activeBefore).toBe(0);

      // 输家不连坐：赢家的 token 依然可刷新
      const winner = a.status === 200 ? a : b;
      const winnerRefresh = await http(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: winner.body.refreshToken });
      expect(winnerRefresh.status).toBe(200);
    });

    it('超过宽限期的复用视为泄露：吊销该用户全部会话', async () => {
      const session = await loginOk(http(app));
      const rotated = await http(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);

      // 把旧 token 的撤销时间拨回 35 秒前（超过宽限期）
      await backdateRevocation(prisma, session.refreshToken);

      const reuse = await http(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
      expect(reuse.status).toBe(401);

      // 连坐：轮换出的新 token 也被吊销
      const afterReuse = await http(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: rotated.body.refreshToken });
      expect(afterReuse.status).toBe(401);
    });

    it('过期的 refresh token 不能刷新', async () => {
      const session = await loginOk(http(app));
      await prisma.refreshToken.updateMany({
        where: { userId: session.user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await http(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
      expect(res.status).toBe(401);
    });

    it('禁用用户的 refresh 被拒（403）', async () => {
      const session = await loginOk(http(app));
      await prisma.user.update({ where: { id: session.user.id }, data: { status: 'DISABLED' } });
      const res = await http(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
      expect(res.status).toBe(403);
      await prisma.user.update({ where: { id: session.user.id }, data: { status: 'ACTIVE' } });
    });
  });

  describe('登出', () => {
    it('登出幂等，且登出后 refresh 失效', async () => {
      const session = await loginOk(http(app));
      const first = await http(app).post('/api/auth/logout').send({ refreshToken: session.refreshToken });
      const second = await http(app).post('/api/auth/logout').send({ refreshToken: session.refreshToken });
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      const refresh = await http(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
      expect(refresh.status).toBe(401);
    });
  });
});
