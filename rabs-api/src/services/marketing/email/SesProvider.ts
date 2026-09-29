import type {
  BulkMail,
  EmailProvider,
  SendResult,
  TransactionalMail,
  VerifyResult
} from './EmailProvider.js';

export type SesCredentials = {
  useEnv?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  fromEmail?: string;
};

/**
 * Amazon SES stub — returns “not configured” until keys are set.
 */
export class SesProvider implements EmailProvider {
  readonly kind = 'ses';
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly region: string;

  constructor(creds: SesCredentials = {}) {
    const useEnv = Boolean(creds.useEnv);
    this.accessKeyId =
      (useEnv ? process.env.AWS_SES_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID : creds.accessKeyId) ||
      process.env.AWS_SES_ACCESS_KEY_ID ||
      '';
    this.secretAccessKey =
      (useEnv
        ? process.env.AWS_SES_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY
        : creds.secretAccessKey) ||
      process.env.AWS_SES_SECRET_ACCESS_KEY ||
      '';
    this.region = creds.region || process.env.AWS_SES_REGION || process.env.AWS_REGION || 'eu-west-2';
  }

  private notConfigured(): VerifyResult {
    return {
      ok: false,
      message:
        'Amazon SES not configured. Set connector accessKeyId/secretAccessKey or AWS_SES_* env.'
    };
  }

  async verifyConnection(): Promise<VerifyResult> {
    if (!this.accessKeyId || !this.secretAccessKey) return this.notConfigured();
    return {
      ok: false,
      message: `SES adapter is a stub (region=${this.region}) — keys present but send not implemented yet.`
    };
  }

  async sendTransactional(_mail: TransactionalMail): Promise<SendResult> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      return { ok: false, error: this.notConfigured().message };
    }
    return { ok: false, error: 'SES send not implemented yet' };
  }

  async sendBulk(_mail: BulkMail): Promise<SendResult> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      return { ok: false, error: this.notConfigured().message };
    }
    return { ok: false, error: 'SES bulk send not implemented yet' };
  }
}
