import { Router } from 'express';
import { CatalogItemsController } from '@controllers/catalog/catalogItems.controller.js';
import { VariantsController } from '@controllers/catalog/variants.controller.js';
import { BarcodesController } from '@controllers/catalog/barcodes.controller.js';
import { TaxCodesController } from '@controllers/catalog/taxCodes.controller.js';
import { PriceListsController } from '@controllers/catalog/priceLists.controller.js';
import { PriceListItemsController } from '@controllers/catalog/priceListItems.controller.js';
import { ProductMediaController } from '@controllers/catalog/productMedia.controller.js';
import { BundlesController } from '@controllers/catalog/bundles.controller.js';
import { BundleItemsController } from '@controllers/catalog/bundleItems.controller.js';
import { PromotionalPricesController } from '@controllers/catalog/promotionalPrices.controller.js';
import { ChannelMappingsController } from '@controllers/catalog/channelMappings.controller.js';
import { ComplianceDocumentsController } from '@controllers/catalog/complianceDocuments.controller.js';
import { ProductImportController } from '@controllers/catalog/productImport.controller.js';
import { ChannelConnectionsController } from '@controllers/catalog/channelConnections.controller.js';
import { WordPressChannelsController } from '@controllers/catalog/wordpressChannels.controller.js';
import { GoodTillChannelsController } from '@controllers/catalog/goodtillChannels.controller.js';
import { authMiddleware } from '@middlewares/auth.js';
import { auditMiddleware } from '@middlewares/audit.js';
import { requireRoles } from '@middlewares/rbac.js';
import { uploadSingle, uploadCsv, uploadExcel } from '@middlewares/upload.js';
import { InventoryExcelImportController } from '@controllers/catalog/inventoryExcelImport.controller.js';

export const catalogRouter = Router();

// All routes require authentication
catalogRouter.use(authMiddleware);

// Audit logging for all authenticated routes
catalogRouter.use(auditMiddleware);

