import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Organization } from '@entities/iam/Organization.js';
import { z } from 'zod';
import { uploadFile, deleteFileByUrl } from '@utils/storage.js';

const createOrganizationSchema = z.object({
  name: z.string().min(2),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  registrationNumber: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  logoUrl: z.string().url().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'suspended']).optional()
});

const updateOrganizationSchema = z.object({
  name: z.string().min(2).optional(),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  registrationNumber: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  logoUrl: z.string().url().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'suspended']).optional()
});

export class OrganizationsController {
  static async list(req: Request, res: Response): Promise<void> {
    const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
    const repo = AppDataSource.getRepository(Organization);
    
    // Super admin can see all organizations, others only their own
    if (auth.roles?.includes('SUPER_ADMIN')) {
      const orgs = await repo.find({ take: 200, order: { createdAt: 'DESC' } });
      res.json({ data: orgs });
    } else {
      const org = await repo.findOne({ where: { id: auth.orgId } });
      res.json({ data: org ? [org] : [] });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
    const repo = AppDataSource.getRepository(Organization);
    
    const org = await repo.findOne({ where: { id } });
    if (!org) {
      res.status(404).json({ error: { message: 'Organization not found' } });
      return;
    }

    // Super admin can view any org, others only their own
    const isSuperAdmin = auth.roles?.includes('SUPER_ADMIN');
    if (!isSuperAdmin && org.id !== auth.orgId) {
      res.status(403).json({ error: { message: 'Access denied' } });
      return;
    }

    res.json({ data: org });
  }

  static async create(req: Request, res: Response): Promise<void> {
    // Only super admin can create organizations
    const parsed = createOrganizationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    let logoUrl = parsed.data.logoUrl || null;

    // Handle logo file upload if provided
    if (req.file) {
      try {
        const uploadResult = await uploadFile({
          file: req.file,
          folder: 'organizations',
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
          maxSizeInMB: 2
        });
        logoUrl = uploadResult.url;
      } catch (error: any) {
        res.status(400).json({ error: { message: `Logo upload failed: ${error.message}` } });
        return;
      }
    }

    const repo = AppDataSource.getRepository(Organization);
    const org = repo.create({
      name: parsed.data.name,
      legalName: parsed.data.legalName || null,
      taxId: parsed.data.taxId || null,
      registrationNumber: parsed.data.registrationNumber || null,
      website: parsed.data.website || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      logoUrl,
      status: parsed.data.status || 'active'
    });
    await repo.save(org);
    res.status(201).json({ data: org });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
    const parsed = updateOrganizationSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(Organization);
    const org = await repo.findOne({ where: { id } });
    
    if (!org) {
      res.status(404).json({ error: { message: 'Organization not found' } });
      return;
    }

    // Super admin can update any org, admin can only update their own
    const isSuperAdmin = auth.roles?.includes('SUPER_ADMIN');
    const isAdmin = auth.roles?.includes('ADMIN');
    
    if (!isSuperAdmin && (!isAdmin || org.id !== auth.orgId)) {
      res.status(403).json({ error: { message: 'Access denied' } });
      return;
    }

    // Handle logo file upload if provided
    if (req.file) {
      try {
        // Delete old logo if exists
        if (org.logoUrl) {
          try {
            await deleteFileByUrl(org.logoUrl);
          } catch (error) {
            // Log but don't fail if old logo deletion fails
            console.warn('Failed to delete old logo:', error);
          }
        }

        const uploadResult = await uploadFile({
          file: req.file,
          folder: 'organizations',
          fileName: `org-${id}-logo`,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
          maxSizeInMB: 2
        });
        org.logoUrl = uploadResult.url;
      } catch (error: any) {
        res.status(400).json({ error: { message: `Logo upload failed: ${error.message}` } });
        return;
      }
    } else if (parsed.data.logoUrl !== undefined) {
      // If logoUrl is explicitly set to empty string, delete the logo
      if (parsed.data.logoUrl === '' && org.logoUrl) {
        try {
          await deleteFileByUrl(org.logoUrl);
        } catch (error) {
          console.warn('Failed to delete logo:', error);
        }
        org.logoUrl = null;
      } else if (parsed.data.logoUrl) {
        org.logoUrl = parsed.data.logoUrl;
      }
    }

    // Update fields
    if (parsed.data.name !== undefined) org.name = parsed.data.name;
    if (parsed.data.legalName !== undefined) org.legalName = parsed.data.legalName || null;
    if (parsed.data.taxId !== undefined) org.taxId = parsed.data.taxId || null;
    if (parsed.data.registrationNumber !== undefined) org.registrationNumber = parsed.data.registrationNumber || null;
    if (parsed.data.website !== undefined) org.website = parsed.data.website || null;
    if (parsed.data.phone !== undefined) org.phone = parsed.data.phone || null;
    if (parsed.data.email !== undefined) org.email = parsed.data.email || null;
    
    // Only super admin can change status
    if (parsed.data.status !== undefined && isSuperAdmin) {
      org.status = parsed.data.status;
    }

    await repo.save(org);
    res.json({ data: org });
  }
}

