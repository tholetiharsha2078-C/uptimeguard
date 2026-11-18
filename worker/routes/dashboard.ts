import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../lib/auth';
import { getDashboard } from '../services/analytics';

const dashboard = new Hono<AppEnv>();

dashboard.use('*', requireAuth);

dashboard.get('/', async (c) => {
  const data = await getDashboard(c.env.DB, c.get('user').id);
  return c.json(data);
});

export const dashboardRoutes = dashboard;
