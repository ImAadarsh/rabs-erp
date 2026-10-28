/**
 * Customer/staff notifications — SMTP when configured; SMS stub until provider keys exist.
 */
import { env } from '@config/env.js';
import { isSmtpConfigured, sendSmtpMail } from '@services/marketing/email/SmtpGmailProvider.js';

export function notifyChannelsStatus() {
  return {
    email: isSmtpConfigured(),
    sms: Boolean(env.SMS_PROVIDER_API_KEY && env.SMS_PROVIDER_FROM),
    push: Boolean(env.FCM_SERVER_KEY),
    calendar: Boolean(env.GOOGLE_CALENDAR_REFRESH_TOKEN && env.GOOGLE_CLIENT_ID)
  };
}

export async function notifyEmail(opts: {
  to: string | null | undefined;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ sent: boolean; reason?: string; messageId?: string }> {
  if (!opts.to?.includes('@')) return { sent: false, reason: 'No email address' };
  if (!isSmtpConfigured()) return { sent: false, reason: 'SMTP not configured (SMTP_HOST/USER/PASS)' };
  try {
    const r = await sendSmtpMail({
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text
    });
    return { sent: true, messageId: r.messageId };
  } catch (e: any) {
    console.warn('[rabsNotify] email', e?.message || e);
    return { sent: false, reason: String(e?.message || e) };
  }
}

/** SMS — no-op until SMS_PROVIDER_* keys are set. Never throws. */
export async function notifySms(opts: {
  to: string | null | undefined;
  body: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const phone = opts.to?.replace(/\s+/g, '');
  if (!phone) return { sent: false, reason: 'No phone' };
  if (!env.SMS_PROVIDER_API_KEY || !env.SMS_PROVIDER_FROM) {
    return { sent: false, reason: 'SMS not configured (SMS_PROVIDER_API_KEY / SMS_PROVIDER_FROM)' };
  }
  // Provider-agnostic placeholder: set SMS_PROVIDER_URL to a POST endpoint that accepts {to,from,body}.
  const url = env.SMS_PROVIDER_URL;
  if (!url) return { sent: false, reason: 'SMS_PROVIDER_URL not set' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SMS_PROVIDER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to: phone, from: env.SMS_PROVIDER_FROM, body: opts.body })
    });
    if (!res.ok) return { sent: false, reason: `SMS API ${res.status}` };
    return { sent: true };
  } catch (e: any) {
    return { sent: false, reason: String(e?.message || e) };
  }
}
