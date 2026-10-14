import type { SmsProvider } from './sms.provider.js';
import { maskPhone } from '../common/mask.js';

/**
 * DEVELOPMENT ONLY. Prints the message to the console instead of sending it.
 * Refuses to exist outside NODE_ENV=development (also enforced by env validation).
 */
export class DevSmsProvider implements SmsProvider {
  readonly name = 'dev';

  constructor(nodeEnv: string | undefined = process.env.NODE_ENV) {
    if (nodeEnv !== 'development') {
      throw new Error('DevSmsProvider can only be used when NODE_ENV=development');
    }
  }

  send(phoneE164: string, text: string): Promise<void> {
    // Deliberately outside the structured logger: this line must never reach
    // production log storage. Only allowed because NODE_ENV=development.
    process.stdout.write(`\n[DEV SMS] to ${maskPhone(phoneE164)}: ${text}\n\n`);
    return Promise.resolve();
  }
}
