import { Router } from 'express';
import { CustomersController } from '@controllers/orders/customers.controller.js';
import { CustomerAddressesController } from '@controllers/orders/customerAddresses.controller.js';
import { OrdersController } from '@controllers/orders/orders.controller.js';
import { OrderLinesController } from '@controllers/orders/orderLines.controller.js';
import { OrderAddressesController } from '@controllers/orders/orderAddresses.controller.js';
import { OrderNotesController } from '@controllers/orders/orderNotes.controller.js';
import { ReturnsController } from '@controllers/orders/returns.controller.js';
import { OrderChannelSyncController } from '@controllers/orders/orderChannelSync.controller.js';
import { authMiddleware } from '@middlewares/auth.js';
import { auditMiddleware } from '@middlewares/audit.js';
import { requireRoles } from '@middlewares/rbac.js';

export const ordersRouter = Router();

// All routes require authentication
ordersRouter.use(authMiddleware);

// Audit logging for all authenticated routes
ordersRouter.use(auditMiddleware);

// Channel order sync (POS + linked websites)
ordersRouter.get('/channel-sync/connections', requireRoles('ADMIN', 'SUPER_ADMIN'), OrderChannelSyncController.listConnections);
ordersRouter.post('/channel-sync/preview', requireRoles('ADMIN', 'SUPER_ADMIN'), OrderChannelSyncController.preview);
ordersRouter.post('/channel-sync/import', requireRoles('ADMIN', 'SUPER_ADMIN'), OrderChannelSyncController.import);

// Customers
ordersRouter.get('/customers', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE'), CustomersController.list);
ordersRouter.get('/customers/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE'), CustomersController.get);
ordersRouter.post('/customers', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP'), CustomersController.create);
ordersRouter.patch('/customers/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP'), CustomersController.update);
ordersRouter.delete('/customers/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), CustomersController.remove);

// Orders
ordersRouter.get('/orders', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE', 'WAREHOUSE_MANAGER'), OrdersController.list);
ordersRouter.get('/orders/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE', 'WAREHOUSE_MANAGER'), OrdersController.get);
ordersRouter.post('/orders', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP'), OrdersController.create);
ordersRouter.patch('/orders/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP'), OrdersController.update);
ordersRouter.delete('/orders/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), OrdersController.remove);

// Customer Addresses
ordersRouter.get('/customer-addresses', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE'), CustomerAddressesController.list);
ordersRouter.get('/customer-addresses/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE'), CustomerAddressesController.get);
ordersRouter.post('/customer-addresses', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP'), CustomerAddressesController.create);
ordersRouter.patch('/customer-addresses/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP'), CustomerAddressesController.update);
ordersRouter.delete('/customer-addresses/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), CustomerAddressesController.remove);

// Order Lines
ordersRouter.get('/order-lines', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE', 'WAREHOUSE_MANAGER'), OrderLinesController.list);
ordersRouter.get('/order-lines/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE', 'WAREHOUSE_MANAGER'), OrderLinesController.get);
ordersRouter.post('/order-lines', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP'), OrderLinesController.create);
ordersRouter.patch('/order-lines/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP'), OrderLinesController.update);
ordersRouter.delete('/order-lines/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), OrderLinesController.remove);

// Order Addresses
ordersRouter.get('/order-addresses', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE'), OrderAddressesController.list);
ordersRouter.get('/order-addresses/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE'), OrderAddressesController.get);
ordersRouter.post('/order-addresses', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP'), OrderAddressesController.create);
ordersRouter.patch('/order-addresses/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP'), OrderAddressesController.update);
ordersRouter.delete('/order-addresses/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), OrderAddressesController.remove);

// Order Notes
ordersRouter.get('/order-notes', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE'), OrderNotesController.list);
ordersRouter.get('/order-notes/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE'), OrderNotesController.get);
ordersRouter.post('/order-notes', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE'), OrderNotesController.create);
ordersRouter.patch('/order-notes/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE'), OrderNotesController.update);
ordersRouter.delete('/order-notes/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), OrderNotesController.remove);

// Returns
ordersRouter.get('/returns', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE'), ReturnsController.list);
ordersRouter.get('/returns/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE'), ReturnsController.get);
ordersRouter.post('/returns', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE'), ReturnsController.create);
ordersRouter.post('/returns/:id/refund', requireRoles('ADMIN', 'SUPER_ADMIN', 'CUSTOMER_SERVICE'), ReturnsController.refund);
ordersRouter.patch('/returns/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE'), ReturnsController.update);
ordersRouter.delete('/returns/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ReturnsController.remove);

