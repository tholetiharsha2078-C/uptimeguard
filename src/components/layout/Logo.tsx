import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

export function Logo({ className, to = '/' }: { className?: string; to?: string }) {
  return (
    <Link to={to} className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Activity className="size-4" strokeWidth={2.5} />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-foreground">UptimeGuard</span>
    </Link>
  );
}
