import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 标注无需登录即可访问的接口（JwtAuthGuard 会放行） */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
