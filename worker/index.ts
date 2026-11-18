import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv, Env } from './env';
import { ApiError, jsonError } from './lib/errors';
import { authRoutes } from './routes/auth';
import { dashboardRoutes } from './routes/dashboard';
import { incidentRoutes } from './routes/incidents';
import { notificationRoutes } from './routes/notifications';
import { websiteRoutes } from './routes/websites';
import { runScheduledMonitoring } from './services/scheduler';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
});

app.use('/api/*', bodyLimit({ maxSize: 64 * 1024 }));

app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');

  const method = c.req.method;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = c.req.header('origin');
    if (origin) {
      const expected = new URL(c.req.url).origin;
      const isLocalDev =
        c.env.ENVIRONMENT === 'development' &&
        /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(origin);
      if (origin !== expected && !isLocalDev) {
        return c.json(
          { error: { code: 'cross_origin_blocked', message: 'Cross-origin requests are not allowed.' } },
          403,
        );
      }
    }
  }

  await next();
});

app.get('/api/health', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1').first();
    return c.json({ status: 'ok', service: c.env.APP_NAME, environment: c.env.ENVIRONMENT });
  } catch {
    return c.json({ status: 'degraded', service: c.env.APP_NAME }, 503);
  }
});

app.route('/api/auth', authRoutes);
app.route('/api/websites', websiteRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/incidents', incidentRoutes);
app.route('/api/notifications', notificationRoutes);

app.notFound((c) =>
  c.json({ error: { code: 'not_found', message: 'The requested endpoint does not exist.' } }, 404),
);

app.onError((error, c) => {
  if (error instanceof ApiError) return jsonError(c, error);
  console.error('Unhandled API error', error);
  return c.json(
    { error: { code: 'internal_error', message: 'Something went wrong. Please try again.' } },
    500,
  );
});

export { app };

export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(
      runScheduledMonitoring(env).catch((error) => {
        console.error('Scheduled monitoring run failed', error);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
