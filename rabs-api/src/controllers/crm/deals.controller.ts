import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { CrmDeal } from '@entities/crm/CrmDeal.js';
import { CrmStage } from '@entities/crm/CrmStage.js';
import { CrmPipeline } from '@entities/crm/CrmPipeline.js';
import { CrmDealStageHistory } from '@entities/crm/CrmDealStageHistory.js';
import { Customer } from '@entities/orders/Customer.js';
import { assertOrgAccess, orgIdFromReq, userIdFromReq } from '@services/crm/crmScope.js';
import { attachTag, detachTag, listTagsForEntities } from '@services/crm/tags.service.js';
import { dealWithProbability } from './forecast.controller.js';

const createDealSchema = z.object({
  organizationId: z.string().optional(),
  pipelineId: z.string(),
  stageId: z.string().optional(),
  customerId: z.string(),
  name: z.string().min(1).max(255),
  amount: z.number().optional(),
  probabilityOverride: z.number().min(0).max(100).optional().nullable(),
  currency: z.string().length(3).optional(),
  expectedClose: z.string().optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable()
});

const updateDealSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  amount: z.number().optional(),
  probabilityOverride: z.number().min(0).max(100).optional().nullable(),
  currency: z.string().length(3).optional(),
  expectedClose: z.string().optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
  status: z.enum(['open', 'won', 'lost']).optional(),
  lostReason: z.string().max(500).optional().nullable(),
  stageId: z.string().optional(),
  pipelineId: z.string().optional()
});

const moveSchema = z.object({
  stageId: z.string(),
  note: z.string().max(500).optional().nullable(),
  lostReason: z.string().max(500).optional().nullable()
});

export class DealsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const { status, pipelineId, stageId, customerId, ownerUserId, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const qb = AppDataSource.getRepository(CrmDeal)
        .createQueryBuilder('d')
        .leftJoinAndSelect('d.stage', 'stage')
        .leftJoinAndSelect('d.pipeline', 'pipeline')
        .leftJoinAndSelect('d.customer', 'customer')
        .leftJoinAndSelect('d.owner', 'owner')
        .where('d.organization_id = :orgId', { orgId })
        .orderBy('d.updatedAt', 'DESC')
        .take(take)
        .skip(skip);

      if (status) qb.andWhere('d.status = :status', { status });
      if (pipelineId) qb.andWhere('d.pipeline_id = :pipelineId', { pipelineId });
      if (stageId) qb.andWhere('d.stage_id = :stageId', { stageId });
      if (customerId) qb.andWhere('d.customer_id = :customerId', { customerId });
      if (ownerUserId) qb.andWhere('d.owner_user_id = :ownerUserId', { ownerUserId });

