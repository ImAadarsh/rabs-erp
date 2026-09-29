import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { AccOrgSettings } from '@entities/finance/AccOrgSettings.js';
import { AccVatCode } from '@entities/finance/AccVatCode.js';
import { AccAuditEvent } from '@entities/finance/AccAuditEvent.js';
import { appendAccAudit } from '@services/finance/accAudit.service.js';
import * as reports from '@services/finance/reports.service.js';
import { postExistingJournal } from '@services/finance/journalPosting.service.js';
import { postPayrollRunToLedger, listPayslipsForAccounting } from '@services/finance/payrollJournal.service.js';
import { postSalesInvoice, postSupplierBill } from '@services/finance/documentPosting.service.js';

function orgId(req: Request): string {
  return String(
    req.query.organizationId ||
      req.body?.organizationId ||
      (req as any).user?.orgId ||
      '1'
  );
}

function userId(req: Request): string | null {
  return (req as any).user?.id ? String((req as any).user.id) : null;
}

export class AccDashboardController {
  static async get(req: Request, res: Response): Promise<void> {
    try {
      const data = await reports.dashboardAggregates(orgId(req));
      res.json({ data });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }
}

export class AccSettingsController {
  static async get(req: Request, res: Response): Promise<void> {
    try {
      const oid = orgId(req);
      let row = await AppDataSource.getRepository(AccOrgSettings).findOne({
        where: { organizationId: oid }
      });
      if (!row) {
        row = await AppDataSource.getRepository(AccOrgSettings).save(
          AppDataSource.getRepository(AccOrgSettings).create({
            organizationId: oid,
            organization: { id: oid } as any
          })
        );
      }
      res.json({
        data: {
          ...row,
          mtdNote:
            'MTD = structured VAT box export + placeholder submission. Full live HMRC RTI/VAT requires credentials.'
        }
      });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async upsert(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        vatRegistered: z.boolean().optional(),
        vatNumber: z.string().nullable().optional(),
        vatScheme: z.enum(['standard', 'flat_rate', 'cash_accounting']).optional(),
        flatRatePercent: z.coerce.number().nullable().optional(),
        cashAccountingEnabled: z.boolean().optional(),
        flatRateEnabled: z.boolean().optional(),
        defaultCurrency: z.string().length(3).optional(),
        financialYearStartMonth: z.coerce.number().int().min(1).max(12).optional(),
        hmrcMtdClientId: z.string().nullable().optional(),
        hmrcMtdEnabled: z.boolean().optional(),
        notes: z.string().nullable().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const oid = parsed.data.organizationId || orgId(req);
      const repo = AppDataSource.getRepository(AccOrgSettings);
      let row = await repo.findOne({ where: { organizationId: oid } });
      if (!row) {
        row = repo.create({ organizationId: oid, organization: { id: oid } as any });
      }
      Object.assign(row, {
        vatRegistered: parsed.data.vatRegistered ?? row.vatRegistered,
        vatNumber: parsed.data.vatNumber !== undefined ? parsed.data.vatNumber : row.vatNumber,
        vatScheme: parsed.data.vatScheme ?? row.vatScheme,
        flatRatePercent:
          parsed.data.flatRatePercent !== undefined
            ? parsed.data.flatRatePercent
            : row.flatRatePercent,
        cashAccountingEnabled:
          parsed.data.cashAccountingEnabled ?? row.cashAccountingEnabled,
        flatRateEnabled: parsed.data.flatRateEnabled ?? row.flatRateEnabled,
        defaultCurrency: parsed.data.defaultCurrency ?? row.defaultCurrency,
        financialYearStartMonth:
          parsed.data.financialYearStartMonth ?? row.financialYearStartMonth,
        hmrcMtdClientId:
          parsed.data.hmrcMtdClientId !== undefined
            ? parsed.data.hmrcMtdClientId
            : row.hmrcMtdClientId,
        hmrcMtdEnabled: parsed.data.hmrcMtdEnabled ?? row.hmrcMtdEnabled,
        notes: parsed.data.notes !== undefined ? parsed.data.notes : row.notes
      });
      row = await repo.save(row);
      await appendAccAudit({
        organizationId: oid,
        entityType: 'acc_org_settings',
        entityId: row.id,
        action: 'update',
        actorUserId: userId(req)
      });
      res.json({ data: row });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }
}

export class AccVatCodesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const items = await AppDataSource.getRepository(AccVatCode).find({
        where: { organizationId: orgId(req) },
        order: { code: 'ASC' }
      });
      res.json({ data: items });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        code: z.string().min(1),
        name: z.string().min(1),
        rate: z.coerce.number().nonnegative(),
        isRecoverable: z.boolean().optional(),
        boxSales: z.coerce.number().int().nullable().optional(),
        boxPurchases: z.coerce.number().int().nullable().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const oid = parsed.data.organizationId || orgId(req);
      const repo = AppDataSource.getRepository(AccVatCode);
      const item = await repo.save(
        repo.create({
          organizationId: oid,
          organization: { id: oid } as any,
          code: parsed.data.code,
          name: parsed.data.name,
          rate: parsed.data.rate,
          isRecoverable: parsed.data.isRecoverable ?? true,
          boxSales: parsed.data.boxSales ?? null,
          boxPurchases: parsed.data.boxPurchases ?? null
        })
      );
      res.status(201).json({ data: item });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(AccVatCode);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'VAT code not found' } });
        return;
      }
      const { name, rate, isRecoverable, isActive, boxSales, boxPurchases } = req.body || {};
      if (name !== undefined) item.name = name;
      if (rate !== undefined) item.rate = rate;
      if (isRecoverable !== undefined) item.isRecoverable = isRecoverable;
      if (isActive !== undefined) item.isActive = isActive;
      if (boxSales !== undefined) item.boxSales = boxSales;
      if (boxPurchases !== undefined) item.boxPurchases = boxPurchases;
      await repo.save(item);
      res.json({ data: item });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }
}

