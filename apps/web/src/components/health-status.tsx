import { cn } from '@uzgo/ui/lib/cn';
import type { ApiHealth } from '@/lib/api-health';

const TONE: Record<ApiHealth['state'], string> = {
  ok: 'border-success/40 text-success',
  degraded: 'border-warning/40 text-warning',
  unreachable: 'border-destructive/40 text-destructive',
};

export function HealthStatus({ health, label }: { health: ApiHealth; label: string }) {
  return (
    <p
      role="status"
      data-state={health.state}
      className={cn('rounded-lg border bg-card px-4 py-3 text-sm font-medium', TONE[health.state])}
    >
      {label}
    </p>
  );
}
