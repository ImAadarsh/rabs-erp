import { Router } from 'express';
import { EmployeesController } from '@controllers/hr/employees.controller.js';
import { EmploymentContractsController } from '@controllers/hr/employmentContracts.controller.js';
import { EmployeeDocumentsController } from '@controllers/hr/employeeDocuments.controller.js';
import { TimeEntriesController } from '@controllers/hr/timeEntries.controller.js';
import { LeaveRequestsController } from '@controllers/hr/leaveRequests.controller.js';
import { ShiftsController } from '@controllers/hr/shifts.controller.js';
import { PayrollRunsController } from '@controllers/hr/payrollRuns.controller.js';
import { PayrollLinesController } from '@controllers/hr/payrollLines.controller.js';
import { TasksController } from '@controllers/hr/tasks.controller.js';
import { KpiDefinitionsController } from '@controllers/hr/kpiDefinitions.controller.js';
import { KpiRecordsController } from '@controllers/hr/kpiRecords.controller.js';
import {
  ImmigrationController,
  RtwDocumentsController
} from '@controllers/hr/immigration.controller.js';
import {
  LeavePoliciesController,
  LeaveBalancesController,
  LeaveActionsController
} from '@controllers/hr/leaveUk.controller.js';
import {
  AttendanceController,
  OvertimeController,
  SickEpisodesController,
  PensionController
} from '@controllers/hr/attendanceUk.controller.js';
import {
  HrDocumentsController,
  PayslipsController,
  TaxDocumentsController,
  PayrollCalcController
} from '@controllers/hr/documentsPayslips.controller.js';
import {
  JobPostingsController,
  ApplicantsController,
  OnboardingController
} from '@controllers/hr/recruitment.controller.js';
import {
  ComplianceController,
  HrReportsController
} from '@controllers/hr/complianceReports.controller.js';
import { MeController } from '@controllers/hr/me.controller.js';
import { authMiddleware } from '@middlewares/auth.js';
import { auditMiddleware } from '@middlewares/audit.js';
import { requireRoles } from '@middlewares/rbac.js';
import { HR_STAFF_ROLES, HR_WRITE_ROLES, HR_PAYROLL_ROLES } from '@services/hr/hrScope.js';

export const hrRouter = Router();

const staff = [...HR_STAFF_ROLES];
const write = [...HR_WRITE_ROLES, 'HR_MANAGER'] as const;
const payroll = [...HR_PAYROLL_ROLES];

hrRouter.use(authMiddleware);
hrRouter.use(auditMiddleware);

// ——— Self-service (any authenticated user linked to an employee) ———
hrRouter.get('/me', MeController.profile);
hrRouter.patch('/me', MeController.patchProfile);
hrRouter.get('/me/leave-requests', MeController.leaveRequests);
hrRouter.post('/me/leave-requests', MeController.createLeaveRequest);
hrRouter.get('/me/leave-balances', MeController.leaveBalances);
hrRouter.get('/me/attendance', MeController.attendance);
hrRouter.get('/me/payslips', MeController.payslips);
hrRouter.get('/me/tax-documents', MeController.taxDocuments);
hrRouter.get('/me/documents', MeController.documents);
hrRouter.get('/me/pension', MeController.pension);
hrRouter.get('/me/immigration', MeController.immigration);
hrRouter.get('/me/onboarding', MeController.onboarding);

// ——— Compliance & reports ———
hrRouter.get('/compliance/visa-expiring', requireRoles(...staff), ComplianceController.visaExpiring);
hrRouter.get('/compliance/alerts', requireRoles(...staff), ComplianceController.listAlerts);
hrRouter.patch('/compliance/alerts/:id', requireRoles(...write), ComplianceController.updateAlert);
hrRouter.get('/reports/summary', requireRoles(...staff), HrReportsController.summary);

