import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { Employee } from '@entities/hr/Employee.js';
import { HrDocument } from '@entities/hr/HrDocument.js';
import { HrPayslip } from '@entities/hr/HrPayslip.js';
import { HrTaxDocument } from '@entities/hr/HrTaxDocument.js';
import { PayrollRun } from '@entities/hr/PayrollRun.js';
import { PayrollLine } from '@entities/hr/PayrollLine.js';
import { HrPension } from '@entities/hr/HrPension.js';
import { userIdFromReq } from '@services/hr/hrScope.js';
import { calculateIllustrativePayeNi } from '@services/hr/payrollCalc.service.js';
import { IsNull } from 'typeorm';

const docSchema = z.object({
  employeeId: z.string(),
  docCategory: z.enum(['contract', 'handbook', 'policy', 'id', 'certificate', 'other']).optional(),
  documentName: z.string().min(1).max(255),
  s3Key: z.string().max(500).optional().nullable(),
  documentUrl: z.string().max(1000).optional().nullable(),
  issueDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable()
});

const payslipSchema = z.object({
  employeeId: z.string(),
  payrollRunId: z.string().optional().nullable(),
  payrollLineId: z.string().optional().nullable(),
  taxYear: z.string().min(4).max(9),
  payPeriodStart: z.string(),
  payPeriodEnd: z.string(),
  paymentDate: z.string().optional().nullable(),
  grossPay: z.coerce.number().optional(),
  taxDeducted: z.coerce.number().optional(),
  niDeducted: z.coerce.number().optional(),
  pensionDeducted: z.coerce.number().optional(),
  netPay: z.coerce.number().optional(),
  s3Key: z.string().optional().nullable(),
  documentUrl: z.string().optional().nullable()
});

