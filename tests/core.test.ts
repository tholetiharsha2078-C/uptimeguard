import { describe, expect, it } from 'vitest';
import { computeUptime, roundMs } from '../worker/services/analytics';
import { hashPassword, hashSessionToken, verifyPassword } from '../worker/lib/auth';
import { registerSchema, createWebsiteSchema } from '@shared/schemas';

describe('computeUptime', () => {
  it('returns null when there are no checks', () => {
    expect(computeUptime(0, 0)).toBeNull();
  });

  it('calculates successful checks divided by total checks', () => {
    expect(computeUptime(100, 100)).toBe(100);
    expect(computeUptime(100, 99)).toBe(99);
    expect(computeUptime(3, 2)).toBe(66.67);
    expect(computeUptime(1000, 999)).toBe(99.9);
  });

  it('rounds response times and handles missing values', () => {
    expect(roundMs(12.6)).toBe(13);
    expect(roundMs(null)).toBeNull();
    expect(roundMs(undefined)).toBeNull();
  });
});

describe('password hashing', () => {
  it('verifies the correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery 42');
    expect(hash.startsWith('pbkdf2_sha256$')).toBe(true);
    await expect(verifyPassword('correct horse battery 42', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password 42', hash)).resolves.toBe(false);
  }, 20_000);

  it('rejects malformed stored hashes instead of throwing', async () => {
    await expect(verifyPassword('anything', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'pbkdf2_sha256$x$y$z')).resolves.toBe(false);
  });

  it('hashes session tokens deterministically without storing the token', async () => {
    const first = await hashSessionToken('token-value');
    const second = await hashSessionToken('token-value');
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
    expect(first).not.toContain('token-value');
  });
});

describe('request validation schemas', () => {
  it('rejects weak passwords and mismatched confirmation', () => {
    expect(
      registerSchema.safeParse({
        name: 'Ada',
        email: 'ada@example.com',
        password: 'short',
        confirmPassword: 'short',
      }).success,
    ).toBe(false);

    expect(
      registerSchema.safeParse({
        name: 'Ada',
        email: 'ada@example.com',
        password: 'long-enough 1',
        confirmPassword: 'different 1',
      }).success,
    ).toBe(false);

    expect(
      registerSchema.safeParse({
        name: 'Ada',
        email: 'ada@example.com',
        password: 'long-enough 1',
        confirmPassword: 'long-enough 1',
      }).success,
    ).toBe(true);
  });

  it('constrains monitoring intervals to the supported values', () => {
    expect(createWebsiteSchema.safeParse({ url: 'https://example.com', intervalMinutes: 5 }).success).toBe(true);
    expect(createWebsiteSchema.safeParse({ url: 'https://example.com', intervalMinutes: 7 }).success).toBe(false);
    expect(createWebsiteSchema.safeParse({ url: '' }).success).toBe(false);
  });
});
