import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { Employee } from '@entities/hr/Employee.js';
import { HrImmigration } from '@entities/hr/HrImmigration.js';
import { HrRtwDocument } from '@entities/hr/HrRtwDocument.js';
import { userIdFromReq } from '@services/hr/hrScope.js';
import { IsNull } from 'typeorm';

const immigrationStatuses = [
  'british_citizen',
  'settled',
  'pre_settled',
  'skilled_worker',
  'student',
  'spouse',
  'other',
  'unknown'
] as const;

const immigrationSchema = z.object({
  employeeId: z.string(),
  status: z.enum(immigrationStatuses).optional(),
  visaType: z.string().max(100).optional().nullable(),
  visaNumber: z.string().max(100).optional().nullable(),
  visaExpiry: z.string().optional().nullable(),
  shareCode: z.string().max(50).optional().nullable(),
  rightToWorkVerified: z.boolean().optional(),
  rightToWorkCheckedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

const rtwSchema = z.object({
  employeeId: z.string(),
  docType: z.enum(['passport', 'brp', 'share_code_check', 'visa', 'birth_certificate', 'other']).optional(),
  documentName: z.string().min(1).max(255),
  s3Key: z.string().max(500).optional().nullable(),
  documentUrl: z.string().max(1000).optional().nullable(),
  verifiedAt: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable()
});

export class ImmigrationController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
      const qb = AppDataSource.getRepository(HrImmigration)
        .createQueryBuilder('i')
        .leftJoinAndSelect('i.employee', 'emp')
        .orderBy('i.visaExpiry', 'ASC')
        .take(take)
        .skip(skip);
      if (employeeId) qb.andWhere('i.employee_id = :employeeId', { employeeId });
      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(HrImmigration).findOne({
        where: { id: req.params.id },
        relations: ['employee']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Immigration record not found' } });
        return;
      }
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async getByEmployee(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(HrImmigration).findOne({
        where: { employeeId: req.params.employeeId },
        relations: ['employee']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Immigration record not found' } });
        return;
      }
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async upsert(req: Request, res: Response): Promise<void> {
    try {
      const parsed = immigrationSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const emp = await AppDataSource.getRepository(Employee).findOne({
        where: { id: parsed.data.employeeId, deletedAt: IsNull() }
      });
      if (!emp) {
        res.status(400).json({ error: { message: 'Invalid employeeId' } });
        return;
      }
      const repo = AppDataSource.getRepository(HrImmigration);
      let item = await repo.findOne({ where: { employeeId: parsed.data.employeeId } });
      const d = parsed.data;
      if (!item) {
        item = repo.create({
          employeeId: d.employeeId,
          status: d.status ?? 'unknown',
          visaType: d.visaType ?? null,
          visaNumber: d.visaNumber ?? null,
          visaExpiry: d.visaExpiry ?? null,
          shareCode: d.shareCode ?? null,
          rightToWorkVerified: d.rightToWorkVerified ?? false,
          rightToWorkCheckedAt: d.rightToWorkCheckedAt ? new Date(d.rightToWorkCheckedAt) : null,
          notes: d.notes ?? null
        });
      } else {
        if (d.status) item.status = d.status;
        if (d.visaType !== undefined) item.visaType = d.visaType;
        if (d.visaNumber !== undefined) item.visaNumber = d.visaNumber;
        if (d.visaExpiry !== undefined) item.visaExpiry = d.visaExpiry;
        if (d.shareCode !== undefined) item.shareCode = d.shareCode;
        if (d.rightToWorkVerified !== undefined) item.rightToWorkVerified = d.rightToWorkVerified;
        if (d.rightToWorkCheckedAt !== undefined) {
          item.rightToWorkCheckedAt = d.rightToWorkCheckedAt ? new Date(d.rightToWorkCheckedAt) : null;
        }
        if (d.notes !== undefined) item.notes = d.notes;
      }
      await repo.save(item);
      const saved = await repo.findOne({ where: { id: item.id }, relations: ['employee'] });
      res.status(item ? 200 : 201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(HrImmigration);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Immigration record not found' } });
        return;
      }
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

export class RtwDocumentsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
      const qb = AppDataSource.getRepository(HrRtwDocument)
        .createQueryBuilder('d')
        .leftJoinAndSelect('d.employee', 'emp')
        .orderBy('d.createdAt', 'DESC')
        .take(take)
        .skip(skip);
      if (employeeId) qb.andWhere('d.employee_id = :employeeId', { employeeId });
      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(HrRtwDocument).findOne({
        where: { id: req.params.id },
        relations: ['employee', 'verifiedBy']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'RTW document not found' } });
        return;
      }
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = rtwSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const emp = await AppDataSource.getRepository(Employee).findOne({
        where: { id: parsed.data.employeeId, deletedAt: IsNull() }
      });
      if (!emp) {
        res.status(400).json({ error: { message: 'Invalid employeeId' } });
        return;
      }
      const repo = AppDataSource.getRepository(HrRtwDocument);
      const d = parsed.data;
      const item = await repo.save(
        repo.create({
          employeeId: d.employeeId,
          docType: d.docType ?? 'other',
          documentName: d.documentName,
          s3Key: d.s3Key ?? null,
          documentUrl: d.documentUrl ?? null,
          verifiedAt: d.verifiedAt ? new Date(d.verifiedAt) : null,
          verifiedById: d.verifiedAt ? userIdFromReq(req) ?? null : null,
          expiresAt: d.expiresAt ?? null,
          notes: d.notes ?? null
        })
      );
      res.status(201).json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = rtwSchema.partial().omit({ employeeId: true }).extend({
        verify: z.boolean().optional()
      }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const repo = AppDataSource.getRepository(HrRtwDocument);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'RTW document not found' } });
        return;
      }
      const d = parsed.data;
      if (d.docType) item.docType = d.docType;
      if (d.documentName) item.documentName = d.documentName;
      if (d.s3Key !== undefined) item.s3Key = d.s3Key;
      if (d.documentUrl !== undefined) item.documentUrl = d.documentUrl;
      if (d.expiresAt !== undefined) item.expiresAt = d.expiresAt;
      if (d.notes !== undefined) item.notes = d.notes;
      if (d.verify || d.verifiedAt) {
        item.verifiedAt = d.verifiedAt ? new Date(d.verifiedAt) : new Date();
        item.verifiedById = userIdFromReq(req) ?? null;
      }
      await repo.save(item);
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(HrRtwDocument);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'RTW document not found' } });
        return;
      }
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
