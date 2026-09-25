import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { hashPassword } from '../src/common/utils/argon';
import { REUSE_GRACE_MS } from '../src/auth/auth.service';

export const ADMIN_PASSWORD = 'Admin@123456';

/** 起一个与 main.ts 等价（前缀/校验管道/安全头）的完整应用；Swagger 属于 main.ts 职责，不在此挂载 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export function http(app: INestApplication): App {
  return request(app.getHttpServer());
}

/** 清库 + 种一个 SUPER_ADMIN（username=admin），返回 PrismaService */
export async function resetDbWithAdmin(
  prisma: PrismaService,
): Promise<{ adminId: string }> {
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      name: '管理员',
      role: 'SUPER_ADMIN',
      passwordHash: await hashPassword(ADMIN_PASSWORD),
    },
  });
  return { adminId: admin.id };
}

export async function loginOk(agent: App, username = 'admin', password = ADMIN_PASSWORD) {
  const res = await agent.post('/api/auth/login').send({ username, password }).expect(200);
  return res.body as {
    accessToken: string;
    refreshToken: string;
    user: { id: string; role: string };
  };
}

/** 把指定 refresh token 的 revokedAt 拨回过去（模拟「撤销很久之后被复用」） */
export async function backdateRevocation(
  prisma: PrismaService,
  refreshToken: string,
  ageMs: number = REUSE_GRACE_MS + 5_000,
): Promise<void> {
  const { sha256Hex } = await import('../src/common/utils/tokens');
  await prisma.refreshToken.update({
    where: { tokenHash: sha256Hex(refreshToken) },
    data: { revokedAt: new Date(Date.now() - ageMs) },
  });
}
