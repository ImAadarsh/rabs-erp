import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { TaxCode } from '@entities/catalog/TaxCode.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';

const createTaxCodeSchema = z.object({
  organizationId: z.string(),
  code: z.string().min(1),
  name: z.string().min(1),
  rate: z.number().min(0).max(1),
  countryCode: z.string().length(2).optional(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional()
});

const updateTaxCodeSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  rate: z.number().min(0).max(1).optional(),
  countryCode: z.string().length(2).optional(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional()
});

export class TaxCodesController {
  static async list(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(TaxCode);
    const { organizationId, countryCode, status } = req.query;
    
    const queryBuilder = repo.createQueryBuilder('tc')
      .leftJoinAndSelect('tc.organization', 'org')
      .orderBy('tc.code', 'ASC');

    if (organizationId) {
      queryBuilder.andWhere('tc.organization_id = :orgId', { orgId: organizationId });
    }

    if (countryCode) {
      queryBuilder.andWhere('tc.country_code = :countryCode', { countryCode });
    }

    if (status) {
      queryBuilder.andWhere('tc.status = :status', { status });
    }

    const taxCodes = await queryBuilder.getMany();
    res.json({ data: taxCodes });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(TaxCode);
    const taxCode = await repo.findOne({
      where: { id: req.params.id },
      relations: ['organization']
    });
    
    if (!taxCode) {
      res.status(404).json({ error: { message: 'Tax code not found' } });
      return;
    }
    
    res.json({ data: taxCode });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createTaxCodeSchema.safeParse(req.body);
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
    const repo = AppDataSource.getRepository(TaxCode);
    const existing = await repo.findOne({
      where: { 
        organization: { id: parsed.data.organizationId },
        code: parsed.data.code 
      }
    });
    
    if (existing) {
      res.status(400).json({ error: { message: 'Tax code already exists in this organization' } });
      return;
    }

    // If this is set as default, unset other defaults in the organization
    if (parsed.data.isDefault) {
      await repo.update(
        { organization: { id: parsed.data.organizationId }, isDefault: true },
        { isDefault: false }
      );
    }

    const taxCode = repo.create({
      organization: org,
      code: parsed.data.code,
      name: parsed.data.name,
      rate: parsed.data.rate,
      countryCode: parsed.data.countryCode ?? null,
      description: parsed.data.description ?? null,
      isDefault: parsed.data.isDefault ?? false,
      status: parsed.data.status ?? 'active'
    });

    await repo.save(taxCode);

    const saved = await repo.findOne({
      where: { id: taxCode.id },
      relations: ['organization']
    });

    res.status(201).json({ data: saved });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const parsed = updateTaxCodeSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(TaxCode);
    const taxCode = await repo.findOne({
      where: { id },
      relations: ['organization']
    });

    if (!taxCode) {
      res.status(404).json({ error: { message: 'Tax code not found' } });
      return;
    }

    // Check for duplicate code if code is being updated
    if (parsed.data.code && parsed.data.code !== taxCode.code) {
      const existing = await repo.findOne({
        where: { 
          organization: { id: taxCode.organization.id },
          code: parsed.data.code 
        }
      });
      
      if (existing) {
        res.status(400).json({ error: { message: 'Tax code already exists in this organization' } });
        return;
      }
    }

    // If setting as default, unset other defaults
    if (parsed.data.isDefault === true) {
      await repo.update(
        { organization: { id: taxCode.organization.id }, isDefault: true },
        { isDefault: false }
      );
    }

    // Update fields
    if (parsed.data.code) taxCode.code = parsed.data.code;
    if (parsed.data.name) taxCode.name = parsed.data.name;
    if (parsed.data.rate !== undefined) taxCode.rate = parsed.data.rate;
    if (parsed.data.countryCode !== undefined) taxCode.countryCode = parsed.data.countryCode ?? null;
    if (parsed.data.description !== undefined) taxCode.description = parsed.data.description ?? null;
    if (parsed.data.isDefault !== undefined) taxCode.isDefault = parsed.data.isDefault;
    if (parsed.data.status) taxCode.status = parsed.data.status;

    await repo.save(taxCode);

    const updated = await repo.findOne({
      where: { id: taxCode.id },
      relations: ['organization']
    });

    res.json({ data: updated });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(TaxCode);
    const taxCode = await repo.findOne({ where: { id } });

    if (!taxCode) {
      res.status(404).json({ error: { message: 'Tax code not found' } });
      return;
    }

    await repo.remove(taxCode);
    res.status(204).send();
  }
}

