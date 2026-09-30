import { AppDataSource } from '@config/data-source.js';
import { Customer } from '@entities/orders/Customer.js';
import { B2bCreditLedger } from '@entities/b2b/B2bCreditLedger.js';
import { B2bCreditRequest } from '@entities/b2b/B2bCreditRequest.js';
import { Payment } from '@entities/finance/Payment.js';
import { Order } from '@entities/orders/Order.js';
import { getOrCreateB2bSettings } from './b2bCatalog.service.js';

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function getWalletSummary(customerId: string, orgId: string) {
  const customer = await AppDataSource.getRepository(Customer).findOne({ where: { id: customerId } });
  if (!customer) throw Object.assign(new Error('Retailer not found'), { status: 404 });
  const settings = await getOrCreateB2bSettings(orgId);
  const pendingRequests = await AppDataSource.getRepository(B2bCreditRequest).count({
    where: { customer: { id: customerId }, status: 'pending' }
  });
  return {
    creditLimit: num(customer.creditLimit),
    creditUsed: num(customer.creditUsed),
    availableCredit: Number((num(customer.creditLimit) - num(customer.creditUsed)).toFixed(4)),
    paymentTerms: customer.paymentTerms || '30 Days Net',
    pendingCreditRequests: pendingRequests,
    assignedRep: {
      name: settings.assignedRepName,
      phone: settings.assignedRepPhone,
      email: settings.assignedRepEmail
    }
  };
}

export async function listLedger(customerId: string) {
  const ledger = await AppDataSource.getRepository(B2bCreditLedger).find({
    where: { customer: { id: customerId } },
    order: { createdAt: 'DESC' },
    take: 100
  });

  if (ledger.length > 0) {
    return ledger.map((e) => ({
      id: e.id,
      reference: e.reference,
      type: e.entryType,
      description: e.description,
      date: e.createdAt,
      amount: num(e.amount),
      status: e.entryType === 'invoice' ? 'pending' : e.entryType === 'payment' ? 'settled' : 'applied'
    }));
  }

  // Fallback compose from orders + payments when ledger empty
  const orders = await AppDataSource.getRepository(Order).find({
    where: { customer: { id: customerId }, channel: 'b2b_portal' },
    relations: ['organization'],
    order: { createdAt: 'DESC' },
    take: 50
  });
  const orderIds = new Set(orders.map((o) => o.id));
  const orgId = orders[0]?.organization?.id;
  const payments = orgId
    ? await AppDataSource.getRepository(Payment).find({
        where: { organizationId: orgId },
        order: { createdAt: 'DESC' },
        take: 100
      })
    : [];

  const rows: any[] = [];
  for (const o of orders) {
    rows.push({
      id: `ord-${o.id}`,
      reference: `INV-${o.orderNumber}`,
      type: 'invoice',
      description: `Wholesale order ${o.orderNumber}`,
      date: o.orderDate,
      amount: num(o.total),
      status: o.paymentStatus === 'paid' || o.paymentStatus === 'authorized' ? 'settled' : 'pending'
    });
  }
  for (const p of payments.filter((x) => x.orderId && orderIds.has(x.orderId))) {
    rows.push({
      id: `pay-${p.id}`,
      reference: p.transactionId || `PAY-${p.id}`,
      type: 'payment',
      description: p.notes || p.reference || 'Payment',
      date: p.paymentDate || p.createdAt,
      amount: num(p.amount),
      status: p.status === 'completed' ? 'settled' : p.status
    });
  }
  return rows.sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

export async function requestCreditIncrease(opts: {
  orgId: string;
  customerId: string;
  requestedLimit: number;
  reason?: string;
}) {
  const customer = await AppDataSource.getRepository(Customer).findOne({ where: { id: opts.customerId } });
  if (!customer) throw Object.assign(new Error('Retailer not found'), { status: 404 });
  if (opts.requestedLimit <= num(customer.creditLimit)) {
    throw Object.assign(new Error('Requested limit must be greater than current credit limit'), { status: 400 });
  }
  const pending = await AppDataSource.getRepository(B2bCreditRequest).findOne({
    where: { customer: { id: opts.customerId }, status: 'pending' }
  });
  if (pending) {
    throw Object.assign(new Error('A credit increase request is already pending review'), { status: 400 });
  }
  const repo = AppDataSource.getRepository(B2bCreditRequest);
  return repo.save(
    repo.create({
      organization: { id: opts.orgId } as any,
      customer,
      requestedLimit: opts.requestedLimit,
      currentLimit: num(customer.creditLimit),
      reason: opts.reason || null,
      status: 'pending'
    })
  );
}

export async function listCreditRequests(customerId: string) {
  return AppDataSource.getRepository(B2bCreditRequest).find({
    where: { customer: { id: customerId } },
    order: { createdAt: 'DESC' }
  });
}

export async function buildStatementCsv(customerId: string): Promise<string> {
  const rows = await listLedger(customerId);
  const header = 'reference,type,description,date,amount,status';
  const lines = rows.map((r) =>
    [r.reference, r.type, JSON.stringify(r.description), new Date(r.date).toISOString(), r.amount, r.status].join(',')
  );
  return [header, ...lines].join('\n');
}
