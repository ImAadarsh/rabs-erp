import { Request, Response } from 'express';
import { z } from 'zod';
import { In, IsNull } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { Customer } from '@entities/orders/Customer.js';
import { CustomerAddress } from '@entities/orders/CustomerAddress.js';
import { CustomerNote } from '@entities/crm/CustomerNote.js';
import { Order } from '@entities/orders/Order.js';
import { Ticket } from '@entities/crm/Ticket.js';
import { CrmDeal } from '@entities/crm/CrmDeal.js';
import { CrmActivity } from '@entities/crm/CrmActivity.js';
import { CrmContact } from '@entities/crm/CrmContact.js';
import { CrmDealStageHistory } from '@entities/crm/CrmDealStageHistory.js';
import { TicketMessage } from '@entities/crm/TicketMessage.js';
import { RetailerAccount } from '@entities/b2b/RetailerAccount.js';
import { assertOrgAccess, orgIdFromReq, userIdFromReq } from '@services/crm/crmScope.js';
import { attachTag, detachTag, listTagsForEntities } from '@services/crm/tags.service.js';

export type TimelineItem = {
  id: string;
  type: 'activity' | 'note' | 'ticket_message' | 'deal_stage';
  at: string;
  title: string;
  body?: string | null;
  meta?: Record<string, unknown>;
};

const OPEN_TICKET_STATUSES = ['new', 'open', 'pending_customer', 'pending_internal'] as const;

const noteSchema = z.object({
  note: z.string().min(1),
  noteType: z.enum(['general', 'complaint', 'praise', 'follow_up', 'warning', 'other']).optional(),
  isImportant: z.boolean().optional()
});

const patchAccountSchema = z.object({
  crmOwnerUserId: z.string().nullable().optional()
});

export class AccountsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const { search, ownerUserId, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const qb = AppDataSource.getRepository(Customer)
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.crmOwner', 'crmOwner')
        .where('c.organization_id = :orgId', { orgId })
        .andWhere('c.deleted_at IS NULL')
        .orderBy('c.updatedAt', 'DESC')
        .take(take)
        .skip(skip);

      if (ownerUserId) qb.andWhere('c.crm_owner_user_id = :ownerUserId', { ownerUserId });
      if (search) {
        qb.andWhere(
          '(c.email LIKE :q OR c.phone LIKE :q OR c.company_name LIKE :q OR c.first_name LIKE :q OR c.last_name LIKE :q OR c.customer_number LIKE :q)',
          { q: `%${String(search)}%` }
        );
      }

      const [customers, total] = await qb.getManyAndCount();
      const ids = customers.map((c) => c.id);
      const tagsMap = await listTagsForEntities('account', ids);

      const openTicketsMap = new Map<string, number>();
      const openDealsMap = new Map<string, number>();
      const lastOrderMap = new Map<string, Date | null>();

      if (ids.length) {
        const ticketRows: Array<{ customer_id: string; cnt: string }> = await AppDataSource.query(
          `SELECT customer_id, COUNT(*) AS cnt FROM tickets
           WHERE customer_id IN (?) AND status IN (?)
           GROUP BY customer_id`,
          [ids, [...OPEN_TICKET_STATUSES]]
        );
        for (const row of ticketRows) openTicketsMap.set(String(row.customer_id), Number(row.cnt));

        const dealRows: Array<{ customer_id: string; cnt: string }> = await AppDataSource.query(
          `SELECT customer_id, COUNT(*) AS cnt FROM crm_deals
           WHERE customer_id IN (?) AND status = 'open'
           GROUP BY customer_id`,
          [ids]
        );
        for (const row of dealRows) openDealsMap.set(String(row.customer_id), Number(row.cnt));

        const orderRows: Array<{ customer_id: string; last_order: Date | null }> = await AppDataSource.query(
          `SELECT customer_id, MAX(order_date) AS last_order FROM orders
           WHERE customer_id IN (?)
           GROUP BY customer_id`,
          [ids]
        );
        for (const row of orderRows) lastOrderMap.set(String(row.customer_id), row.last_order);
      }