// Catalog Items
catalogRouter.get('/items', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP'), CatalogItemsController.list);
catalogRouter.get('/items/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP'), CatalogItemsController.get);
catalogRouter.post('/items', requireRoles('ADMIN', 'SUPER_ADMIN'), CatalogItemsController.create);
catalogRouter.patch('/items/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), CatalogItemsController.update);
catalogRouter.delete('/items/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), CatalogItemsController.remove);

// Variants
catalogRouter.get('/variants', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP'), VariantsController.list);
catalogRouter.get('/variants/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP'), VariantsController.get);
catalogRouter.post('/variants', requireRoles('ADMIN', 'SUPER_ADMIN'), uploadSingle('image'), VariantsController.create);
catalogRouter.patch('/variants/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), uploadSingle('image'), VariantsController.update);
catalogRouter.delete('/variants/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), VariantsController.remove);

// Barcodes
catalogRouter.get('/barcodes', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), BarcodesController.list);
catalogRouter.get('/barcodes/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), BarcodesController.get);
catalogRouter.post('/barcodes', requireRoles('ADMIN', 'SUPER_ADMIN'), BarcodesController.create);
catalogRouter.patch('/barcodes/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), BarcodesController.update);
catalogRouter.delete('/barcodes/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), BarcodesController.remove);

// Tax Codes
catalogRouter.get('/tax-codes', requireRoles('ADMIN', 'SUPER_ADMIN', 'FINANCE'), TaxCodesController.list);
catalogRouter.get('/tax-codes/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'FINANCE'), TaxCodesController.get);
catalogRouter.post('/tax-codes', requireRoles('ADMIN', 'SUPER_ADMIN'), TaxCodesController.create);
catalogRouter.patch('/tax-codes/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), TaxCodesController.update);
catalogRouter.delete('/tax-codes/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), TaxCodesController.remove);

// Price Lists
catalogRouter.get('/price-lists', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'FINANCE'), PriceListsController.list);
catalogRouter.get('/price-lists/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'FINANCE'), PriceListsController.get);
catalogRouter.post('/price-lists', requireRoles('ADMIN', 'SUPER_ADMIN'), PriceListsController.create);
catalogRouter.patch('/price-lists/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), PriceListsController.update);
catalogRouter.delete('/price-lists/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), PriceListsController.remove);

// Price List Items
catalogRouter.get('/price-list-items', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'FINANCE'), PriceListItemsController.list);
catalogRouter.get('/price-list-items/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'FINANCE'), PriceListItemsController.get);
catalogRouter.post('/price-list-items', requireRoles('ADMIN', 'SUPER_ADMIN'), PriceListItemsController.create);
catalogRouter.patch('/price-list-items/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), PriceListItemsController.update);
catalogRouter.delete('/price-list-items/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), PriceListItemsController.remove);

// Product Media
catalogRouter.get('/media', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP'), ProductMediaController.list);
catalogRouter.get('/media/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP'), ProductMediaController.get);
catalogRouter.post('/media', requireRoles('ADMIN', 'SUPER_ADMIN'), uploadSingle('file'), ProductMediaController.create);
catalogRouter.patch('/media/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), uploadSingle('file'), ProductMediaController.update);
catalogRouter.delete('/media/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ProductMediaController.remove);

// Bundles
catalogRouter.get('/bundles', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP'), BundlesController.list);
catalogRouter.get('/bundles/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP'), BundlesController.get);
catalogRouter.post('/bundles', requireRoles('ADMIN', 'SUPER_ADMIN'), BundlesController.create);
catalogRouter.patch('/bundles/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), BundlesController.update);
catalogRouter.delete('/bundles/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), BundlesController.remove);

// Bundle Items
catalogRouter.get('/bundle-items', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP'), BundleItemsController.list);
catalogRouter.get('/bundle-items/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP'), BundleItemsController.get);
catalogRouter.post('/bundle-items', requireRoles('ADMIN', 'SUPER_ADMIN'), BundleItemsController.create);
catalogRouter.patch('/bundle-items/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), BundleItemsController.update);
catalogRouter.delete('/bundle-items/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), BundleItemsController.remove);

// Promotional Prices
catalogRouter.get('/promotional-prices', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'FINANCE'), PromotionalPricesController.list);
catalogRouter.get('/promotional-prices/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'FINANCE'), PromotionalPricesController.get);
catalogRouter.post('/promotional-prices', requireRoles('ADMIN', 'SUPER_ADMIN'), PromotionalPricesController.create);
catalogRouter.patch('/promotional-prices/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), PromotionalPricesController.update);
catalogRouter.delete('/promotional-prices/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), PromotionalPricesController.remove);

// Channel Mappings
catalogRouter.get('/channel-mappings', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP'), ChannelMappingsController.list);
catalogRouter.get('/channel-mappings/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP'), ChannelMappingsController.get);
catalogRouter.post('/channel-mappings', requireRoles('ADMIN', 'SUPER_ADMIN'), ChannelMappingsController.create);
catalogRouter.patch('/channel-mappings/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ChannelMappingsController.update);
catalogRouter.delete('/channel-mappings/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ChannelMappingsController.remove);

// Saved channel connections (WooCommerce / Shopify / WordPress stores)
catalogRouter.get('/channel-connections', requireRoles('ADMIN', 'SUPER_ADMIN'), ChannelConnectionsController.list);
catalogRouter.get('/channel-connections/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ChannelConnectionsController.get);
catalogRouter.post('/channel-connections/woocommerce', requireRoles('ADMIN', 'SUPER_ADMIN'), ChannelConnectionsController.createWooCommerce);
catalogRouter.post('/channel-connections/shopify', requireRoles('ADMIN', 'SUPER_ADMIN'), ChannelConnectionsController.createShopify);
catalogRouter.post('/channel-connections/wordpress', requireRoles('ADMIN', 'SUPER_ADMIN'), WordPressChannelsController.create);
catalogRouter.post('/channel-connections/goodtill', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.create);
catalogRouter.patch('/channel-connections/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ChannelConnectionsController.update);
catalogRouter.delete('/channel-connections/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ChannelConnectionsController.remove);
catalogRouter.post('/channel-connections/:id/test', requireRoles('ADMIN', 'SUPER_ADMIN'), ChannelConnectionsController.test);

// WordPress Channels — browse, import, export
catalogRouter.get('/wordpress-channels/:connectionId/products', requireRoles('ADMIN', 'SUPER_ADMIN'), WordPressChannelsController.browseProducts);
catalogRouter.post('/wordpress-channels/:connectionId/import', requireRoles('ADMIN', 'SUPER_ADMIN'), WordPressChannelsController.importProducts);
catalogRouter.post('/wordpress-channels/:connectionId/export', requireRoles('ADMIN', 'SUPER_ADMIN'), WordPressChannelsController.exportProducts);
catalogRouter.get('/wordpress-channels/:connectionId/preview-export', requireRoles('ADMIN', 'SUPER_ADMIN'), WordPressChannelsController.previewExport);
catalogRouter.post('/wordpress-channels/:connectionId/sync-status', requireRoles('ADMIN', 'SUPER_ADMIN'), WordPressChannelsController.syncStatus);
catalogRouter.get('/wordpress-channels/:connectionId/sync-health', requireRoles('ADMIN', 'SUPER_ADMIN'), WordPressChannelsController.syncHealth);
catalogRouter.post('/wordpress-channels/:connectionId/push-prices', requireRoles('ADMIN', 'SUPER_ADMIN'), WordPressChannelsController.pushPrices);

// Good Till / EPOS Channels — browse, import, export
catalogRouter.get('/epos-channels/connections', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.listConnections);
catalogRouter.get('/epos-channels/:connectionId/vat-rates', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.listVatRates);
catalogRouter.get('/epos-channels/:connectionId/products', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.browseProducts);
catalogRouter.get('/epos-channels/:connectionId/preview-import', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.previewImport);
catalogRouter.post('/epos-channels/:connectionId/import', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.importProducts);
catalogRouter.post('/epos-channels/:connectionId/export', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.exportProducts);
catalogRouter.get('/epos-channels/:connectionId/preview-export', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.previewExport);
catalogRouter.post('/epos-channels/:connectionId/epos-products/barcodes', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.generateEposBarcodes);
catalogRouter.get('/epos-channels/:connectionId/barcode-image/:code', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.barcodeImage);
catalogRouter.get('/epos-channels/:connectionId/epos-products/:productId', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.getEposProduct);
catalogRouter.delete('/epos-channels/:connectionId/epos-products/:productId', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.deleteEposProduct);
catalogRouter.post('/epos-channels/:connectionId/epos-products/delete', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.deleteEposProductsBulk);
catalogRouter.post('/epos-channels/:connectionId/generate-barcodes', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.generateBarcodes);
catalogRouter.get('/epos-channels/:connectionId/qr/:barcode', requireRoles('ADMIN', 'SUPER_ADMIN'), GoodTillChannelsController.qrCode);

// Import Channels (product import from Shopify, WooCommerce, etc.)
catalogRouter.get('/import-channels/sources', requireRoles('ADMIN', 'SUPER_ADMIN'), ProductImportController.listSources);
catalogRouter.post('/import-channels/preview', requireRoles('ADMIN', 'SUPER_ADMIN'), uploadCsv, ProductImportController.preview);
catalogRouter.post('/import-channels/execute', requireRoles('ADMIN', 'SUPER_ADMIN'), uploadCsv, ProductImportController.execute);
catalogRouter.post('/import-channels/api/preview', requireRoles('ADMIN', 'SUPER_ADMIN'), ProductImportController.previewApi);
catalogRouter.post('/import-channels/api/execute', requireRoles('ADMIN', 'SUPER_ADMIN'), ProductImportController.executeApi);
catalogRouter.get('/import-channels/jobs', requireRoles('ADMIN', 'SUPER_ADMIN'), ProductImportController.listJobs);
catalogRouter.get('/import-channels/jobs/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ProductImportController.getJob);

// Inventory Excel seed import (Rabs Interiors inventory sheet)
catalogRouter.post('/inventory-import/preview', requireRoles('ADMIN', 'SUPER_ADMIN'), uploadExcel, InventoryExcelImportController.preview);
catalogRouter.post('/inventory-import/execute', requireRoles('ADMIN', 'SUPER_ADMIN'), uploadExcel, InventoryExcelImportController.execute);

// Compliance Documents
catalogRouter.get('/compliance-documents', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), ComplianceDocumentsController.list);
catalogRouter.get('/compliance-documents/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER'), ComplianceDocumentsController.get);
catalogRouter.post('/compliance-documents', requireRoles('ADMIN', 'SUPER_ADMIN'), uploadSingle('file'), ComplianceDocumentsController.create);
catalogRouter.patch('/compliance-documents/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), uploadSingle('file'), ComplianceDocumentsController.update);
catalogRouter.delete('/compliance-documents/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ComplianceDocumentsController.remove);

