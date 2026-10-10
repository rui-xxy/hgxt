import type { ReactNode } from 'react';
import { Role } from '@hgxt/shared';
import { useMe } from '../api/hooks';
import { NoPermissionPage } from '../pages/NoPermissionPage';

/** 后台数据管理允许管理员和超级管理员进入。 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.data && me.data.role !== Role.ADMIN && me.data.role !== Role.SUPER_ADMIN) {
    return <NoPermissionPage />;
  }
  return <>{children}</>;
}
