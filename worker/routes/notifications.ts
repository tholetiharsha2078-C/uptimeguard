import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireAuth } from '../lib/auth';
import { getNotifications } from '../services/analytics';

const notifications = new Hono<AppEnv>();

notifications.use('*', requireAuth);

const limitSchema = z.coerce.number().int().min(1).max(100).catch(50);

notifications.get('/', async (c) => {
  const limit = limitSchema.parse(c.req.query('limit') ?? '50');
  const data = await getNotifications(c.env.DB, c.get('user').id, limit);
  return c.json(data);
});

notifications.post('/read-all', async (c) => {
  await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
    .bind(Date.now(), c.get('user').id)
    .run();
  return c.json({ ok: true });
});

notifications.post('/:id/read', async (c) => {
  const userId = c.get('user').id;
  const id = c.req.param('id');

  const result = await c.env.DB.prepare(
    'UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL',
  )
    .bind(Date.now(), id, userId)
    .run();

  if (result.meta.changes === 0) {
    const exists = await c.env.DB.prepare('SELECT id FROM notifications WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .first<{ id: string }>();
    if (!exists) {
      return c.json({ error: { code: 'not_found', message: 'Notification not found.' } }, 404);
    }
  }

  return c.json({ ok: true });
});

export const notificationRoutes = notifications;
