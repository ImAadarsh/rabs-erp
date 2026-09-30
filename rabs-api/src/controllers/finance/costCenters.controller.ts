import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { CostCenter } from '@entities/finance/CostCenter.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { User } from '@entities/iam/User.js';

const createCostCenterSchema = z.object({
  organizationId: z.string(),
  businessUnitId: z.string().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  managerId: z.string().optional(),
  status: z.enum(['active', 'inactive', 'closed']).optional()
});

const updateCostCenterSchema = z.object({
  businessUnitId: z.string().optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  managerId: z.string().optional(),
  status: z.enum(['active', 'inactive', 'closed']).optional()
});

export class CostCentersController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(CostCenter);
      const { organizationId, businessUnitId, status, search, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('cc')
        .leftJoinAndSelect('cc.organization', 'org')
        .leftJoinAndSelect('cc.businessUnit', 'bu')
        .leftJoinAndSelect('cc.manager', 'manager')
        .orderBy('cc.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('cc.organization_id = :orgId', { orgId: organizationId });
      }

      if (businessUnitId) {
        queryBuilder.andWhere('cc.business_unit_id = :buId', { buId: businessUnitId });
      }

      if (status) {
        queryBuilder.andWhere('cc.status = :status', { status });
      }

      if (search) {
        queryBuilder.andWhere(
          '(cc.code LIKE :search OR cc.name LIKE :search)',
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
      const repo = AppDataSource.getRepository(CostCenter);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'businessUnit', 'manager']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Cost Center not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createCostCenterSchema.safeParse(req.body);
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

      const repo = AppDataSource.getRepository(CostCenter);
      
      // Check for duplicate code within organization
      const existing = await repo.findOne({
        where: { 
          organization: { id: parsed.data.organizationId },
          code: parsed.data.code
        }
      });
      
      if (existing) {
        res.status(400).json({ error: { message: 'Cost center code already exists' } });
        return;
      }

      let businessUnit = null;
      if (parsed.data.businessUnitId) {
        const buRepo = AppDataSource.getRepository(BusinessUnit);
        businessUnit = await buRepo.findOne({ where: { id: parsed.data.businessUnitId } });
        if (!businessUnit) {
          res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
          return;
        }
      }

      let manager = null;
      if (parsed.data.managerId) {
        const userRepo = AppDataSource.getRepository(User);
        manager = await userRepo.findOne({ where: { id: parsed.data.managerId } });
        if (!manager) {
          res.status(400).json({ error: { message: 'Invalid managerId' } });
          return;
        }
      }

      const item = repo.create({
        organization: org,
        businessUnit: businessUnit ?? undefined,
        code: parsed.data.code,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        manager: manager ?? undefined,
        status: parsed.data.status ?? 'active'
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'businessUnit', 'manager']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateCostCenterSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(CostCenter);
      const item = await repo.findOne({
        where: { id },
        relations: ['organization', 'businessUnit', 'manager']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Cost Center not found' } });
        return;
      }

      // Check for duplicate code if changing
      if (parsed.data.code && parsed.data.code !== item.code) {
        const existing = await repo.findOne({
          where: { 
            organization: { id: item.organization.id },
            code: parsed.data.code
          }
        });
        
        if (existing) {
          res.status(400).json({ error: { message: 'Cost center code already exists' } });
          return;
        }
      }

      if (parsed.data.businessUnitId !== undefined) {
        if (parsed.data.businessUnitId) {
          const buRepo = AppDataSource.getRepository(BusinessUnit);
          const businessUnit = await buRepo.findOne({ where: { id: parsed.data.businessUnitId } });
          if (!businessUnit) {
            res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
            return;
          }
          item.businessUnit = businessUnit;
        } else {
          item.businessUnit = null;
        }
      }

      if (parsed.data.managerId !== undefined) {
        if (parsed.data.managerId) {
          const userRepo = AppDataSource.getRepository(User);
          const manager = await userRepo.findOne({ where: { id: parsed.data.managerId } });
          if (!manager) {
            res.status(400).json({ error: { message: 'Invalid managerId' } });
            return;
          }
          item.manager = manager;
        } else {
          item.manager = null;
        }
      }

      if (parsed.data.code) item.code = parsed.data.code;
      if (parsed.data.name) item.name = parsed.data.name;
      if (parsed.data.description !== undefined) item.description = parsed.data.description ?? null;
      if (parsed.data.status) item.status = parsed.data.status;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'businessUnit', 'manager']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(CostCenter);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Cost Center not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

