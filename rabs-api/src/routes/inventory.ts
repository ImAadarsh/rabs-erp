import { Router } from 'express';
import { WarehousesController } from '@controllers/inventory/warehouses.controller.js';
import { BinsController } from '@controllers/inventory/bins.controller.js';
import { SuppliersController } from '@controllers/inventory/suppliers.controller.js';
import { PurchaseOrdersController } from '@controllers/inventory/purchaseOrders.controller.js';
import { StockItemsController } from '@controllers/inventory/stockItems.controller.js';
import { ASNController } from '@controllers/inventory/asn.controller.js';
import { GRNController } from '@controllers/inventory/grn.controller.js';
import { StockTransfersController } from '@controllers/inventory/stockTransfers.controller.js';
import { StockAdjustmentsController } from '@controllers/inventory/stockAdjustments.controller.js';
import { CycleCountsController } from '@controllers/inventory/cycleCounts.controller.js';
import { authMiddleware } from '@middlewares/auth.js';
import { auditMiddleware } from '@middlewares/audit.js';
import { requireRoles } from '@middlewares/rbac.js';

export const inventoryRouter = Router();

// All routes require authentication
inventoryRouter.use(authMiddleware);

// Audit logging for all authenticated routes
inventoryRouter.use(auditMiddleware);

// Warehouses
inventoryRouter.get('/warehouses', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), WarehousesController.list);
inventoryRouter.get('/warehouses/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), WarehousesController.get);
inventoryRouter.post('/warehouses', requireRoles('ADMIN', 'SUPER_ADMIN'), WarehousesController.create);
inventoryRouter.patch('/warehouses/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), WarehousesController.update);
inventoryRouter.delete('/warehouses/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), WarehousesController.remove);

// Bins
inventoryRouter.get('/bins', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), BinsController.list);
inventoryRouter.get('/bins/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), BinsController.get);
inventoryRouter.post('/bins', requireRoles('ADMIN', 'SUPER_ADMIN'), BinsController.create);
inventoryRouter.patch('/bins/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), BinsController.update);
inventoryRouter.delete('/bins/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), BinsController.remove);

// Suppliers
inventoryRouter.get('/suppliers', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'PURCHASING'), SuppliersController.list);
inventoryRouter.get('/suppliers/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'PURCHASING'), SuppliersController.get);
inventoryRouter.post('/suppliers', requireRoles('ADMIN', 'SUPER_ADMIN'), SuppliersController.create);
inventoryRouter.patch('/suppliers/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), SuppliersController.update);
inventoryRouter.delete('/suppliers/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), SuppliersController.remove);

// Purchase Orders
inventoryRouter.get('/purchase-orders', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'PURCHASING'), PurchaseOrdersController.list);
inventoryRouter.get('/purchase-orders/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'PURCHASING'), PurchaseOrdersController.get);
inventoryRouter.post('/purchase-orders', requireRoles('ADMIN', 'SUPER_ADMIN'), PurchaseOrdersController.create);
inventoryRouter.patch('/purchase-orders/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), PurchaseOrdersController.update);
inventoryRouter.delete('/purchase-orders/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), PurchaseOrdersController.remove);

// Stock Items
inventoryRouter.get('/stock-items', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), StockItemsController.list);
inventoryRouter.get('/stock-items/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), StockItemsController.get);
inventoryRouter.post('/stock-items', requireRoles('ADMIN', 'SUPER_ADMIN'), StockItemsController.create);
inventoryRouter.patch('/stock-items/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), StockItemsController.update);
inventoryRouter.delete('/stock-items/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), StockItemsController.remove);

// ASN (Advanced Shipping Notices)
inventoryRouter.get('/asn', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'PURCHASING'), ASNController.list);
inventoryRouter.get('/asn/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'PURCHASING'), ASNController.get);
inventoryRouter.post('/asn', requireRoles('ADMIN', 'SUPER_ADMIN', 'PURCHASING'), ASNController.create);
inventoryRouter.patch('/asn/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'PURCHASING'), ASNController.update);
inventoryRouter.delete('/asn/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ASNController.remove);

// GRN (Goods Receipt Notes)
inventoryRouter.get('/grn', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), GRNController.list);
inventoryRouter.get('/grn/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), GRNController.get);
inventoryRouter.post('/grn', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), GRNController.create);
inventoryRouter.patch('/grn/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), GRNController.update);
inventoryRouter.delete('/grn/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), GRNController.remove);

// Stock Transfers — static sub-paths must precede `/:id` so they are not captured by it
inventoryRouter.get('/stock-transfers', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), StockTransfersController.list);
inventoryRouter.get('/stock-transfers/availability', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), StockTransfersController.availability);
inventoryRouter.get('/stock-transfers/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), StockTransfersController.get);
inventoryRouter.post('/stock-transfers', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), StockTransfersController.create);
inventoryRouter.patch('/stock-transfers/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), StockTransfersController.update);
inventoryRouter.delete('/stock-transfers/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), StockTransfersController.remove);

// Stock Adjustments
inventoryRouter.get('/stock-adjustments', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), StockAdjustmentsController.list);
inventoryRouter.get('/stock-adjustments/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), StockAdjustmentsController.get);
inventoryRouter.post('/stock-adjustments', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), StockAdjustmentsController.create);
inventoryRouter.patch('/stock-adjustments/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), StockAdjustmentsController.update);
inventoryRouter.delete('/stock-adjustments/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), StockAdjustmentsController.remove);

// Cycle Counts
inventoryRouter.get('/cycle-counts', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), CycleCountsController.list);
inventoryRouter.get('/cycle-counts/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), CycleCountsController.get);
inventoryRouter.post('/cycle-counts', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), CycleCountsController.create);
inventoryRouter.patch('/cycle-counts/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), CycleCountsController.update);
inventoryRouter.delete('/cycle-counts/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), CycleCountsController.remove);

