/** Provider-agnostic marketing email send interface. */

export type EmailAddress = {
  email: string;
  name?: string;
};

export type TransactionalMail = {
  to: EmailAddress | string;
  subject: string;
  html: string;
  text?: string;
  from?: EmailAddress;
  replyTo?: string;
  /** Custom args returned in webhooks (e.g. campaignId, sendId). */
  customArgs?: Record<string, string>;
};

export type BulkRecipient = {
  email: string;
  /** Per-recipient substitutions e.g. {{firstName}} — provider-specific. */
  substitutions?: Record<string, string>;
  customArgs?: Record<string, string>;
};

export type BulkMail = {
  recipients: BulkRecipient[];
  subject: string;
  html: string;
  text?: string;
  from?: EmailAddress;
  replyTo?: string;
  customArgs?: Record<string, string>;
};

export type SendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  /** Per-recipient results when bulk API returns them. */
  recipientResults?: Array<{ email: string; ok: boolean; messageId?: string; error?: string }>;
};

export type VerifyResult = {
  ok: boolean;
  message: string;
};

export type WebhookEvent = {
  eventType: string;
  email?: string;
  occurredAt?: Date;
  providerEventId?: string;
  sgMessageId?: string;
  campaignId?: string;
  sendId?: string;
  organizationId?: string;
  payload: Record<string, unknown>;
};

export interface EmailProvider {
  readonly kind: string;

  sendTransactional(mail: TransactionalMail): Promise<SendResult>;

  /**
   * Mass send. Implementations may batch internally and apply rate limits.
   * Prefer one API call per batch when the provider supports it (SendGrid).
   */
  sendBulk(mail: BulkMail): Promise<SendResult>;

  verifyConnection(): Promise<VerifyResult>;

  /** Optional: parse inbound webhook body into normalized events. */
  parseWebhook?(rawBody: unknown, headers?: Record<string, string | string[] | undefined>): WebhookEvent[];
}
