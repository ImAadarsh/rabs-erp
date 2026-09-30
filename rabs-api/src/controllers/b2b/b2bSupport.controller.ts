import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { Ticket } from '@entities/crm/Ticket.js';
import { TicketMessage } from '@entities/crm/TicketMessage.js';
import { Organization } from '@entities/iam/Organization.js';
import { Customer } from '@entities/orders/Customer.js';
import { Order } from '@entities/orders/Order.js';
import { RetailerAccount } from '@entities/b2b/RetailerAccount.js';
import { B2bAuthPayload } from '@middlewares/b2bAuth.js';

function auth(req: Request): B2bAuthPayload {
  return (req as any).b2bAuth as B2bAuthPayload;
}

const createSchema = z.object({
  subject: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
  category: z
    .enum(['order_inquiry', 'return', 'complaint', 'technical', 'billing', 'general', 'other'])
    .default('general'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  orderId: z.string().optional()
});

const messageSchema = z.object({
  message: z.string().min(1).max(10000)
});

function mapMessage(m: TicketMessage) {
  return {
    id: m.id,
    senderType: m.senderType,
    senderName: m.senderName,
    message: m.message,
    createdAt: m.createdAt
  };
}

function mapTicket(ticket: Ticket, includeMessages = false) {
  const publicMessages = includeMessages
    ? (ticket.messages || [])
        .filter((m) => !m.isInternal)
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
        .map(mapMessage)
    : undefined;

  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    channel: ticket.channel,
    orderId: ticket.order?.id ?? null,
    orderNumber: ticket.order?.orderNumber ?? null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    ...(includeMessages ? { messages: publicMessages } : {})
  };
}

async function loadCustomerContext(payload: B2bAuthPayload) {
  // Select only columns we need (avoids schema-drift on unrelated Customer fields).
  const customer = await AppDataSource.getRepository(Customer)
    .createQueryBuilder('c')
    .select(['c.id', 'c.firstName', 'c.lastName', 'c.companyName', 'c.email'])
    .where('c.id = :id', { id: payload.customerId })
    .getOne();
  if (!customer) {
    throw Object.assign(new Error('Retailer customer not found'), { status: 404 });
  }

  const account = await AppDataSource.getRepository(RetailerAccount)
    .createQueryBuilder('ra')
    .select(['ra.id', 'ra.email'])
    .where('ra.id = :id', { id: payload.retailerAccountId })
    .getOne();

  const senderName =
    `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() ||
    customer.companyName ||
    account?.email ||
    customer.email ||
    'Retailer';
  const senderEmail = account?.email || customer.email || null;

  return { customer, senderName, senderEmail };
}

async function findOwnedTicket(customerId: string, ticketId: string, withMessages = false) {
  const repo = AppDataSource.getRepository(Ticket);
  const ticket = await repo.findOne({
    where: { id: ticketId, customer: { id: customerId } },
    relations: withMessages
      ? ['order', 'messages']
      : ['order']
  });
  return ticket;
}

export class B2bSupportController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { customerId } = auth(req);
      const tickets = await AppDataSource.getRepository(Ticket).find({
        where: { customer: { id: customerId } },
        relations: ['order'],
        order: { createdAt: 'DESC' },
        take: 100
      });
      res.json({ data: tickets.map((t) => mapTicket(t)) });
    } catch (e: any) {
      res.status(e.status || 500).json({ error: { message: e.message || 'Failed to list tickets' } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const { customerId } = auth(req);
      const ticket = await findOwnedTicket(customerId, req.params.id, true);
      if (!ticket) {
        res.status(404).json({ error: { message: 'Ticket not found' } });
        return;
      }
      res.json({ data: mapTicket(ticket, true) });
    } catch (e: any) {
      res.status(e.status || 500).json({ error: { message: e.message || 'Failed to load ticket' } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const payload = auth(req);
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const { customer, senderName, senderEmail } = await loadCustomerContext(payload);
      const orgExists = await AppDataSource.getRepository(Organization)
        .createQueryBuilder('o')
        .select(['o.id'])
        .where('o.id = :id', { id: payload.orgId })
        .getOne();
      if (!orgExists) {
        res.status(400).json({ error: { message: 'Invalid organization' } });
        return;
      }

      let order: Order | null = null;
      if (parsed.data.orderId) {
        order = await AppDataSource.getRepository(Order)
          .createQueryBuilder('o')
          .select(['o.id', 'o.orderNumber'])
          .where('o.id = :id', { id: parsed.data.orderId })
          .andWhere('o.customer_id = :customerId', { customerId: payload.customerId })
          .getOne();
        if (!order) {
          res.status(400).json({ error: { message: 'Order not found for this account' } });
          return;
        }
      }

      const ticketRepo = AppDataSource.getRepository(Ticket);
      const messageRepo = AppDataSource.getRepository(TicketMessage);

      const ticket = ticketRepo.create({
        organization: { id: payload.orgId } as Organization,
        customer: { id: customer.id } as Customer,
        order: order ? ({ id: order.id } as Order) : null,
        channel: 'web_form',
        subject: parsed.data.subject,
        description: parsed.data.description,
        priority: parsed.data.priority,
        category: parsed.data.category,
        ticketNumber: `TICK-${Date.now()}`,
        status: 'new'
      });
      await ticketRepo.save(ticket);

      const firstMessage = messageRepo.create({
        ticket,
        senderType: 'customer',
        senderName,
        senderEmail,
        message: parsed.data.description,
        isInternal: false
      });
      await messageRepo.save(firstMessage);

      const created = await findOwnedTicket(payload.customerId, ticket.id, true);
      res.status(201).json({ data: mapTicket(created!, true) });
    } catch (e: any) {
      res.status(e.status || 500).json({ error: { message: e.message || 'Failed to create ticket' } });
    }
  }

  static async addMessage(req: Request, res: Response): Promise<void> {
    try {
      const payload = auth(req);
      const parsed = messageSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const ticket = await findOwnedTicket(payload.customerId, req.params.id, false);
      if (!ticket) {
        res.status(404).json({ error: { message: 'Ticket not found' } });
        return;
      }

      if (ticket.status === 'closed' || ticket.status === 'cancelled') {
        res.status(400).json({ error: { message: 'This ticket is closed and cannot accept replies' } });
        return;
      }

      const { senderName, senderEmail } = await loadCustomerContext(payload);
      const messageRepo = AppDataSource.getRepository(TicketMessage);
      const message = messageRepo.create({
        ticket,
        senderType: 'customer',
        senderName,
        senderEmail,
        message: parsed.data.message,
        isInternal: false
      });
      await messageRepo.save(message);

      const ticketRepo = AppDataSource.getRepository(Ticket);
      ticket.updatedAt = new Date();
      if (ticket.status === 'pending_customer' || ticket.status === 'resolved' || ticket.status === 'new') {
        ticket.status = 'open';
      }
      await ticketRepo.save(ticket);

      res.status(201).json({ data: mapMessage(message) });
    } catch (e: any) {
      res.status(e.status || 500).json({ error: { message: e.message || 'Failed to send message' } });
    }
  }
}
