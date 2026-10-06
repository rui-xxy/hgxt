import { describe, expect, it } from 'vitest';
import { landingPath } from './landing';

describe('登录后的默认入口', () => {
  it('所有登录用户从车间版面进入', () => {
    expect(landingPath()).toBe('/board');
  });
});
