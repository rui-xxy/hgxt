import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { PAGE_PERMISSION_VALUES, type PagePermission } from '@hgxt/shared';

/**
 * 全局 JWT 守卫：校验 Bearer Access Token，并核对用户当前状态与 authVersion，
 * 保证「禁用用户」「重置密码」立即生效，而不是等 15 分钟后 Access Token 过期。
 * A2：旧签发的 JWT 没有 ver 字段（undefined !== 数字）同样会被拒绝——
 * 上线该版本瞬间所有存量会话强制重新登录一次，属预期行为。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractBearerToken(request.headers?.authorization);
    if (!token) throw new UnauthorizedException('未登录');

    let payload: { sub: string; ver?: number };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string; ver?: number }>(token);
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, name: true, role: true, status: true, authVersion: true, pagePermissions: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('账号不可用');
    }
    if (payload.ver !== user.authVersion) {
      throw new UnauthorizedException('登录状态已变更，请重新登录');
    }

    request.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      pagePermissions: user.pagePermissions.filter((permission): permission is PagePermission =>
        PAGE_PERMISSION_VALUES.includes(permission as PagePermission)),
    } satisfies AuthUser;
    return true;
  }

  private extractBearerToken(authorization?: string): string | null {
    if (!authorization?.startsWith('Bearer ')) return null;
    return authorization.slice('Bearer '.length).trim() || null;
  }
}
