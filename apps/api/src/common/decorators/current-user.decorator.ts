import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PagePermission, Role } from '@hgxt/shared';

/** JwtAuthGuard 校验通过后挂到 request 上的当前用户 */
export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  pagePermissions: PagePermission[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
