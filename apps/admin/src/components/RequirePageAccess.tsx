import type { ReactNode } from 'react';
import { Role, type PagePermission } from '@hgxt/shared';
import { useMe } from '../api/hooks';
import { NoPermissionPage } from '../pages/NoPermissionPage';

export function RequirePageAccess({ permission, children }: { permission: PagePermission; children: ReactNode }) {
  const me = useMe();
  if (me.data && me.data.role !== Role.SUPER_ADMIN && !me.data.pagePermissions.includes(permission)) {
    return <NoPermissionPage />;
  }
  return <>{children}</>;
}
