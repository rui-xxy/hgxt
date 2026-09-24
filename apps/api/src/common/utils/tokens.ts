import { createHash, randomBytes } from 'node:crypto';

/** 生成不透明 Refresh Token（随机 48 字节，base64url） */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/** 库里只存 sha256，泄露数据库也无法反推出可用 token */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
