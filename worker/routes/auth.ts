import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { User } from '../../shared/types';
import {
  changePasswordSchema,
  loginSchema,
  profileSchema,
  registerSchema,
} from '../../shared/schemas';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  hashPassword,
  hashSessionToken,
  requireAuth,
  sessionTokenFromRequest,
  setSessionCookie,
  verifyDummyPassword,
  verifyPassword,
} from '../lib/auth';
import { ApiError } from '../lib/errors';
import { enforceRateLimit } from '../lib/rate-limit';
import { parseJsonBody, requestIp } from '../lib/validation';

const auth = new Hono<AppEnv>();

auth.post('/register', async (c) => {
  await enforceRateLimit(c, 'register', 5, 60 * 60 * 1000);
  const input = await parseJsonBody(c, registerSchema);

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(input.email)
    .first<{ id: string }>();
  if (existing) {
    throw new ApiError(409, 'email_taken', 'An account with that email already exists.');
  }

  const now = Date.now();
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);

  try {
    await c.env.DB.prepare(
      `INSERT INTO users (id, name, email, password_hash, default_interval_minutes, created_at, updated_at)
       VALUES (?, ?, ?, ?, 5, ?, ?)`,
    )
      .bind(userId, input.name, input.email, passwordHash, now, now)
      .run();
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) {
      throw new ApiError(409, 'email_taken', 'An account with that email already exists.');
    }
    throw error;
  }

  const session = await createSession(
    c.env.DB,
    userId,
    c.req.header('user-agent') ?? null,
    requestIp(c),
  );
  setSessionCookie(c, session.token, session.expiresAt);

  const user: User = { id: userId, name: input.name, email: input.email, createdAt: now };
  return c.json({ user }, 201);
});

auth.post('/login', async (c) => {
  await enforceRateLimit(c, 'login', 10, 5 * 60 * 1000);
  const input = await parseJsonBody(c, loginSchema);

  const row = await c.env.DB.prepare(
    'SELECT id, name, email, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE email = ?',
  )
    .bind(input.email)
    .first<{ id: string; name: string; email: string; passwordHash: string; createdAt: number }>();

  if (!row) {
    await verifyDummyPassword(input.password);
    throw new ApiError(401, 'invalid_credentials', 'Incorrect email or password.');
  }

  const valid = await verifyPassword(input.password, row.passwordHash);
  if (!valid) {
    throw new ApiError(401, 'invalid_credentials', 'Incorrect email or password.');
  }

  const session = await createSession(
    c.env.DB,
    row.id,
    c.req.header('user-agent') ?? null,
    requestIp(c),
  );
  setSessionCookie(c, session.token, session.expiresAt);

  return c.json({
    user: { id: row.id, name: row.name, email: row.email, createdAt: row.createdAt } satisfies User,
  });
});

auth.post('/logout', async (c) => {
  const token = sessionTokenFromRequest(c);
  if (token) {
    await destroySession(c.env.DB, await hashSessionToken(token));
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});

auth.get('/me', requireAuth, (c) => {
  const user = c.get('user');
  return c.json({
    user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } satisfies User,
  });
});

auth.patch('/me', requireAuth, async (c) => {
  await enforceRateLimit(c, 'profile-update', 20, 60 * 60 * 1000);
  const input = await parseJsonBody(c, profileSchema);
  const user = c.get('user');
  const now = Date.now();

  await c.env.DB.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?')
    .bind(input.name, now, user.id)
    .run();

  return c.json({
    user: { id: user.id, name: input.name, email: user.email, createdAt: user.createdAt } satisfies User,
  });
});

auth.post('/change-password', requireAuth, async (c) => {
  await enforceRateLimit(c, 'change-password', 5, 60 * 60 * 1000);
  const input = await parseJsonBody(c, changePasswordSchema);
  const user = c.get('user');

  const row = await c.env.DB.prepare('SELECT password_hash AS passwordHash FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ passwordHash: string }>();
  if (!row) throw new ApiError(404, 'not_found', 'Account not found.');

  const valid = await verifyPassword(input.currentPassword, row.passwordHash);
  if (!valid) {
    throw new ApiError(422, 'invalid_password', 'Current password is incorrect.', {
      currentPassword: ['Current password is incorrect.'],
    });
  }

  const newHash = await hashPassword(input.newPassword);
  const now = Date.now();
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(newHash, now, user.id)
    .run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?')
    .bind(user.id, c.get('sessionTokenHash'))
    .run();

  return c.json({ ok: true });
});

export const authRoutes = auth;
