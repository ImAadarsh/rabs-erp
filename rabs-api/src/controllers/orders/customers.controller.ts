import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Customer } from '@entities/orders/Customer.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { IsNull } from 'typeorm';

const createCustomerSchema = z.object({
  organizationId: z.string(),
  customerNumber: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  companyName: z.string().optional(),
  customerType: z.enum(['individual', 'business', 'wholesale', 'vip']).optional(),
  tier: z.enum(['standard', 'silver', 'gold', 'platinum']).optional(),
  taxId: z.string().optional(),
  taxExempt: z.boolean().optional(),
  languageCode: z.string().length(2).optional(),
  marketingOptIn: z.boolean().optional(),
  notes: z.string().optional(),
  creditLimit: z.number().optional(),
  creditUsed: z.number().optional(),
  paymentTerms: z.string().optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional()
});

const updateCustomerSchema = z.object({
  customerNumber: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  companyName: z.string().optional(),
  customerType: z.enum(['individual', 'business', 'wholesale', 'vip']).optional(),
  tier: z.enum(['standard', 'silver', 'gold', 'platinum']).optional(),
  taxId: z.string().optional(),
  taxExempt: z.boolean().optional(),
  languageCode: z.string().length(2).optional(),
  marketingOptIn: z.boolean().optional(),
  notes: z.string().optional(),
  creditLimit: z.number().optional(),
  creditUsed: z.number().optional(),
  paymentTerms: z.string().optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional()
});

