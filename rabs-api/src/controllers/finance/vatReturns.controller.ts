import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { VatReturn } from '@entities/finance/VatReturn.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { User } from '@entities/iam/User.js';

const createVatReturnSchema = z.object({
  organizationId: z.string(),
  businessUnitId: z.string().optional(),
  returnNumber: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vatDueSales: z.coerce.number().nonnegative().default(0),
  vatDueAcquisitions: z.coerce.number().nonnegative().default(0),
  vatReclaimed: z.coerce.number().nonnegative().default(0),
  totalValueSales: z.coerce.number().nonnegative().default(0),
  totalValuePurchases: z.coerce.number().nonnegative().default(0),
  totalValueGoodsSupplied: z.coerce.number().nonnegative().default(0),
  totalAcquisitions: z.coerce.number().nonnegative().default(0),
  status: z.enum(['draft', 'submitted', 'accepted', 'rejected']).optional(),
  mtdReference: z.string().optional()
});

const updateVatReturnSchema = z.object({
  businessUnitId: z.string().optional(),
  returnNumber: z.string().min(1).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  vatDueSales: z.coerce.number().nonnegative().optional(),
  vatDueAcquisitions: z.coerce.number().nonnegative().optional(),
  vatReclaimed: z.coerce.number().nonnegative().optional(),
  totalValueSales: z.coerce.number().nonnegative().optional(),
  totalValuePurchases: z.coerce.number().nonnegative().optional(),
  totalValueGoodsSupplied: z.coerce.number().nonnegative().optional(),
  totalAcquisitions: z.coerce.number().nonnegative().optional(),
  status: z.enum(['draft', 'submitted', 'accepted', 'rejected']).optional(),
  mtdReference: z.string().optional()
});

export class VatReturnsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(VatReturn);
      const { organizationId, businessUnitId, status, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('vr')
        .leftJoinAndSelect('vr.organization', 'org')
        .leftJoinAndSelect('vr.businessUnit', 'bu')
        .leftJoinAndSelect('vr.submittedBy', 'submittedBy')
        .orderBy('vr.periodEnd', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('vr.organization_id = :orgId', { orgId: organizationId });
      }

      if (businessUnitId) {
        queryBuilder.andWhere('vr.business_unit_id = :buId', { buId: businessUnitId });
      }

      if (status) {
        queryBuilder.andWhere('vr.status = :status', { status });
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
      const repo = AppDataSource.getRepository(VatReturn);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'businessUnit', 'submittedBy']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'VAT Return not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createVatReturnSchema.safeParse(req.body);
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

      const repo = AppDataSource.getRepository(VatReturn);
      const existing = await repo.findOne({
        where: { returnNumber: parsed.data.returnNumber }
      });
      
      if (existing) {
        res.status(400).json({ error: { message: 'Return number already exists' } });
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

      const item = repo.create({
        organization: org,
        businessUnit: businessUnit ?? undefined,
        returnNumber: parsed.data.returnNumber,
        periodStart: new Date(parsed.data.periodStart),
        periodEnd: new Date(parsed.data.periodEnd),
        vatDueSales: parsed.data.vatDueSales,
        vatDueAcquisitions: parsed.data.vatDueAcquisitions,
        vatReclaimed: parsed.data.vatReclaimed,
        totalValueSales: parsed.data.totalValueSales,
        totalValuePurchases: parsed.data.totalValuePurchases,
        totalValueGoodsSupplied: parsed.data.totalValueGoodsSupplied,
        totalAcquisitions: parsed.data.totalAcquisitions,
        status: parsed.data.status ?? 'draft',
        mtdReference: parsed.data.mtdReference ?? null
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'businessUnit']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateVatReturnSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(VatReturn);
      const item = await repo.findOne({
        where: { id },
        relations: ['organization', 'businessUnit']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'VAT Return not found' } });
        return;
      }

      if (item.status === 'submitted' || item.status === 'accepted') {
        res.status(400).json({ error: { message: 'Cannot update a submitted or accepted VAT return' } });
        return;
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

      if (parsed.data.returnNumber && parsed.data.returnNumber !== item.returnNumber) {
        const existing = await repo.findOne({ where: { returnNumber: parsed.data.returnNumber } });
        if (existing) {
          res.status(400).json({ error: { message: 'Return number already exists' } });
          return;
        }
        item.returnNumber = parsed.data.returnNumber;
      }

      if (parsed.data.periodStart) item.periodStart = new Date(parsed.data.periodStart);
      if (parsed.data.periodEnd) item.periodEnd = new Date(parsed.data.periodEnd);
      if (parsed.data.vatDueSales !== undefined) item.vatDueSales = parsed.data.vatDueSales;
      if (parsed.data.vatDueAcquisitions !== undefined) item.vatDueAcquisitions = parsed.data.vatDueAcquisitions;
      if (parsed.data.vatReclaimed !== undefined) item.vatReclaimed = parsed.data.vatReclaimed;
      if (parsed.data.totalValueSales !== undefined) item.totalValueSales = parsed.data.totalValueSales;
      if (parsed.data.totalValuePurchases !== undefined) item.totalValuePurchases = parsed.data.totalValuePurchases;
      if (parsed.data.totalValueGoodsSupplied !== undefined) item.totalValueGoodsSupplied = parsed.data.totalValueGoodsSupplied;
      if (parsed.data.totalAcquisitions !== undefined) item.totalAcquisitions = parsed.data.totalAcquisitions;
      if (parsed.data.mtdReference !== undefined) item.mtdReference = parsed.data.mtdReference ?? null;

      // Handle submission
      if (parsed.data.status === 'submitted' && item.status === 'draft') {
        const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
        const userRepo = AppDataSource.getRepository(User);
        const submittedBy = await userRepo.findOne({ where: { id: auth.sub } });
        item.submittedBy = submittedBy ?? null;
        item.submittedAt = new Date();
        item.status = 'submitted';
      } else if (parsed.data.status) {
        item.status = parsed.data.status;
      }

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'businessUnit', 'submittedBy']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(VatReturn);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'VAT Return not found' } });
        return;
      }

      if (item.status === 'submitted' || item.status === 'accepted') {
        res.status(400).json({ error: { message: 'Cannot delete a submitted or accepted VAT return' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

