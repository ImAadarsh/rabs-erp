/** Customer portal: OTP login + scoped job/quote views. Separate from staff JWT. */
import jwt from 'jsonwebtoken';
import { AppDataSource } from '@config/data-source.js';
import { env } from '@config/env.js';
import { RabsCustomer, RabsJob, RabsQuote } from '@entities/rabs/RabsEntities.js';
import { addTimeline, bad, conflict, getSettings, notFound, recomputeJob, todayISO } from './rabsCore.js';
import { DEFAULT_STATUSES, PROGRESS_STEPS, deriveStatus, progressIndex } from './rabsWorkflow.js';
import { Not, In } from 'typeorm';
import { isSmtpConfigured, sendSmtpMail } from '@services/marketing/email/SmtpGmailProvider.js';
import { notifySms } from './rabsNotify.js';

type PortalAuth = { orgId: string; rabsCustomerId: string; typ: 'portal' };

/** In-memory OTP store (dev/prod-simple). Key: orgId:normalizedIdentifier */
const otps = new Map<string, { code: string; customerId: string; orgId: string; expires: number }>();

function normalizeIdentifier(raw: string): { phone?: string; email?: string; key: string } {
  const s = raw.trim();
  if (s.includes('@')) {
    const email = s.toLowerCase();
    return { email, key: `e:${email}` };
  }
  const phone = s.replace(/[\s\-()]/g, '');
  return { phone, key: `p:${phone}` };
}

export async function requestOtp(identifier: string) {
  const id = normalizeIdentifier(identifier);
  if (!id.phone && !id.email) throw bad('Enter the phone or email on your quotation');

  const qb = AppDataSource.getRepository(RabsCustomer).createQueryBuilder('c');
  if (id.email) qb.where('LOWER(c.email) = :email', { email: id.email });
  else qb.where("REPLACE(REPLACE(REPLACE(REPLACE(c.phone, ' ', ''), '-', ''), '(', ''), ')', '') LIKE :phone", {
    phone: `%${id.phone!.replace(/^\+44/, '0').replace(/^44/, '0')}%`
  });
  const customers = await qb.take(5).getMany();
  if (!customers.length) throw bad('We could not find an account with that phone or email. Check the details on your quote.');

  // Prefer the customer with an active job
  const customer = customers[0];
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const mapKey = `${customer.organizationId}:${id.key}`;
  otps.set(mapKey, { code, customerId: String(customer.id), orgId: String(customer.organizationId), expires: Date.now() + 10 * 60 * 1000 });

  // Also store bare key for lookup without org
  otps.set(id.key, { code, customerId: String(customer.id), orgId: String(customer.organizationId), expires: Date.now() + 10 * 60 * 1000 });

  const delivery = await deliverPortalOtp(customer, id, code);
  const payload: Record<string, unknown> = {
    ok: true,
    message: delivery.message,
    channel: delivery.channel
  };
  // Dev-only fallback when nothing could be delivered
  if (env.NODE_ENV !== 'production' && !delivery.sent) payload.devCode = code;
  return payload;
}

async function deliverPortalOtp(
  customer: RabsCustomer,
  id: { phone?: string; email?: string },
  code: string
): Promise<{ sent: boolean; channel: 'email' | 'sms' | 'none'; message: string }> {
  const emailTo = (id.email || customer.email || '').trim().toLowerCase();
  const subject = 'Your RABS Interiors login code';
  const text = `Your login code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`;
  const html = `<p>Your RABS Interiors login code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`;

  if (emailTo.includes('@') && isSmtpConfigured()) {
    try {
      await sendSmtpMail({ to: emailTo, subject, html, text });
      return { sent: true, channel: 'email', message: `A code has been sent to ${maskEmail(emailTo)}.` };
    } catch (e: any) {
      console.warn('[portal OTP] SMTP failed', e?.message || e);
    }
  }

  const sms = await notifySms({
    to: id.phone || customer.phone,
    body: `RABS Interiors login code: ${code}. Expires in 10 minutes.`
  });
  if (sms.sent) {
    return { sent: true, channel: 'sms', message: 'A code has been sent by SMS.' };
  }

  if (!isSmtpConfigured()) {
    return {
      sent: false,
      channel: 'none',
      message: 'Email delivery is not configured on the server. Please contact the office for access.'
    };
  }
  if (!emailTo.includes('@')) {
    return {
      sent: false,
      channel: 'none',
      message: 'No email is on file for this account. Ask the office to add your email, or sign in with the email on your quotation.'
    };
  }
  return {
    sent: false,
    channel: 'none',
    message: 'We could not send the code just now. Please try again shortly.'
  };
}

function maskEmail(email: string) {
  const [u, d] = email.split('@');
  if (!d) return '***';
  const visible = u.slice(0, Math.min(2, u.length));
  return `${visible}***@${d}`;
}

