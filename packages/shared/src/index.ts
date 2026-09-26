/**
 * 前后端共享的类型与枚举。
 *
 * 这是唯一的「契约」来源——apps/api 的返回结构必须与这里一致，
 * apps/admin 的请求/解析也以这里为准。字符串值与 Prisma schema 中的
 * 枚举保持一致，接口层直接透传。
 *
 * 用 const 对象 + 字面量联合而非 TS enum：字面量类型可以和 Prisma 生成的
 * 枚举（本质也是字面量联合）互相赋值，序列化行为也更可预期。
 */

export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  USER: 'USER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const ROLE_VALUES = Object.values(Role);
export const USER_STATUS_VALUES = Object.values(UserStatus);

/** 对外的用户结构（不含 passwordHash，任何接口都不允许返回它） */
export interface UserDTO {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  /** Access Token 有效期（秒） */
  expiresIn: number;
  user: UserDTO;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserDTO;
}

export interface UserPageQuery {
  page?: number;
  pageSize?: number;
  /** 对 用户名/姓名/手机/邮箱 做模糊匹配 */
  keyword?: string;
}

export interface UserPageResult {
  items: UserDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateUserBody {
  username: string;
  name: string;
  password: string;
  email?: string;
  phone?: string;
  role: Role;
}

export interface UpdateUserBody {
  name?: string;
  email?: string | null;
  phone?: string | null;
  role?: Role;
}

export interface UpdateUserStatusBody {
  status: UserStatus;
}

export interface ResetPasswordBody {
  newPassword: string;
}

export type FormFieldType = 'text' | 'number' | 'date' | 'select';
export interface FormField {
  id: string;
  title: string;
  type: FormFieldType;
  group?: string;
  options?: { label: string; value: string }[];
  precision?: number;
  unit?: string;
  width?: number;
  description?: string;
  suffix?: string;
  hidden?: boolean;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}
export type FormData = Record<string, string | number | null>;
export interface FormDTO {
  id: string;
  title: string;
  description: string | null;
  schema: FormField[];
  /** 是否启用「停车记录」附加录入 */
  parkingEnabled: boolean;
  latestEntryDate: string | null;
  submissionCount: number;
}
export interface FormSubmissionDTO {
  id: string;
  formId: string;
  data: FormData;
  createdAt: string;
  updatedAt: string;
}
export interface FormPageResult {
  items: FormDTO[];
  total: number;
  page: number;
  pageSize: number;
}
export interface FormSubmissionPageResult {
  items: FormSubmissionDTO[];
  total: number;
  page: number;
  pageSize: number;
}
export interface SaveFormSubmissionsBody {
  created: FormData[];
  updated: { id: string; data: FormData }[];
  deleted: string[];
}

/** 上次值接口（USER 可用）：每个字段最近一次非空值及其归属日期 */
export interface FormLastValuesResult {
  [fieldId: string]: { value: string | number; date: string };
}
