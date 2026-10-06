import { PAGE_PERMISSION_VALUES, type PagePermission, type UserDTO } from '@hgxt/shared';
import type { User } from '../generated/prisma/client';

/** Prisma User → 对外 DTO（剔除 passwordHash，日期统一 ISO 字符串） */
export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    phone: user.phone,
    role: user.role,
    pagePermissions: user.pagePermissions.filter((permission): permission is PagePermission =>
      PAGE_PERMISSION_VALUES.includes(permission as PagePermission)),
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