// ——— Employees (legacy + UK fields) ———
hrRouter.get('/employees', requireRoles(...staff), EmployeesController.list);
hrRouter.get('/employees/:id', requireRoles(...staff), EmployeesController.get);
hrRouter.post('/employees', requireRoles(...write), EmployeesController.create);
hrRouter.patch('/employees/:id', requireRoles(...write), EmployeesController.update);
hrRouter.delete('/employees/:id', requireRoles(...HR_WRITE_ROLES), EmployeesController.remove);

hrRouter.get('/employment-contracts', requireRoles(...staff), EmploymentContractsController.list);
hrRouter.get('/employment-contracts/:id', requireRoles(...staff), EmploymentContractsController.get);
hrRouter.post('/employment-contracts', requireRoles(...write), EmploymentContractsController.create);
hrRouter.patch('/employment-contracts/:id', requireRoles(...write), EmploymentContractsController.update);
hrRouter.delete('/employment-contracts/:id', requireRoles(...HR_WRITE_ROLES), EmploymentContractsController.remove);

hrRouter.get('/employee-documents', requireRoles(...staff), EmployeeDocumentsController.list);
hrRouter.get('/employee-documents/:id', requireRoles(...staff), EmployeeDocumentsController.get);
hrRouter.post('/employee-documents', requireRoles(...write), EmployeeDocumentsController.create);
hrRouter.patch('/employee-documents/:id', requireRoles(...write), EmployeeDocumentsController.update);
hrRouter.delete('/employee-documents/:id', requireRoles(...HR_WRITE_ROLES), EmployeeDocumentsController.remove);

// ——— Immigration / RTW ———
hrRouter.get('/immigration', requireRoles(...staff), ImmigrationController.list);
hrRouter.get('/immigration/employee/:employeeId', requireRoles(...staff), ImmigrationController.getByEmployee);
hrRouter.get('/immigration/:id', requireRoles(...staff), ImmigrationController.get);
hrRouter.post('/immigration', requireRoles(...write), ImmigrationController.upsert);
hrRouter.put('/immigration', requireRoles(...write), ImmigrationController.upsert);
hrRouter.delete('/immigration/:id', requireRoles(...HR_WRITE_ROLES), ImmigrationController.remove);

hrRouter.get('/rtw-documents', requireRoles(...staff), RtwDocumentsController.list);
hrRouter.get('/rtw-documents/:id', requireRoles(...staff), RtwDocumentsController.get);
hrRouter.post('/rtw-documents', requireRoles(...write), RtwDocumentsController.create);
hrRouter.patch('/rtw-documents/:id', requireRoles(...write), RtwDocumentsController.update);
hrRouter.delete('/rtw-documents/:id', requireRoles(...HR_WRITE_ROLES), RtwDocumentsController.remove);

// ——— Leave policies / balances + approve/reject ———
hrRouter.get('/leave-policies', requireRoles(...staff), LeavePoliciesController.list);
hrRouter.post('/leave-policies', requireRoles(...write), LeavePoliciesController.create);
hrRouter.patch('/leave-policies/:id', requireRoles(...write), LeavePoliciesController.update);
hrRouter.delete('/leave-policies/:id', requireRoles(...HR_WRITE_ROLES), LeavePoliciesController.remove);

hrRouter.get('/leave-balances', requireRoles(...staff), LeaveBalancesController.list);
hrRouter.post('/leave-balances', requireRoles(...write), LeaveBalancesController.upsert);
hrRouter.put('/leave-balances', requireRoles(...write), LeaveBalancesController.upsert);

hrRouter.get('/leave-requests', requireRoles(...staff), LeaveRequestsController.list);
hrRouter.get('/leave-requests/:id', requireRoles(...staff), LeaveRequestsController.get);
hrRouter.post('/leave-requests', requireRoles(...staff), LeaveRequestsController.create);
hrRouter.patch('/leave-requests/:id', requireRoles(...staff), LeaveRequestsController.update);
hrRouter.post('/leave-requests/:id/approve', requireRoles(...write), LeaveActionsController.approve);
hrRouter.post('/leave-requests/:id/reject', requireRoles(...write), LeaveActionsController.reject);
hrRouter.delete('/leave-requests/:id', requireRoles(...HR_WRITE_ROLES), LeaveRequestsController.remove);

