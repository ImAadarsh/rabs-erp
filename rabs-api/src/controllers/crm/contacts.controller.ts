import { Request, Response } from 'express';
import { z } from 'zod';
import { IsNull } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { CrmContact } from '@entities/crm/CrmContact.js';
import { Customer } from '@entities/orders/Customer.js';
import { assertOrgAccess, orgIdFromReq } from '@services/crm/crmScope.js';

const createSchema = z.object({
  organizationId: z.string().optional(),
  customerId: z.string(),
  firstName: z.string().min(1).max(120),
  lastName: z.string().max(120).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().max(50).optional().nullable(),
  title: z.string().max(150).optional().nullable(),
  isPrimary: z.boolean().optional(),
  notes: z.string().optional().nullable()
});

const updateSchema = createSchema.partial().omit({ organizationId: true, customerId: true }).extend({
  customerId: z.string().optional()
});

async function loadCustomer(customerId: string) {
  return AppDataSource.getRepository(Customer).findOne({
    where: { id: customerId, deletedAt: IsNull() },
    relations: ['organization']
  });
}

export class ContactsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const { customerId, search, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const qb = AppDataSource.getRepository(CrmContact)
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.customer', 'customer')
        .where('c.organizationId = :orgId', { orgId })
        // Use entity property names in orderBy — snake_case paths resolve to undefined metadata (500).
        .orderBy('c.isPrimary', 'DESC')
        .addOrderBy('c.createdAt', 'DESC')
        .take(take)
        .skip(skip);

      if (customerId) qb.andWhere('c.customerId = :customerId', { customerId: String(customerId) });
      if (search) {
        qb.andWhere(
          '(c.firstName LIKE :q OR c.lastName LIKE :q OR c.email LIKE :q OR c.phone LIKE :q OR c.title LIKE :q)',
          { q: `%${String(search)}%` }
        );
      }

      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(CrmContact).findOne({
        where: { id: req.params.id },
        relations: ['customer']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Contact not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      res.json({ data: item });
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
      const customer = await loadCustomer(data.customerId);
      if (!customer || String(customer.organization?.id) !== String(orgId)) {
        res.status(400).json({ error: { message: 'Invalid customerId' } });
        return;
      }
      assertOrgAccess(req, orgId);

      const repo = AppDataSource.getRepository(CrmContact);
      if (data.isPrimary) {
        await repo
          .createQueryBuilder()
          .update(CrmContact)
          .set({ isPrimary: false })
          .where('customer_id = :cid', { cid: customer.id })
          .execute();
      }

      const saved = await repo.save(
        repo.create({
          organizationId: orgId,
          customerId: customer.id,
          firstName: data.firstName,
          lastName: data.lastName ?? null,
          email: data.email ? data.email : null,
          phone: data.phone ?? null,
          title: data.title ?? null,
          isPrimary: data.isPrimary ?? false,
          notes: data.notes ?? null
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
      const repo = AppDataSource.getRepository(CrmContact);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Contact not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);

      if (data.isPrimary === true) {
        await repo
          .createQueryBuilder()
          .update(CrmContact)
          .set({ isPrimary: false })
          .where('customer_id = :cid AND id != :id', { cid: item.customerId, id: item.id })
          .execute();
      }

      if (data.firstName !== undefined) item.firstName = data.firstName;
      if (data.lastName !== undefined) item.lastName = data.lastName;
      if (data.email !== undefined) item.email = data.email ? data.email : null;
      if (data.phone !== undefined) item.phone = data.phone;
      if (data.title !== undefined) item.title = data.title;
      if (data.isPrimary !== undefined) item.isPrimary = data.isPrimary;
      if (data.notes !== undefined) item.notes = data.notes;

      res.json({ data: await repo.save(item) });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(CrmContact);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Contact not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
