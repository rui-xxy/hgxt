import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginResponse, RefreshResponse, UserDTO } from '@hgxt/shared';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { verifyPassword } from '../common/utils/argon';
import { generateRefreshToken, sha256Hex } from '../common/utils/tokens';
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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, password: string): Promise<LoginResponse> {
    // 顺带清理已过期的 refresh token，避免表无限膨胀
    await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    // E2：用户名统一小写，登录不区分大小写
    const user = await this.prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    // 用户不存在与密码错误返回同一句话，避免账号枚举
    if (!user) throw new UnauthorizedException('用户名或密码错误');
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('账号已被禁用，请联系管理员');
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) throw new UnauthorizedException('用户名或密码错误');

    const tokens = await this.issueTokens(user);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
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
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256Hex(refreshToken), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
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
