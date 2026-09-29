import { Router } from 'express';
import { authMiddleware } from '@middlewares/auth.js';
import { requireRoles } from '@middlewares/rbac.js';
import { PM_STAFF_ROLES } from '@services/pm/pmScope.js';
import { PmDashboardController } from '@controllers/pm/dashboard.controller.js';
import { ProjectsController } from '@controllers/pm/projects.controller.js';
import { WorkOrdersController } from '@controllers/pm/workOrders.controller.js';
import { TasksController } from '@controllers/pm/tasks.controller.js';
import { MilestonesController } from '@controllers/pm/milestones.controller.js';
import { StagesController } from '@controllers/pm/stages.controller.js';
import { ScheduleController } from '@controllers/pm/schedule.controller.js';

export const pmRouter = Router();

const staff = [...PM_STAFF_ROLES];

pmRouter.use(authMiddleware);

// Dashboard
pmRouter.get('/dashboard', requireRoles(...staff), PmDashboardController.get);

// Work stages (org templates or per-project)
pmRouter.get('/stages', requireRoles(...staff), StagesController.list);
pmRouter.post('/stages', requireRoles(...staff), StagesController.create);
pmRouter.patch('/stages/:id', requireRoles(...staff), StagesController.update);
pmRouter.delete('/stages/:id', requireRoles(...staff), StagesController.remove);

// Projects / jobs
pmRouter.get('/projects', requireRoles(...staff), ProjectsController.list);
pmRouter.post('/projects', requireRoles(...staff), ProjectsController.create);
pmRouter.get('/projects/:id', requireRoles(...staff), ProjectsController.get);
pmRouter.patch('/projects/:id', requireRoles(...staff), ProjectsController.update);
pmRouter.delete('/projects/:id', requireRoles(...staff), ProjectsController.remove);
pmRouter.get('/projects/:id/progress', requireRoles(...staff), ProjectsController.progress);
pmRouter.post(
  '/projects/:id/mark-production-ready',
  requireRoles(...staff),
  ProjectsController.markProductionReady
);
pmRouter.post('/projects/:id/complete', requireRoles(...staff), ProjectsController.complete);

// Deliverables
pmRouter.get('/projects/:id/deliverables', requireRoles(...staff), ProjectsController.listDeliverables);
pmRouter.post('/projects/:id/deliverables', requireRoles(...staff), ProjectsController.createDeliverable);
pmRouter.patch(
  '/projects/:id/deliverables/:deliverableId',
  requireRoles(...staff),
  ProjectsController.updateDeliverable
);
pmRouter.delete(
  '/projects/:id/deliverables/:deliverableId',
  requireRoles(...staff),
  ProjectsController.removeDeliverable
);

// Members
pmRouter.get('/projects/:id/members', requireRoles(...staff), ProjectsController.listMembers);
pmRouter.post('/projects/:id/members', requireRoles(...staff), ProjectsController.addMember);
pmRouter.patch(
  '/projects/:id/members/:memberId',
  requireRoles(...staff),
  ProjectsController.updateMember
);
pmRouter.delete(
  '/projects/:id/members/:memberId',
  requireRoles(...staff),
  ProjectsController.removeMember
);

// Work orders
pmRouter.get('/work-orders', requireRoles(...staff), WorkOrdersController.list);
pmRouter.post('/work-orders', requireRoles(...staff), WorkOrdersController.create);
pmRouter.get('/work-orders/:id', requireRoles(...staff), WorkOrdersController.get);
pmRouter.patch('/work-orders/:id', requireRoles(...staff), WorkOrdersController.update);
pmRouter.delete('/work-orders/:id', requireRoles(...staff), WorkOrdersController.remove);

// Tasks
pmRouter.get('/tasks', requireRoles(...staff), TasksController.list);
pmRouter.post('/tasks', requireRoles(...staff), TasksController.create);
pmRouter.get('/tasks/:id', requireRoles(...staff), TasksController.get);
pmRouter.patch('/tasks/:id', requireRoles(...staff), TasksController.update);
pmRouter.delete('/tasks/:id', requireRoles(...staff), TasksController.remove);
pmRouter.post('/tasks/:id/complete', requireRoles(...staff), TasksController.complete);
pmRouter.post('/tasks/:id/dependencies', requireRoles(...staff), TasksController.addDependency);
pmRouter.delete(
  '/tasks/:id/dependencies/:dependsOnTaskId',
  requireRoles(...staff),
  TasksController.removeDependency
);

// Milestones
pmRouter.get('/milestones', requireRoles(...staff), MilestonesController.list);
pmRouter.post('/milestones', requireRoles(...staff), MilestonesController.create);
pmRouter.get('/milestones/:id', requireRoles(...staff), MilestonesController.get);
pmRouter.patch('/milestones/:id', requireRoles(...staff), MilestonesController.update);
pmRouter.delete('/milestones/:id', requireRoles(...staff), MilestonesController.remove);

// Staff schedule blocks
pmRouter.get('/schedule-blocks', requireRoles(...staff), ScheduleController.list);
pmRouter.post('/schedule-blocks', requireRoles(...staff), ScheduleController.create);
pmRouter.get('/schedule-blocks/:id', requireRoles(...staff), ScheduleController.get);
pmRouter.patch('/schedule-blocks/:id', requireRoles(...staff), ScheduleController.update);
pmRouter.delete('/schedule-blocks/:id', requireRoles(...staff), ScheduleController.remove);
