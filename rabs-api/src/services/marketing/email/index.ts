import { decryptJson } from '@utils/credentialCrypto.js';
import type { MarketingEmailConnector } from '@entities/marketing/MarketingEmailConnector.js';
import type { MarketingEmailProviderKind } from '@entities/marketing/MarketingEmailConnector.js';
import type { EmailProvider } from './EmailProvider.js';
import { SendGridProvider, type SendGridCredentials } from './SendGridProvider.js';
import { SmtpGmailProvider, type SmtpGmailCredentials } from './SmtpGmailProvider.js';
import { BrevoProvider, type BrevoCredentials } from './BrevoProvider.js';
import { SesProvider, type SesCredentials } from './SesProvider.js';
import { MailchimpProvider, type MailchimpCredentials } from './MailchimpProvider.js';

export function createEmailProviderFromCredentials(
  provider: MarketingEmailProviderKind,
  credentials: Record<string, unknown>
): EmailProvider {
  switch (provider) {
    case 'sendgrid':
      return new SendGridProvider(credentials as SendGridCredentials);
    case 'gmail_smtp':
      return new SmtpGmailProvider(credentials as SmtpGmailCredentials);
    case 'brevo':
      return new BrevoProvider(credentials as BrevoCredentials);
    case 'ses':
      return new SesProvider(credentials as SesCredentials);
    case 'mailchimp':
      return new MailchimpProvider(credentials as MailchimpCredentials);
    default:
      throw Object.assign(new Error(`Unknown email provider: ${provider}`), { status: 400 });
  }
}

export function createEmailProvider(connector: MarketingEmailConnector): EmailProvider {
  const credentials = decryptJson<Record<string, unknown>>(connector.credentialsEncrypted);
  return createEmailProviderFromCredentials(connector.provider, credentials);
}

/** Fallback when campaign has no connector: prefer SendGrid env, else Gmail SMTP env. */
export function createDefaultEnvProvider(): EmailProvider {
  if (process.env.SENDGRID_API_KEY) {
    return new SendGridProvider({
      useEnv: true,
      fromEmail: process.env.SENDGRID_FROM_EMAIL,
      fromName: process.env.SENDGRID_FROM_NAME
    });
  }
  return new SmtpGmailProvider({ useEnv: true });
}

export {
  SendGridProvider,
  SmtpGmailProvider,
  BrevoProvider,
  SesProvider,
  MailchimpProvider
};