const taxDocSchema = z.object({
  employeeId: z.string(),
  docType: z.enum(['P45', 'P60', 'P11D', 'other']),
  taxYear: z.string().min(4).max(9),
  s3Key: z.string().optional().nullable(),
  documentUrl: z.string().optional().nullable(),
  issuedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

export class HrDocumentsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
      const qb = AppDataSource.getRepository(HrDocument)
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

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = docSchema.safeParse(req.body);
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
      const repo = AppDataSource.getRepository(HrDocument);
      const d = parsed.data;
      const item = await repo.save(
        repo.create({
          employeeId: d.employeeId,
          docCategory: d.docCategory ?? 'other',
          documentName: d.documentName,
          s3Key: d.s3Key ?? null,
          documentUrl: d.documentUrl ?? null,
          issueDate: d.issueDate ?? null,
          expiryDate: d.expiryDate ?? null,
          uploadedById: userIdFromReq(req) ?? null,
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
      const parsed = docSchema.partial().omit({ employeeId: true }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const repo = AppDataSource.getRepository(HrDocument);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Document not found' } });
        return;
      }
      Object.assign(item, parsed.data);
      await repo.save(item);
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(HrDocument);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Document not found' } });
        return;
      }
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

export class PayslipsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId, taxYear, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
      const qb = AppDataSource.getRepository(HrPayslip)
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.employee', 'emp')
        .orderBy('p.payPeriodEnd', 'DESC')
        .take(take)
        .skip(skip);
      if (employeeId) qb.andWhere('p.employee_id = :employeeId', { employeeId });
      if (taxYear) qb.andWhere('p.tax_year = :taxYear', { taxYear });
      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = payslipSchema.safeParse(req.body);
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
      const repo = AppDataSource.getRepository(HrPayslip);
      const d = parsed.data;
      const item = await repo.save(
        repo.create({
          employeeId: d.employeeId,
          payrollRunId: d.payrollRunId ?? null,
          payrollLineId: d.payrollLineId ?? null,
          taxYear: d.taxYear,
          payPeriodStart: d.payPeriodStart,
          payPeriodEnd: d.payPeriodEnd,
          paymentDate: d.paymentDate ?? null,
          grossPay: d.grossPay ?? 0,
          taxDeducted: d.taxDeducted ?? 0,
          niDeducted: d.niDeducted ?? 0,
          pensionDeducted: d.pensionDeducted ?? 0,
          netPay: d.netPay ?? 0,
          s3Key: d.s3Key ?? null,
          documentUrl: d.documentUrl ?? null
        })
      );
      res.status(201).json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(HrPayslip);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Payslip not found' } });
        return;
      }
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

export class TaxDocumentsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId, docType, taxYear, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
      const qb = AppDataSource.getRepository(HrTaxDocument)
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.employee', 'emp')
        .orderBy('t.taxYear', 'DESC')
        .take(take)
        .skip(skip);
      if (employeeId) qb.andWhere('t.employee_id = :employeeId', { employeeId });
      if (docType) qb.andWhere('t.doc_type = :docType', { docType });
      if (taxYear) qb.andWhere('t.tax_year = :taxYear', { taxYear });
      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = taxDocSchema.safeParse(req.body);
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
      const repo = AppDataSource.getRepository(HrTaxDocument);
      const d = parsed.data;
      const item = await repo.save(
        repo.create({
          employeeId: d.employeeId,
          docType: d.docType,
          taxYear: d.taxYear,
          s3Key: d.s3Key ?? null,
          documentUrl: d.documentUrl ?? null,
          issuedAt: d.issuedAt ?? null,
          notes: d.notes ?? null
        })
      );
      res.status(201).json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(HrTaxDocument);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Tax document not found' } });
        return;
      }
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

/** Calculate illustrative PAYE/NI lines for a draft payroll run and optionally create payslips. */
export class PayrollCalcController {
  static async calculate(req: Request, res: Response): Promise<void> {
    try {
      const runId = req.params.id;
      const createPayslips = req.body?.createPayslips !== false;
      const taxYear = (req.body?.taxYear as string) || '2025/26';

      const runRepo = AppDataSource.getRepository(PayrollRun);
      const run = await runRepo.findOne({
        where: { id: runId },
        relations: ['organization', 'payrollLines', 'payrollLines.employee']
      });
      if (!run) {
        res.status(404).json({ error: { message: 'Payroll Run not found' } });
        return;
      }

      const lineRepo = AppDataSource.getRepository(PayrollLine);
      const payslipRepo = AppDataSource.getRepository(HrPayslip);
      const pensionRepo = AppDataSource.getRepository(HrPension);

      let lines = run.payrollLines || [];
      if (!lines.length) {
        const employees = await AppDataSource.getRepository(Employee).find({
          where: { organization: { id: run.organization.id }, status: 'active', deletedAt: IsNull() },
          relations: ['organization']
        });
        for (const emp of employees) {
          const gross =
            emp.annualSalary != null
              ? Number(emp.annualSalary) / 12
              : Number(req.body?.defaultGross) || 2500;
          const pension = await pensionRepo.findOne({ where: { employeeId: emp.id } });
          const calc = calculateIllustrativePayeNi({
            grossPay: gross,
            periodFraction: 1 / 12,
            employeePensionPct: pension?.enrolled ? Number(pension.contributionPct) : 0,
            employerPensionPct: pension?.enrolled ? Number(pension.employerContributionPct) : 0
          });
          // Do not set generated columns (total_deductions, net_pay, total_employer_costs)
          const line = await lineRepo.save(
            lineRepo.create({
              payrollRun: run,
              employee: emp,
              grossPay: calc.grossPay,
              taxDeduction: calc.taxDeduction,
              nationalInsurance: calc.nationalInsurance,
              pensionDeduction: calc.pensionDeduction,
              otherDeductions: 0,
              employerNi: calc.employerNi,
              employerPension: calc.employerPension,
              regularHours: 160,
              overtimeHours: 0,
              holidayHours: 0,
              sickHours: 0,
              paymentMethod: 'bank_transfer'
            })
          );
          lines.push(line);
          if (createPayslips) {
            await payslipRepo.save(
              payslipRepo.create({
                employeeId: emp.id,
                payrollRunId: run.id,
                payrollLineId: line.id,
                taxYear,
                payPeriodStart: String(run.periodStart).slice(0, 10),
                payPeriodEnd: String(run.periodEnd).slice(0, 10),
                paymentDate: String(run.paymentDate).slice(0, 10),
                grossPay: calc.grossPay,
                taxDeducted: calc.taxDeduction,
                niDeducted: calc.nationalInsurance,
                pensionDeducted: calc.pensionDeduction,
                netPay: calc.netPay
              })
            );
          }
        }
      } else {
        for (const line of lines) {
          const empId = (line as any).employee?.id || (line as any).employeeId;
          const pension = empId
            ? await pensionRepo.findOne({ where: { employeeId: empId } })
            : null;
          const calc = calculateIllustrativePayeNi({
            grossPay: Number(line.grossPay),
            periodFraction: 1 / 12,
            employeePensionPct: pension?.enrolled ? Number(pension.contributionPct) : 0,
            employerPensionPct: pension?.enrolled ? Number(pension.employerContributionPct) : 0
          });
          line.taxDeduction = calc.taxDeduction;
          line.nationalInsurance = calc.nationalInsurance;
          line.pensionDeduction = calc.pensionDeduction;
          line.employerNi = calc.employerNi;
          line.employerPension = calc.employerPension;
          // total_deductions / net_pay / total_employer_costs are DB-generated
          await lineRepo.save(line);
        }
      }

      lines = await lineRepo.find({ where: { payrollRun: { id: run.id } }, relations: ['employee'] });
      run.totalGross = lines.reduce((s, l) => s + Number(l.grossPay), 0);
      run.totalDeductions = lines.reduce((s, l) => s + Number(l.totalDeductions || 0), 0);
      // total_net is DB-generated from total_gross - total_deductions
      run.totalEmployerCosts = lines.reduce((s, l) => s + Number(l.totalEmployerCosts || 0), 0);
      run.employeeCount = lines.length;
      run.status = 'calculated';
      run.calculatedAt = new Date();
      await runRepo.save(run);

      const sample = calculateIllustrativePayeNi({ grossPay: 2500 });
      res.json({
        data: {
          payrollRun: run,
          lines,
          illustrative: true,
          note: 'PAYE/NI figures are illustrative stubs — not HMRC-certified',
          sampleRates: sample.ratesUsed
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