// ——— Attendance / overtime / SSP / pension ———
hrRouter.get('/attendance', requireRoles(...staff), AttendanceController.list);
hrRouter.post('/attendance', requireRoles(...staff), AttendanceController.upsert);
hrRouter.put('/attendance', requireRoles(...staff), AttendanceController.upsert);
hrRouter.delete('/attendance/:id', requireRoles(...write), AttendanceController.remove);

hrRouter.get('/overtime', requireRoles(...staff), OvertimeController.list);
hrRouter.post('/overtime', requireRoles(...staff), OvertimeController.create);
hrRouter.patch('/overtime/:id', requireRoles(...write), OvertimeController.update);
hrRouter.delete('/overtime/:id', requireRoles(...HR_WRITE_ROLES), OvertimeController.remove);

hrRouter.get('/sick-episodes', requireRoles(...staff), SickEpisodesController.list);
hrRouter.post('/sick-episodes', requireRoles(...write), SickEpisodesController.create);
hrRouter.patch('/sick-episodes/:id', requireRoles(...write), SickEpisodesController.update);
hrRouter.delete('/sick-episodes/:id', requireRoles(...HR_WRITE_ROLES), SickEpisodesController.remove);

hrRouter.get('/pension', requireRoles(...staff), PensionController.list);
hrRouter.post('/pension', requireRoles(...write), PensionController.upsert);
hrRouter.put('/pension', requireRoles(...write), PensionController.upsert);

// ——— Documents / payslips / tax docs ———
hrRouter.get('/documents', requireRoles(...staff), HrDocumentsController.list);
hrRouter.post('/documents', requireRoles(...write), HrDocumentsController.create);
hrRouter.patch('/documents/:id', requireRoles(...write), HrDocumentsController.update);
hrRouter.delete('/documents/:id', requireRoles(...HR_WRITE_ROLES), HrDocumentsController.remove);

hrRouter.get('/payslips', requireRoles(...payroll), PayslipsController.list);
hrRouter.post('/payslips', requireRoles(...write), PayslipsController.create);
hrRouter.delete('/payslips/:id', requireRoles(...HR_WRITE_ROLES), PayslipsController.remove);

hrRouter.get('/tax-documents', requireRoles(...payroll), TaxDocumentsController.list);
hrRouter.post('/tax-documents', requireRoles(...write), TaxDocumentsController.create);
hrRouter.delete('/tax-documents/:id', requireRoles(...HR_WRITE_ROLES), TaxDocumentsController.remove);

// ——— Time / shifts / payroll (legacy) ———
hrRouter.get('/time-entries', requireRoles(...staff), TimeEntriesController.list);
hrRouter.get('/time-entries/:id', requireRoles(...staff), TimeEntriesController.get);
hrRouter.post('/time-entries', requireRoles(...staff), TimeEntriesController.create);
hrRouter.patch('/time-entries/:id', requireRoles(...staff), TimeEntriesController.update);
hrRouter.delete('/time-entries/:id', requireRoles(...HR_WRITE_ROLES), TimeEntriesController.remove);

hrRouter.get('/shifts', requireRoles(...staff), ShiftsController.list);
hrRouter.get('/shifts/:id', requireRoles(...staff), ShiftsController.get);
hrRouter.post('/shifts', requireRoles(...staff), ShiftsController.create);
hrRouter.patch('/shifts/:id', requireRoles(...staff), ShiftsController.update);
hrRouter.delete('/shifts/:id', requireRoles(...HR_WRITE_ROLES), ShiftsController.remove);

