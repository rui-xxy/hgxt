import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginResponse, RefreshResponse, UserDTO } from '@hgxt/shared';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { verifyPassword } from '../common/utils/argon';
import { generateRefreshToken, sha256Hex } from '../common/utils/tokens';
import type { UaInfo } from '../common/utils/ua';
import { MonitorService } from '../monitor/monitor.service';
import { toUserDTO } from '../users/user.mapper';
import type { User } from '../generated/prisma/client';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A1 复用检测宽限期：同一 Refresh Token 在撤销后短时间内再次出现，
 * 更可能是并发竞争的「输家」（多标签页）而非泄露。宽限期内只拒绝、
 * 不连坐吊销；超过宽限期的复用视为疑似泄露，吊销该用户全部会话。
 */
export const REUSE_GRACE_MS = 30_000;

export interface LoginMeta {
  ip?: string | null;
  ua?: UaInfo;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly monitor: MonitorService,
  ) {}

  async login(username: string, password: string, meta: LoginMeta = {}): Promise<LoginResponse> {
    // 顺带清理已过期的 refresh token 与超期访问事件，避免表无限膨胀
    await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await this.monitor.cleanupExpired();

    // E2：用户名统一小写，登录不区分大小写
    const normalized = username.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { username: normalized } });
    // 用户不存在与密码错误返回同一句话，避免账号枚举
    if (!user) {
      await this.monitor.recordLoginFailure({ username: normalized, reason: '用户名或密码错误', ...meta });
      throw new UnauthorizedException('用户名或密码错误');
    }
    if (user.status !== 'ACTIVE') {
      await this.monitor.recordLoginFailure({
        userId: user.id,
        username: user.username,
        name: user.name,
        reason: '账号已被禁用',
        ...meta,
      });
      throw new ForbiddenException('账号已被禁用，请联系管理员');
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      await this.monitor.recordLoginFailure({
        userId: user.id,
        username: user.username,
        name: user.name,
        reason: '密码错误',
        ...meta,
      });
      throw new UnauthorizedException('用户名或密码错误');
    }

    const tokens = await this.issueTokens(user);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.monitor.record({
      userId: user.id,
      username: user.username,
      name: user.name,
      department: user.department,
      action: 'login',
      detail: meta.ua?.client ?? null,
      ip: meta.ip ?? null,
      ua: meta.ua,
    });

    return { ...tokens, user: toUserDTO(user) };
  }

  /**
   * A1：轮换的原子性由「条件更新抢占」保证——
   * `WHERE tokenHash = ? AND revokedAt IS NULL` 的 UPDATE 只有一个并发请求能改到 1 行。
   * 抢占成功后在**同一事务**内写入新 Token：若 create 失败，抢占一并回滚，
   * 旧 token 仍有效，客户端可无感重试，不会出现「旧作废了但没有新 token」的中间态。
   * 不依赖前端单飞，多标签页并发也只有一个成功。
   */
  async refresh(refreshToken: string): Promise<RefreshResponse> {
    const tokenHash = sha256Hex(refreshToken);
    const now = new Date();

    const claimed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now, revokedReason: 'ROTATED' },
      });
      if (result.count !== 1) return null;
      const row = await tx.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
      if (!row) return null;
      if (row.user.status !== 'ACTIVE') {
        // 禁用竞态兜底：直接抛出并回滚抢占（该用户 token 已随禁用被吊销）
        throw new ForbiddenException('账号已被禁用，请联系管理员');
      }
      const tokens = await this.issueTokens(row.user, tx);
      return { row, tokens };
    });

    if (!claimed) {
      return this.rejectStaleToken(tokenHash, now);
    }

    return { ...claimed.tokens, user: toUserDTO(claimed.row.user) };
  }

  /** 抢占失败后的分类处理：不存在 / 过期 / 并发输家 / 疑似泄露 */
  private async rejectStaleToken(tokenHash: string, now: Date): Promise<never> {
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    if (existing.revokedAt) {
      const revokedAgo = now.getTime() - existing.revokedAt.getTime();
      if (revokedAgo > REUSE_GRACE_MS) {
        // 撤销很久之后仍被复用：疑似 Token 泄露，吊销该用户全部会话
        await this.prisma.refreshToken.updateMany({
          where: { userId: existing.userId, revokedAt: null },
          data: { revokedAt: now, revokedReason: 'REUSE_DETECTED' },
        });
        throw new UnauthorizedException('登录状态异常，请重新登录');
      }
      // 宽限期内：并发竞争输家，仅拒绝本次，不连坐
      throw new UnauthorizedException('登录状态已变更，请重新登录');
    }
    throw new UnauthorizedException('登录已过期，请重新登录');
  }

  /** 幂等：token 不存在或已作废都视为成功 */
  async logout(refreshToken: string, meta: LoginMeta = {}): Promise<void> {
    const tokenHash = sha256Hex(refreshToken);
    // 条件更新抢占（原子）：并发登出同一 token 只有一个能改到 1 行，
    // 也只有那一次会写入 logout 事件——不存在重复登出记录
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
    });
    if (revoked.count !== 1) return;
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!existing?.user) return;

    // 会话时长：取**同一客户端**（UA 摘要一致）的最近一次登录，避免多设备会话混算
    const clientKey = meta.ua?.client ?? null;
    const lastLogin = await this.prisma.accessEvent.findFirst({
      where: {
        userId: existing.userId,
        action: 'login',
        createdAt: { lt: new Date() },
        ...(clientKey ? { client: clientKey } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    let detail: string | null = null;
    if (lastLogin) {
      const spanMs = Date.now() - lastLogin.createdAt.getTime();
      if (spanMs >= 5 * 60_000) {
        const minutes = Math.round(spanMs / 60_000);
        const hours = Math.floor(minutes / 60);
        detail = `在线 ${hours > 0 ? `${hours} 小时 ` : ''}${minutes % 60} 分钟`;
      }
    }
    await this.monitor.record({
      userId: existing.userId,
      username: existing.user.username,
      name: existing.user.name,
      department: existing.user.department,
      action: 'logout',
      detail,
      ip: meta.ip ?? null,
      ua: meta.ua,
    });
  }

  async me(userId: string): Promise<UserDTO> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('账号不存在');
    return toUserDTO(user);
  }

  private async issueTokens(
    user: User,
    tx?: Prisma.TransactionClient,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    // A2：authVersion 签进 JWT，守卫核对版本实现「重置密码后旧 Access 立即失效」
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
      role: user.role,
      ver: user.authVersion,
    });
    const refreshToken = generateRefreshToken();
    const client = tx ?? this.prisma;
    await client.refreshToken.create({
      data: {
        tokenHash: sha256Hex(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }
}
