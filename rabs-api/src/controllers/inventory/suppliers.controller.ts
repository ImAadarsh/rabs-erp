import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Supplier } from '@entities/inventory/Supplier.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { IsNull } from 'typeorm';

const createSupplierSchema = z.object({
  organizationId: z.string(),
  code: z.string().min(1),
  name: z.string().min(1),
  legalName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  taxId: z.string().optional(),
  paymentTerms: z.string().optional(),
  currency: z.string().length(3).optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  stateProvince: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  leadTimeDays: z.number().optional(),
  minimumOrderValue: z.number().optional(),
  rating: z.number().optional(),
  notes: z.string().optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional()
});

const updateSupplierSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  legalName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  taxId: z.string().optional(),
  paymentTerms: z.string().optional(),
  currency: z.string().length(3).optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  stateProvince: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  leadTimeDays: z.number().optional(),
  minimumOrderValue: z.number().optional(),
  rating: z.number().optional(),
  notes: z.string().optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional()
});

export class SuppliersController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(Supplier);
      const { organizationId, status, search, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('s')
        .leftJoinAndSelect('s.organization', 'org')
        .orderBy('s.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('s.organization_id = :orgId', { orgId: organizationId });
      }

      if (status) {
        queryBuilder.andWhere('s.status = :status', { status });
      }

      if (search) {
        queryBuilder.andWhere(
          '(s.code LIKE :search OR s.name LIKE :search OR s.email LIKE :search)',
          { search: `%${search}%` }
        );
      }

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      queryBuilder.skip(skip).take(parseInt(limit as string));

      const [items, total] = await queryBuilder.getManyAndCount();
      
      res.json({ 
        data: items, 
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string))
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(Supplier);
      const item = await repo.findOne({
        where: { id: req.params.id, deletedAt: IsNull() },
        relations: ['organization']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Supplier not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createSupplierSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const orgRepo = AppDataSource.getRepository(Organization);
      const org = await orgRepo.findOne({ where: { id: parsed.data.organizationId } });
      if (!org) {
        res.status(400).json({ error: { message: 'Invalid organizationId' } });
        return;
      }

      const repo = AppDataSource.getRepository(Supplier);
      const existing = await repo.findOne({
        where: { organization: { id: parsed.data.organizationId }, code: parsed.data.code, deletedAt: IsNull() }
      });
      
      if (existing) {
        res.status(400).json({ error: { message: 'Supplier code already exists in this organization' } });
        return;
      }

      const item = repo.create({
        organization: org,
        code: parsed.data.code,
        name: parsed.data.name,
        legalName: parsed.data.legalName ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        website: parsed.data.website ?? null,
        taxId: parsed.data.taxId ?? null,
        paymentTerms: parsed.data.paymentTerms ?? null,
        currency: parsed.data.currency ?? 'GBP',
        addressLine1: parsed.data.addressLine1 ?? null,
        addressLine2: parsed.data.addressLine2 ?? null,
        city: parsed.data.city ?? null,
        stateProvince: parsed.data.stateProvince ?? null,
        postalCode: parsed.data.postalCode ?? null,
        countryCode: parsed.data.countryCode ?? null,
        leadTimeDays: parsed.data.leadTimeDays ?? 0,
        minimumOrderValue: parsed.data.minimumOrderValue ?? null,
        rating: parsed.data.rating ?? null,
        notes: parsed.data.notes ?? null,
        status: parsed.data.status ?? 'active'
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['organization']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateSupplierSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(Supplier);
      const item = await repo.findOne({
        where: { id, deletedAt: IsNull() },
        relations: ['organization']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Supplier not found' } });
        return;
      }

      if (parsed.data.code && parsed.data.code !== item.code) {
        const existing = await repo.findOne({
          where: { organization: { id: item.organization.id }, code: parsed.data.code, deletedAt: IsNull() }
        });
        
        if (existing) {
          res.status(400).json({ error: { message: 'Supplier code already exists in this organization' } });
          return;
        }
      }

      if (parsed.data.code) item.code = parsed.data.code;
      if (parsed.data.name) item.name = parsed.data.name;
      if (parsed.data.legalName !== undefined) item.legalName = parsed.data.legalName ?? null;
      if (parsed.data.email !== undefined) item.email = parsed.data.email ?? null;
      if (parsed.data.phone !== undefined) item.phone = parsed.data.phone ?? null;
      if (parsed.data.website !== undefined) item.website = parsed.data.website ?? null;
      if (parsed.data.taxId !== undefined) item.taxId = parsed.data.taxId ?? null;
      if (parsed.data.paymentTerms !== undefined) item.paymentTerms = parsed.data.paymentTerms ?? null;
      if (parsed.data.currency) item.currency = parsed.data.currency;
      if (parsed.data.addressLine1 !== undefined) item.addressLine1 = parsed.data.addressLine1 ?? null;
      if (parsed.data.addressLine2 !== undefined) item.addressLine2 = parsed.data.addressLine2 ?? null;
      if (parsed.data.city !== undefined) item.city = parsed.data.city ?? null;
      if (parsed.data.stateProvince !== undefined) item.stateProvince = parsed.data.stateProvince ?? null;
      if (parsed.data.postalCode !== undefined) item.postalCode = parsed.data.postalCode ?? null;
      if (parsed.data.countryCode !== undefined) item.countryCode = parsed.data.countryCode ?? null;
      if (parsed.data.leadTimeDays !== undefined) item.leadTimeDays = parsed.data.leadTimeDays;
      if (parsed.data.minimumOrderValue !== undefined) item.minimumOrderValue = parsed.data.minimumOrderValue ?? null;
      if (parsed.data.rating !== undefined) item.rating = parsed.data.rating ?? null;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes ?? null;
      if (parsed.data.status) item.status = parsed.data.status;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['organization']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(Supplier);
      const item = await repo.findOne({ where: { id, deletedAt: IsNull() } });

      if (!item) {
        res.status(404).json({ error: { message: 'Supplier not found' } });
        return;
      }

      await repo.softRemove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

