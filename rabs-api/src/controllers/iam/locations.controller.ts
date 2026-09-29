import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Location } from '@entities/iam/Location.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { z } from 'zod';

const createLocationSchema = z.object({
  businessUnitId: z.string(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  type: z.enum(['warehouse', 'store', 'office', 'distribution_center', 'other']),
  addressLine1: z.string().max(255).optional().nullable(),
  addressLine2: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  stateProvince: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  countryCode: z.string().length(2),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable(),
  timezone: z.string().optional(),
  isDefault: z.coerce.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional()
});

const updateLocationSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(255).optional(),
  type: z.enum(['warehouse', 'store', 'office', 'distribution_center', 'other']).optional(),
  addressLine1: z.string().max(255).optional().nullable(),
  addressLine2: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  stateProvince: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  countryCode: z.string().length(2).optional(),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable(),
  timezone: z.string().optional(),
  isDefault: z.coerce.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional()
});

export class LocationsController {
  static async list(req: Request, res: Response): Promise<void> {
    const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
    const { businessUnitId, organizationId } = req.query;
    
    const repo = AppDataSource.getRepository(Location);
    const where: any = {};
    
    if (businessUnitId) {
      where.businessUnit = { id: businessUnitId as string };
    } else if (organizationId) {
      // Filter by organization through business unit
      where.businessUnit = { organization: { id: organizationId as string } };
    }
    
    // If not super admin, filter by their org
    if (!auth.roles?.includes('SUPER_ADMIN')) {
      if (!where.businessUnit) where.businessUnit = {};
      where.businessUnit.organization = { id: auth.orgId };
    }
    
    const locations = await repo.find({
      where,
      relations: ['businessUnit', 'businessUnit.organization'],
      order: { createdAt: 'DESC' }
    });
    
    res.json({ data: locations });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
    
    const repo = AppDataSource.getRepository(Location);
    const location = await repo.findOne({
      where: { id },
      relations: ['businessUnit', 'businessUnit.organization']
    });
    
    if (!location) {
      res.status(404).json({ error: { message: 'Location not found' } });
      return;
    }

    // Check access
    if (!auth.roles?.includes('SUPER_ADMIN') && location.businessUnit.organization.id !== auth.orgId) {
      res.status(403).json({ error: { message: 'Access denied' } });
      return;
    }

    res.json({ data: location });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
    const parsed = createLocationSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const buRepo = AppDataSource.getRepository(BusinessUnit);
    const businessUnit = await buRepo.findOne({
      where: { id: parsed.data.businessUnitId },
      relations: ['organization']
    });
    
    if (!businessUnit) {
      res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
      return;
    }

    // Check permissions
    if (!auth.roles?.includes('SUPER_ADMIN') && businessUnit.organization.id !== auth.orgId) {
      res.status(403).json({ error: { message: 'Access denied' } });
      return;
    }

    const repo = AppDataSource.getRepository(Location);
    
    // Check if code already exists
    const existing = await repo.findOne({ where: { code: parsed.data.code } });
    if (existing) {
      res.status(400).json({ error: { message: 'Location code already exists' } });
      return;
    }

    // If setting as default, unset other defaults for this business unit
    if (parsed.data.isDefault) {
      await repo.update(
        { businessUnit: { id: businessUnit.id } },
        { isDefault: false }
      );
    }

    const location = repo.create({
      businessUnit,
      code: parsed.data.code,
      name: parsed.data.name,
      type: parsed.data.type,
      addressLine1: parsed.data.addressLine1 || null,
      addressLine2: parsed.data.addressLine2 || null,
      city: parsed.data.city || null,
      stateProvince: parsed.data.stateProvince || null,
      postalCode: parsed.data.postalCode || null,
      countryCode: parsed.data.countryCode,
      latitude: parsed.data.latitude || null,
      longitude: parsed.data.longitude || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      timezone: parsed.data.timezone || 'Europe/London',
      isDefault: parsed.data.isDefault || false,
      status: parsed.data.status || 'active'
    });

    await repo.save(location);

    const saved = await repo.findOne({
      where: { id: location.id },
      relations: ['businessUnit', 'businessUnit.organization']
    });

    res.status(201).json({ data: saved });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
    const parsed = updateLocationSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(Location);
    const location = await repo.findOne({
      where: { id },
      relations: ['businessUnit', 'businessUnit.organization']
    });
    
    if (!location) {
      res.status(404).json({ error: { message: 'Location not found' } });
      return;
    }

    // Check access
    if (!auth.roles?.includes('SUPER_ADMIN') && location.businessUnit.organization.id !== auth.orgId) {
      res.status(403).json({ error: { message: 'Access denied' } });
      return;
    }

    // Update fields
    if (parsed.data.code !== undefined) {
      const existing = await repo.findOne({ where: { code: parsed.data.code } });
      if (existing && existing.id !== id) {
        res.status(400).json({ error: { message: 'Location code already exists' } });
        return;
      }
      location.code = parsed.data.code;
    }
    if (parsed.data.name !== undefined) location.name = parsed.data.name;
    if (parsed.data.type !== undefined) location.type = parsed.data.type;
    if (parsed.data.addressLine1 !== undefined) location.addressLine1 = parsed.data.addressLine1;
    if (parsed.data.addressLine2 !== undefined) location.addressLine2 = parsed.data.addressLine2;
    if (parsed.data.city !== undefined) location.city = parsed.data.city;
    if (parsed.data.stateProvince !== undefined) location.stateProvince = parsed.data.stateProvince;
    if (parsed.data.postalCode !== undefined) location.postalCode = parsed.data.postalCode;
    if (parsed.data.countryCode !== undefined) location.countryCode = parsed.data.countryCode;
    if (parsed.data.latitude !== undefined) location.latitude = parsed.data.latitude;
    if (parsed.data.longitude !== undefined) location.longitude = parsed.data.longitude;
    if (parsed.data.phone !== undefined) location.phone = parsed.data.phone;
    if (parsed.data.email !== undefined) location.email = parsed.data.email;
    if (parsed.data.timezone !== undefined) location.timezone = parsed.data.timezone;
    if (parsed.data.status !== undefined) location.status = parsed.data.status;

    // Handle default flag
    if (parsed.data.isDefault !== undefined) {
      if (parsed.data.isDefault && !location.isDefault) {
        // Unset other defaults
        await repo.update(
          { businessUnit: { id: location.businessUnit.id } },
          { isDefault: false }
        );
      }
      location.isDefault = parsed.data.isDefault;
    }

    await repo.save(location);

    const updated = await repo.findOne({
      where: { id },
      relations: ['businessUnit', 'businessUnit.organization']
    });

    res.json({ data: updated });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
    
    const repo = AppDataSource.getRepository(Location);
    const location = await repo.findOne({
      where: { id },
      relations: ['businessUnit', 'businessUnit.organization']
    });
    
    if (!location) {
      res.status(404).json({ error: { message: 'Location not found' } });
      return;
    }

    // Check access
    if (!auth.roles?.includes('SUPER_ADMIN') && location.businessUnit.organization.id !== auth.orgId) {
      res.status(403).json({ error: { message: 'Access denied' } });
      return;
    }

    await repo.remove(location);
    res.status(204).send();
  }
}

