import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { UserPageQuery } from '@hgxt/shared';
import { fetchMe } from './auth';
import { listUsers } from './users';

/** 当前登录用户；登录成功后可直接 setQueryData(['me'], user) 预填 */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useUsers(params: UserPageQuery) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => listUsers(params),
    placeholderData: keepPreviousData,
  });
}
