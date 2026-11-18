import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, AuthUser } from '../env';
import { unauthorized } from './errors';

const SESSION_COOKIE = 'ug_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LAST_USED_REFRESH_MS = 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 100_000;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 1_000_000) return false;
  try {
    const salt = fromBase64Url(parts[2] ?? '');
    const expected = fromBase64Url(parts[3] ?? '');
    const actual = await derive(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Equal-cost verification for unknown accounts to avoid email enumeration timing. */
let dummyHashPromise: Promise<string> | null = null;
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHashPromise ??= hashPassword('uptime-guard-dummy-password');
  await verifyPassword(password, await dummyHashPromise);
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function createSession(
  db: D1Database,
  userId: string,
  userAgent: string | null,
  ip: string | null,
): Promise<{ token: string; expiresAt: number }> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await hashSessionToken(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  await db
    .prepare('INSERT INTO sessions (token_hash, user_id, user_agent, ip, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(tokenHash, userId, userAgent, ip, now, now, expiresAt)
    .run();

  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();

  return { token, expiresAt };
}

export async function destroySession(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

export function setSessionCookie(c: Context<AppEnv>, token: string, expiresAt: number): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: c.env.ENVIRONMENT === 'production',
    path: '/',
    maxAge: Math.floor((expiresAt - Date.now()) / 1000),
  });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, {
    path: '/',
    secure: c.env.ENVIRONMENT === 'production',
  });
}

export function sessionTokenFromRequest(c: Context<AppEnv>): string | null {
  return getCookie(c, SESSION_COOKIE) ?? null;
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = sessionTokenFromRequest(c);
  if (!token) throw unauthorized();

  const tokenHash = await hashSessionToken(token);
  const now = Date.now();
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.default_interval_minutes AS defaultIntervalMinutes, u.created_at AS createdAt,
            s.expires_at AS expiresAt, s.last_used_at AS lastUsedAt
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<AuthUser & { expiresAt: number; lastUsedAt: number }>();

  if (!row || row.expiresAt <= now) {
    if (row) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    clearSessionCookie(c);
    throw unauthorized('Your session has expired. Please sign in again.');
  }

  c.set('user', {
    id: row.id,
    name: row.name,
    email: row.email,
    defaultIntervalMinutes: row.defaultIntervalMinutes,
    createdAt: row.createdAt,
  });
  c.set('sessionTokenHash', tokenHash);

  if (now - row.lastUsedAt > LAST_USED_REFRESH_MS) {
    await c.env.DB.prepare('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?').bind(now, tokenHash).run();
  }

  await next();
});
