import { Request, Response } from 'express';
import { z } from 'zod';
import { IsNull } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { PmWorkStage } from '@entities/pm/PmWorkStage.js';
import { PmProject } from '@entities/pm/PmProject.js';
import { assertOrgAccess, orgIdFromReq } from '@services/pm/pmScope.js';

const createSchema = z.object({
  organizationId: z.string().optional(),
  projectId: z.string().optional().nullable(),
  name: z.string().min(1).max(150),
  position: z.number().int().optional()
});

const updateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  position: z.number().int().optional()
});

export class StagesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const { projectId, templateOnly } = req.query;

      const qb = AppDataSource.getRepository(PmWorkStage)
        .createQueryBuilder('s')
        .where('s.organization_id = :orgId', { orgId })
        .orderBy('s.position', 'ASC')
        .addOrderBy('s.id', 'ASC');

      if (templateOnly === '1' || templateOnly === 'true') {
        qb.andWhere('s.project_id IS NULL');
      } else if (projectId) {
        qb.andWhere('(s.project_id = :projectId OR s.project_id IS NULL)', { projectId });
      }

      const items = await qb.getMany();
      res.json({ data: items });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const data = createSchema.parse(req.body);
      const orgId = data.organizationId || orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      if (data.projectId) {
        const project = await AppDataSource.getRepository(PmProject).findOne({
          where: { id: data.projectId, organizationId: orgId }
        });
        if (!project) {
          res.status(404).json({ error: { message: 'Project not found' } });
          return;
        }
      }

      let position = data.position;
      if (position === undefined) {
        const where = data.projectId
          ? { organizationId: orgId, projectId: data.projectId }
          : { organizationId: orgId, projectId: IsNull() };
        const max = await AppDataSource.getRepository(PmWorkStage).find({
          where,
          order: { position: 'DESC' },
          take: 1
        });
        position = (max[0]?.position ?? -1) + 1;
      }

      const repo = AppDataSource.getRepository(PmWorkStage);
      const item = await repo.save(
        repo.create({
          organizationId: orgId,
          projectId: data.projectId ?? null,
          name: data.name,
          position
        })
      );
      res.status(201).json({ data: item });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { message: 'Validation failed', details: error.errors } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const data = updateSchema.parse(req.body);
      const repo = AppDataSource.getRepository(PmWorkStage);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Stage not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      if (data.name !== undefined) item.name = data.name;
      if (data.position !== undefined) item.position = data.position;
      const saved = await repo.save(item);
      res.json({ data: saved });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { message: 'Validation failed', details: error.errors } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(PmWorkStage);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Stage not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      await repo.remove(item);
      res.json({ data: { ok: true } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
