import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { rangeSchema } from '../../shared/schemas';
import { requireAuth } from '../lib/auth';
import { getIncidents } from '../services/analytics';

const incidents = new Hono<AppEnv>();

incidents.use('*', requireAuth);

const incidentQuerySchema = z.object({
  status: z.enum(['open', 'resolved', 'all']).catch('all'),
  range: rangeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).catch(50),
  offset: z.coerce.number().int().min(0).max(10_000).catch(0),
});

incidents.get('/', async (c) => {
  const query = incidentQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
  const data = await getIncidents(c.env.DB, c.get('user').id, query);
  return c.json(data);
});

export const incidentRoutes = incidents;
