import nodemailer from 'nodemailer';
import { env } from '@config/env.js';
import type {
  BulkMail,
  EmailProvider,
  SendResult,
  TransactionalMail,
  VerifyResult
} from './EmailProvider.js';

export type SmtpGmailCredentials = {
  /** Prefer global SMTP_* env when true or when host/user/pass omitted. */
  useEnv?: boolean;
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
};

/**
 * Gmail / generic SMTP via nodemailer (keeps existing cold-email path).
 * Never log pass.
 */
export class SmtpGmailProvider implements EmailProvider {
  readonly kind = 'gmail_smtp';
  private readonly host: string;
  private readonly port: number;
  private readonly user: string;
  private readonly pass: string;
  private readonly from: string;
  private transporter: nodemailer.Transporter | null = null;

  constructor(creds: SmtpGmailCredentials = {}) {
    const useEnv = creds.useEnv !== false && (!creds.host || !creds.user || !creds.pass);
    this.host = useEnv ? env.SMTP_HOST : creds.host || env.SMTP_HOST;
    this.port = useEnv ? env.SMTP_PORT : Number(creds.port ?? env.SMTP_PORT ?? 587);
    this.user = useEnv ? env.SMTP_USER : creds.user || env.SMTP_USER;
    this.pass = useEnv ? env.SMTP_PASS : creds.pass || env.SMTP_PASS;
    this.from = creds.from || env.SMTP_FROM || this.user;
  }

  private assertConfigured(): void {
    if (!this.host || !this.user || !this.pass) {
      throw Object.assign(
        new Error('SMTP not configured. Set connector credentials or SMTP_HOST/USER/PASS.'),
        { status: 503 }
      );
    }
  }

  private getTransporter(): nodemailer.Transporter {
    this.assertConfigured();
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.port === 465,
        auth: { user: this.user, pass: this.pass }
      });
    }
    return this.transporter;
  }

  async verifyConnection(): Promise<VerifyResult> {
    if (!this.host || !this.user || !this.pass) {
      return { ok: false, message: 'SMTP host/user/pass not set' };
    }
    try {
      await this.getTransporter().verify();
      return { ok: true, message: 'SMTP connection verified' };
    } catch (err: any) {
      return { ok: false, message: String(err?.message || 'SMTP verify failed') };
    }
  }

  async sendTransactional(mail: TransactionalMail): Promise<SendResult> {
    try {
      const to = typeof mail.to === 'string' ? mail.to : mail.to.email;
      const from =
        mail.from?.email
          ? mail.from.name
            ? `${mail.from.name} <${mail.from.email}>`
            : mail.from.email
          : this.from;
      const info = await this.getTransporter().sendMail({
        from,
        to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: mail.replyTo
      });
      return { ok: true, messageId: info.messageId || '' };
    } catch (err: any) {
      return { ok: false, error: String(err?.message || 'send failed') };
    }
  }

  /** Per-recipient send with ~400ms delay (Gmail-safe). */
  async sendBulk(mail: BulkMail): Promise<SendResult> {
    const DELAY_MS = 400;
    const recipientResults: NonNullable<SendResult['recipientResults']> = [];
    let anyOk = false;
    let lastError: string | undefined;

    for (let i = 0; i < mail.recipients.length; i++) {
      const r = mail.recipients[i]!;
      const result = await this.sendTransactional({
        to: r.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        from: mail.from,
        replyTo: mail.replyTo,
        customArgs: { ...(mail.customArgs || {}), ...(r.customArgs || {}) }
      });
      if (result.ok) anyOk = true;
      else lastError = result.error;
      recipientResults.push({
        email: r.email,
        ok: result.ok,
        messageId: result.messageId,
        error: result.error
      });
      if (i + 1 < mail.recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }

    return {
      ok: anyOk,
      error: anyOk ? undefined : lastError,
      recipientResults
    };
  }
}

/** Legacy helpers used by older call sites. */
export function isSmtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

export async function sendSmtpMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ messageId: string }> {
  const provider = new SmtpGmailProvider({ useEnv: true });
  const result = await provider.sendTransactional(opts);
  if (!result.ok) {
    throw Object.assign(new Error(result.error || 'SMTP send failed'), { status: 502 });
  }
  return { messageId: result.messageId || '' };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
