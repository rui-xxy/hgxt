import type { LoginResponse, UserDTO } from '@hgxt/shared';
import { request } from './client';

export function loginApi(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { username, password },
    auth: false,
  });
}

export function logoutApi(refreshToken: string): Promise<{ success: true }> {
  return request<{ success: true }>('/auth/logout', {
    method: 'POST',
    body: { refreshToken },
    auth: false,
  });
}

export function fetchMe(): Promise<UserDTO> {
  return request<UserDTO>('/auth/me');
}
