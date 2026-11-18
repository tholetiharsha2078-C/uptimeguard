import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ResponsePoint, TimeRange } from '@shared/types';
import { formatDate, formatDateTime, formatMs, formatTime } from '@/lib/format';
import { EmptyState } from '@/components/States';
import { LineChart } from 'lucide-react';

interface TooltipPayloadItem {
  payload?: ResponsePoint;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{formatDateTime(point.timestamp)}</p>
      <p className="mt-1 text-muted-foreground">
        Avg response <span className="font-medium text-foreground">{formatMs(point.avgMs)}</span>
      </p>
      <p className="text-muted-foreground">
        {point.checks} check{point.checks === 1 ? '' : 's'}
      </p>
    </div>
  );
}

export function ResponseChart({
  data,
  range = '24h',
  height = 260,
}: {
  data: ResponsePoint[];
  range?: TimeRange;
  height?: number;
}) {
  const dataPoints = data.filter((point) => point.avgMs !== null).length;
  const hasData = dataPoints > 0;

  if (!hasData) {
    return (
      <EmptyState
        icon={<LineChart className="size-5" />}
        title="No response data yet"
        description="The chart fills in as soon as your first health checks complete."
        className="py-10"
      />
    );
  }

  const tickFormatter = (value: number) => (range === '24h' ? formatTime(value) : formatDate(value));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={tickFormatter}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            dy={6}
          />
          <YAxis
            tickFormatter={(value: number) => formatMs(value)}
            tickLine={false}
            axisLine={false}
            width={58}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)' }} />
          <Area
            type="monotone"
            dataKey="avgMs"
            name="Avg response"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="var(--primary)"
            fillOpacity={0.08}
            connectNulls
            dot={dataPoints <= 24 ? { r: 2.5, strokeWidth: 0, fill: 'var(--primary)' } : false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
