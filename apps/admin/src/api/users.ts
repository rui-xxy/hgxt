import type {
  CreateUserBody,
  ResetPasswordBody,
  UpdateUserBody,
  UserDTO,
  UserPageQuery,
  UserPageResult,
  UserStatus,
} from '@hgxt/shared';
import { request } from './client';

export function listUsers(query: UserPageQuery): Promise<UserPageResult> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.keyword?.trim()) params.set('keyword', query.keyword.trim());
  const qs = params.toString();
  return request<UserPageResult>(`/users${qs ? `?${qs}` : ''}`);
}

export function createUserApi(body: CreateUserBody): Promise<UserDTO> {
  return request<UserDTO>('/users', { method: 'POST', body });
}

export function updateUserApi(id: string, body: UpdateUserBody): Promise<UserDTO> {
  return request<UserDTO>(`/users/${id}`, { method: 'PATCH', body });
}

export function updateUserStatusApi(id: string, status: UserStatus): Promise<UserDTO> {
  return request<UserDTO>(`/users/${id}/status`, { method: 'PATCH', body: { status } });
}

export function resetPasswordApi(id: string, body: ResetPasswordBody): Promise<UserDTO> {
  return request<UserDTO>(`/users/${id}/reset-password`, { method: 'POST', body });
}
