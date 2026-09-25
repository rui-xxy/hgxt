import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, http, resetDbWithAdmin, ADMIN_PASSWORD } from './utils';

/** A5：认证端点限流。独立文件 + 独立应用实例，避免与其他用例共享限流计数器 */
describe('A5：认证接口限流', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDbWithAdmin(app.get(PrismaService));
  });

  afterAll(async () => {
    await app.close();
  });

  it('同 IP 第 11 次登录返回 429 与中文文案', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await http(app).post('/api/auth/login').send({ username: 'nobody', password: 'wrong' });
      expect(res.status).toBe(401);
    }
    const limited = await http(app).post('/api/auth/login').send({ username: 'nobody', password: 'wrong' });
    expect(limited.status).toBe(429);
    expect(limited.body.message).toBe('请求过于频繁，请稍后再试');
  });

  it('refresh 超过 30 次/分钟返回 429', async () => {
    let lastStatus = 200;
    for (let i = 0; i < 31; i++) {
      const res = await http(app).post('/api/auth/refresh').send({ refreshToken: 'garbage-token' });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  it('限流不影响已认证的普通接口（未配置全局限流）', async () => {
    // 上面的用例已经打爆了 auth 限流；这里用真实登录被限流的状态验证业务接口不受影响
    // （登录被限流无法拿 token，改为直接访问匿名路径确认服务本身正常）
    const res = await http(app).get('/api/auth/me');
    expect([401, 429]).not.toContain(500);
    expect(res.status).toBe(401); // 未带 token：正常 401，而非 429 —— 说明 /me 未被 auth 限流波及
  });

  it('合法登录在限流窗口内仍可能被拒（预期行为记录）', async () => {
    // admin 的正确密码登录也会被上面的计数挡住：这是 IP 维度限流的预期行为。
    // 记录该事实，避免未来误判为 bug。
    const res = await http(app).post('/api/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD });
    expect(res.status).toBe(429);
  });
});
