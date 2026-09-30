import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { CrmDeal } from '@entities/crm/CrmDeal.js';
import { orgIdFromReq } from '@services/crm/crmScope.js';

function effectiveProbability(deal: CrmDeal): number {
  if (deal.probabilityOverride != null && deal.probabilityOverride !== undefined) {
    return Number(deal.probabilityOverride);
  }
  return Number(deal.stage?.probability ?? 0);
}

function monthKey(date: Date | string | null | undefined): string {
  if (!date) return 'unscheduled';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return 'unscheduled';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export class ForecastController {
  /** GET /api/crm/forecast — weighted open pipeline by stage / owner / month */
  static async get(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const { ownerUserId, pipelineId, from, to } = req.query;

      const qb = AppDataSource.getRepository(CrmDeal)
        .createQueryBuilder('d')
        .leftJoinAndSelect('d.stage', 'stage')
        .leftJoinAndSelect('d.pipeline', 'pipeline')
        .leftJoinAndSelect('d.owner', 'owner')
        .leftJoinAndSelect('d.customer', 'customer')
        .where('d.organization_id = :orgId', { orgId })
        .andWhere('d.status = :status', { status: 'open' });

      if (ownerUserId) qb.andWhere('d.owner_user_id = :ownerUserId', { ownerUserId });
      if (pipelineId) qb.andWhere('d.pipeline_id = :pipelineId', { pipelineId });
      if (from) qb.andWhere('(d.expected_close IS NULL OR d.expected_close >= :from)', { from: String(from) });
      if (to) qb.andWhere('(d.expected_close IS NULL OR d.expected_close <= :to)', { to: String(to) });

      const deals = await qb.getMany();

      let totalPipeline = 0;
      let weightedForecast = 0;
      const byMonth = new Map<string, { amount: number; weighted: number; count: number }>();
      const byStage = new Map<string, { stageId: string; stageName: string; amount: number; weighted: number; count: number }>();
      const byOwner = new Map<string, { ownerUserId: string | null; ownerName: string; amount: number; weighted: number; count: number }>();

      const dealRows = deals.map((d) => {
        const amount = Number(d.amount) || 0;
        const probability = effectiveProbability(d);
        const weighted = (amount * probability) / 100;
        totalPipeline += amount;
        weightedForecast += weighted;

        const mk = monthKey(d.expectedClose);
        const monthBucket = byMonth.get(mk) || { amount: 0, weighted: 0, count: 0 };
        monthBucket.amount += amount;
        monthBucket.weighted += weighted;
        monthBucket.count += 1;
        byMonth.set(mk, monthBucket);

        const stageKey = String(d.stageId);
        const stageBucket = byStage.get(stageKey) || {
          stageId: stageKey,
          stageName: d.stage?.name || 'Unknown',
          amount: 0,
          weighted: 0,
          count: 0
        };
        stageBucket.amount += amount;
        stageBucket.weighted += weighted;
        stageBucket.count += 1;
        byStage.set(stageKey, stageBucket);

        const ownerKey = d.ownerUserId ? String(d.ownerUserId) : 'unassigned';
        const ownerName = d.owner
          ? [d.owner.firstName, d.owner.lastName].filter(Boolean).join(' ') || d.owner.email
          : 'Unassigned';
        const ownerBucket = byOwner.get(ownerKey) || {
          ownerUserId: d.ownerUserId,
          ownerName,
          amount: 0,
          weighted: 0,
          count: 0
        };
        ownerBucket.amount += amount;
        ownerBucket.weighted += weighted;
        ownerBucket.count += 1;
        byOwner.set(ownerKey, ownerBucket);

        return {
          id: d.id,
          name: d.name,
          amount,
          currency: d.currency,
          probability,
          probabilitySource: d.probabilityOverride != null ? 'override' : 'stage',
          weighted,
          expectedClose: d.expectedClose,
          stageId: d.stageId,
          stageName: d.stage?.name || null,
          pipelineId: d.pipelineId,
          pipelineName: d.pipeline?.name || null,
          ownerUserId: d.ownerUserId,
          customerId: d.customerId
        };
      });

      const sortByWeighted = <T extends { weighted: number }>(arr: T[]) =>
        arr.sort((a, b) => b.weighted - a.weighted);

      res.json({
        data: {
          totalPipeline,
          weightedForecast,
          dealCount: deals.length,
          currency: deals[0]?.currency || 'GBP',
          byMonth: [...byMonth.entries()]
            .map(([month, v]) => ({ month, ...v }))
            .sort((a, b) => a.month.localeCompare(b.month)),
          byStage: sortByWeighted([...byStage.values()]),
          byOwner: sortByWeighted([...byOwner.values()]),
          deals: dealRows
        },
        meta: {
          asOf: new Date().toISOString(),
          filters: {
            ownerUserId: ownerUserId || null,
            pipelineId: pipelineId || null,
            from: from || null,
            to: to || null
          }
        }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}

export function dealWithProbability(deal: CrmDeal) {
  const probability =
    deal.probabilityOverride != null ? Number(deal.probabilityOverride) : Number(deal.stage?.probability ?? 0);
  return {
    ...deal,
    probability,
    probabilitySource: deal.probabilityOverride != null ? ('override' as const) : ('stage' as const)
  };
}
