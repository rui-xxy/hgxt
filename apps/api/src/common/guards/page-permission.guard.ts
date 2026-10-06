import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, type PagePermission } from '@hgxt/shared';
import { PAGE_PERMISSION_KEY } from '../decorators/page-permission.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class PagePermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<PagePermission>(PAGE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (user?.role === Role.SUPER_ADMIN || user?.pagePermissions.includes(permission)) return true;
    throw new ForbiddenException('无权限访问此页面');
  }
}
