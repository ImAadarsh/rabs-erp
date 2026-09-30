import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { HrJobPosting } from '@entities/hr/HrJobPosting.js';
import { HrApplicant } from '@entities/hr/HrApplicant.js';
import { HrOnboardingChecklist } from '@entities/hr/HrOnboardingChecklist.js';
import { Employee } from '@entities/hr/Employee.js';
import { orgIdFromReq, userIdFromReq } from '@services/hr/hrScope.js';
import { IsNull } from 'typeorm';

const jobSchema = z.object({
  organizationId: z.string().optional(),
  title: z.string().min(1).max(255),
  department: z.string().max(255).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'temporary', 'intern']).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(['draft', 'open', 'closed', 'filled', 'cancelled']).optional(),
  postedAt: z.string().optional().nullable(),
  closesAt: z.string().optional().nullable()
});

const applicantSchema = z.object({
  jobPostingId: z.string(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  stage: z
    .enum(['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'])
    .optional(),
  cvS3Key: z.string().optional().nullable(),
  cvUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  employeeId: z.string().optional().nullable()
});

const onboardSchema = z.object({
  employeeId: z.string(),
  itemKey: z.string().min(1).max(100),
  itemLabel: z.string().min(1).max(255),
  isDone: z.boolean().optional(),
  dueDate: z.string().optional().nullable(),
  sortOrder: z.coerce.number().optional()
});

const DEFAULT_ONBOARD = [
  { itemKey: 'rtw_check', itemLabel: 'Right to Work check completed' },
  { itemKey: 'contract_signed', itemLabel: 'Employment contract signed' },
  { itemKey: 'bank_details', itemLabel: 'Bank details collected' },
  { itemKey: 'pension_letter', itemLabel: 'Pension auto-enrolment letter issued' },
  { itemKey: 'starter_checklist', itemLabel: 'HMRC starter checklist / P45 received' },
  { itemKey: 'it_access', itemLabel: 'IT / systems access provisioned' }
];

export class JobPostingsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const { status, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
      const qb = AppDataSource.getRepository(HrJobPosting)
        .createQueryBuilder('j')
        .where('j.organization_id = :orgId', { orgId })
        .orderBy('j.createdAt', 'DESC')
        .take(take)
        .skip(skip);
      if (status) qb.andWhere('j.status = :status', { status });
      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(HrJobPosting).findOne({
        where: { id: req.params.id }
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Job posting not found' } });
        return;
      }
      const applicants = await AppDataSource.getRepository(HrApplicant).find({
        where: { jobPostingId: item.id },
        order: { createdAt: 'DESC' }
      });
      res.json({ data: { ...item, applicants } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = jobSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const orgId = parsed.data.organizationId || orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const repo = AppDataSource.getRepository(HrJobPosting);
      const d = parsed.data;
      const item = await repo.save(
        repo.create({
          organizationId: orgId,
          title: d.title,
          department: d.department ?? null,
          location: d.location ?? null,
          employmentType: d.employmentType ?? 'full_time',
          description: d.description ?? null,
          status: d.status ?? 'draft',
          postedAt: d.postedAt ?? null,
          closesAt: d.closesAt ?? null,
          createdById: userIdFromReq(req) ?? null
        })
      );
      res.status(201).json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = jobSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const repo = AppDataSource.getRepository(HrJobPosting);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Job posting not found' } });
        return;
      }
      const d = parsed.data;
      if (d.title) item.title = d.title;
      if (d.department !== undefined) item.department = d.department;
      if (d.location !== undefined) item.location = d.location;
      if (d.employmentType) item.employmentType = d.employmentType;
      if (d.description !== undefined) item.description = d.description;
      if (d.status) item.status = d.status;
      if (d.postedAt !== undefined) item.postedAt = d.postedAt;
      if (d.closesAt !== undefined) item.closesAt = d.closesAt;
      await repo.save(item);
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(HrJobPosting);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Job posting not found' } });
        return;
      }
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

export class ApplicantsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { jobPostingId, stage, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
      const qb = AppDataSource.getRepository(HrApplicant)
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.jobPosting', 'job')
        .orderBy('a.createdAt', 'DESC')
        .take(take)
        .skip(skip);
      if (jobPostingId) qb.andWhere('a.job_posting_id = :jobPostingId', { jobPostingId });
      if (stage) qb.andWhere('a.stage = :stage', { stage });
      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = applicantSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const job = await AppDataSource.getRepository(HrJobPosting).findOne({
        where: { id: parsed.data.jobPostingId }
      });
      if (!job) {
        res.status(400).json({ error: { message: 'Invalid jobPostingId' } });
        return;
      }
      const repo = AppDataSource.getRepository(HrApplicant);
      const d = parsed.data;
      const item = await repo.save(
        repo.create({
          jobPostingId: d.jobPostingId,
          firstName: d.firstName,
          lastName: d.lastName,
          email: d.email ?? null,
          phone: d.phone ?? null,
          stage: d.stage ?? 'applied',
          cvS3Key: d.cvS3Key ?? null,
          cvUrl: d.cvUrl ?? null,
          notes: d.notes ?? null,
          employeeId: d.employeeId ?? null
        })
      );
      res.status(201).json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = applicantSchema.partial().omit({ jobPostingId: true }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const repo = AppDataSource.getRepository(HrApplicant);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Applicant not found' } });
        return;
      }
      const d = parsed.data;
      if (d.firstName) item.firstName = d.firstName;
      if (d.lastName) item.lastName = d.lastName;
      if (d.email !== undefined) item.email = d.email;
      if (d.phone !== undefined) item.phone = d.phone;
      if (d.stage) item.stage = d.stage;
      if (d.cvS3Key !== undefined) item.cvS3Key = d.cvS3Key;
      if (d.cvUrl !== undefined) item.cvUrl = d.cvUrl;
      if (d.notes !== undefined) item.notes = d.notes;
      if (d.employeeId !== undefined) item.employeeId = d.employeeId;
      await repo.save(item);
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(HrApplicant);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Applicant not found' } });
        return;
      }
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

export class OnboardingController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId } = req.query;
      if (!employeeId) {
        res.status(400).json({ error: { message: 'employeeId required' } });
        return;
      }
      const items = await AppDataSource.getRepository(HrOnboardingChecklist).find({
        where: { employeeId: String(employeeId) },
        order: { sortOrder: 'ASC', id: 'ASC' }
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async seedDefaults(req: Request, res: Response): Promise<void> {
    try {
      const employeeId = req.body?.employeeId || req.params.employeeId;
      if (!employeeId) {
        res.status(400).json({ error: { message: 'employeeId required' } });
        return;
      }
      const emp = await AppDataSource.getRepository(Employee).findOne({
        where: { id: employeeId, deletedAt: IsNull() }
      });
      if (!emp) {
        res.status(400).json({ error: { message: 'Invalid employeeId' } });
        return;
      }
      const repo = AppDataSource.getRepository(HrOnboardingChecklist);
      const created = [];
      for (let i = 0; i < DEFAULT_ONBOARD.length; i++) {
        const def = DEFAULT_ONBOARD[i];
        let row = await repo.findOne({ where: { employeeId, itemKey: def.itemKey } });
        if (!row) {
          row = await repo.save(
            repo.create({
              employeeId,
              itemKey: def.itemKey,
              itemLabel: def.itemLabel,
              isDone: false,
              sortOrder: i
            })
          );
        }
        created.push(row);
      }
      res.status(201).json({ data: created });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = onboardSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const repo = AppDataSource.getRepository(HrOnboardingChecklist);
      const d = parsed.data;
      const item = await repo.save(
        repo.create({
          employeeId: d.employeeId,
          itemKey: d.itemKey,
          itemLabel: d.itemLabel,
          isDone: d.isDone ?? false,
          dueDate: d.dueDate ?? null,
          sortOrder: d.sortOrder ?? 0,
          completedAt: d.isDone ? new Date() : null,
          completedById: d.isDone ? userIdFromReq(req) ?? null : null
        })
      );
      res.status(201).json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = onboardSchema.partial().omit({ employeeId: true }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const repo = AppDataSource.getRepository(HrOnboardingChecklist);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Checklist item not found' } });
        return;
      }
      const d = parsed.data;
      if (d.itemKey) item.itemKey = d.itemKey;
      if (d.itemLabel) item.itemLabel = d.itemLabel;
      if (d.dueDate !== undefined) item.dueDate = d.dueDate;
      if (d.sortOrder !== undefined) item.sortOrder = d.sortOrder;
      if (d.isDone !== undefined) {
        item.isDone = d.isDone;
        item.completedAt = d.isDone ? new Date() : null;
        item.completedById = d.isDone ? userIdFromReq(req) ?? null : null;
      }
      await repo.save(item);
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
