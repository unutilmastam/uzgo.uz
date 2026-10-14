import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HealthStatus } from './health-status';

describe('HealthStatus', () => {
  it('renders an accessible status with the given label', () => {
    const ok = renderToStaticMarkup(
      <HealthStatus health={{ state: 'ok' }} label="Hammasi joyida" />,
    );
    expect(ok).toContain('role="status"');
    expect(ok).toContain('data-state="ok"');
    expect(ok).toContain('Hammasi joyida');
  });
});