export async function verifyOtp(identifier: string, code: string) {
  const id = normalizeIdentifier(identifier);
  const entry = otps.get(id.key);
  if (!entry || entry.expires < Date.now()) throw bad('Code expired. Request a new one.');
  if (entry.code !== code.trim()) throw bad('That code is not correct.');
  otps.delete(id.key);
  otps.delete(`${entry.orgId}:${id.key}`);

  const customer = await AppDataSource.getRepository(RabsCustomer).findOne({ where: { id: entry.customerId as any } });
  if (!customer) throw notFound('Customer');

  const accessToken = jwt.sign(
    { sub: String(customer.id), orgId: String(customer.organizationId), rabsCustomerId: String(customer.id), typ: 'portal', roles: ['CUSTOMER'] } satisfies PortalAuth & { sub: string; roles: string[] },
    env.JWT_ACCESS_SECRET,
    { expiresIn: 60 * 60 * 24 * 30 }
  );

  return {
    accessToken,
    customer: {
      id: String(customer.id),
      name: customer.name,
      email: customer.email,
      phone: customer.phone
    }
  };
}

export function parsePortalAuth(req: { headers: { authorization?: string } }): PortalAuth {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw bad('Unauthorized');
  try {
    const payload = jwt.verify(header.substring(7), env.JWT_ACCESS_SECRET) as any;
    if (payload.typ !== 'portal' || !payload.rabsCustomerId || !payload.orgId) throw new Error('bad');
    return { orgId: String(payload.orgId), rabsCustomerId: String(payload.rabsCustomerId), typ: 'portal' };
  } catch {
    throw bad('Unauthorized');
  }
}

async function customerJobs(auth: PortalAuth) {
  return AppDataSource.getRepository(RabsJob).find({
    where: { organizationId: auth.orgId as any, rabsCustomerId: auth.rabsCustomerId as any },
    order: { createdAt: 'DESC' }
  });
}

export async function portalMe(auth: PortalAuth) {
  const c = await AppDataSource.getRepository(RabsCustomer).findOne({ where: { id: auth.rabsCustomerId as any } });
  if (!c || String(c.organizationId) !== auth.orgId) throw notFound('Customer');
  return { id: String(c.id), name: c.name, email: c.email, phone: c.phone };
}

function statusDef(code: string) {
  return DEFAULT_STATUSES.find((d) => d.code === code) || DEFAULT_STATUSES[0];
}

async function jobStatusPayload(job: RabsJob) {
  const settings = await getSettings(String(job.organizationId));
  const quote = job.acceptedQuoteId
    ? await AppDataSource.getRepository(RabsQuote).findOne({ where: { id: job.acceptedQuoteId as any } })
    : await AppDataSource.getRepository(RabsQuote).findOne({ where: { jobId: job.id as any }, order: { version: 'DESC' } });

  const payments = await AppDataSource.query(
    'SELECT COALESCE(SUM(amount),0) paid FROM rabs_payments WHERE job_id = ? AND deleted_at IS NULL',
    [job.id]
  );
  const paid = Number(payments[0]?.paid || 0);
  const bookings = await AppDataSource.query(
    `SELECT id, type, scheduled_date scheduledDate, slot, status FROM rabs_bookings WHERE job_id = ? AND status != 'cancelled' ORDER BY scheduled_date`,
    [job.id]
  );
  const fitting = bookings.find((b: any) => b.type === 'fitting') || null;
  const delivery = bookings.find((b: any) => b.type === 'delivery') || null;

  const [{ m }] = await AppDataSource.query('SELECT COUNT(*) m FROM rabs_measurements WHERE job_id = ?', [job.id]);
  const [{ a }] = await AppDataSource.query('SELECT COUNT(*) a FROM rabs_appointments WHERE job_id = ? AND status != ?', [job.id, 'cancelled']);
  const code2 = deriveStatus({
    closed: !!job.closedAt,
    hasIssue: !!job.hasIssue,
    converted: !!job.convertedAt,
    acceptedQuote: !!job.acceptedQuoteId,
    quoteStatus: quote?.status || null,
    hasMeasurement: Number(m) > 0,
    hasAppointment: Number(a) > 0,
    depositRequired: Number(job.depositRequired || 0),
    paid,
    balance: Number(job.totalAmount || 0) - paid,
    materialsStatus: job.materialsStatus || 'not_checked',
    requiresFitting: !!job.requiresFitting,
    requiresDelivery: !!job.requiresDelivery,
    fitting: fitting ? { status: fitting.status, date: String(fitting.scheduledDate).slice(0, 10) } : null,
    delivery: delivery ? { status: delivery.status, date: String(delivery.scheduledDate).slice(0, 10) } : null,
    invoiceIssued: false,
    autoClose: !!settings.autoCloseWhenPaid,
    today: todayISO()
  });

  const def = statusDef(code2);
  const idx = progressIndex(code2, !!job.closedAt);
  const customer = await AppDataSource.getRepository(RabsCustomer).findOneOrFail({ where: { id: job.rabsCustomerId as any } });
  const address = [customer.addressLine1, customer.city, customer.postcode].filter(Boolean).join(', ');

  return {
    id: String(job.id),
    jobNumber: job.jobNumber,
    siteAddress: job.siteAddress || address,
    statusLabel: def.label,
    status: { code: def.code, label: def.label, color: def.color, textColor: def.textColor },
    progress: { index: idx, steps: PROGRESS_STEPS.map((s) => ({ key: s.key, label: s.label })) },
    money: {
      quoteTotal: Number(job.totalAmount || quote?.total || 0),
      paid,
      balance: Math.max(0, Number(job.totalAmount || quote?.total || 0) - paid),
      depositOutstanding: Math.max(0, Number(job.depositRequired || 0) - paid)
    },
    quote: quote
      ? {
          id: String(quote.id),
          quoteNumber: quote.quoteNumber,
          status: quote.status,
          total: Number(quote.total),
          version: quote.version
        }
      : null,
    bookings: bookings.map((b: any) => ({
      id: String(b.id),
      type: b.type,
      scheduledDate: b.scheduledDate,
      slot: b.slot,
      status: b.status
    })),
    paymentInstructions:
      settings.documentFooter ||
      'Please pay the deposit to confirm your order. Bank details are on your quotation or ask the office.'
  };
}

