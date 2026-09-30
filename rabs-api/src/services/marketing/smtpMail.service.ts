/**
 * Backward-compatible SMTP helpers — implementation lives in email/SmtpGmailProvider.
 */
export {
  isSmtpConfigured,
  sendSmtpMail,
  sleep,
  SmtpGmailProvider
} from './email/SmtpGmailProvider.js';
