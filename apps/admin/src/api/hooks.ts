import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { UserPageQuery } from '@hgxt/shared';
import { fetchMe } from './auth';
import { listUsers } from './users';

/**
 * 当前登录用户；登录成功后可直接 setQueryData(['me'], user) 预填。
 * 聚焦窗口时静默刷新：管理员调整了我的页面权限或角色后，切回标签页即可更新菜单。
 */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: 'always',
  });
}

export function useUsers(params: UserPageQuery) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => listUsers(params),
    placeholderData: keepPreviousData,
  });
}

