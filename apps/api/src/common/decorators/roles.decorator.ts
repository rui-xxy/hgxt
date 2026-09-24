import { SetMetadata } from '@nestjs/common';
import type { Role } from '@hgxt/shared';

export const ROLES_KEY = 'roles';

/** 标注访问该接口/控制器所需的最低角色（RolesGuard 校验） */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
