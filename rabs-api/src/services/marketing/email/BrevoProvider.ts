import type {
  BulkMail,
  EmailProvider,
  SendResult,
  TransactionalMail,
  VerifyResult
} from './EmailProvider.js';

export type BrevoCredentials = {
  useEnv?: boolean;
  apiKey?: string;
  fromEmail?: string;
  fromName?: string;
};

/**
 * Brevo (Sendinblue) stub — returns “not configured” until API key is set.
 * Full REST integration can replace these methods later.
 */
export class BrevoProvider implements EmailProvider {
  readonly kind = 'brevo';
  private readonly apiKey: string;

  constructor(creds: BrevoCredentials = {}) {
    this.apiKey =
      (creds.useEnv ? process.env.BREVO_API_KEY : creds.apiKey) ||
      process.env.BREVO_API_KEY ||
      '';
  }

  private notConfigured(): VerifyResult {
    return {
      ok: false,
      message: 'Brevo not configured. Set connector apiKey or BREVO_API_KEY to enable.'
    };
  }

  async verifyConnection(): Promise<VerifyResult> {
    if (!this.apiKey) return this.notConfigured();
    return {
      ok: false,
      message: 'Brevo adapter is a stub — API key present but send not implemented yet.'
    };
  }

  async sendTransactional(_mail: TransactionalMail): Promise<SendResult> {
    if (!this.apiKey) {
      return { ok: false, error: this.notConfigured().message };
    }
    return { ok: false, error: 'Brevo send not implemented yet' };
  }

  async sendBulk(_mail: BulkMail): Promise<SendResult> {
    if (!this.apiKey) {
      return { ok: false, error: this.notConfigured().message };
    }
    return { ok: false, error: 'Brevo bulk send not implemented yet' };
  }
}