      const [items, total] = await qb.getManyAndCount();
      const tagsMap = await listTagsForEntities(
        'deal',
        items.map((i) => i.id)
      );
      res.json({
        data: items.map((d) => ({ ...dealWithProbability(d), tags: tagsMap.get(d.id) || [] })),
        meta: { total, page: Number(page) || 1, limit: take }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(CrmDeal).findOne({
        where: { id: req.params.id },
        relations: ['stage', 'pipeline', 'customer', 'owner', 'lead']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Deal not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      const history = await AppDataSource.getRepository(CrmDealStageHistory).find({
        where: { dealId: item.id },
        relations: ['fromStage', 'toStage', 'changedBy'],
        order: { createdAt: 'ASC' }
      });
      const tagsMap = await listTagsForEntities('deal', [item.id]);
      res.json({
        data: {
          ...dealWithProbability(item),
          tags: tagsMap.get(item.id) || [],
          stageHistory: history
        }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const data = createDealSchema.parse(req.body);
      const orgId = data.organizationId || orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }

      const pipeline = await AppDataSource.getRepository(CrmPipeline).findOne({
        where: { id: data.pipelineId, organizationId: orgId }
      });
      if (!pipeline) {
        res.status(400).json({ error: { message: 'Invalid pipelineId' } });
        return;
      }

      let stage: CrmStage | null = null;
      if (data.stageId) {
        stage = await AppDataSource.getRepository(CrmStage).findOne({
          where: { id: data.stageId, pipelineId: pipeline.id }
        });
      } else {
        stage = await AppDataSource.getRepository(CrmStage).findOne({
          where: { pipelineId: pipeline.id },
          order: { position: 'ASC' }
        });
      }
      if (!stage) {
        res.status(400).json({ error: { message: 'Invalid or missing stageId' } });
        return;
      }

      const customer = await AppDataSource.getRepository(Customer).findOne({
        where: { id: data.customerId },
        relations: ['organization']
      });
      if (!customer || String(customer.organization?.id) !== String(orgId)) {
        res.status(400).json({ error: { message: 'Invalid customerId' } });
        return;
      }

      const dealRepo = AppDataSource.getRepository(CrmDeal);
      const deal = await dealRepo.save(
        dealRepo.create({
          organizationId: orgId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          customerId: customer.id,
          name: data.name,
          amount: data.amount ?? 0,
          probabilityOverride: data.probabilityOverride ?? null,
          currency: data.currency || 'GBP',
          expectedClose: data.expectedClose ?? null,
          ownerUserId: data.ownerUserId ?? userIdFromReq(req) ?? null,
          status: 'open',
          leadId: data.leadId ?? null
        })
      );

      await AppDataSource.getRepository(CrmDealStageHistory).save(
        AppDataSource.getRepository(CrmDealStageHistory).create({
          dealId: deal.id,
          fromStageId: null,
          toStageId: stage.id,
          changedByUserId: userIdFromReq(req) ?? null,
          note: 'Deal created'
        })
      );

      const withStage = await dealRepo.findOne({
        where: { id: deal.id },
        relations: ['stage']
      });
      res.status(201).json({ data: dealWithProbability(withStage || deal) });
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
      const data = updateDealSchema.parse(req.body);
      const repo = AppDataSource.getRepository(CrmDeal);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Deal not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);

      if (data.stageId && data.stageId !== item.stageId) {
        await DealsController.applyStageMove(item, data.stageId, null, data.lostReason ?? null, userIdFromReq(req));
      }

      if (data.name !== undefined) item.name = data.name;
      if (data.amount !== undefined) item.amount = data.amount;
      if (data.probabilityOverride !== undefined) item.probabilityOverride = data.probabilityOverride;
      if (data.currency !== undefined) item.currency = data.currency;
      if (data.expectedClose !== undefined) item.expectedClose = data.expectedClose;
      if (data.ownerUserId !== undefined) item.ownerUserId = data.ownerUserId;
      if (data.pipelineId !== undefined) item.pipelineId = data.pipelineId;
      if (data.status !== undefined && !data.stageId) item.status = data.status;
      if (data.lostReason !== undefined) item.lostReason = data.lostReason;

      const saved = await repo.save(item);
      const withStage = await repo.findOne({ where: { id: saved.id }, relations: ['stage'] });
      res.json({ data: dealWithProbability(withStage || saved) });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async move(req: Request, res: Response): Promise<void> {
    try {
      const data = moveSchema.parse(req.body);
      const repo = AppDataSource.getRepository(CrmDeal);
      // Do not load `stage` relation — TypeORM would overwrite stageId from the old relation on save.
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Deal not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      await DealsController.applyStageMove(
        item,
        data.stageId,
        data.note ?? null,
        data.lostReason ?? null,
        userIdFromReq(req)
      );
      const saved = await repo.save(item);
      const withStage = await repo.findOne({
        where: { id: saved.id },
        relations: ['stage', 'pipeline', 'owner']
      });
      res.json({ data: dealWithProbability(withStage || saved) });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  private static async applyStageMove(
    deal: CrmDeal,
    toStageId: string,
    note: string | null,
    lostReason: string | null,
    userId: string | undefined
  ): Promise<void> {
    const stage = await AppDataSource.getRepository(CrmStage).findOne({ where: { id: toStageId } });
    if (!stage || String(stage.pipelineId) !== String(deal.pipelineId)) {
      throw Object.assign(new Error('stageId must belong to deal pipeline'), { status: 400 });
    }
    const fromStageId = deal.stageId;
    deal.stageId = stage.id;
    // Keep relation in sync if it was previously loaded (avoids FK overwrite on save).
    deal.stage = stage;
    if (stage.isWon) {
      deal.status = 'won';
      deal.lostReason = null;
    } else if (stage.isLost) {
      deal.status = 'lost';
      if (lostReason) deal.lostReason = lostReason;
    } else {
      deal.status = 'open';
    }
    await AppDataSource.getRepository(CrmDealStageHistory).save(
      AppDataSource.getRepository(CrmDealStageHistory).create({
        dealId: deal.id,
        fromStageId,
        toStageId: stage.id,
        changedByUserId: userId ?? null,
        note
      })
    );
  }

  static async attachTag(req: Request, res: Response): Promise<void> {
    try {
      const deal = await AppDataSource.getRepository(CrmDeal).findOne({ where: { id: req.params.id } });
      if (!deal) {
        res.status(404).json({ error: { message: 'Deal not found' } });
        return;
      }
      assertOrgAccess(req, deal.organizationId);
      const body = z
        .object({ tagId: z.string().optional(), name: z.string().optional(), color: z.string().optional().nullable() })
        .parse(req.body);
      const result = await attachTag({
        organizationId: deal.organizationId,
        entityType: 'deal',
        entityId: deal.id,
        ...body
      });
      res.status(201).json({ data: result });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async detachTag(req: Request, res: Response): Promise<void> {
    try {
      const deal = await AppDataSource.getRepository(CrmDeal).findOne({ where: { id: req.params.id } });
      if (!deal) {
        res.status(404).json({ error: { message: 'Deal not found' } });
        return;
      }
      assertOrgAccess(req, deal.organizationId);
      const ok = await detachTag({ entityType: 'deal', entityId: deal.id, tagId: req.params.tagId });
      if (!ok) {
        res.status(404).json({ error: { message: 'Tag link not found' } });
        return;
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
