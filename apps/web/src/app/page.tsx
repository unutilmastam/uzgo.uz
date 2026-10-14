import { connection } from 'next/server';
import { HealthStatus } from '@/components/health-status';
import { getApiHealth } from '@/lib/api-health';
import { getServerEnv } from '@/lib/server-env';

export default async function HomePage() {
  // Always render at request time: the status must be live, never prerendered.
  await connection();
  const health = await getApiHealth(getServerEnv().API_INTERNAL_URL);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">UZGO</h1>
      <p className="text-slate-600">Texnik sahifa (Phase 1). Dizayn Phase 2 da.</p>
      <HealthStatus health={health} />
    </main>
  );
}
