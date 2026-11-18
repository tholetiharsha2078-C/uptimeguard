import type { ReactNode } from 'react';
import { Activity, BellRing, Gauge, ShieldCheck } from 'lucide-react';

import { Logo } from '@/components/layout/Logo';

const FEATURES = [
  { icon: Activity, text: 'Real HTTP checks from Cloudflare’s edge' },
  { icon: Gauge, text: 'Response times, uptime and incident history' },
  { icon: BellRing, text: 'Notifications the moment a site goes down' },
  { icon: ShieldCheck, text: 'SSRF-safe URL validation on every request' },
];

const BAR_HEIGHTS = [64, 74, 58, 82, 70, 90, 76, 62, 84, 68, 56, 78, 88, 72, 60, 80, 66, 92, 74, 58, 70, 84, 62, 76, 88, 54, 72, 80, 66, 90];

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r border-border bg-card p-10 lg:flex xl:p-14">
        <Logo />
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Know the moment your website goes down.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            UptimeGuard checks your sites on a schedule, measures response times and keeps a precise record of
            every incident and recovery.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature.text} className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex size-7 items-center justify-center rounded-md bg-muted text-foreground">
                  <feature.icon className="size-3.5" />
                </span>
                {feature.text}
              </li>
            ))}
          </ul>
          <div className="mt-10 rounded-xl border border-border p-4" aria-hidden>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Response time</span>
              <span>Last 24 hours</span>
            </div>
            <div className="mt-3 flex h-20 items-end gap-1">
              {BAR_HEIGHTS.map((height, index) => (
                <div
                  key={index}
                  style={{ height: `${height}%` }}
                  className={index === 19 ? 'flex-1 rounded-sm bg-destructive/70' : 'flex-1 rounded-sm bg-primary/25'}
                />
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Cloudflare Workers · D1 · Drizzle ORM</p>
      </div>

      <div className="flex flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
          <div className="mt-7">{children}</div>
          <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
        </div>
      </div>
    </div>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
}
