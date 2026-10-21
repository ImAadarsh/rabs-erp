import { Router } from 'express';
import { authMiddleware } from '@middlewares/auth.js';
import { requireRoles } from '@middlewares/rbac.js';
import { auditMiddleware } from '@middlewares/audit.js';
import { DhlController } from '@controllers/fulfillment/dhl.controller.js';
import { FulfillmentController } from '@controllers/fulfillment/fulfillment.controller.js';

export const fulfillmentRouter = Router();

fulfillmentRouter.use(authMiddleware);
fulfillmentRouter.use(auditMiddleware);

const staff = requireRoles(
  'ADMIN',
  'SUPER_ADMIN',
  'SALES_REP',
  'CUSTOMER_SERVICE',
  'WAREHOUSE_MANAGER'
);

fulfillmentRouter.get('/carriers', staff, FulfillmentController.carriers);
fulfillmentRouter.get('/pick-pack', staff, FulfillmentController.pickPackQueue);
fulfillmentRouter.post('/pick-pack/:orderId/:stage', staff, FulfillmentController.markStage);
fulfillmentRouter.get('/shipments', staff, FulfillmentController.shipments);
fulfillmentRouter.post('/shipments/manual', staff, FulfillmentController.createManual);
fulfillmentRouter.get('/shipments/:id', staff, FulfillmentController.shipmentDetail);
fulfillmentRouter.patch('/shipments/:id/status', staff, FulfillmentController.updateStatus);

fulfillmentRouter.get('/dhl/status', staff, DhlController.status);
fulfillmentRouter.get('/dhl/shipments', staff, DhlController.list);
fulfillmentRouter.post('/dhl/shipments', staff, DhlController.create);
fulfillmentRouter.get('/dhl/shipments/:id/label', staff, DhlController.label);
fulfillmentRouter.get('/dhl/shipments/:id/track', staff, DhlController.track);
fulfillmentRouter.post('/dhl/track', staff, DhlController.track);
fulfillmentRouter.delete('/dhl/shipments/:id', staff, DhlController.cancel);
