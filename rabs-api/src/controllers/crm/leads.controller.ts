import { Request, Response } from 'express';
import { z } from 'zod';
import { IsNull } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { CrmLead } from '@entities/crm/CrmLead.js';
import { CrmDeal } from '@entities/crm/CrmDeal.js';
import { CrmPipeline } from '@entities/crm/CrmPipeline.js';
import { CrmStage } from '@entities/crm/CrmStage.js';
import { CrmDealStageHistory } from '@entities/crm/CrmDealStageHistory.js';
import { Customer } from '@entities/orders/Customer.js';
import { Organization } from '@entities/iam/Organization.js';
import { assertOrgAccess, orgIdFromReq, userIdFromReq } from '@services/crm/crmScope.js';
import { attachTag, detachTag, listTagsForEntities } from '@services/crm/tags.service.js';
import { syncFromCrmLead } from '@services/marketing/marketingLeads.service.js';
import {
  applyLeadAutomation,
  assertAssignableUser,
  createLeadFollowUpActivity
} from '@services/crm/leadAssignment.service.js';
import { getOrCreateCrmSettings } from '@services/crm/crmSettings.service.js';
import { CrmContact } from '@entities/crm/CrmContact.js';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

const createLeadSchema = z.object({
  organizationId: z.string().optional(),
  name: z.string().min(1).max(255),
  company: z.string().max(255).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost']).optional(),
  ownerUserId: z.string().optional().nullable(),
  affiliateId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  score: z.number().int().min(0).max(100).optional().nullable(),
  priority: z.enum(PRIORITIES).optional(),
  disqualifiedReason: z.string().max(500).optional().nullable()
});

const updateLeadSchema = createLeadSchema.partial();

function applyQualificationFields(
  item: CrmLead,
  rest: {
    status?: CrmLead['status'];
    score?: number | null;
    priority?: CrmLead['priority'];
    disqualifiedReason?: string | null;
  }
) {
  if (rest.score !== undefined) item.score = rest.score;
  if (rest.priority !== undefined) item.priority = rest.priority;
  if (rest.disqualifiedReason !== undefined) item.disqualifiedReason = rest.disqualifiedReason;
  if (rest.status !== undefined) {
    item.status = rest.status;
    if (rest.status === 'qualified' && !item.qualifiedAt) {
      item.qualifiedAt = new Date();
    }
    if (rest.status === 'unqualified' && rest.disqualifiedReason) {
      item.disqualifiedReason = rest.disqualifiedReason;
    }
  }
}

const convertSchema = z.object({
  customerId: z.string().optional(),
  createDeal: z.boolean().optional().default(false),
  dealName: z.string().optional(),
  dealAmount: z.number().optional(),
  currency: z.string().length(3).optional(),
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
  ownerUserId: z.string().optional().nullable(),
  customerType: z.enum(['individual', 'business', 'wholesale', 'vip']).optional()
});

