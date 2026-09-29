import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { PriceList } from '@entities/catalog/PriceList.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';

const createPriceListSchema = z.object({
  organizationId: z.string(),
  businessUnitId: z.string().optional(),
  name: z.string().min(1),
  code: z.string().min(1),
  type: z.enum(['retail', 'wholesale', 'channel', 'customer_tier', 'region']),
  currency: z.string().length(3).optional(),
  description: z.string().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional()
});

const updatePriceListSchema = z.object({
  businessUnitId: z.string().optional(),
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  type: z.enum(['retail', 'wholesale', 'channel', 'customer_tier', 'region']).optional(),
  currency: z.string().length(3).optional(),
  description: z.string().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional()
});

export class PriceListsController {
  static async list(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(PriceList);
    const { organizationId, businessUnitId, type, status } = req.query;
    
    const queryBuilder = repo.createQueryBuilder('pl')
      .leftJoinAndSelect('pl.organization', 'org')
      .leftJoinAndSelect('pl.businessUnit', 'bu')
      .orderBy('pl.createdAt', 'DESC');

    if (organizationId) {
      queryBuilder.andWhere('pl.organization_id = :orgId', { orgId: organizationId });
    }

    if (businessUnitId) {
      queryBuilder.andWhere('pl.business_unit_id = :buId', { buId: businessUnitId });
    }

    if (type) {
      queryBuilder.andWhere('pl.type = :type', { type });
    }

    if (status) {
      queryBuilder.andWhere('pl.status = :status', { status });
    }

    const priceLists = await queryBuilder.getMany();
    res.json({ data: priceLists });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(PriceList);
    const priceList = await repo.findOne({
      where: { id: req.params.id },
      relations: ['organization', 'businessUnit', 'items', 'items.variant']
    });
    
    if (!priceList) {
      res.status(404).json({ error: { message: 'Price list not found' } });
      return;
    }
    
    res.json({ data: priceList });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createPriceListSchema.safeParse(req.body);
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

    // Check for duplicate code within organization
    const repo = AppDataSource.getRepository(PriceList);
    const existing = await repo.findOne({
      where: { 
        organization: { id: parsed.data.organizationId },
        code: parsed.data.code 
      }
    });
    
    if (existing) {
      res.status(400).json({ error: { message: 'Price list code already exists in this organization' } });
      return;
    }

    let businessUnit = null;
    if (parsed.data.businessUnitId) {
      const buRepo = AppDataSource.getRepository(BusinessUnit);
      businessUnit = await buRepo.findOne({ 
        where: { id: parsed.data.businessUnitId },
        relations: ['organization']
      });
      if (!businessUnit || businessUnit.organization.id !== org.id) {
        res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
        return;
      }
    }

    // If this is set as default, unset other defaults in the organization
    if (parsed.data.isDefault) {
      await repo.update(
        { organization: { id: parsed.data.organizationId }, isDefault: true },
        { isDefault: false }
      );
    }

    const priceList = repo.create({
      organization: org,
      businessUnit,
      name: parsed.data.name,
      code: parsed.data.code,
      type: parsed.data.type,
      currency: parsed.data.currency ?? 'GBP',
      description: parsed.data.description ?? null,
      validFrom: parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
      validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
      isDefault: parsed.data.isDefault ?? false,
      status: parsed.data.status ?? 'active'
    });

    await repo.save(priceList);

    const saved = await repo.findOne({
      where: { id: priceList.id },
      relations: ['organization', 'businessUnit']
    });

    res.status(201).json({ data: saved });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const parsed = updatePriceListSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(PriceList);
    const priceList = await repo.findOne({
      where: { id },
      relations: ['organization', 'businessUnit']
    });

    if (!priceList) {
      res.status(404).json({ error: { message: 'Price list not found' } });
      return;
    }

    // Check for duplicate code if code is being updated
    if (parsed.data.code && parsed.data.code !== priceList.code) {
      const existing = await repo.findOne({
        where: { 
          organization: { id: priceList.organization.id },
          code: parsed.data.code 
        }
      });
      
      if (existing) {
        res.status(400).json({ error: { message: 'Price list code already exists in this organization' } });
        return;
      }
    }

    // Update business unit if provided
    if (parsed.data.businessUnitId !== undefined) {
      if (parsed.data.businessUnitId) {
        const buRepo = AppDataSource.getRepository(BusinessUnit);
        const businessUnit = await buRepo.findOne({ 
          where: { id: parsed.data.businessUnitId },
          relations: ['organization']
        });
        if (!businessUnit || businessUnit.organization.id !== priceList.organization.id) {
          res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
          return;
        }
        priceList.businessUnit = businessUnit;
      } else {
        priceList.businessUnit = null;
      }
    }

    // If setting as default, unset other defaults
    if (parsed.data.isDefault === true) {
      await repo.update(
        { organization: { id: priceList.organization.id }, isDefault: true },
        { isDefault: false }
      );
    }

    // Update fields
    if (parsed.data.name) priceList.name = parsed.data.name;
    if (parsed.data.code) priceList.code = parsed.data.code;
    if (parsed.data.type) priceList.type = parsed.data.type;
    if (parsed.data.currency) priceList.currency = parsed.data.currency;
    if (parsed.data.description !== undefined) priceList.description = parsed.data.description ?? null;
    if (parsed.data.validFrom !== undefined) priceList.validFrom = parsed.data.validFrom ? new Date(parsed.data.validFrom) : null;
    if (parsed.data.validUntil !== undefined) priceList.validUntil = parsed.data.validUntil ? new Date(parsed.data.validUntil) : null;
    if (parsed.data.isDefault !== undefined) priceList.isDefault = parsed.data.isDefault;
    if (parsed.data.status) priceList.status = parsed.data.status;

    await repo.save(priceList);

    const updated = await repo.findOne({
      where: { id: priceList.id },
      relations: ['organization', 'businessUnit']
    });

    res.json({ data: updated });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(PriceList);
    const priceList = await repo.findOne({ where: { id } });

    if (!priceList) {
      res.status(404).json({ error: { message: 'Price list not found' } });
      return;
    }

    await repo.remove(priceList);
    res.status(204).send();
  }
}

