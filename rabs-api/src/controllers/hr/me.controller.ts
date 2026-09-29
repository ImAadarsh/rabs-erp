import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { Employee } from '@entities/hr/Employee.js';
import { LeaveRequest } from '@entities/hr/LeaveRequest.js';
import { HrLeaveBalance } from '@entities/hr/HrLeaveBalance.js';
import { HrAttendance } from '@entities/hr/HrAttendance.js';
import { HrPayslip } from '@entities/hr/HrPayslip.js';
import { HrTaxDocument } from '@entities/hr/HrTaxDocument.js';
import { HrDocument } from '@entities/hr/HrDocument.js';
import { HrPension } from '@entities/hr/HrPension.js';
import { HrImmigration } from '@entities/hr/HrImmigration.js';
import { HrOnboardingChecklist } from '@entities/hr/HrOnboardingChecklist.js';
import { userIdFromReq } from '@services/hr/hrScope.js';
import { IsNull } from 'typeorm';

async function linkedEmployee(req: Request): Promise<Employee | null> {
  const uid = userIdFromReq(req);
  if (!uid) return null;
  return AppDataSource.getRepository(Employee).findOne({
    where: { user: { id: uid }, deletedAt: IsNull() },
    relations: ['organization', 'user']
  });
}

const patchMeSchema = z.object({
  phone: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  stateProvince: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  countryCode: z.string().length(2).optional().nullable(),
  emergencyContactName: z.string().optional().nullable(),
  emergencyContactPhone: z.string().optional().nullable(),
  emergencyContactRelationship: z.string().optional().nullable()
});

const leaveSelfSchema = z.object({
  leaveType: z.enum([
    'vacation',
    'sick',
    'personal',
    'maternity',
    'paternity',
    'bereavement',
    'unpaid',
    'other'
  ]),
  startDate: z.string(),
  endDate: z.string(),
  totalDays: z.coerce.number(),
  reason: z.string().optional(),
  leavePolicyId: z.string().optional().nullable(),
  notes: z.string().optional()
});