function splitName(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export class LeadsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const { status, ownerUserId, priority, search, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const qb = AppDataSource.getRepository(CrmLead)
        .createQueryBuilder('l')
        .leftJoinAndSelect('l.owner', 'owner')
        .where('l.organization_id = :orgId', { orgId })
        .orderBy('l.createdAt', 'DESC')
        .take(take)
        .skip(skip);

      if (status) qb.andWhere('l.status = :status', { status });
      if (ownerUserId) qb.andWhere('l.owner_user_id = :ownerUserId', { ownerUserId });
      if (priority) qb.andWhere('l.priority = :priority', { priority });
      if (search) {
        qb.andWhere(
          '(l.name LIKE :q OR l.company LIKE :q OR l.email LIKE :q OR l.phone LIKE :q)',
          { q: `%${String(search)}%` }
        );
      }

      const [items, total] = await qb.getManyAndCount();
      const tagsMap = await listTagsForEntities(
        'lead',
        items.map((i) => i.id)
      );
      res.json({
        data: items.map((l) => ({ ...l, tags: tagsMap.get(l.id) || [] })),
        meta: { total, page: Number(page) || 1, limit: take }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(CrmLead).findOne({
        where: { id: req.params.id },
        relations: ['owner', 'convertedCustomer', 'affiliate']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Lead not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      const tagsMap = await listTagsForEntities('lead', [item.id]);
      res.json({ data: { ...item, tags: tagsMap.get(item.id) || [] } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const data = createLeadSchema.parse(req.body);
      const orgId = data.organizationId || orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const repo = AppDataSource.getRepository(CrmLead);
      const status = data.status ?? 'new';

      if (data.ownerUserId) {
        const ok = await assertAssignableUser(orgId, data.ownerUserId);
        if (!ok) {
          res.status(400).json({ error: { message: 'ownerUserId is not an assignable user in this organization' } });
          return;
        }
      }

      let saved = await repo.save(
        repo.create({
          organizationId: orgId,
          name: data.name,
          company: data.company ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          source: data.source ?? null,
          status,
          ownerUserId: data.ownerUserId ?? null,
          affiliateId: data.affiliateId ?? null,
          notes: data.notes ?? null,
          score: data.score ?? null,
          priority: data.priority ?? 'medium',
          qualifiedAt: status === 'qualified' ? new Date() : null,
          disqualifiedReason: data.disqualifiedReason ?? null
        })
      );

      const automation = await applyLeadAutomation(saved);
      saved = automation.lead;
      // If still unassigned (auto-assign off / no reps), fall back to creator
      if (!saved.ownerUserId) {
        const fallback = userIdFromReq(req);
        if (fallback) {
          saved.ownerUserId = fallback;
          saved = await repo.save(saved);
          if (!automation.followUp) {
            automation.followUp = await createLeadFollowUpActivity(saved);
          }
        }
      }

      let marketingSync: any;
      try {
        marketingSync = await syncFromCrmLead(saved);
      } catch (err: any) {
        marketingSync = { error: err.message || 'sync failed' };
      }
      res.status(201).json({
        data: saved,
        meta: {
          marketingSync,
          assigned: automation.assigned,
          followUpId: automation.followUp?.id ?? null
        }
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  /** POST /api/crm/leads/:id/sync-to-marketing */
  static async syncToMarketing(req: Request, res: Response): Promise<void> {
    try {
      const lead = await AppDataSource.getRepository(CrmLead).findOne({
        where: { id: req.params.id }
      });
      if (!lead) {
        res.status(404).json({ error: { message: 'Lead not found' } });
        return;
      }
      assertOrgAccess(req, lead.organizationId);
      const result = await syncFromCrmLead(lead);
      if (result.skipped) {
        res.status(400).json({ error: { message: result.skipped }, data: result });
        return;
      }
      res.json({ data: result });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const data = updateLeadSchema.parse(req.body);
      const repo = AppDataSource.getRepository(CrmLead);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Lead not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      const { organizationId: _o, ...rest } = data;
      const prevOwner = item.ownerUserId;

      if (rest.ownerUserId) {
        const ok = await assertAssignableUser(item.organizationId, rest.ownerUserId);
        if (!ok) {
          res.status(400).json({ error: { message: 'ownerUserId is not an assignable user in this organization' } });
          return;
        }
      }

      Object.assign(item, {
        ...(rest.name !== undefined ? { name: rest.name } : {}),
        ...(rest.company !== undefined ? { company: rest.company } : {}),
        ...(rest.email !== undefined ? { email: rest.email } : {}),
        ...(rest.phone !== undefined ? { phone: rest.phone } : {}),
        ...(rest.source !== undefined ? { source: rest.source } : {}),
        ...(rest.affiliateId !== undefined ? { affiliateId: rest.affiliateId } : {}),
        ...(rest.notes !== undefined ? { notes: rest.notes } : {})
      });
      // Set FK without a loaded `owner` relation — TypeORM would otherwise overwrite ownerUserId from the old relation.
      if (rest.ownerUserId !== undefined) {
        item.ownerUserId = rest.ownerUserId;
      }
      applyQualificationFields(item, rest);
      await repo.save(item);

      let followUpId: string | null = null;
      if (rest.ownerUserId && rest.ownerUserId !== prevOwner) {
        const settings = await getOrCreateCrmSettings(item.organizationId);
        if (settings.autoFollowupOnLead) {
          const followUp = await createLeadFollowUpActivity(item);
          followUpId = followUp?.id ?? null;
        }
      }

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['owner']
      });
      res.json({ data: saved, meta: { followUpId } });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  /** POST /api/crm/leads/bulk-assign — assign many leads to one owner */
  static async bulkAssign(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        leadIds: z.array(z.string()).min(1).max(100),
        ownerUserId: z.string().min(1)
      });
      const data = schema.parse(req.body);
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const ok = await assertAssignableUser(orgId, data.ownerUserId);
      if (!ok) {
        res.status(400).json({ error: { message: 'ownerUserId is not an assignable user in this organization' } });
        return;
      }

      const repo = AppDataSource.getRepository(CrmLead);
      const leads = await repo
        .createQueryBuilder('l')
        .where('l.id IN (:...ids)', { ids: data.leadIds })
        .andWhere('l.organization_id = :orgId', { orgId })
        .getMany();

      const settings = await getOrCreateCrmSettings(orgId);
      let updated = 0;
      let followUps = 0;
      for (const lead of leads) {
        const prev = lead.ownerUserId;
        if (String(prev) === String(data.ownerUserId)) continue;
        lead.ownerUserId = data.ownerUserId;
        await repo.save(lead);
        updated += 1;
        if (settings.autoFollowupOnLead) {
          const fu = await createLeadFollowUpActivity(lead);
          if (fu) followUps += 1;
        }
      }

      res.json({
        data: { updated, followUps, ownerUserId: data.ownerUserId },
        meta: { requested: data.leadIds.length, found: leads.length }
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async convert(req: Request, res: Response): Promise<void> {
    try {
      const data = convertSchema.parse(req.body);
      const leadRepo = AppDataSource.getRepository(CrmLead);
      const lead = await leadRepo.findOne({ where: { id: req.params.id } });
      if (!lead) {
        res.status(404).json({ error: { message: 'Lead not found' } });
        return;
      }
      assertOrgAccess(req, lead.organizationId);
      if (lead.status === 'converted' && lead.convertedCustomerId) {
        res.status(400).json({ error: { message: 'Lead already converted' } });
        return;
      }

      const customerRepo = AppDataSource.getRepository(Customer);
      let customer: Customer | null = null;

      if (data.customerId) {
        customer = await customerRepo.findOne({
          where: { id: data.customerId },
          relations: ['organization']
        });
        if (!customer || String(customer.organization?.id) !== String(lead.organizationId)) {
          res.status(400).json({ error: { message: 'Invalid customerId for org' } });
          return;
        }
      } else if (lead.email) {
        customer = await customerRepo.findOne({
          where: {
            organization: { id: lead.organizationId },
            email: lead.email,
            deletedAt: IsNull()
          },
          relations: ['organization']
        });
      }

      if (!customer) {
        const org = await AppDataSource.getRepository(Organization).findOne({
          where: { id: lead.organizationId }
        });
        if (!org) {
          res.status(400).json({ error: { message: 'Organization missing' } });
          return;
        }
        const { firstName, lastName } = splitName(lead.name);
        customer = await customerRepo.save(
          customerRepo.create({
            organization: org,
            email: lead.email,
            phone: lead.phone,
            firstName,
            lastName,
            companyName: lead.company,
            customerType: data.customerType || (lead.company ? 'business' : 'individual'),
            crmOwnerUserId: data.ownerUserId ?? lead.ownerUserId,
            status: 'active'
          })
        );
      } else if (!customer.crmOwnerUserId && (data.ownerUserId || lead.ownerUserId)) {
        customer.crmOwnerUserId = data.ownerUserId ?? lead.ownerUserId;
        await customerRepo.save(customer);
      }

      let deal: CrmDeal | null = null;
      if (data.createDeal) {
        let pipeline: CrmPipeline | null = null;
        if (data.pipelineId) {
          pipeline = await AppDataSource.getRepository(CrmPipeline).findOne({
            where: { id: data.pipelineId, organizationId: lead.organizationId }
          });
        } else {
          pipeline = await AppDataSource.getRepository(CrmPipeline).findOne({
            where: { organizationId: lead.organizationId, isDefault: true }
          });
          if (!pipeline) {
            pipeline = await AppDataSource.getRepository(CrmPipeline).findOne({
              where: { organizationId: lead.organizationId },
              order: { id: 'ASC' }
            });
          }
        }
        if (!pipeline) {
          res.status(400).json({ error: { message: 'No pipeline available; create one first' } });
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
          res.status(400).json({ error: { message: 'No stage available on pipeline' } });
          return;
        }

        const dealRepo = AppDataSource.getRepository(CrmDeal);
        deal = await dealRepo.save(
          dealRepo.create({
            organizationId: lead.organizationId,
            pipelineId: pipeline.id,
            stageId: stage.id,
            customerId: customer.id,
            name: data.dealName || `${lead.company || lead.name} — Deal`,
            amount: data.dealAmount ?? 0,
            currency: data.currency || 'GBP',
            ownerUserId: data.ownerUserId ?? lead.ownerUserId,
            status: 'open',
            leadId: lead.id
          })
        );
        await AppDataSource.getRepository(CrmDealStageHistory).save(
          AppDataSource.getRepository(CrmDealStageHistory).create({
            dealId: deal.id,
            fromStageId: null,
            toStageId: stage.id,
            changedByUserId: userIdFromReq(req) ?? null,
            note: 'Created from lead conversion'
          })
        );
      }

      lead.status = 'converted';
      lead.convertedCustomerId = customer.id;
      if (!lead.qualifiedAt) lead.qualifiedAt = new Date();
      await leadRepo.save(lead);

      // Create a contact on the account from lead person details
      let contact: CrmContact | null = null;
      const contactRepo = AppDataSource.getRepository(CrmContact);
      const { firstName, lastName } = splitName(lead.name);
      const existingContact = lead.email
        ? await contactRepo.findOne({
            where: { customerId: customer.id, email: lead.email }
          })
        : null;
      if (existingContact) {
        contact = existingContact;
      } else {
        contact = await contactRepo.save(
          contactRepo.create({
            organizationId: lead.organizationId,
            customerId: customer.id,
            firstName,
            lastName,
            email: lead.email,
            phone: lead.phone,
            title: null,
            isPrimary: true,
            notes: lead.notes
          })
        );
      }

      res.json({
        data: {
          lead,
          customer,
          contact,
          deal
        }
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async attachTag(req: Request, res: Response): Promise<void> {
    try {
      const lead = await AppDataSource.getRepository(CrmLead).findOne({ where: { id: req.params.id } });
      if (!lead) {
        res.status(404).json({ error: { message: 'Lead not found' } });
        return;
      }
      assertOrgAccess(req, lead.organizationId);
      const body = z
        .object({ tagId: z.string().optional(), name: z.string().optional(), color: z.string().optional().nullable() })
        .parse(req.body);
      const result = await attachTag({
        organizationId: lead.organizationId,
        entityType: 'lead',
        entityId: lead.id,
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
      const lead = await AppDataSource.getRepository(CrmLead).findOne({ where: { id: req.params.id } });
      if (!lead) {
        res.status(404).json({ error: { message: 'Lead not found' } });
        return;
      }
      assertOrgAccess(req, lead.organizationId);
      const ok = await detachTag({
        entityType: 'lead',
        entityId: lead.id,
        tagId: req.params.tagId
      });
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
