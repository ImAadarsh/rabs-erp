import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { PayrollLine } from '@entities/hr/PayrollLine.js';
import { z } from 'zod';
import { PayrollRun } from '@entities/hr/PayrollRun.js';
import { Employee } from '@entities/hr/Employee.js';
import { CostCenter } from '@entities/finance/CostCenter.js';

const createPayrollLineSchema = z.object({
  payrollRunId: z.string(),
  employeeId: z.string(),
  costCenterId: z.string().optional(),
  grossPay: z.coerce.number(),
  taxDeduction: z.coerce.number().optional(),
  nationalInsurance: z.coerce.number().optional(),
  pensionDeduction: z.coerce.number().optional(),
  otherDeductions: z.coerce.number().optional(),
  employerNi: z.coerce.number().optional(),
  employerPension: z.coerce.number().optional(),
  regularHours: z.coerce.number().optional(),
  overtimeHours: z.coerce.number().optional(),
  holidayHours: z.coerce.number().optional(),
  sickHours: z.coerce.number().optional(),
  paymentMethod: z.enum(['bank_transfer', 'check', 'cash', 'paypal']).optional(),
  payslipUrl: z.string().optional(),
  notes: z.string().optional()
});

const updatePayrollLineSchema = z.object({
  costCenterId: z.string().optional(),
  grossPay: z.coerce.number().optional(),
  taxDeduction: z.coerce.number().optional(),
  nationalInsurance: z.coerce.number().optional(),
  pensionDeduction: z.coerce.number().optional(),
  otherDeductions: z.coerce.number().optional(),
  employerNi: z.coerce.number().optional(),
  employerPension: z.coerce.number().optional(),
  regularHours: z.coerce.number().optional(),
  overtimeHours: z.coerce.number().optional(),
  holidayHours: z.coerce.number().optional(),
  sickHours: z.coerce.number().optional(),
  paymentMethod: z.enum(['bank_transfer', 'check', 'cash', 'paypal']).optional(),
  payslipUrl: z.string().optional(),
  notes: z.string().optional()
});

export class PayrollLinesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(PayrollLine);
      const { payrollRunId, employeeId, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('pl')
        .leftJoinAndSelect('pl.payrollRun', 'pr')
        .leftJoinAndSelect('pl.employee', 'emp')
        .leftJoinAndSelect('pl.costCenter', 'cc')
        .orderBy('pl.createdAt', 'DESC');

      if (payrollRunId) {
        queryBuilder.andWhere('pl.payroll_run_id = :prId', { prId: payrollRunId });
      }

      if (employeeId) {
        queryBuilder.andWhere('pl.employee_id = :empId', { empId: employeeId });
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
      const repo = AppDataSource.getRepository(PayrollLine);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['payrollRun', 'employee', 'costCenter']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Payroll Line not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createPayrollLineSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const prRepo = AppDataSource.getRepository(PayrollRun);
      const payrollRun = await prRepo.findOne({ where: { id: parsed.data.payrollRunId } });
      if (!payrollRun) {
        res.status(400).json({ error: { message: 'Invalid payrollRunId' } });
        return;
      }

      const empRepo = AppDataSource.getRepository(Employee);
      const employee = await empRepo.findOne({ where: { id: parsed.data.employeeId } });
      if (!employee) {
        res.status(400).json({ error: { message: 'Invalid employeeId' } });
        return;
      }

      const repo = AppDataSource.getRepository(PayrollLine);
      let costCenter = null;
      
      if (parsed.data.costCenterId) {
        const ccRepo = AppDataSource.getRepository(CostCenter);
        costCenter = await ccRepo.findOne({ where: { id: parsed.data.costCenterId } });
      }

      const item = repo.create({
        payrollRun,
        employee,
        costCenter: costCenter ?? undefined,
        grossPay: parsed.data.grossPay,
        taxDeduction: parsed.data.taxDeduction ?? 0.00,
        nationalInsurance: parsed.data.nationalInsurance ?? 0.00,
        pensionDeduction: parsed.data.pensionDeduction ?? 0.00,
        otherDeductions: parsed.data.otherDeductions ?? 0.00,
        employerNi: parsed.data.employerNi ?? 0.00,
        employerPension: parsed.data.employerPension ?? 0.00,
        regularHours: parsed.data.regularHours ?? 0.00,
        overtimeHours: parsed.data.overtimeHours ?? 0.00,
        holidayHours: parsed.data.holidayHours ?? 0.00,
        sickHours: parsed.data.sickHours ?? 0.00,
        paymentMethod: parsed.data.paymentMethod ?? 'bank_transfer',
        payslipUrl: parsed.data.payslipUrl ?? null,
        notes: parsed.data.notes ?? null
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['payrollRun', 'employee', 'costCenter']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updatePayrollLineSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(PayrollLine);
      const item = await repo.findOne({
        where: { id },
        relations: ['payrollRun', 'employee', 'costCenter']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Payroll Line not found' } });
        return;
      }

      if (parsed.data.costCenterId !== undefined) {
        if (parsed.data.costCenterId) {
          const ccRepo = AppDataSource.getRepository(CostCenter);
          const costCenter = await ccRepo.findOne({ where: { id: parsed.data.costCenterId } });
          item.costCenter = costCenter ?? null;
        } else {
          item.costCenter = null;
        }
      }

      if (parsed.data.grossPay !== undefined) item.grossPay = parsed.data.grossPay;
      if (parsed.data.taxDeduction !== undefined) item.taxDeduction = parsed.data.taxDeduction ?? 0.00;
      if (parsed.data.nationalInsurance !== undefined) item.nationalInsurance = parsed.data.nationalInsurance ?? 0.00;
      if (parsed.data.pensionDeduction !== undefined) item.pensionDeduction = parsed.data.pensionDeduction ?? 0.00;
      if (parsed.data.otherDeductions !== undefined) item.otherDeductions = parsed.data.otherDeductions ?? 0.00;
      if (parsed.data.employerNi !== undefined) item.employerNi = parsed.data.employerNi ?? 0.00;
      if (parsed.data.employerPension !== undefined) item.employerPension = parsed.data.employerPension ?? 0.00;
      if (parsed.data.regularHours !== undefined) item.regularHours = parsed.data.regularHours ?? 0.00;
      if (parsed.data.overtimeHours !== undefined) item.overtimeHours = parsed.data.overtimeHours ?? 0.00;
      if (parsed.data.holidayHours !== undefined) item.holidayHours = parsed.data.holidayHours ?? 0.00;
      if (parsed.data.sickHours !== undefined) item.sickHours = parsed.data.sickHours ?? 0.00;
      if (parsed.data.paymentMethod) item.paymentMethod = parsed.data.paymentMethod;
      if (parsed.data.payslipUrl !== undefined) item.payslipUrl = parsed.data.payslipUrl ?? null;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes ?? null;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['payrollRun', 'employee', 'costCenter']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(PayrollLine);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Payroll Line not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

