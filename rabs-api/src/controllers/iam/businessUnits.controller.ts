import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { Organization } from '@entities/iam/Organization.js';
import { z } from 'zod';

const createBusinessUnitSchema = z.object({
  organizationId: z.string(),
  parentId: z.string().optional().nullable(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  type: z.enum(['wholesale', 'retail', 'ecommerce', '3pl', 'food_beverage', 'other']),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  settings: z.record(z.any()).optional().nullable()
});

const updateBusinessUnitSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(255).optional(),
  type: z.enum(['wholesale', 'retail', 'ecommerce', '3pl', 'food_beverage', 'other']).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  parentId: z.string().optional().nullable(),
  settings: z.record(z.any()).optional().nullable()
});

export class BusinessUnitsController {
  static async list(req: Request, res: Response): Promise<void> {
    const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
    const { organizationId } = req.query;
    
    const repo = AppDataSource.getRepository(BusinessUnit);
    const where: any = {};
    
    // Super admin can see all, others only their org
    if (!auth.roles?.includes('SUPER_ADMIN')) {
      where.organization = { id: auth.orgId };
    } else if (organizationId) {
      where.organization = { id: organizationId as string };
    }
    
    const businessUnits = await repo.find({
      where,
      relations: ['organization', 'parent', 'locations'],
      order: { createdAt: 'DESC' }
    });
    
    res.json({ data: businessUnits });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
    
    const repo = AppDataSource.getRepository(BusinessUnit);
    const businessUnit = await repo.findOne({
      where: { id },
      relations: ['organization', 'parent', 'locations']
    });
    
    if (!businessUnit) {
      res.status(404).json({ error: { message: 'Business unit not found' } });
      return;
    }

    // Check access: super admin can view any, others only their org
    if (!auth.roles?.includes('SUPER_ADMIN') && businessUnit.organization.id !== auth.orgId) {
      res.status(403).json({ error: { message: 'Access denied' } });
      return;
    }

    res.json({ data: businessUnit });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
    const parsed = createBusinessUnitSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    // Check permissions: super admin can create for any org, admin only for their org
    if (!auth.roles?.includes('SUPER_ADMIN') && parsed.data.organizationId !== auth.orgId) {
      res.status(403).json({ error: { message: 'Access denied' } });
      return;
    }

    const orgRepo = AppDataSource.getRepository(Organization);
    const org = await orgRepo.findOne({ where: { id: parsed.data.organizationId } });
    if (!org) {
      res.status(400).json({ error: { message: 'Invalid organizationId' } });
      return;
    }

    const repo = AppDataSource.getRepository(BusinessUnit);
    
    // Check if code already exists
    const existing = await repo.findOne({ where: { code: parsed.data.code } });
    if (existing) {
      res.status(400).json({ error: { message: 'Business unit code already exists' } });
      return;
    }

    // Handle parent if provided
    let parent = null;
    if (parsed.data.parentId) {
      parent = await repo.findOne({ where: { id: parsed.data.parentId } });
      if (!parent || parent.organization.id !== org.id) {
        res.status(400).json({ error: { message: 'Invalid parentId' } });
        return;
      }
    }

    const businessUnit = repo.create({
      organization: org,
      parent,
      code: parsed.data.code,
      name: parsed.data.name,
      type: parsed.data.type,
      status: parsed.data.status || 'active',
      settings: parsed.data.settings || null
    });

    await repo.save(businessUnit);

    // Fetch with relations
    const saved = await repo.findOne({
      where: { id: businessUnit.id },
      relations: ['organization', 'parent', 'locations']
    });

    res.status(201).json({ data: saved });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
    const parsed = updateBusinessUnitSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(BusinessUnit);
    const businessUnit = await repo.findOne({
      where: { id },
      relations: ['organization']
    });
    
    if (!businessUnit) {
      res.status(404).json({ error: { message: 'Business unit not found' } });
      return;
    }

    // Check access
    if (!auth.roles?.includes('SUPER_ADMIN') && businessUnit.organization.id !== auth.orgId) {
      res.status(403).json({ error: { message: 'Access denied' } });
      return;
    }

    // Update fields
    if (parsed.data.code !== undefined) {
      // Check code uniqueness
      const existing = await repo.findOne({ where: { code: parsed.data.code } });
      if (existing && existing.id !== id) {
        res.status(400).json({ error: { message: 'Business unit code already exists' } });
        return;
      }
      businessUnit.code = parsed.data.code;
    }
    if (parsed.data.name !== undefined) businessUnit.name = parsed.data.name;
    if (parsed.data.type !== undefined) businessUnit.type = parsed.data.type;
    if (parsed.data.status !== undefined) businessUnit.status = parsed.data.status;
    if (parsed.data.settings !== undefined) businessUnit.settings = parsed.data.settings;

    // Handle parent update
    if (parsed.data.parentId !== undefined) {
      if (parsed.data.parentId) {
        const parent = await repo.findOne({ where: { id: parsed.data.parentId } });
        if (!parent || parent.organization.id !== businessUnit.organization.id) {
          res.status(400).json({ error: { message: 'Invalid parentId' } });
          return;
        }
        businessUnit.parent = parent;
      } else {
        businessUnit.parent = null;
      }
    }

    await repo.save(businessUnit);

    const updated = await repo.findOne({
      where: { id },
      relations: ['organization', 'parent', 'locations']
    });

    res.json({ data: updated });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
    
    const repo = AppDataSource.getRepository(BusinessUnit);
    const businessUnit = await repo.findOne({
      where: { id },
      relations: ['organization']
    });
    
    if (!businessUnit) {
      res.status(404).json({ error: { message: 'Business unit not found' } });
      return;
    }

    // Check access
    if (!auth.roles?.includes('SUPER_ADMIN') && businessUnit.organization.id !== auth.orgId) {
      res.status(403).json({ error: { message: 'Access denied' } });
      return;
    }

    await repo.remove(businessUnit);
    res.status(204).send();
  }
}

