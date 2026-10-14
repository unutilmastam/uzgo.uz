import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HealthStatus } from './health-status';

describe('HealthStatus', () => {
  it('renders an accessible status for each state', () => {
    const ok = renderToStaticMarkup(<HealthStatus health={{ state: 'ok' }} />);
    expect(ok).toContain('role="status"');
    expect(ok).toContain('data-state="ok"');

    const down = renderToStaticMarkup(<HealthStatus health={{ state: 'unreachable' }} />);
    expect(down).toContain('javob bermayapti');
  });
});