      res.json({
        data: customers.map((c) => ({
          ...c,
          tags: tagsMap.get(c.id) || [],
          openTicketsCount: openTicketsMap.get(c.id) || 0,
          openDealsCount: openDealsMap.get(c.id) || 0,
          lastOrderDate: lastOrderMap.get(c.id) || null
        })),
        meta: { total, page: Number(page) || 1, limit: take }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const customerId = req.params.customerId;
      const customer = await AppDataSource.getRepository(Customer).findOne({
        where: { id: customerId, deletedAt: IsNull() },
        relations: ['organization', 'crmOwner']
      });
      if (!customer) {
        res.status(404).json({ error: { message: 'Account not found' } });
        return;
      }
      assertOrgAccess(req, customer.organization?.id);

      const orderLimit = Math.min(Number(req.query.orderLimit) || 10, 50);

      const [addresses, recentOrders, openTickets, deals, activities, notes, contacts, tagsMap, retailer] =
        await Promise.all([
          AppDataSource.getRepository(CustomerAddress).find({
            where: { customer: { id: customerId } },
            take: 50
          }),
          AppDataSource.getRepository(Order).find({
            where: { customer: { id: customerId } },
            order: { orderDate: 'DESC' },
            take: orderLimit
          }),
          AppDataSource.getRepository(Ticket).find({
            where: {
              customer: { id: customerId },
              status: In([...OPEN_TICKET_STATUSES] as any)
            },
            order: { createdAt: 'DESC' },
            take: 50
          }),
          AppDataSource.getRepository(CrmDeal).find({
            where: { customerId },
            relations: ['stage', 'pipeline', 'owner'],
            order: { updatedAt: 'DESC' },
            take: 50
          }),
          AppDataSource.getRepository(CrmActivity).find({
            where: { customerId },
            relations: ['owner'],
            order: { createdAt: 'DESC' },
            take: 50
          }),
          AppDataSource.getRepository(CustomerNote).find({
            where: { customer: { id: customerId } },
            relations: ['createdBy'],
            order: { createdAt: 'DESC' },
            take: 50
          }),
          AppDataSource.getRepository(CrmContact).find({
            where: { customerId },
            order: { isPrimary: 'DESC', createdAt: 'DESC' },
            take: 100
          }),
          listTagsForEntities('account', [customerId]),
          AppDataSource.getRepository(RetailerAccount).findOne({
            where: { customer: { id: customerId } }
          })
        ]);

      res.json({
        data: {
          customer,
          addresses,
          recentOrders,
          openTickets,
          deals,
          activities,
          notes,
          contacts,
          tags: tagsMap.get(customerId) || [],
          portalRetailer: retailer
            ? { id: retailer.id, email: retailer.email, status: retailer.status }
            : null
        }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async timeline(req: Request, res: Response): Promise<void> {
    try {
      const customerId = req.params.customerId;
      const customer = await AppDataSource.getRepository(Customer).findOne({
        where: { id: customerId, deletedAt: IsNull() },
        relations: ['organization']
      });
      if (!customer) {
        res.status(404).json({ error: { message: 'Account not found' } });
        return;
      }
      assertOrgAccess(req, customer.organization?.id);

      const limit = Math.min(Number(req.query.limit) || 100, 300);
      const items: TimelineItem[] = [];

      const [activities, notes, tickets, deals] = await Promise.all([
        AppDataSource.getRepository(CrmActivity).find({
          where: { customerId },
          relations: ['owner'],
          order: { createdAt: 'DESC' },
          take: limit
        }),
        AppDataSource.getRepository(CustomerNote).find({
          where: { customer: { id: customerId } },
          relations: ['createdBy'],
          order: { createdAt: 'DESC' },
          take: limit
        }),
        AppDataSource.getRepository(Ticket).find({
          where: { customer: { id: customerId } },
          take: 50,
          order: { createdAt: 'DESC' }
        }),
        AppDataSource.getRepository(CrmDeal).find({
          where: { customerId },
          take: 50
        })
      ]);

      for (const a of activities) {
        items.push({
          id: `activity:${a.id}`,
          type: 'activity',
          at: a.createdAt.toISOString(),
          title: a.subject,
          body: a.body,
          meta: {
            activityId: a.id,
            activityType: a.type,
            dueAt: a.dueAt,
            completedAt: a.completedAt,
            ownerUserId: a.ownerUserId
          }
        });
      }

      for (const n of notes) {
        items.push({
          id: `note:${n.id}`,
          type: 'note',
          at: n.createdAt.toISOString(),
          title: `Note · ${n.noteType}`,
          body: n.note,
          meta: { noteId: n.id, isImportant: n.isImportant }
        });
      }

      const ticketIds = tickets.map((t) => t.id);
      if (ticketIds.length) {
        const messages = await AppDataSource.getRepository(TicketMessage)
          .createQueryBuilder('m')
          .leftJoinAndSelect('m.ticket', 'ticket')
          .leftJoinAndSelect('m.sender', 'sender')
          .where('ticket.id IN (:...ids)', { ids: ticketIds })
          .orderBy('m.createdAt', 'DESC')
          .take(limit)
          .getMany();
        for (const m of messages) {
          items.push({
            id: `ticket_message:${m.id}`,
            type: 'ticket_message',
            at: m.createdAt.toISOString(),
            title: `Ticket ${m.ticket?.ticketNumber || ''} · ${m.senderType}`,
            body: m.message,
            meta: {
              ticketId: m.ticket?.id,
              ticketNumber: m.ticket?.ticketNumber,
              senderType: m.senderType,
              isInternal: m.isInternal
            }
          });
        }
      }

      const dealIds = deals.map((d) => d.id);
      if (dealIds.length) {
        const history = await AppDataSource.getRepository(CrmDealStageHistory)
          .createQueryBuilder('h')
          .leftJoinAndSelect('h.toStage', 'toStage')
          .leftJoinAndSelect('h.fromStage', 'fromStage')
          .leftJoinAndSelect('h.deal', 'deal')
          .where('h.deal_id IN (:...ids)', { ids: dealIds })
          .orderBy('h.createdAt', 'DESC')
          .take(limit)
          .getMany();
        for (const h of history) {
          const fromName = h.fromStage?.name;
          const toName = h.toStage?.name || 'stage';
          items.push({
            id: `deal_stage:${h.id}`,
            type: 'deal_stage',
            at: h.createdAt.toISOString(),
            title: h.deal?.name
              ? `${h.deal.name}: ${fromName ? `${fromName} → ` : ''}${toName}`
              : `Stage → ${toName}`,
            body: h.note,
            meta: {
              dealId: h.dealId,
              fromStageId: h.fromStageId,
              toStageId: h.toStageId
            }
          });
        }
      }

      items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      res.json({ data: items.slice(0, limit), meta: { total: items.length, limit } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async patch(req: Request, res: Response): Promise<void> {
    try {
      const data = patchAccountSchema.parse(req.body);
      const repo = AppDataSource.getRepository(Customer);
      const customer = await repo.findOne({
        where: { id: req.params.customerId, deletedAt: IsNull() },
        relations: ['organization']
      });
      if (!customer) {
        res.status(404).json({ error: { message: 'Account not found' } });
        return;
      }
      assertOrgAccess(req, customer.organization?.id);
      if (data.crmOwnerUserId !== undefined) customer.crmOwnerUserId = data.crmOwnerUserId;
      res.json({ data: await repo.save(customer) });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async listNotes(req: Request, res: Response): Promise<void> {
    try {
      const customer = await AppDataSource.getRepository(Customer).findOne({
        where: { id: req.params.customerId, deletedAt: IsNull() },
        relations: ['organization']
      });
      if (!customer) {
        res.status(404).json({ error: { message: 'Account not found' } });
        return;
      }
      assertOrgAccess(req, customer.organization?.id);
      const notes = await AppDataSource.getRepository(CustomerNote).find({
        where: { customer: { id: customer.id } },
        relations: ['createdBy'],
        order: { createdAt: 'DESC' },
        take: 100
      });
      res.json({ data: notes });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async createNote(req: Request, res: Response): Promise<void> {
    try {
      const data = noteSchema.parse(req.body);
      const customer = await AppDataSource.getRepository(Customer).findOne({
        where: { id: req.params.customerId, deletedAt: IsNull() },
        relations: ['organization']
      });
      if (!customer) {
        res.status(404).json({ error: { message: 'Account not found' } });
        return;
      }
      assertOrgAccess(req, customer.organization?.id);
      const repo = AppDataSource.getRepository(CustomerNote);
      const userId = userIdFromReq(req);
      const note = await repo.save(
        repo.create({
          customer,
          note: data.note,
          noteType: data.noteType || 'general',
          isImportant: data.isImportant ?? false,
          createdBy: userId ? ({ id: userId } as any) : null
        })
      );
      res.status(201).json({ data: note });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async attachTag(req: Request, res: Response): Promise<void> {
    try {
      const customer = await AppDataSource.getRepository(Customer).findOne({
        where: { id: req.params.customerId, deletedAt: IsNull() },
        relations: ['organization']
      });
      if (!customer) {
        res.status(404).json({ error: { message: 'Account not found' } });
        return;
      }
      assertOrgAccess(req, customer.organization?.id);
      const body = z
        .object({ tagId: z.string().optional(), name: z.string().optional(), color: z.string().optional().nullable() })
        .parse(req.body);
      const result = await attachTag({
        organizationId: String(customer.organization.id),
        entityType: 'account',
        entityId: customer.id,
        ...body
      });
      res.status(201).json({ data: result });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async detachTag(req: Request, res: Response): Promise<void> {
    try {
      const customer = await AppDataSource.getRepository(Customer).findOne({
        where: { id: req.params.customerId, deletedAt: IsNull() },
        relations: ['organization']
      });
      if (!customer) {
        res.status(404).json({ error: { message: 'Account not found' } });
        return;
      }
      assertOrgAccess(req, customer.organization?.id);
      const ok = await detachTag({
        entityType: 'account',
        entityId: customer.id,
        tagId: req.params.tagId
      });
      if (!ok) {
        res.status(404).json({ error: { message: 'Tag link not found' } });
        return;
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
