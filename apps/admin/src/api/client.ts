/**
 * 统一请求层（D1/D2 整改版）：
 *  - 错误三分类：'auth'（认证失效）/ 'server'（服务端错误）/ 'network'（网络不通）/ 'client'（业务 4xx）
 *  - 401 时「单飞」刷新 Refresh Token 并重放原请求
 *  - 同一个旧 Refresh Token 只尝试刷新一次（A1 服务端原子轮换的客户端配合）：
 *    竞争输家不重试旧 token（避免触发服务端复用检测连坐吊销），而是检查
 *    localStorage 是否已被获胜标签页写入新 token（D2 时序：storage 事件可能晚于失败）
 *  - 其他标签页登出时通过 storage 事件同步登出
 *
 * V1 取舍：token 存 localStorage；升级路径是后端下发 httpOnly cookie（需 CSRF 防护），届时只改本文件。
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

/** 错误类别：守卫只把 'auth' 当作「需要重新登录」，其余绝不登出 */
export type ApiErrorKind = 'auth' | 'server' | 'network' | 'client';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public kind: ApiErrorKind,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 认证彻底失效（刷新也失败）时由路由层注册，负责跳转登录页 */
let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(handler: (() => void) | null): void {
  onAuthFailure = handler;
}

/** D2：其他标签页登出时由路由层注册（清缓存 + 跳登录），storage 事件触发 */
let onExternalLogout: (() => void) | null = null;
export function setExternalLogoutHandler(handler: (() => void) | null): void {
  onExternalLogout = handler;
}

if (typeof window !== 'undefined') {
  // D2：跨标签页同步。storage 事件只在「其他」标签页修改 localStorage 时触发。
  // 登出 → access token 被移除 → 本页同步登出；刷新 → token 更新 → 每次请求
  // 实时读取 localStorage，无需额外处理。
  window.addEventListener('storage', (event) => {
    if (event.key !== ACCESS_TOKEN_KEY && event.key !== REFRESH_TOKEN_KEY) return;
    if (!tokenStore.getAccessToken()) {
      onExternalLogout?.();
    }
  });
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** false 表示不带 token（登录/刷新本身） */
  auth?: boolean;
}

type RefreshOutcome = 'ok' | 'auth' | 'network';

/** 单飞：并发多个 401 时只发起一次 refresh；且每个旧 token 至多尝试一次 */
let refreshing: Promise<RefreshOutcome> | null = null;
let lastAttemptedToken: string | null = null;

async function attemptRefresh(): Promise<RefreshOutcome> {
  const attempted = tokenStore.getRefreshToken();
  if (!attempted) return 'auth';

  if (attempted === lastAttemptedToken) {
    // 这个旧 token 刚才已经失败过：不再用它重试（避免命中服务端复用检测）。
    // 但如果其他标签页已经换出新 token（storage 已更新），直接视为成功。
    const current = tokenStore.getRefreshToken();
    return current !== null && current !== attempted && tokenStore.getAccessToken()
      ? 'ok'
      : 'auth';
  }
  lastAttemptedToken = attempted;

  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: attempted }),
    });
    if (res.ok) {
      const data = (await res.json()) as RefreshResponse;
      tokenStore.setTokens(data.accessToken, data.refreshToken);
      return 'ok';
    }
    // 判定为认证失败之前再读一次：并发竞争中获胜的标签页可能刚把新 token
    // 写进 localStorage（storage 事件与本次失败存在时序竞争，见整改文档 D2）
    const latest = tokenStore.getRefreshToken();
    if (latest && latest !== attempted && tokenStore.getAccessToken()) return 'ok';
    return 'auth';
  } catch {
    return 'network';
  }
}

function refreshOnce(): Promise<RefreshOutcome> {
  refreshing ??= attemptRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function parseError(res: Response): Promise<ApiError> {
  const kind: ApiErrorKind =
    res.status === 401 || res.status === 403 ? 'auth' : res.status >= 500 ? 'server' : 'client';
  try {
    const data = (await res.json()) as { message?: string | string[] };
    const message = Array.isArray(data.message) ? data.message[0] : data.message;
    return new ApiError(res.status, message || `请求失败（${res.status}）`, kind);
  } catch {
    return new ApiError(res.status, `请求失败（${res.status}）`, kind);
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const needAuth = options.auth !== false;

  const doFetch = async (): Promise<Response> => {
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

  const networkError = () =>
    new ApiError(0, '无法连接服务器，请检查网络或服务状态', 'network');

  let res: Response;
  try {
    res = await doFetch();
  } catch {
    throw networkError();
  }

  if (res.status === 401 && needAuth) {
    const outcome = await refreshOnce();

    if (outcome === 'network') throw networkError();

    // ok / auth：只要本地还有 token（自己刷新成功，或获胜标签页写入的新 token），重放一次
    if (tokenStore.getAccessToken()) {
      try {
        res = await doFetch();
      } catch {
        throw networkError();
      }
    }

    if (res.status === 401) {
      tokenStore.clear();
      onAuthFailure?.();
      throw new ApiError(401, '登录已过期，请重新登录', 'auth');
    }
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
