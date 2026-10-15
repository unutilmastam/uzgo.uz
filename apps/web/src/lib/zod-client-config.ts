import { config } from 'zod';

// Browser only: Zod 4 probes `new Function("")` to decide whether it may
// compile parsers. The nonce CSP (no 'unsafe-eval') blocks that and Chrome
// reports a CSP issue for it, so parsers are interpreted instead.
config({ jitless: true });
