import { SetMetadata } from '@nestjs/common';
import type { PagePermission } from '@hgxt/shared';

export const PAGE_PERMISSION_KEY = 'pagePermission';

export const PageAccess = (permission: PagePermission) => SetMetadata(PAGE_PERMISSION_KEY, permission);
