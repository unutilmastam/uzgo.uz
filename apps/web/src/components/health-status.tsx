import type { ApiHealth } from '@/lib/api-health';

// Phase 1 technical page only. Real UI strings move to message files with
// i18n in Phase 2.
const LABELS: Record<ApiHealth['state'], { text: string; className: string }> = {
  ok: { text: 'API: ishlayapti · БД: ulangan', className: 'bg-emerald-100 text-emerald-900' },
  degraded: { text: 'API: ishlayapti · БД: ulanmagan', className: 'bg-amber-100 text-amber-900' },
  unreachable: { text: 'API: javob bermayapti', className: 'bg-red-100 text-red-900' },
};

export function HealthStatus({ health }: { health: ApiHealth }) {
  const label = LABELS[health.state];
  return (
    <p
      role="status"
      data-state={health.state}
      className={`rounded-lg px-4 py-3 text-sm font-medium ${label.className}`}
    >
      {label.text}
    </p>
  );
}
