import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { CrmActivity } from '@entities/crm/CrmActivity.js';
import { assertOrgAccess, orgIdFromReq, userIdFromReq } from '@services/crm/crmScope.js';

const createSchema = z.object({
  organizationId: z.string().optional(),
  type: z.enum(['task', 'call', 'meeting', 'note']).default('task'),
  subject: z.string().min(1).max(500),
  body: z.string().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable().or(z.string().optional().nullable()),
  ownerUserId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
  ticketId: z.string().optional().nullable(),
  orderId: z.string().optional().nullable(),
  completed: z.boolean().optional()
});

const updateSchema = z.object({
  type: z.enum(['task', 'call', 'meeting', 'note']).optional(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
  ticketId: z.string().optional().nullable(),
  orderId: z.string().optional().nullable(),
  completed: z.boolean().optional(),
  completedAt: z.string().optional().nullable()
});

function parseDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class ActivitiesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const {
        ownerUserId,
        customerId,
        leadId,
        dealId,
        ticketId,
        type,
        overdue,
        openOnly,
        page = '1',
        limit = '50'
      } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const qb = AppDataSource.getRepository(CrmActivity)
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.owner', 'owner')
        .where('a.organization_id = :orgId', { orgId })
        .orderBy('a.dueAt', 'ASC')
        .addOrderBy('a.createdAt', 'DESC')
        .take(take)
        .skip(skip);

      if (ownerUserId) qb.andWhere('a.owner_user_id = :ownerUserId', { ownerUserId });
      if (customerId) qb.andWhere('a.customer_id = :customerId', { customerId });
      if (leadId) qb.andWhere('a.lead_id = :leadId', { leadId });
      if (dealId) qb.andWhere('a.deal_id = :dealId', { dealId });
      if (ticketId) qb.andWhere('a.ticket_id = :ticketId', { ticketId });
      if (type) qb.andWhere('a.type = :type', { type });
      if (openOnly === '1' || openOnly === 'true') {
        qb.andWhere('a.completed_at IS NULL');
      }
      if (overdue === '1' || overdue === 'true') {
        qb.andWhere('a.completed_at IS NULL AND a.due_at IS NOT NULL AND a.due_at < NOW()');
      }

      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const data = createSchema.parse(req.body);
      const orgId = data.organizationId || orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const repo = AppDataSource.getRepository(CrmActivity);
      const saved = await repo.save(
        repo.create({
          organizationId: orgId,
          type: data.type,
          subject: data.subject,
          body: data.body ?? null,
          dueAt: parseDate(data.dueAt as string | null | undefined),
          ownerUserId: data.ownerUserId ?? userIdFromReq(req) ?? null,
          customerId: data.customerId ?? null,
          leadId: data.leadId ?? null,
          dealId: data.dealId ?? null,
          ticketId: data.ticketId ?? null,
          orderId: data.orderId ?? null,
          completedAt: data.completed ? new Date() : null
        })
      );
      res.status(201).json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const data = updateSchema.parse(req.body);
      const repo = AppDataSource.getRepository(CrmActivity);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Activity not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);

      if (data.type !== undefined) item.type = data.type;
      if (data.subject !== undefined) item.subject = data.subject;
      if (data.body !== undefined) item.body = data.body;
      if (data.dueAt !== undefined) item.dueAt = parseDate(data.dueAt);
      if (data.ownerUserId !== undefined) item.ownerUserId = data.ownerUserId;
      if (data.customerId !== undefined) item.customerId = data.customerId;
      if (data.leadId !== undefined) item.leadId = data.leadId;
      if (data.dealId !== undefined) item.dealId = data.dealId;
      if (data.ticketId !== undefined) item.ticketId = data.ticketId;
      if (data.orderId !== undefined) item.orderId = data.orderId;

      if (data.completed === true) item.completedAt = new Date();
      else if (data.completed === false) item.completedAt = null;
      else if (data.completedAt !== undefined) item.completedAt = parseDate(data.completedAt);

      res.json({ data: await repo.save(item) });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
