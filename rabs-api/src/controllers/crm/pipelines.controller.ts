import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { CrmPipeline } from '@entities/crm/CrmPipeline.js';
import { CrmStage } from '@entities/crm/CrmStage.js';
import { assertOrgAccess, orgIdFromReq } from '@services/crm/crmScope.js';

const createPipelineSchema = z.object({
  organizationId: z.string().optional(),
  name: z.string().min(1).max(150),
  type: z.enum(['onboarding', 'expansion', 'credit']).default('onboarding'),
  isDefault: z.boolean().optional()
});

const updatePipelineSchema = createPipelineSchema.partial();

const createStageSchema = z.object({
  pipelineId: z.string(),
  name: z.string().min(1).max(150),
  position: z.number().int().optional(),
  probability: z.number().min(0).max(100).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional()
});

const updateStageSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  position: z.number().int().optional(),
  probability: z.number().min(0).max(100).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional()
});

export class PipelinesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const items = await AppDataSource.getRepository(CrmPipeline).find({
        where: { organizationId: orgId },
        relations: ['stages'],
        order: { id: 'ASC' }
      });
      for (const p of items) {
        p.stages = (p.stages || []).sort((a, b) => a.position - b.position);
      }
      res.json({ data: items });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const data = createPipelineSchema.parse(req.body);
      const orgId = data.organizationId || orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const repo = AppDataSource.getRepository(CrmPipeline);
      if (data.isDefault) {
        await repo
          .createQueryBuilder()
          .update(CrmPipeline)
          .set({ isDefault: false })
          .where('organization_id = :orgId AND type = :type', { orgId, type: data.type })
          .execute();
      }
      const saved = await repo.save(
        repo.create({
          organizationId: orgId,
          name: data.name,
          type: data.type,
          isDefault: data.isDefault ?? false
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
      const data = updatePipelineSchema.parse(req.body);
      const repo = AppDataSource.getRepository(CrmPipeline);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Pipeline not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      if (data.isDefault) {
        await repo
          .createQueryBuilder()
          .update(CrmPipeline)
          .set({ isDefault: false })
          .where('organization_id = :orgId AND type = :type AND id != :id', {
            orgId: item.organizationId,
            type: data.type || item.type,
            id: item.id
          })
          .execute();
      }
      if (data.name !== undefined) item.name = data.name;
      if (data.type !== undefined) item.type = data.type;
      if (data.isDefault !== undefined) item.isDefault = data.isDefault;
      res.json({ data: await repo.save(item) });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}

export class StagesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const pipelineId = req.query.pipelineId as string | undefined;
      const qb = AppDataSource.getRepository(CrmStage)
        .createQueryBuilder('s')
        .innerJoinAndSelect('s.pipeline', 'p')
        .orderBy('s.position', 'ASC');
      if (pipelineId) qb.andWhere('s.pipeline_id = :pipelineId', { pipelineId });
      const orgId = orgIdFromReq(req);
      if (orgId) qb.andWhere('p.organization_id = :orgId', { orgId });
      res.json({ data: await qb.getMany() });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const data = createStageSchema.parse(req.body);
      const pipeline = await AppDataSource.getRepository(CrmPipeline).findOne({
        where: { id: data.pipelineId }
      });
      if (!pipeline) {
        res.status(400).json({ error: { message: 'Invalid pipelineId' } });
        return;
      }
      assertOrgAccess(req, pipeline.organizationId);
      const repo = AppDataSource.getRepository(CrmStage);
      let position = data.position;
      if (position === undefined) {
        const max = await repo
          .createQueryBuilder('s')
          .select('MAX(s.position)', 'max')
          .where('s.pipeline_id = :pid', { pid: pipeline.id })
          .getRawOne();
        position = Number(max?.max ?? -1) + 1;
      }
      const saved = await repo.save(
        repo.create({
          pipelineId: pipeline.id,
          name: data.name,
          position,
          probability: data.probability ?? 0,
          isWon: data.isWon ?? false,
          isLost: data.isLost ?? false
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
      const data = updateStageSchema.parse(req.body);
      const repo = AppDataSource.getRepository(CrmStage);
      const item = await repo.findOne({ where: { id: req.params.id }, relations: ['pipeline'] });
      if (!item) {
        res.status(404).json({ error: { message: 'Stage not found' } });
        return;
      }
      assertOrgAccess(req, item.pipeline?.organizationId);
      Object.assign(item, {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.position !== undefined ? { position: data.position } : {}),
        ...(data.probability !== undefined ? { probability: data.probability } : {}),
        ...(data.isWon !== undefined ? { isWon: data.isWon } : {}),
        ...(data.isLost !== undefined ? { isLost: data.isLost } : {})
      });
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
      const repo = AppDataSource.getRepository(CrmStage);
      const item = await repo.findOne({ where: { id: req.params.id }, relations: ['pipeline'] });
      if (!item) {
        res.status(404).json({ error: { message: 'Stage not found' } });
        return;
      }
      assertOrgAccess(req, item.pipeline?.organizationId);
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
