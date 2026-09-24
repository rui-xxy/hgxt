import type { ReactNode } from 'react';
import { Role } from '@hgxt/shared';
import { useMe } from '../api/hooks';
import { NoPermissionPage } from '../pages/NoPermissionPage';

/** 用户管理仅 SUPER_ADMIN 可见可用；后端 RolesGuard 同样拦截 */
export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.data && me.data.role !== Role.SUPER_ADMIN) {
    return <NoPermissionPage />;
  }
  return <>{children}</>;
}
