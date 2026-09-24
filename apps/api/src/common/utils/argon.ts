import { hash, verify, Algorithm } from '@node-rs/argon2';

/**
 * Argon2id，参数取 OWASP 推荐基线（19 MiB / timeCost 2 / 并行 1）。
 * 密码只存哈希，任何接口都不返回 passwordHash。
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}
