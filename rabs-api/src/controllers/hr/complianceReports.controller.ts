import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Employee } from '@entities/hr/Employee.js';
import { HrImmigration } from '@entities/hr/HrImmigration.js';
import { HrComplianceAlert } from '@entities/hr/HrComplianceAlert.js';
import { LeaveRequest } from '@entities/hr/LeaveRequest.js';
import { HrSickEpisode } from '@entities/hr/HrSickEpisode.js';
import { HrPension } from '@entities/hr/HrPension.js';
import { HrJobPosting } from '@entities/hr/HrJobPosting.js';
import { HrApplicant } from '@entities/hr/HrApplicant.js';
import { orgIdFromReq } from '@services/hr/hrScope.js';
import { stubVisaReminderEmail } from '@services/hr/payrollCalc.service.js';
import { IsNull } from 'typeorm';

export class ComplianceController {
  /** Visa expiry within N days — also upserts open compliance alerts + stub reminders. */
  static async visaExpiring(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const withinDays = Math.min(Math.max(Number(req.query.withinDays) || 90, 1), 365);
      const today = new Date();
      const until = new Date(today);
      until.setDate(until.getDate() + withinDays);
      const todayStr = today.toISOString().slice(0, 10);
      const untilStr = until.toISOString().slice(0, 10);

      const rows = await AppDataSource.getRepository(HrImmigration)
        .createQueryBuilder('i')
        .innerJoinAndSelect('i.employee', 'emp')
        .where('emp.organization_id = :orgId', { orgId })
        .andWhere('emp.deleted_at IS NULL')
        .andWhere('i.visa_expiry IS NOT NULL')
        .andWhere('i.visa_expiry >= :today', { today: todayStr })
        .andWhere('i.visa_expiry <= :until', { until: untilStr })
        .orderBy('i.visa_expiry', 'ASC')
        .getMany();

      const alertRepo = AppDataSource.getRepository(HrComplianceAlert);
      const alerts = [];
      for (const row of rows) {
        const expiry = String(row.visaExpiry).slice(0, 10);
        const daysUntil = Math.ceil(
          (new Date(expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        stubVisaReminderEmail({
          employeeId: row.employeeId,
          email: row.employee?.email ?? null,
          visaExpiry: expiry,
          daysUntil
        });

        let alert = await alertRepo.findOne({
          where: {
            organizationId: orgId,
            employeeId: row.employeeId,
            alertType: 'visa_expiry',
            dueDate: expiry,
            status: 'open'
          }
        });
        if (!alert) {
          alert = await alertRepo.save(
            alertRepo.create({
              organizationId: orgId,
              employeeId: row.employeeId,
              alertType: 'visa_expiry',
              severity: daysUntil <= 30 ? 'critical' : 'warning',
              title: `Visa expiring: ${row.employee?.firstName} ${row.employee?.lastName}`,
              message: `Visa/immigration status expires on ${expiry} (in ${daysUntil} days).`,
              dueDate: expiry,
              status: 'open',
              reminderSentAt: new Date()
            })
          );
        } else {
          alert.reminderSentAt = new Date();
          await alertRepo.save(alert);
        }
        alerts.push(alert);
      }

      res.json({
        data: {
          withinDays,
          count: rows.length,
          expiring: rows.map((r) => ({
            immigrationId: r.id,
            employeeId: r.employeeId,
            employeeName: `${r.employee?.firstName ?? ''} ${r.employee?.lastName ?? ''}`.trim(),
            email: r.employee?.email ?? null,
            status: r.status,
            visaType: r.visaType,
            visaExpiry: r.visaExpiry,
            shareCode: r.shareCode
          })),
          alerts
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async listAlerts(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const { status = 'open', page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
      const qb = AppDataSource.getRepository(HrComplianceAlert)
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.employee', 'emp')
        .where('a.organization_id = :orgId', { orgId })
        .orderBy('a.dueDate', 'ASC')
        .take(take)
        .skip(skip);
      if (status) qb.andWhere('a.status = :status', { status });
      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async updateAlert(req: Request, res: Response): Promise<void> {
    try {
      const status = req.body?.status as HrComplianceAlert['status'] | undefined;
      const repo = AppDataSource.getRepository(HrComplianceAlert);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Alert not found' } });
        return;
      }
      if (status) {
        item.status = status;
        if (status === 'resolved' || status === 'dismissed') item.resolvedAt = new Date();
      }
      await repo.save(item);
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

export class HrReportsController {
  static async summary(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }

      const empRepo = AppDataSource.getRepository(Employee);
      const active = await empRepo.count({
        where: { organization: { id: orgId }, status: 'active', deletedAt: IsNull() }
      });
      const onLeave = await empRepo.count({
        where: { organization: { id: orgId }, status: 'on_leave', deletedAt: IsNull() }
      });
      const terminated = await empRepo.count({
        where: { organization: { id: orgId }, status: 'terminated', deletedAt: IsNull() }
      });

      const pendingLeave = await AppDataSource.getRepository(LeaveRequest)
        .createQueryBuilder('lr')
        .innerJoin('lr.employee', 'emp')
        .where('emp.organization_id = :orgId', { orgId })
        .andWhere('lr.status = :st', { st: 'pending' })
        .getCount();

      const openSick = await AppDataSource.getRepository(HrSickEpisode)
        .createQueryBuilder('s')
        .innerJoin('s.employee', 'emp')
        .where('emp.organization_id = :orgId', { orgId })
        .andWhere('s.status = :st', { st: 'open' })
        .getCount();

      const notEnrolled = await AppDataSource.getRepository(HrPension)
        .createQueryBuilder('p')
        .innerJoin('p.employee', 'emp')
        .where('emp.organization_id = :orgId', { orgId })
        .andWhere('p.eligible = 1')
        .andWhere('p.enrolled = 0')
        .getCount();

      const openJobs = await AppDataSource.getRepository(HrJobPosting).count({
        where: { organizationId: orgId, status: 'open' }
      });
      const applicants = await AppDataSource.getRepository(HrApplicant)
        .createQueryBuilder('a')
        .innerJoin('a.jobPosting', 'j')
        .where('j.organization_id = :orgId', { orgId })
        .andWhere('a.stage NOT IN (:...done)', { done: ['hired', 'rejected', 'withdrawn'] })
        .getCount();

      const openAlerts = await AppDataSource.getRepository(HrComplianceAlert).count({
        where: { organizationId: orgId, status: 'open' }
      });

      const withinDays = 90;
      const until = new Date();
      until.setDate(until.getDate() + withinDays);
      const visasExpiring = await AppDataSource.getRepository(HrImmigration)
        .createQueryBuilder('i')
        .innerJoin('i.employee', 'emp')
        .where('emp.organization_id = :orgId', { orgId })
        .andWhere('i.visa_expiry IS NOT NULL')
        .andWhere('i.visa_expiry <= :until', { until: until.toISOString().slice(0, 10) })
        .andWhere('i.visa_expiry >= CURDATE()')
        .getCount();

      res.json({
        data: {
          headcount: { active, onLeave, terminated, total: active + onLeave + terminated },
          pendingLeaveRequests: pendingLeave,
          openSickEpisodes: openSick,
          pensionEligibleNotEnrolled: notEnrolled,
          recruitment: { openJobs, activeApplicants: applicants },
          compliance: { openAlerts, visasExpiringWithin90Days: visasExpiring },
          asOf: new Date().toISOString()
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
