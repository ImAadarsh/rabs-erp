import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { AccFixedAsset } from '@entities/finance/AccFixedAsset.js';
import { AccDepreciationSchedule } from '@entities/finance/AccDepreciationSchedule.js';
import { AccCtWorksheet } from '@entities/finance/AccCtWorksheet.js';
import { appendAccAudit } from '@services/finance/accAudit.service.js';
import {
  createPostedJournal,
  resolveAccountByCode
} from '@services/finance/journalPosting.service.js';
import { roundMoney } from '@services/finance/vatCalc.service.js';

function orgId(req: Request): string {
  return String(req.query.organizationId || req.body?.organizationId || (req as any).user?.orgId || '1');
}
function userId(req: Request): string | null {
  return (req as any).user?.id ? String((req as any).user.id) : null;
}

function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

export class AccFixedAssetsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const data = await AppDataSource.getRepository(AccFixedAsset).find({
        where: { organizationId: orgId(req) },
        relations: ['schedule'],
        order: { assetCode: 'ASC' }
      });
      res.json({ data });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(AccFixedAsset).findOne({
        where: { id: req.params.id },
        relations: ['schedule', 'costAccount', 'accumDeprAccount', 'deprExpenseAccount']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Asset not found' } });
        return;
      }
      res.json({ data: item });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        assetCode: z.string().min(1),
        name: z.string().min(1),
        purchaseDate: z.string(),
        purchaseCost: z.coerce.number().positive(),
        residualValue: z.coerce.number().optional(),
        usefulLifeMonths: z.coerce.number().int().positive().optional(),
        depreciationMethod: z.enum(['straight_line', 'reducing_balance']).optional(),
        reducingRate: z.coerce.number().optional().nullable(),
        costAccountId: z.string().optional().nullable(),
        accumDeprAccountId: z.string().optional().nullable(),
        deprExpenseAccountId: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        generateSchedule: z.boolean().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const oid = parsed.data.organizationId || orgId(req);
      const costAcct =
        parsed.data.costAccountId ||
        (await resolveAccountByCode(oid, '1500'))?.id ||
        null;
      const accumAcct =
        parsed.data.accumDeprAccountId ||
        (await resolveAccountByCode(oid, '1510'))?.id ||
        null;
      const deprAcct =
        parsed.data.deprExpenseAccountId ||
        (await resolveAccountByCode(oid, '6500'))?.id ||
        null;

      const repo = AppDataSource.getRepository(AccFixedAsset);
      const asset = await repo.save(
        repo.create({
          organizationId: oid,
          assetCode: parsed.data.assetCode,
          name: parsed.data.name,
          purchaseDate: new Date(parsed.data.purchaseDate),
          purchaseCost: parsed.data.purchaseCost,
          residualValue: parsed.data.residualValue ?? 0,
          usefulLifeMonths: parsed.data.usefulLifeMonths ?? 36,
          depreciationMethod: parsed.data.depreciationMethod ?? 'straight_line',
          reducingRate: parsed.data.reducingRate ?? null,
          costAccountId: costAcct,
          accumDeprAccountId: accumAcct,
          deprExpenseAccountId: deprAcct,
          notes: parsed.data.notes ?? null,
          status: 'active'
        })
      );

      if (parsed.data.generateSchedule !== false) {
        const months = asset.usefulLifeMonths;
        const depreciable = Number(asset.purchaseCost) - Number(asset.residualValue);
        const monthly =
          asset.depreciationMethod === 'straight_line'
            ? roundMoney(depreciable / months)
            : roundMoney((Number(asset.purchaseCost) * Number(asset.reducingRate || 0.25)) / 12);
        const schedRepo = AppDataSource.getRepository(AccDepreciationSchedule);
        let start = new Date(asset.purchaseDate);
        let remaining = depreciable;
        for (let i = 0; i < months && remaining > 0.01; i++) {
          const end = addMonths(start, 1);
          end.setDate(end.getDate() - 1);
          let amount = monthly;
          if (asset.depreciationMethod === 'straight_line' && i === months - 1) {
            amount = roundMoney(remaining);
          } else {
            amount = Math.min(amount, remaining);
          }
          remaining = roundMoney(remaining - amount);
          await schedRepo.save(
            schedRepo.create({
              assetId: asset.id,
              periodStart: start,
              periodEnd: end,
              amount,
              status: 'scheduled'
            })
          );
          start = addMonths(new Date(asset.purchaseDate), i + 1);
        }
      }

      await appendAccAudit({
        organizationId: oid,
        entityType: 'fixed_asset',
        entityId: asset.id,
        action: 'create',
        actorUserId: userId(req)
      });

      res.status(201).json({
        data: await repo.findOne({ where: { id: asset.id }, relations: ['schedule'] })
      });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async postDepreciation(req: Request, res: Response): Promise<void> {
    try {
      const schedRepo = AppDataSource.getRepository(AccDepreciationSchedule);
      const row = await schedRepo.findOne({
        where: { id: req.params.scheduleId },
        relations: ['asset']
      });
      if (!row || !row.asset) {
        res.status(404).json({ error: { message: 'Schedule row not found' } });
        return;
      }
      if (row.status === 'posted') {
        res.status(400).json({ error: { message: 'Already posted' } });
        return;
      }
      const asset = row.asset;
      if (!asset.deprExpenseAccountId || !asset.accumDeprAccountId) {
        res.status(400).json({ error: { message: 'Asset missing depreciation accounts' } });
        return;
      }
      const je = await createPostedJournal({
        organizationId: asset.organizationId,
        entryDate: row.periodEnd,
        description: `Depreciation ${asset.assetCode}`,
        reference: asset.assetCode,
        sourceType: 'other',
        sourceId: asset.id,
        lines: [
          {
            ledgerAccountId: asset.deprExpenseAccountId,
            description: 'Depreciation expense',
            debitAmount: Number(row.amount),
            creditAmount: 0
          },
          {
            ledgerAccountId: asset.accumDeprAccountId,
            description: 'Accumulated depreciation',
            debitAmount: 0,
            creditAmount: Number(row.amount)
          }
        ],
        postedByUserId: userId(req)
      });
      row.status = 'posted';
      row.postedAt = new Date();
      row.journalEntryId = je.id;
      await schedRepo.save(row);
      res.json({ data: row });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async dispose(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        disposedAt: z.string(),
        proceeds: z.coerce.number().nonnegative().default(0)
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const repo = AppDataSource.getRepository(AccFixedAsset);
      const asset = await repo.findOne({
        where: { id: req.params.id },
        relations: ['schedule']
      });
      if (!asset) {
        res.status(404).json({ error: { message: 'Asset not found' } });
        return;
      }
      const postedDepr = (asset.schedule || [])
        .filter((s) => s.status === 'posted')
        .reduce((s, r) => s + Number(r.amount), 0);
      const nbv = roundMoney(Number(asset.purchaseCost) - postedDepr);
      const proceeds = roundMoney(parsed.data.proceeds);
      const gainLoss = roundMoney(proceeds - nbv);

      const bank = await resolveAccountByCode(asset.organizationId, '1000');
      const cost = asset.costAccountId;
      const accum = asset.accumDeprAccountId;
      const plAcct =
        (await resolveAccountByCode(asset.organizationId, gainLoss >= 0 ? '4100' : '6600'))?.id;
      if (!bank || !cost || !accum || !plAcct) {
        res.status(400).json({ error: { message: 'Missing accounts for disposal journal' } });
        return;
      }

      const lines = [
        {
          ledgerAccountId: bank.id,
          description: 'Disposal proceeds',
          debitAmount: proceeds,
          creditAmount: 0
        },
        {
          ledgerAccountId: accum,
          description: 'Clear accum depr',
          debitAmount: postedDepr,
          creditAmount: 0
        },
        {
          ledgerAccountId: cost,
          description: 'Clear asset cost',
          debitAmount: 0,
          creditAmount: Number(asset.purchaseCost)
        }
      ];
      if (gainLoss >= 0) {
        lines.push({
          ledgerAccountId: plAcct,
          description: 'Gain on disposal',
          debitAmount: 0,
          creditAmount: gainLoss
        });
      } else {
        lines.push({
          ledgerAccountId: plAcct,
          description: 'Loss on disposal',
          debitAmount: Math.abs(gainLoss),
          creditAmount: 0
        });
      }

      const je = await createPostedJournal({
        organizationId: asset.organizationId,
        entryDate: parsed.data.disposedAt,
        description: `Dispose ${asset.assetCode}`,
        reference: asset.assetCode,
        sourceType: 'other',
        sourceId: asset.id,
        lines,
        postedByUserId: userId(req)
      });

      asset.status = 'disposed';
      asset.disposedAt = new Date(parsed.data.disposedAt);
      asset.disposalProceeds = proceeds;
      asset.disposalJournalId = je.id;
      await repo.save(asset);

      await appendAccAudit({
        organizationId: asset.organizationId,
        entityType: 'fixed_asset',
        entityId: asset.id,
        action: 'dispose',
        actorUserId: userId(req),
        payload: { proceeds, nbv, gainLoss, journalEntryId: je.id }
      });

      res.json({ data: asset });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }
}

export class AccCtController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const data = await AppDataSource.getRepository(AccCtWorksheet).find({
        where: { organizationId: orgId(req) },
        order: { periodEnd: 'DESC' }
      });
      res.json({ data });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async upsert(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        id: z.string().optional(),
        organizationId: z.string().optional(),
        periodStart: z.string(),
        periodEnd: z.string(),
        accountingProfit: z.coerce.number().optional(),
        addBacks: z.coerce.number().optional(),
        deductions: z.coerce.number().optional(),
        capitalAllowances: z.coerce.number().optional(),
        ctRate: z.coerce.number().optional(),
        adjustmentsJson: z.record(z.unknown()).optional().nullable(),
        notes: z.string().optional().nullable(),
        status: z.enum(['draft', 'finalised']).optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const oid = parsed.data.organizationId || orgId(req);
      const repo = AppDataSource.getRepository(AccCtWorksheet);
      let row = parsed.data.id
        ? await repo.findOne({ where: { id: parsed.data.id } })
        : null;
      if (!row) {
        row = repo.create({
          organizationId: oid,
          periodStart: new Date(parsed.data.periodStart),
          periodEnd: new Date(parsed.data.periodEnd),
          createdBy: userId(req)
        });
      }
      row.periodStart = new Date(parsed.data.periodStart);
      row.periodEnd = new Date(parsed.data.periodEnd);
      row.accountingProfit = parsed.data.accountingProfit ?? row.accountingProfit ?? 0;
      row.addBacks = parsed.data.addBacks ?? row.addBacks ?? 0;
      row.deductions = parsed.data.deductions ?? row.deductions ?? 0;
      row.capitalAllowances = parsed.data.capitalAllowances ?? row.capitalAllowances ?? 0;
      row.ctRate = parsed.data.ctRate ?? row.ctRate ?? 0.25;
      row.adjustmentsJson =
        parsed.data.adjustmentsJson !== undefined
          ? (parsed.data.adjustmentsJson as any)
          : row.adjustmentsJson;
      row.notes = parsed.data.notes !== undefined ? parsed.data.notes : row.notes;
      if (parsed.data.status) row.status = parsed.data.status;

      row.taxableProfit = roundMoney(
        Number(row.accountingProfit) +
          Number(row.addBacks) -
          Number(row.deductions) -
          Number(row.capitalAllowances)
      );
      row.estimatedCt = roundMoney(Math.max(0, Number(row.taxableProfit)) * Number(row.ctRate));

      row = await repo.save(row);
      res.json({
        data: row,
        meta: {
          note: 'CT worksheet support data only — not a full CT600 filing'
        }
      });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }
}
