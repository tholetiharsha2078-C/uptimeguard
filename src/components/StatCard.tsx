import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'success' | 'danger' | 'muted';
  className?: string;
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'danger'
        ? 'text-destructive'
        : tone === 'muted'
          ? 'text-muted-foreground'
          : 'text-foreground';

  return (
    <Card className={cn('gap-0 py-5 shadow-xs', className)}>
      <CardHeader className="flex-row items-center justify-between gap-2 px-5 pb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {icon ? <span className="text-muted-foreground/70">{icon}</span> : null}
      </CardHeader>
      <CardContent className="px-5">
        <div className={cn('text-2xl font-semibold leading-none tracking-tight tabular-nums', toneClass)}>
          {value}
        </div>
        {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
