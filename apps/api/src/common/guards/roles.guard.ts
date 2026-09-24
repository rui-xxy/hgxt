import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { Role } from '@hgxt/shared';

/** 角色守卫：注册在 JwtAuthGuard 之后，@Roles(...) 未标注则放行 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: { role?: Role } }>();
    if (!user || !user.role || !required.includes(user.role)) {
      throw new ForbiddenException('无权限执行此操作');
    }
    return true;
  }
}