export class MeController {
  static async profile(req: Request, res: Response): Promise<void> {
    try {
      const emp = await linkedEmployee(req);
      if (!emp) {
        res.status(404).json({ error: { message: 'No employee record linked to this user' } });
        return;
      }
      // Self-service: redact NI for response? Still show own NI.
      res.json({ data: emp });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async patchProfile(req: Request, res: Response): Promise<void> {
    try {
      const emp = await linkedEmployee(req);
      if (!emp) {
        res.status(404).json({ error: { message: 'No employee record linked to this user' } });
        return;
      }
      const parsed = patchMeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const d = parsed.data;
      if (d.phone !== undefined) emp.phone = d.phone;
      if (d.addressLine1 !== undefined) emp.addressLine1 = d.addressLine1;
      if (d.addressLine2 !== undefined) emp.addressLine2 = d.addressLine2;
      if (d.city !== undefined) emp.city = d.city;
      if (d.stateProvince !== undefined) emp.stateProvince = d.stateProvince;
      if (d.postalCode !== undefined) emp.postalCode = d.postalCode;
      if (d.countryCode !== undefined) emp.countryCode = d.countryCode;
      if (d.emergencyContactName !== undefined) emp.emergencyContactName = d.emergencyContactName;
      if (d.emergencyContactPhone !== undefined) emp.emergencyContactPhone = d.emergencyContactPhone;
      if (d.emergencyContactRelationship !== undefined) {
        emp.emergencyContactRelationship = d.emergencyContactRelationship;
      }
      await AppDataSource.getRepository(Employee).save(emp);
      res.json({ data: emp });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async leaveRequests(req: Request, res: Response): Promise<void> {
    try {
      const emp = await linkedEmployee(req);
      if (!emp) {
        res.status(404).json({ error: { message: 'No employee record linked to this user' } });
        return;
      }
      const items = await AppDataSource.getRepository(LeaveRequest).find({
        where: { employee: { id: emp.id } },
        order: { createdAt: 'DESC' }
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async createLeaveRequest(req: Request, res: Response): Promise<void> {
    try {
      const emp = await linkedEmployee(req);
      if (!emp) {
        res.status(404).json({ error: { message: 'No employee record linked to this user' } });
        return;
      }
      const parsed = leaveSelfSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const repo = AppDataSource.getRepository(LeaveRequest);
      const item = await repo.save(
        repo.create({
          employee: emp,
          leaveType: parsed.data.leaveType,
          leavePolicyId: parsed.data.leavePolicyId ?? null,
          startDate: new Date(parsed.data.startDate),
          endDate: new Date(parsed.data.endDate),
          totalDays: parsed.data.totalDays,
          reason: parsed.data.reason ?? null,
          status: 'pending',
          notes: parsed.data.notes ?? null
        })
      );
      if (parsed.data.leavePolicyId) {
        const year = new Date(parsed.data.startDate).getFullYear();
        const balRepo = AppDataSource.getRepository(HrLeaveBalance);
        const bal = await balRepo.findOne({
          where: {
            employeeId: emp.id,
            leavePolicyId: parsed.data.leavePolicyId,
            year
          }
        });
        if (bal) {
          bal.pendingDays = Number(bal.pendingDays) + Number(parsed.data.totalDays);
          await balRepo.save(bal);
        }
      }
      res.status(201).json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async leaveBalances(req: Request, res: Response): Promise<void> {
    try {
      const emp = await linkedEmployee(req);
      if (!emp) {
        res.status(404).json({ error: { message: 'No employee record linked to this user' } });
        return;
      }
      const items = await AppDataSource.getRepository(HrLeaveBalance).find({
        where: { employeeId: emp.id },
        relations: ['leavePolicy'],
        order: { year: 'DESC' }
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async attendance(req: Request, res: Response): Promise<void> {
    try {
      const emp = await linkedEmployee(req);
      if (!emp) {
        res.status(404).json({ error: { message: 'No employee record linked to this user' } });
        return;
      }
      const items = await AppDataSource.getRepository(HrAttendance).find({
        where: { employeeId: emp.id },
        order: { workDate: 'DESC' },
        take: 60
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async payslips(req: Request, res: Response): Promise<void> {
    try {
      const emp = await linkedEmployee(req);
      if (!emp) {
        res.status(404).json({ error: { message: 'No employee record linked to this user' } });
        return;
      }
      const items = await AppDataSource.getRepository(HrPayslip).find({
        where: { employeeId: emp.id },
        order: { payPeriodEnd: 'DESC' }
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async taxDocuments(req: Request, res: Response): Promise<void> {
    try {
      const emp = await linkedEmployee(req);
      if (!emp) {
        res.status(404).json({ error: { message: 'No employee record linked to this user' } });
        return;
      }
      const items = await AppDataSource.getRepository(HrTaxDocument).find({
        where: { employeeId: emp.id },
        order: { taxYear: 'DESC' }
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async documents(req: Request, res: Response): Promise<void> {
    try {
      const emp = await linkedEmployee(req);
      if (!emp) {
        res.status(404).json({ error: { message: 'No employee record linked to this user' } });
        return;
      }
      const items = await AppDataSource.getRepository(HrDocument).find({
        where: { employeeId: emp.id },
        order: { createdAt: 'DESC' }
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async pension(req: Request, res: Response): Promise<void> {
    try {
      const emp = await linkedEmployee(req);
      if (!emp) {
        res.status(404).json({ error: { message: 'No employee record linked to this user' } });
        return;
      }
      const item = await AppDataSource.getRepository(HrPension).findOne({
        where: { employeeId: emp.id }
      });
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async immigration(req: Request, res: Response): Promise<void> {
    try {
      const emp = await linkedEmployee(req);
      if (!emp) {
        res.status(404).json({ error: { message: 'No employee record linked to this user' } });
        return;
      }
      const item = await AppDataSource.getRepository(HrImmigration).findOne({
        where: { employeeId: emp.id }
      });
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async onboarding(req: Request, res: Response): Promise<void> {
    try {
      const emp = await linkedEmployee(req);
      if (!emp) {
        res.status(404).json({ error: { message: 'No employee record linked to this user' } });
        return;
      }
      const items = await AppDataSource.getRepository(HrOnboardingChecklist).find({
        where: { employeeId: emp.id },
        order: { sortOrder: 'ASC' }
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