hrRouter.get('/payroll-runs', requireRoles(...payroll), PayrollRunsController.list);
hrRouter.get('/payroll-runs/:id', requireRoles(...payroll), PayrollRunsController.get);
hrRouter.post('/payroll-runs', requireRoles(...HR_WRITE_ROLES), PayrollRunsController.create);
hrRouter.patch('/payroll-runs/:id', requireRoles(...HR_WRITE_ROLES), PayrollRunsController.update);
hrRouter.post('/payroll-runs/:id/calculate', requireRoles(...write), PayrollCalcController.calculate);
hrRouter.delete('/payroll-runs/:id', requireRoles(...HR_WRITE_ROLES), PayrollRunsController.remove);

hrRouter.get('/payroll-lines', requireRoles(...payroll), PayrollLinesController.list);
hrRouter.get('/payroll-lines/:id', requireRoles(...payroll), PayrollLinesController.get);
hrRouter.post('/payroll-lines', requireRoles(...HR_WRITE_ROLES), PayrollLinesController.create);
hrRouter.patch('/payroll-lines/:id', requireRoles(...HR_WRITE_ROLES), PayrollLinesController.update);
hrRouter.delete('/payroll-lines/:id', requireRoles(...HR_WRITE_ROLES), PayrollLinesController.remove);

// ——— Recruitment / onboarding ———
hrRouter.get('/job-postings', requireRoles(...staff), JobPostingsController.list);
hrRouter.get('/job-postings/:id', requireRoles(...staff), JobPostingsController.get);
hrRouter.post('/job-postings', requireRoles(...write), JobPostingsController.create);
hrRouter.patch('/job-postings/:id', requireRoles(...write), JobPostingsController.update);
hrRouter.delete('/job-postings/:id', requireRoles(...HR_WRITE_ROLES), JobPostingsController.remove);

hrRouter.get('/applicants', requireRoles(...staff), ApplicantsController.list);
hrRouter.post('/applicants', requireRoles(...write), ApplicantsController.create);
hrRouter.patch('/applicants/:id', requireRoles(...write), ApplicantsController.update);
hrRouter.delete('/applicants/:id', requireRoles(...HR_WRITE_ROLES), ApplicantsController.remove);

hrRouter.get('/onboarding', requireRoles(...staff), OnboardingController.list);
hrRouter.post('/onboarding', requireRoles(...write), OnboardingController.create);
hrRouter.post('/onboarding/seed', requireRoles(...write), OnboardingController.seedDefaults);
hrRouter.patch('/onboarding/:id', requireRoles(...write), OnboardingController.update);

// ——— Tasks / KPIs (legacy) ———
hrRouter.get('/tasks', requireRoles(...staff), TasksController.list);
hrRouter.get('/tasks/:id', requireRoles(...staff), TasksController.get);
hrRouter.post('/tasks', requireRoles(...staff), TasksController.create);
hrRouter.patch('/tasks/:id', requireRoles(...staff), TasksController.update);
hrRouter.delete('/tasks/:id', requireRoles(...HR_WRITE_ROLES), TasksController.remove);

hrRouter.get('/kpi-definitions', requireRoles(...staff), KpiDefinitionsController.list);
hrRouter.get('/kpi-definitions/:id', requireRoles(...staff), KpiDefinitionsController.get);
hrRouter.post('/kpi-definitions', requireRoles(...HR_WRITE_ROLES), KpiDefinitionsController.create);
hrRouter.patch('/kpi-definitions/:id', requireRoles(...HR_WRITE_ROLES), KpiDefinitionsController.update);
hrRouter.delete('/kpi-definitions/:id', requireRoles(...HR_WRITE_ROLES), KpiDefinitionsController.remove);

hrRouter.get('/kpi-records', requireRoles(...staff), KpiRecordsController.list);
hrRouter.get('/kpi-records/:id', requireRoles(...staff), KpiRecordsController.get);
hrRouter.post('/kpi-records', requireRoles(...staff), KpiRecordsController.create);
hrRouter.patch('/kpi-records/:id', requireRoles(...staff), KpiRecordsController.update);
hrRouter.delete('/kpi-records/:id', requireRoles(...HR_WRITE_ROLES), KpiRecordsController.remove);
