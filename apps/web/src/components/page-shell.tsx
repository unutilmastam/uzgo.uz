import type { ReactNode } from 'react';

export function PageShell({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:py-10">
      <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}