export async function portalListJobs(auth: PortalAuth) {
  const jobs = await customerJobs(auth);
  return Promise.all(jobs.map((j) => jobStatusPayload(j)));
}

export async function portalGetJob(auth: PortalAuth, jobId: string) {
  const job = await AppDataSource.getRepository(RabsJob).findOne({ where: { id: jobId as any } });
  if (!job || String(job.organizationId) !== auth.orgId || String(job.rabsCustomerId) !== auth.rabsCustomerId) {
    throw notFound('Job');
  }
  return jobStatusPayload(job);
}

export async function portalAcceptQuote(auth: PortalAuth, quoteId: string) {
  const q = await AppDataSource.getRepository(RabsQuote).findOne({ where: { id: quoteId as any } });
  if (!q) throw notFound('Quote');
  const job = await AppDataSource.getRepository(RabsJob).findOne({ where: { id: q.jobId as any } });
  if (!job || String(job.organizationId) !== auth.orgId || String(job.rabsCustomerId) !== auth.rabsCustomerId) {
    throw notFound('Quote');
  }
  if (job.acceptedQuoteId && job.acceptedQuoteId !== q.id) throw conflict('Another quotation is already accepted');
  if (q.status === 'accepted') return portalGetJob(auth, String(job.id));
  if (!['draft', 'sent'].includes(q.status)) throw conflict(`A ${q.status} quotation cannot be accepted`);
  if (Number(q.total) <= 0) throw bad('The quotation total must be more than £0');

  const customer = await AppDataSource.getRepository(RabsCustomer).findOne({ where: { id: auth.rabsCustomerId as any } });
  await AppDataSource.getRepository(RabsQuote).update(
    { id: q.id },
    { status: 'accepted', acceptedAt: new Date(), acceptedByName: customer?.name || null, sentAt: q.sentAt ?? new Date() }
  );
  await AppDataSource.getRepository(RabsQuote).update(
    { jobId: q.jobId, id: Not(q.id), status: In(['draft', 'sent']) },
    { status: 'superseded' }
  );
  await AppDataSource.getRepository(RabsJob).update(
    { id: job.id },
    { acceptedQuoteId: q.id, depositRequired: q.depositRequired, totalAmount: q.total }
  );
  const ctx = { orgId: String(job.organizationId), userId: auth.rabsCustomerId };
  await addTimeline(ctx, String(job.id), 'accepted', `Quotation ${q.quoteNumber} accepted by customer via portal`);
  await recomputeJob(ctx, String(job.id));
  return portalGetJob(auth, String(job.id));
}

export async function portalDeclineQuote(auth: PortalAuth, quoteId: string) {
  const q = await AppDataSource.getRepository(RabsQuote).findOne({ where: { id: quoteId as any } });
  if (!q) throw notFound('Quote');
  const job = await AppDataSource.getRepository(RabsJob).findOne({ where: { id: q.jobId as any } });
  if (!job || String(job.organizationId) !== auth.orgId || String(job.rabsCustomerId) !== auth.rabsCustomerId) {
    throw notFound('Quote');
  }
  if (q.status === 'accepted') throw conflict('This quotation is already accepted');
  await AppDataSource.getRepository(RabsQuote).update({ id: q.id }, { status: 'declined' });
  const ctx = { orgId: String(job.organizationId), userId: auth.rabsCustomerId };
  await addTimeline(ctx, String(job.id), 'quote', `Quotation ${q.quoteNumber} declined by customer via portal`);
  await recomputeJob(ctx, String(job.id));
  return portalGetJob(auth, String(job.id));
}
