import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { UserPageQuery } from '@hgxt/shared';
import { fetchMe } from './auth';
import { listUsers } from './users';

/**
 * 当前登录用户；登录成功后可直接 setQueryData(['me'], user) 预填。
 * 聚焦窗口时静默刷新：其他管理员改了我的角色/姓名，切回标签页即可拿到新值
 * （角色变化影响 RequireSuperAdmin 判断与顶栏展示，不能等 5 分钟 staleTime）
 */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useUsers(params: UserPageQuery) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => listUsers(params),
    placeholderData: keepPreviousData,
  });
}
