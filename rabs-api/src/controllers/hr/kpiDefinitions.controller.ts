import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { KpiDefinition } from '@entities/hr/KpiDefinition.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';

const createKpiDefinitionSchema = z.object({
  organizationId: z.string(),
  kpiCode: z.string().min(1),
  kpiName: z.string().min(1),
  kpiCategory: z.enum(['sales', 'operations', 'finance', 'customer_service', 'hr', 'marketing', 'other']),
  description: z.string().optional(),
  unitOfMeasure: z.string().optional(),
  targetValue: z.coerce.number().optional(),
  calculationMethod: z.string().optional(),
  isHigherBetter: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional()
});

const updateKpiDefinitionSchema = z.object({
  kpiCode: z.string().min(1).optional(),
  kpiName: z.string().min(1).optional(),
  kpiCategory: z.enum(['sales', 'operations', 'finance', 'customer_service', 'hr', 'marketing', 'other']).optional(),
  description: z.string().optional(),
  unitOfMeasure: z.string().optional(),
  targetValue: z.coerce.number().optional(),
  calculationMethod: z.string().optional(),
  isHigherBetter: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional()
});

export class KpiDefinitionsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(KpiDefinition);
      const { organizationId, kpiCategory, isActive, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('kd')
        .leftJoinAndSelect('kd.organization', 'org')
        .orderBy('kd.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('kd.organization_id = :orgId', { orgId: organizationId });
      }

      if (kpiCategory) {
        queryBuilder.andWhere('kd.kpi_category = :category', { category: kpiCategory });
      }

      if (isActive !== undefined) {
        queryBuilder.andWhere('kd.is_active = :isActive', { isActive: isActive === 'true' });
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
      const repo = AppDataSource.getRepository(KpiDefinition);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'KPI Definition not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createKpiDefinitionSchema.safeParse(req.body);
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

      const repo = AppDataSource.getRepository(KpiDefinition);
      const item = repo.create({
        organization: org,
        kpiCode: parsed.data.kpiCode,
        kpiName: parsed.data.kpiName,
        kpiCategory: parsed.data.kpiCategory,
        description: parsed.data.description ?? null,
        unitOfMeasure: parsed.data.unitOfMeasure ?? null,
        targetValue: parsed.data.targetValue ?? null,
        calculationMethod: parsed.data.calculationMethod ?? null,
        isHigherBetter: parsed.data.isHigherBetter ?? true,
        isActive: parsed.data.isActive ?? true
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
      const parsed = updateKpiDefinitionSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(KpiDefinition);
      const item = await repo.findOne({
        where: { id },
        relations: ['organization']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'KPI Definition not found' } });
        return;
      }

      if (parsed.data.kpiCode) item.kpiCode = parsed.data.kpiCode;
      if (parsed.data.kpiName) item.kpiName = parsed.data.kpiName;
      if (parsed.data.kpiCategory) item.kpiCategory = parsed.data.kpiCategory;
      if (parsed.data.description !== undefined) item.description = parsed.data.description ?? null;
      if (parsed.data.unitOfMeasure !== undefined) item.unitOfMeasure = parsed.data.unitOfMeasure ?? null;
      if (parsed.data.targetValue !== undefined) item.targetValue = parsed.data.targetValue ?? null;
      if (parsed.data.calculationMethod !== undefined) item.calculationMethod = parsed.data.calculationMethod ?? null;
      if (parsed.data.isHigherBetter !== undefined) item.isHigherBetter = parsed.data.isHigherBetter;
      if (parsed.data.isActive !== undefined) item.isActive = parsed.data.isActive;

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
      const repo = AppDataSource.getRepository(KpiDefinition);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'KPI Definition not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