export class AccReportsController {
  static async trialBalance(req: Request, res: Response): Promise<void> {
    try {
      const from = String(req.query.from || `${new Date().getFullYear()}-01-01`);
      const to = String(req.query.to || new Date().toISOString().slice(0, 10));
      res.json({ data: await reports.trialBalance({ organizationId: orgId(req), from, to }) });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async profitAndLoss(req: Request, res: Response): Promise<void> {
    try {
      const from = String(req.query.from || `${new Date().getFullYear()}-01-01`);
      const to = String(req.query.to || new Date().toISOString().slice(0, 10));
      res.json({ data: await reports.profitAndLoss({ organizationId: orgId(req), from, to }) });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async balanceSheet(req: Request, res: Response): Promise<void> {
    try {
      const to = String(req.query.to || new Date().toISOString().slice(0, 10));
      res.json({ data: await reports.balanceSheet({ organizationId: orgId(req), to }) });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async cashFlow(req: Request, res: Response): Promise<void> {
    try {
      const from = String(req.query.from || `${new Date().getFullYear()}-01-01`);
      const to = String(req.query.to || new Date().toISOString().slice(0, 10));
      res.json({ data: await reports.cashFlowIndirect({ organizationId: orgId(req), from, to }) });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async agedAr(req: Request, res: Response): Promise<void> {
    try {
      const asOf = String(req.query.asOf || new Date().toISOString().slice(0, 10));
      res.json({ data: await reports.agedReceivables(orgId(req), asOf) });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async agedAp(req: Request, res: Response): Promise<void> {
    try {
      const asOf = String(req.query.asOf || new Date().toISOString().slice(0, 10));
      res.json({ data: await reports.agedPayables(orgId(req), asOf) });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async generalLedger(req: Request, res: Response): Promise<void> {
    try {
      const from = String(req.query.from || `${new Date().getFullYear()}-01-01`);
      const to = String(req.query.to || new Date().toISOString().slice(0, 10));
      const ledgerAccountId = req.query.ledgerAccountId
        ? String(req.query.ledgerAccountId)
        : undefined;
      res.json({
        data: await reports.generalLedger({
          organizationId: orgId(req),
          from,
          to,
          ledgerAccountId
        })
      });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async vatDraft(req: Request, res: Response): Promise<void> {
    try {
      const from = String(req.query.from);
      const to = String(req.query.to);
      if (!from || !to) {
        res.status(400).json({ error: { message: 'from and to query params required' } });
        return;
      }
      res.json({ data: await reports.draftVatReturn({ organizationId: orgId(req), from, to }) });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async vatSaveDraft(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        from: z.string(),
        to: z.string(),
        returnNumber: z.string().min(1)
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const oid = parsed.data.organizationId || orgId(req);
      const row = await reports.saveVatReturnDraft(
        { organizationId: oid, from: parsed.data.from, to: parsed.data.to },
        parsed.data.returnNumber
      );
      res.status(201).json({ data: row });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async vatExport(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(
        (await import('@entities/finance/VatReturn.js')).VatReturn
      );
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'VAT return not found' } });
        return;
      }
      res.json({
        data: {
          boxes: {
            box1: item.box1,
            box2: item.box2,
            box3: item.box3,
            box4: item.box4,
            box5: item.box5,
            box6: item.box6,
            box7: item.box7,
            box8: item.box8,
            box9: item.box9
          },
          exportJson: item.exportJson,
          mtd: {
            support: true,
            liveSubmission: false,
            note: 'Export only until HMRC MTD credentials are configured'
          }
        }
      });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async vatSubmitPlaceholder(req: Request, res: Response): Promise<void> {
    try {
      const { VatReturn } = await import('@entities/finance/VatReturn.js');
      const repo = AppDataSource.getRepository(VatReturn);
      const item = await repo.findOne({ where: { id: req.params.id }, relations: ['organization'] });
      if (!item) {
        res.status(404).json({ error: { message: 'VAT return not found' } });
        return;
      }
      const settings = await AppDataSource.getRepository(AccOrgSettings).findOne({
        where: { organizationId: item.organization.id }
      });
      if (!settings?.hmrcMtdEnabled || !settings.hmrcMtdClientId) {
        res.status(501).json({
          error: {
            message:
              'HMRC MTD live submission not configured. Use VAT box export. Set hmrcMtdEnabled + hmrcMtdClientId when credentials exist.'
          }
        });
        return;
      }
      item.submissionPlaceholder = true;
      item.status = 'submitted';
      item.submittedAt = new Date();
      item.mtdReference = `PLACEHOLDER-${Date.now()}`;
      await repo.save(item);
      await appendAccAudit({
        organizationId: item.organization.id,
        entityType: 'vat_return',
        entityId: item.id,
        action: 'submit',
        actorUserId: userId(req),
        payload: { placeholder: true, mtdReference: item.mtdReference }
      });
      res.json({
        data: item,
        meta: {
          note: 'Placeholder submission recorded — not a live HMRC API call unless keys are wired'
        }
      });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }
}

export class AccPostingController {
  static async postJournal(req: Request, res: Response): Promise<void> {
    try {
      const entry = await postExistingJournal(req.params.id, userId(req));
      await appendAccAudit({
        organizationId: orgId(req),
        entityType: 'journal_entry',
        entityId: entry.id,
        action: 'post',
        actorUserId: userId(req)
      });
      res.json({ data: entry });
    } catch (e: any) {
      res.status(400).json({ error: { message: e.message } });
    }
  }

  static async postInvoice(req: Request, res: Response): Promise<void> {
    try {
      const invoice = await postSalesInvoice(req.params.id, userId(req));
      res.json({ data: invoice });
    } catch (e: any) {
      res.status(400).json({ error: { message: e.message } });
    }
  }

  static async postBill(req: Request, res: Response): Promise<void> {
    try {
      const bill = await postSupplierBill(req.params.id, userId(req));
      res.json({ data: bill });
    } catch (e: any) {
      res.status(400).json({ error: { message: e.message } });
    }
  }

  static async postPayroll(req: Request, res: Response): Promise<void> {
    try {
      const result = await postPayrollRunToLedger(req.params.id, userId(req));
      res.json({ data: result });
    } catch (e: any) {
      res.status(400).json({ error: { message: e.message } });
    }
  }

  static async listPayslips(req: Request, res: Response): Promise<void> {
    try {
      const runId = req.query.payrollRunId ? String(req.query.payrollRunId) : undefined;
      const data = await listPayslipsForAccounting(orgId(req), runId);
      res.json({ data });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }
}

export class AccAuditController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const qb = AppDataSource.getRepository(AccAuditEvent)
        .createQueryBuilder('a')
        .where('a.organization_id = :oid', { oid: orgId(req) })
        .orderBy('a.created_at', 'DESC')
        .take(Math.min(Number(req.query.limit) || 100, 500));
      if (req.query.entityType) {
        qb.andWhere('a.entity_type = :et', { et: String(req.query.entityType) });
      }
      if (req.query.entityId) {
        qb.andWhere('a.entity_id = :eid', { eid: String(req.query.entityId) });
      }
      const data = await qb.getMany();
      res.json({ data });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }
}
