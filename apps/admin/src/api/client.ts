/**
 * 统一请求层：
 *  - 自动携带 Bearer Access Token
 *  - 401 时「单飞」刷新 Refresh Token 并重放一次原请求
 *  - 刷新失败 → 清空本地会话并回调 onAuthFailure（由路由层注册跳转 /login）
 *
 * V1 取舍：token 存 localStorage，简单直接；升级路径是后端下发
 * httpOnly cookie（需要 CSRF 防护），届时只改这一个文件。
 */
import type { RefreshResponse } from '@hgxt/shared';

const ACCESS_TOKEN_KEY = 'hgxt:accessToken';
const REFRESH_TOKEN_KEY = 'hgxt:refreshToken';

export const tokenStore = {
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 会话彻底失效（刷新也失败）时由路由层注册，负责跳转登录页 */
let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(handler: () => void): void {
  onAuthFailure = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** false 表示不带 token（登录/刷新本身） */
  auth?: boolean;
}

/** 单飞：并发多个 401 时只发起一次 refresh */
let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as RefreshResponse;
    tokenStore.setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function refreshOnce(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as { message?: string | string[] };
    const message = Array.isArray(data.message) ? data.message[0] : data.message;
    return new ApiError(res.status, message || `请求失败（${res.status}）`);
  } catch {
    return new ApiError(res.status, `请求失败（${res.status}）`);
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const needAuth = options.auth !== false;

  const doFetch = (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (needAuth) {
      const token = tokenStore.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let res = await doFetch();

  if (res.status === 401 && needAuth) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      res = await doFetch();
    } else {
      tokenStore.clear();
      onAuthFailure?.();
    }
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
