import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { shiftDateKey, shanghaiDateKey } from '@hgxt/shared';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, http, resetDbWithAdmin, ADMIN_PASSWORD, type App } from './utils';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('monitor 访问监控', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: App;
  let adminToken = '';
  let userToken = '';
  let userId = '';
  let managerToken = '';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    agent = http(app);
    await resetDbWithAdmin(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('埋点需要登录（匿名上报 401）', async () => {
    const res = await agent.post('/api/monitor/events').send({ action: 'page_view', page: 'board' });
    expect(res.status).toBe(401);
  });

  it('登录失败会写入安全提醒与访问日志', async () => {
    const res = await agent.post('/api/auth/login').send({ username: 'nobody', password: 'wrong-pass' });
    expect(res.status).toBe(401);
  });

  it('埋点只接受行为事件：export / login 由服务端记录，客户端上报被拒', async () => {
    const login = await agent.post('/api/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD }).expect(200);
    adminToken = login.body.accessToken;

    await agent
      .post('/api/monitor/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'page_view', page: 'monitor' })
      .expect(204);
    expect(await prisma.accessEvent.count({ where: { username: 'admin' } })).toBe(0);

    for (const action of ['export', 'login', 'submit', 'heartbeat-extra']) {
      const res = await agent
        .post('/api/monitor/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action, page: 'materials', detail: '伪造导出' });
      expect(res.status).toBe(400);
    }
    // 伪造尝试不产生 export 事件，安全提醒不受污染
    const exports = await prisma.accessEvent.count({ where: { action: 'export' } });
    expect(exports).toBe(0);
  });

  it('查询参数校验：非法日期 / 非整数分页 / 超长区间一律 400', async () => {
    const badDate = await agent
      .get('/api/monitor/overview?from=2026-13-99')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(badDate.status).toBe(400);

    const badPage = await agent
      .get('/api/monitor/logs?page=abc')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(badPage.status).toBe(400);

    const zeroPage = await agent
      .get('/api/monitor/logs?page=0')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(zeroPage.status).toBe(400);

    const today = shanghaiDateKey(new Date());
    const tooWide = await agent
      .get(`/api/monitor/overview?from=${shiftDateKey(today, -120)}&to=${today}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(tooWide.status).toBe(400);
    expect(tooWide.body.message).toContain('最多查询');
  });

  it('创建带部门的普通用户并登录（部门计入活跃矩阵）', async () => {
    const created = await agent
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'lijing', name: '李静', password: 'User@12345678', role: 'USER', department: '硫酸生产部' })
      .expect(201);
    userId = created.body.id;
    expect(created.body.department).toBe('硫酸生产部');

    const login = await agent
      .post('/api/auth/login')
      .set('User-Agent', MOBILE_UA)
      .send({ username: 'lijing', password: 'User@12345678' })
      .expect(200);
    userToken = login.body.accessToken;

    await agent
      .post('/api/monitor/events')
      .set('Authorization', `Bearer ${userToken}`)
      .set('User-Agent', MOBILE_UA)
      .send({ action: 'page_view', page: 'board' })
      .expect(204);
  });

  it('管理员可管理业务表单，但访问监控和成员管理仅超级管理员可见', async () => {
    await agent.post('/api/users').set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'manager', name: '业务管理员', password: 'User@12345678', role: 'ADMIN' }).expect(201);
    const login = await agent.post('/api/auth/login')
      .send({ username: 'manager', password: 'User@12345678' }).expect(200);
    managerToken = login.body.accessToken;
    await agent.post('/api/monitor/events').set('Authorization', `Bearer ${managerToken}`)
      .send({ action: 'page_view', page: 'forms' }).expect(204);
    await agent.get('/api/forms').set('Authorization', `Bearer ${managerToken}`).expect(200);
    await agent.get('/api/monitor/overview').set('Authorization', `Bearer ${managerToken}`).expect(403);
    await agent.get('/api/users').set('Authorization', `Bearer ${managerToken}`).expect(403);
  });

  it('总览：KPI、小时分布与设备占比反映埋点', async () => {
    const res = await agent.get('/api/monitor/overview').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body.kpis.pageViews.count).toBeGreaterThanOrEqual(2);
    expect(res.body.kpis.online.count).toBeGreaterThanOrEqual(2);
    expect(res.body.kpis.online.mobile).toBeGreaterThanOrEqual(1);
    expect(res.body.kpis.visitors.users).toBeGreaterThanOrEqual(2);
    expect(res.body.kpis.visitors.totalUsers).toBe(2);
    expect(res.body.chart.mode).toBe('hourly');
    expect(res.body.chart.hours).toHaveLength(24);
    const totalBars = res.body.chart.hours.reduce((sum: number, row: { today: number }) => sum + row.today, 0);
    expect(totalBars).toBe(res.body.kpis.pageViews.count);
  });

  it('访问人数按页面访问去重，不依赖当天是否重新登录；历史超级管理员事件不展示', async () => {
    const visitor = await prisma.user.create({
      data: { username: 'returning', name: '免登录访客', passwordHash: 'not-a-real-hash', role: 'USER' },
    });
    const superAdmin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
    await prisma.accessEvent.createMany({ data: [
      { userId: visitor.id, actorRole: 'USER', username: visitor.username, name: visitor.name, action: 'page_view', page: 'board' },
      { userId: visitor.id, actorRole: 'USER', username: visitor.username, name: visitor.name, action: 'page_view', page: 'energy' },
      { userId: superAdmin.id, actorRole: 'SUPER_ADMIN', username: superAdmin.username, name: superAdmin.name, action: 'page_view', page: 'monitor' },
    ] });
    const overview = await agent.get('/api/monitor/overview').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(overview.body.kpis.visitors.users).toBe(3);
    expect(overview.body.kpis.visitors.totalUsers).toBe(3);
    const logs = await agent.get('/api/monitor/logs?tab=view').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(logs.body.items.some((item: { username: string }) => item.username === 'admin')).toBe(false);
  });

  it('普通用户无权访问监控查询（403）', async () => {
    const res = await agent.get('/api/monitor/overview').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('安全提醒包含登录失败；日志页签按动作过滤', async () => {
    const security = await agent
      .get('/api/monitor/security')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(security.body.total).toBeGreaterThanOrEqual(1);
    expect(security.body.items.some((item: { kind: string }) => item.kind === 'login_failed')).toBe(true);

    const loginTab = await agent
      .get('/api/monitor/logs?tab=login')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(loginTab.body.items.some((item: { action: string }) => item.action === 'login_failed')).toBe(true);
    expect(loginTab.body.items.some((item: { action: string }) => item.action === 'page_view')).toBe(false);

    const failedRow = loginTab.body.items.find((item: { action: string }) => item.action === 'login_failed');
    expect(failedRow.detail).toContain('第 1 次');
  });

  it('页面热度按页面聚合；部门活跃统计实际访问人数', async () => {
    const pages = await agent.get('/api/monitor/pages').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const board = pages.body.rows.find((row: { page: string }) => row.page === 'board');
    expect(board).toBeDefined();
    expect(board.views).toBeGreaterThanOrEqual(1);
    expect(board.label).toBe('车间版面');

    const departments = await agent
      .get('/api/monitor/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(departments.body.dates).toHaveLength(7);
    const sulfuric = departments.body.rows.find((row: { department: string }) => row.department === '硫酸生产部');
    expect(sulfuric).toBeDefined();
    expect(sulfuric.counts[6]).toBeGreaterThanOrEqual(1);
  });

  it('部门活跃支持历史截止日期（不再悄悄回落到今天）', async () => {
    const yesterday = shiftDateKey(shanghaiDateKey(new Date()), -1);
    const res = await agent
      .get(`/api/monitor/departments?to=${yesterday}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.dates).toHaveLength(7);
    expect(res.body.dates[6]).toBe(yesterday);
  });

  it('成员详情：会话、足迹、登录记录与实时在线', async () => {
    const res = await agent.get(`/api/monitor/members/${userId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body.user.username).toBe('lijing');
    expect(res.body.user.department).toBe('硫酸生产部');
    expect(res.body.online.active).toBe(true);
    expect(res.body.kpis.sessions).toBeGreaterThanOrEqual(1);
    expect(res.body.kpis.views).toBeGreaterThanOrEqual(1);
    expect(res.body.footprint[0].action).toBe('page_view');
    expect(res.body.footprint[0].device).toBe('mobile');
    expect(res.body.logins).toHaveLength(1);
    expect(res.body.logins[0].online).toBe(true);
    expect(res.body.weekOnline).toHaveLength(7);
  });

  it('停留时长：心跳不截断，以下一个不同页面为边界', async () => {
    const today = shanghaiDateKey(new Date());
    // 跨午夜的罕见时窗跳过（事件必须落在今天）
    if (today !== shanghaiDateKey(new Date(Date.now() - 9 * 60_000))) return;

    const dweller = await prisma.user.create({
      data: {
        username: 'dwell_probe',
        name: '=@probe', // 顺带验证 CSV 公式中和（姓名以 = 开头）
        department: '工艺技术部',
        passwordHash: 'not-a-real-hash',
        role: 'USER',
      },
    });
    const now = Date.now();
    await prisma.accessEvent.createMany({
      data: [
        { userId: dweller.id, username: 'dwell_probe', name: '=@probe', department: '工艺技术部', action: 'page_view', page: 'energy', detail: 'dwell-test', device: 'desktop', createdAt: new Date(now - 9 * 60_000) },
        { userId: dweller.id, username: 'dwell_probe', name: '=@probe', department: '工艺技术部', action: 'heartbeat', device: 'desktop', createdAt: new Date(now - 6 * 60_000) },
        { userId: dweller.id, username: 'dwell_probe', name: '=@probe', department: '工艺技术部', action: 'page_view', page: 'board', detail: null, device: 'desktop', createdAt: new Date(now - 3 * 60_000) },
      ],
    });
    const res = await agent
      .get(`/api/monitor/pages?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = res.body.rows.find((item: { label: string }) => item.label === '能源中心 · dwell-test');
    expect(row).toBeDefined();
    // 9 分钟前进入 → 3 分钟前换页：约 6 分钟停留，而不是被 1 分钟前的心跳截断
    expect(row.avgDwellSec).toBeGreaterThanOrEqual(300);
    expect(row.avgDwellSec).toBeLessThanOrEqual(450);
  });

  it('登出立即离线；重复登出只记录一次；登录失败不算在线', async () => {
    const created = await agent
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'trackuser', name: '跟踪用户', password: 'User@12345678', role: 'USER' })
      .expect(201);
    const trackId = created.body.id;
    const login = await agent
      .post('/api/auth/login')
      .send({ username: 'trackuser', password: 'User@12345678' })
      .expect(200);

    await agent
      .post('/api/monitor/events')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ action: 'page_view', page: 'plan' })
      .expect(204);

    const before = await agent.get('/api/monitor/online').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(before.body.items.some((item: { userId: string }) => item.userId === trackId)).toBe(true);

    await agent.post('/api/auth/logout').send({ refreshToken: login.body.refreshToken }).expect(200);

    const after = await agent.get('/api/monitor/online').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(after.body.items.some((item: { userId: string }) => item.userId === trackId)).toBe(false);

    // 同一 token 再次登出：幂等成功，但不再产生第二条 logout 事件（条件更新抢占）
    await agent.post('/api/auth/logout').send({ refreshToken: login.body.refreshToken }).expect(200);
    const logoutEvents = await prisma.accessEvent.count({ where: { userId: trackId, action: 'logout' } });
    expect(logoutEvents).toBe(1);

    // 登录失败不能让成员「复活」为在线
    await agent.post('/api/auth/login').send({ username: 'trackuser', password: 'wrong' }).expect(401);
    const member = await agent.get(`/api/monitor/members/${trackId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(member.body.online.active).toBe(false);
  });

  it('强制下线：吊销全部会话并使旧 Access Token 失效，不能对自己使用', async () => {
    // 不存在的用户 → 404
    const missing = await agent.post('/api/users/00000000-0000-4000-8000-000000000000/force-offline').set('Authorization', `Bearer ${adminToken}`);
    expect(missing.status).toBe(404);

    // 不能强制下线自己
    const me = await agent.get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const selfForce = await agent.post(`/api/users/${me.body.id}/force-offline`).set('Authorization', `Bearer ${adminToken}`);
    expect(selfForce.status).toBe(400);

    const res = await agent.post(`/api/users/${userId}/force-offline`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    expect(res.body.id).toBe(userId);

    // 强制下线写入 logout 边界事件，当前在线立即移出
    const online = await agent.get('/api/monitor/online').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(online.body.items.some((item: { userId: string }) => item.userId === userId)).toBe(false);

    // 旧 access token 立即失效
    const denied = await agent.get('/api/auth/me').set('Authorization', `Bearer ${userToken}`);
    expect(denied.status).toBe(401);
    // refresh token 以 FORCE_OFFLINE 吊销
    const revoked = await prisma.refreshToken.findFirst({
      where: { userId, revokedReason: 'FORCE_OFFLINE' },
    });
    expect(revoked).not.toBeNull();
  });

  it('访问日志导出 CSV（带 BOM、含表头、公式中和），超级管理员导出不记行为', async () => {
    const res = await agent
      .get('/api/monitor/logs/export?tab=all')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.startsWith('\uFEFF')).toBe(true);
    expect(res.text).toContain('访问日志');
    expect(res.text).toContain('页面 / 对象');
    expect(res.text).toContain('登录失败');
    // 以 = 开头的姓名被中和为 '=...，Excel 不会当作公式
    expect(res.text).toContain("'=@" );

    // 超级管理员的导出及其它行为均不入监控事件流
    const exportEvent = await prisma.accessEvent.findFirst({
      where: { action: 'export' },
      orderBy: { createdAt: 'desc' },
    });
    expect(exportEvent).toBeNull();
  });

  it('多设备：电脑登出不误伤仍在使用的手机会话', async () => {
    const created = await agent
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'multidev', name: '多设备用户', password: 'User@12345678', role: 'USER', department: '总经办' })
      .expect(201);
    const multiId = created.body.id;

    const desktopLogin = await agent
      .post('/api/auth/login')
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36')
      .send({ username: 'multidev', password: 'User@12345678' })
      .expect(200);
    const mobileLogin = await agent
      .post('/api/auth/login')
      .set('User-Agent', MOBILE_UA)
      .send({ username: 'multidev', password: 'User@12345678' })
      .expect(200);

    // 手机访问页面（手机流活跃）
    await agent
      .post('/api/monitor/events')
      .set('Authorization', `Bearer ${mobileLogin.body.accessToken}`)
      .set('User-Agent', MOBILE_UA)
      .send({ action: 'page_view', page: 'energy' })
      .expect(204);

    // 电脑登出（桌面流终止）
    await agent
      .post('/api/auth/logout')
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36')
      .send({ refreshToken: desktopLogin.body.refreshToken })
      .expect(200);

    // 手机的活动晚于电脑登出 → 仍应在线，且设备为手机
    const online = await agent.get('/api/monitor/online').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const row = online.body.items.find((item: { userId: string }) => item.userId === multiId);
    expect(row).toBeDefined();
    expect(row.device).toBe('mobile');
    expect(row.page).toBe('energy');

    const member = await agent.get(`/api/monitor/members/${multiId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(member.body.online.active).toBe(true);
    expect(member.body.online.device).toBe('mobile');

    // 手机也登出（带手机 UA，登出事件落进手机流）→ 整体离线
    await agent
      .post('/api/auth/logout')
      .set('User-Agent', MOBILE_UA)
      .send({ refreshToken: mobileLogin.body.refreshToken })
      .expect(200);
    const offline = await agent.get('/api/monitor/online').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(offline.body.items.some((item: { userId: string }) => item.userId === multiId)).toBe(false);
  });

  it('登出关闭的会话不加尾部宽放（分钟级会话终点即登出时刻）', async () => {
    const today = shanghaiDateKey(new Date());
    if (today !== shanghaiDateKey(new Date(Date.now() - 40 * 60_000))) return; // 跨午夜时窗跳过

    const probe = await prisma.user.create({
      data: { username: 'tail_probe', name: '宽放探针', passwordHash: 'not-a-real-hash', role: 'USER' },
    });
    // 分钟对齐，避免秒数让「分钟数四舍五入」与测试期望错位
    const minuteBase = Math.floor(Date.now() / 60_000) * 60_000;
    const loginAt = new Date(minuteBase - 40 * 60_000);
    const logoutAt = new Date(minuteBase - 30 * 60_000);
    await prisma.accessEvent.createMany({
      data: [
        { userId: probe.id, username: 'tail_probe', name: '宽放探针', action: 'login', device: 'desktop', client: 'Chrome 129 · Windows', createdAt: loginAt },
        { userId: probe.id, username: 'tail_probe', name: '宽放探针', action: 'page_view', page: 'board', device: 'desktop', createdAt: new Date(minuteBase - 38 * 60_000) },
        { userId: probe.id, username: 'tail_probe', name: '宽放探针', action: 'logout', device: 'desktop', createdAt: logoutAt },
      ],
    });
    const member = await agent.get(`/api/monitor/members/${probe.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(member.body.sessions).toHaveLength(1);
    const minuteOfDay = (time: Date) =>
      new Date(time.getTime() + 8 * 3_600_000).getUTCHours() * 60
      + new Date(time.getTime() + 8 * 3_600_000).getUTCMinutes();
    expect(member.body.sessions[0].start).toBe(minuteOfDay(loginAt));
    // 登出是明确终点：不再 +5 分钟宽放
    expect(member.body.sessions[0].end).toBe(minuteOfDay(logoutAt));
  });

  it('埋点限流按用户分桶：超频被弃，且不占用其他用户的配额', async () => {
    await agent
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'burst', name: '高频用户', password: 'User@12345678', role: 'USER' })
      .expect(201);
    const login = await agent
      .post('/api/auth/login')
      .send({ username: 'burst', password: 'User@12345678' })
      .expect(200);
    const burstToken = login.body.accessToken;

    // 同一用户连发 130 次（上限 120/分钟）→ 出现 429
    let throttled = 0;
    for (let i = 0; i < 130; i += 1) {
      const res = await agent
        .post('/api/monitor/events')
        .set('Authorization', `Bearer ${burstToken}`)
        .send({ action: 'heartbeat' });
      if (res.status === 429) throttled += 1;
    }
    expect(throttled).toBeGreaterThanOrEqual(1);

    // burst 被限流不影响同 IP 的其他用户（共享出口 IP 场景）：admin 仍可正常上报
    const adminOk = await agent
      .post('/api/monitor/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'heartbeat' });
    expect(adminOk.status).toBe(204);
  });

  it('超 1 万条日志的 CSV 导出显式标注截断，不静默丢数据', async () => {
    const today = shanghaiDateKey(new Date());
    const bulk = Array.from({ length: 10_050 }, (_, index) => ({
      username: 'bulk_probe',
      name: '批量探针',
      action: 'page_view',
      page: 'board',
      device: 'desktop',
      createdAt: new Date(Date.now() - 60_000 - index * 10),
    }));
    await prisma.accessEvent.createMany({ data: bulk });

    const res = await agent
      .get(`/api/monitor/logs/export?tab=view&from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Number(res.headers['x-total-count'])).toBeGreaterThan(10_000);
    expect(Number(res.headers['x-exported-count'])).toBe(10_000);
    expect(res.text).toContain('导出最近 10,000 条');
  });
});
