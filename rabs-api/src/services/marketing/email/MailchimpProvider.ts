import type {
  BulkMail,
  EmailProvider,
  SendResult,
  TransactionalMail,
  VerifyResult
} from './EmailProvider.js';

export type MailchimpCredentials = {
  useEnv?: boolean;
  apiKey?: string;
  serverPrefix?: string;
};

/** Mailchimp / Mandrill stub. */
export class MailchimpProvider implements EmailProvider {
  readonly kind = 'mailchimp';
  private readonly apiKey: string;

  constructor(creds: MailchimpCredentials = {}) {
    this.apiKey =
      (creds.useEnv ? process.env.MAILCHIMP_API_KEY : creds.apiKey) ||
      process.env.MAILCHIMP_API_KEY ||
      '';
  }

  private notConfigured(): VerifyResult {
    return {
      ok: false,
      message: 'Mailchimp not configured. Set connector apiKey or MAILCHIMP_API_KEY to enable.'
    };
  }

  async verifyConnection(): Promise<VerifyResult> {
    if (!this.apiKey) return this.notConfigured();
    return {
      ok: false,
      message: 'Mailchimp adapter is a stub — API key present but send not implemented yet.'
    };
  }

  async sendTransactional(_mail: TransactionalMail): Promise<SendResult> {
    if (!this.apiKey) return { ok: false, error: this.notConfigured().message };
    return { ok: false, error: 'Mailchimp send not implemented yet' };
  }

  async sendBulk(_mail: BulkMail): Promise<SendResult> {
    if (!this.apiKey) return { ok: false, error: this.notConfigured().message };
    return { ok: false, error: 'Mailchimp bulk send not implemented yet' };
  }
}
