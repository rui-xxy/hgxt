import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginResponse, RefreshResponse, UserDTO } from '@hgxt/shared';
import { PrismaService } from '../database/prisma.service';
import { verifyPassword } from '../common/utils/argon';
import { generateRefreshToken, sha256Hex } from '../common/utils/tokens';
import { toUserDTO } from '../users/user.mapper';
import type { User } from '../generated/prisma/client';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

    const user = await this.prisma.user.findUnique({ where: { username } });
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

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    const tokenHash = sha256Hex(refreshToken);
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!row) throw new UnauthorizedException('登录状态已失效，请重新登录');

    if (row.revokedAt) {
      // 已作废的 token 再次出现：可能被窃取复用，吊销该用户全部会话
      await this.prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('登录状态异常，请重新登录');
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
    if (row.user.status !== 'ACTIVE') {
      throw new ForbiddenException('账号已被禁用，请联系管理员');
    }

    // 轮换：旧的作废、发新的
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    const tokens = await this.issueTokens(row.user);
    return { ...tokens, user: toUserDTO(row.user) };
  }

  /** 幂等：token 不存在或已作废都视为成功 */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256Hex(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<UserDTO> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('账号不存在');
    return toUserDTO(user);
  }

  private async issueTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
    const refreshToken = generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: sha256Hex(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }
}
