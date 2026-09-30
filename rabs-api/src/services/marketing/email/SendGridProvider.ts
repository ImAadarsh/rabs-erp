import type {
  BulkMail,
  EmailProvider,
  SendResult,
  TransactionalMail,
  VerifyResult,
  WebhookEvent
} from './EmailProvider.js';

export type SendGridCredentials = {
  /** When true, use SENDGRID_API_KEY from env. */
  useEnv?: boolean;
  apiKey?: string;
  fromEmail?: string;
  fromName?: string;
  /** Optional Event Webhook verification public key (PEM). */
  webhookVerificationKey?: string;
};

function toAddr(to: TransactionalMail['to']): { email: string; name?: string } {
  if (typeof to === 'string') return { email: to };
  return { email: to.email, name: to.name };
}

/**
 * SendGrid v3 Mail Send — first-class mass-send provider.
 * Never log apiKey.
 */
export class SendGridProvider implements EmailProvider {
  readonly kind = 'sendgrid';
  private readonly apiKey: string;
  private readonly defaultFromEmail?: string;
  private readonly defaultFromName?: string;

  constructor(creds: SendGridCredentials) {
    const key = creds.useEnv
      ? process.env.SENDGRID_API_KEY || ''
      : creds.apiKey || process.env.SENDGRID_API_KEY || '';
    this.apiKey = key;
    this.defaultFromEmail = creds.fromEmail;
    this.defaultFromName = creds.fromName;
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw Object.assign(
        new Error(
          'SendGrid not configured. Add an API key on the connector or set SENDGRID_API_KEY.'
        ),
        { status: 503 }
      );
    }
  }

  private resolveFrom(mail: { from?: { email: string; name?: string } }): {
    email: string;
    name?: string;
  } {
    if (mail.from?.email) return mail.from;
    if (this.defaultFromEmail) {
      return { email: this.defaultFromEmail, name: this.defaultFromName };
    }
    throw Object.assign(
      new Error('SendGrid from address required (connector fromEmail or campaign from).'),
      { status: 400 }
    );
  }

  private async sgRequest(path: string, init?: RequestInit): Promise<Response> {
    this.assertConfigured();
    return fetch(`https://api.sendgrid.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {})
      }
    });
  }

  async verifyConnection(): Promise<VerifyResult> {
    if (!this.apiKey) {
      return { ok: false, message: 'SendGrid API key not set' };
    }
    try {
      // scopes endpoint is lightweight auth check
      const res = await this.sgRequest('/v3/scopes', { method: 'GET' });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: 'SendGrid API key rejected' };
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return {
          ok: false,
          message: `SendGrid probe failed (${res.status}): ${text.slice(0, 200)}`
        };
      }
      return { ok: true, message: 'SendGrid credentials accepted' };
    } catch (err: any) {
      return { ok: false, message: String(err?.message || 'SendGrid connection failed') };
    }
  }

  async sendTransactional(mail: TransactionalMail): Promise<SendResult> {
    try {
      const from = this.resolveFrom(mail);
      const to = toAddr(mail.to);
      const body = {
        personalizations: [
          {
            to: [{ email: to.email, name: to.name }],
            custom_args: mail.customArgs
          }
        ],
        from: { email: from.email, name: from.name },
        reply_to: mail.replyTo ? { email: mail.replyTo } : undefined,
        subject: mail.subject,
        content: [
          ...(mail.text ? [{ type: 'text/plain', value: mail.text }] : []),
          { type: 'text/html', value: mail.html }
        ]
      };
      const res = await this.sgRequest('/v3/mail/send', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (res.status === 202 || res.ok) {
        const messageId = res.headers.get('x-message-id') || undefined;
        return { ok: true, messageId };
      }
      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        error: `SendGrid ${res.status}: ${errText.slice(0, 500)}`
      };
    } catch (err: any) {
      return { ok: false, error: String(err?.message || 'send failed') };
    }
  }

  /**
   * Batch personalizations (max 1000/request; we use 100) with small delay between batches.
   */
  async sendBulk(mail: BulkMail): Promise<SendResult> {
    const from = this.resolveFrom(mail);
    const BATCH = 100;
    const DELAY_MS = 200;
    const recipientResults: NonNullable<SendResult['recipientResults']> = [];
    let anyOk = false;
    let lastError: string | undefined;

    for (let i = 0; i < mail.recipients.length; i += BATCH) {
      const chunk = mail.recipients.slice(i, i + BATCH);
      const body = {
        personalizations: chunk.map((r) => ({
          to: [{ email: r.email }],
          substitutions: r.substitutions,
          custom_args: { ...(mail.customArgs || {}), ...(r.customArgs || {}) }
        })),
        from: { email: from.email, name: from.name },
        reply_to: mail.replyTo ? { email: mail.replyTo } : undefined,
        subject: mail.subject,
        content: [
          ...(mail.text ? [{ type: 'text/plain', value: mail.text }] : []),
          { type: 'text/html', value: mail.html }
        ]
      };

      try {
        const res = await this.sgRequest('/v3/mail/send', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        const messageId = res.headers.get('x-message-id') || undefined;
        if (res.status === 202 || res.ok) {
          anyOk = true;
          for (const r of chunk) {
            recipientResults.push({ email: r.email, ok: true, messageId });
          }
        } else {
          const errText = await res.text().catch(() => '');
          lastError = `SendGrid ${res.status}: ${errText.slice(0, 500)}`;
          for (const r of chunk) {
            recipientResults.push({ email: r.email, ok: false, error: lastError });
          }
        }
      } catch (err: any) {
        lastError = String(err?.message || 'send failed');
        for (const r of chunk) {
          recipientResults.push({ email: r.email, ok: false, error: lastError });
        }
      }

      if (i + BATCH < mail.recipients.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    return {
      ok: anyOk,
      error: anyOk ? undefined : lastError,
      recipientResults
    };
  }

  parseWebhook(rawBody: unknown): WebhookEvent[] {
    const list = Array.isArray(rawBody) ? rawBody : [rawBody];
    const out: WebhookEvent[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const e = item as Record<string, unknown>;
      const eventType = String(e.event || e.eventType || 'unknown');
      const email = e.email ? String(e.email) : undefined;
      const ts = typeof e.timestamp === 'number' ? new Date(e.timestamp * 1000) : undefined;
      const sgMessageId = e.sg_message_id
        ? String(e.sg_message_id)
        : e['smtp-id']
          ? String(e['smtp-id'])
          : undefined;
      const customArgs =
        (e.custom_args as Record<string, string> | undefined) ||
        (typeof e.campaignId === 'string' || typeof e.sendId === 'string'
          ? {
              campaignId: e.campaignId ? String(e.campaignId) : undefined,
              sendId: e.sendId ? String(e.sendId) : undefined,
              organizationId: e.organizationId ? String(e.organizationId) : undefined
            }
          : undefined);
      out.push({
        eventType,
        email,
        occurredAt: ts,
        providerEventId: e.sg_event_id ? String(e.sg_event_id) : undefined,
        sgMessageId,
        campaignId: customArgs?.campaignId || (e.campaignId ? String(e.campaignId) : undefined),
        sendId: customArgs?.sendId || (e.sendId ? String(e.sendId) : undefined),
        organizationId:
          customArgs?.organizationId ||
          (e.organizationId ? String(e.organizationId) : undefined),
        payload: e
      });
    }
    return out;
  }
}
