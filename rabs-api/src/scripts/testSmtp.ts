import 'dotenv/config';
import { isSmtpConfigured, sendSmtpMail } from '../services/marketing/email/SmtpGmailProvider.js';

async function main() {
  console.log('SMTP configured:', isSmtpConfigured());
  console.log('SMTP_USER:', process.env.SMTP_USER);
  const to = process.env.SMTP_USER || 'lunarscrtltd@gmail.com';
  const r = await sendSmtpMail({
    to,
    subject: 'RABS SMTP test',
    html: '<p>Gmail SMTP is working for RABS Interiors OTP and notifications.</p>',
    text: 'Gmail SMTP is working for RABS Interiors OTP and notifications.'
  });
  console.log('Sent:', r);
}

main().catch((e) => {
  console.error('FAIL:', e?.message || e);
  process.exit(1);
});