export class CustomersController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(Customer);
      const {
        organizationId, status, customerType, tier, marketingOptIn, hasEmail,
        createdFrom, createdTo, search, sortBy, sortDir, page = '1', limit = '50'
      } = req.query;

      const queryBuilder = repo.createQueryBuilder('c')
        .leftJoinAndSelect('c.organization', 'org')
        .where('c.deleted_at IS NULL');

      // Whitelist sortable columns so the query param can't inject SQL.
      // These must be entity property paths: TypeORM resolves them against the
      // metadata when it wraps a joined query for pagination.
      const sortable: Record<string, string> = {
        createdAt: 'c.createdAt',
        email: 'c.email',
        lastName: 'c.lastName',
        lifetimeValue: 'c.lifetimeValue',
        totalOrders: 'c.totalOrders',
        tier: 'c.tier'
      };
      queryBuilder.orderBy(
        sortable[String(sortBy)] ?? 'c.createdAt',
        String(sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
      );

      if (organizationId) {
        queryBuilder.andWhere('c.organization_id = :orgId', { orgId: organizationId });
      }

      if (status) {
        queryBuilder.andWhere('c.status = :status', { status });
      }

      if (customerType) {
        queryBuilder.andWhere('c.customer_type = :customerType', { customerType });
      }

      if (tier) {
        queryBuilder.andWhere('c.tier = :tier', { tier });
      }

      if (marketingOptIn === 'true' || marketingOptIn === 'false') {
        queryBuilder.andWhere('c.marketing_opt_in = :optIn', { optIn: marketingOptIn === 'true' });
      }

      if (hasEmail === 'true') {
        queryBuilder.andWhere("c.email IS NOT NULL AND c.email <> ''");
      } else if (hasEmail === 'false') {
        queryBuilder.andWhere("(c.email IS NULL OR c.email = '')");
      }

      if (createdFrom) {
        queryBuilder.andWhere('c.created_at >= :createdFrom', { createdFrom: new Date(String(createdFrom)) });
      }

      if (createdTo) {
        const end = new Date(String(createdTo));
        end.setHours(23, 59, 59, 999);
        queryBuilder.andWhere('c.created_at <= :createdTo', { createdTo: end });
      }

      if (search) {
        queryBuilder.andWhere(
          '(c.email LIKE :search OR c.phone LIKE :search OR c.first_name LIKE :search OR c.last_name LIKE :search OR c.company_name LIKE :search OR c.customer_number LIKE :search)',
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
      const repo = AppDataSource.getRepository(Customer);
      const item = await repo.findOne({
        where: { id: req.params.id, deletedAt: IsNull() },
        relations: ['organization', 'addresses']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Customer not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createCustomerSchema.safeParse(req.body);
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

      const repo = AppDataSource.getRepository(Customer);
      
      // Check for duplicate email if provided
      if (parsed.data.email) {
        const existing = await repo.findOne({
          where: { organization: { id: parsed.data.organizationId }, email: parsed.data.email, deletedAt: IsNull() }
        });
        
        if (existing) {
          res.status(400).json({ error: { message: 'Customer with this email already exists in this organization' } });
          return;
        }
      }

      const item = repo.create({
        organization: org,
        customerNumber: parsed.data.customerNumber ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        firstName: parsed.data.firstName ?? null,
        lastName: parsed.data.lastName ?? null,
        companyName: parsed.data.companyName ?? null,
        customerType: parsed.data.customerType ?? 'individual',
        tier: parsed.data.tier ?? 'standard',
        taxId: parsed.data.taxId ?? null,
        taxExempt: parsed.data.taxExempt ?? false,
        languageCode: parsed.data.languageCode ?? 'en',
        marketingOptIn: parsed.data.marketingOptIn ?? false,
        notes: parsed.data.notes ?? null,
        creditLimit: parsed.data.creditLimit ?? 0,
        creditUsed: parsed.data.creditUsed ?? 0,
        paymentTerms: parsed.data.paymentTerms ?? null,
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
      const parsed = updateCustomerSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(Customer);
      const item = await repo.findOne({
        where: { id, deletedAt: IsNull() },
        relations: ['organization']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Customer not found' } });
        return;
      }

      // Check for duplicate email if changed
      if (parsed.data.email && parsed.data.email !== item.email) {
        const existing = await repo.findOne({
          where: { organization: { id: item.organization.id }, email: parsed.data.email, deletedAt: IsNull() }
        });
        
        if (existing) {
          res.status(400).json({ error: { message: 'Customer with this email already exists in this organization' } });
          return;
        }
      }

      if (parsed.data.customerNumber !== undefined) item.customerNumber = parsed.data.customerNumber ?? null;
      if (parsed.data.email !== undefined) item.email = parsed.data.email ?? null;
      if (parsed.data.phone !== undefined) item.phone = parsed.data.phone ?? null;
      if (parsed.data.firstName !== undefined) item.firstName = parsed.data.firstName ?? null;
      if (parsed.data.lastName !== undefined) item.lastName = parsed.data.lastName ?? null;
      if (parsed.data.companyName !== undefined) item.companyName = parsed.data.companyName ?? null;
      if (parsed.data.customerType) item.customerType = parsed.data.customerType;
      if (parsed.data.tier) item.tier = parsed.data.tier;
      if (parsed.data.taxId !== undefined) item.taxId = parsed.data.taxId ?? null;
      if (parsed.data.taxExempt !== undefined) item.taxExempt = parsed.data.taxExempt;
      if (parsed.data.languageCode) item.languageCode = parsed.data.languageCode;
      if (parsed.data.marketingOptIn !== undefined) item.marketingOptIn = parsed.data.marketingOptIn;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes ?? null;
      if (parsed.data.creditLimit !== undefined) item.creditLimit = parsed.data.creditLimit;
      if (parsed.data.creditUsed !== undefined) item.creditUsed = parsed.data.creditUsed;
      if (parsed.data.paymentTerms !== undefined) item.paymentTerms = parsed.data.paymentTerms ?? null;
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
      const repo = AppDataSource.getRepository(Customer);
      const item = await repo.findOne({ where: { id, deletedAt: IsNull() } });

      if (!item) {
        res.status(404).json({ error: { message: 'Customer not found' } });
        return;
      }

      await repo.softRemove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

