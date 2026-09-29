import { AppDataSource } from '@config/data-source.js';
import { CatalogItem } from '@entities/catalog/CatalogItem.js';
import { Variant } from '@entities/catalog/Variant.js';
import { ChannelMapping } from '@entities/catalog/ChannelMapping.js';
import { ProductMedia } from '@entities/catalog/ProductMedia.js';
import { PriceListItem } from '@entities/catalog/PriceListItem.js';
import { StockItem } from '@entities/inventory/StockItem.js';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { PriceList } from '@entities/catalog/PriceList.js';
import { Barcode } from '@entities/catalog/Barcode.js';
import { IsNull } from 'typeorm';
import type { ImportOptions, ImportResultSummary, ParsedProduct, ImportChannel } from './types.js';
import { toChannelMappingChannel } from './channelMappingChannel.js';

const dbChannel = (channel: ImportChannel) => toChannelMappingChannel(channel);

export async function runProductImport(
  products: ParsedProduct[],
  options: ImportOptions,
  channel: ImportChannel
): Promise<ImportResultSummary> {
  const summary: ImportResultSummary = {
    productsCreated: 0,
    productsUpdated: 0,
    productsSkipped: 0,
    variantsCreated: 0,
    variantsUpdated: 0,
    variantsSkipped: 0,
    stockItemsCreated: 0,
    stockItemsUpdated: 0,
    priceListItemsCreated: 0,
    mediaCreated: 0,
    channelMappingsCreated: 0,
    errors: []
  };

  const orgRepo = AppDataSource.getRepository(Organization);
  const org = await orgRepo.findOne({ where: { id: options.organizationId } });
  if (!org) throw new Error('Invalid organizationId');

  let businessUnit = null;
  if (options.businessUnitId) {
    const bu = await AppDataSource.getRepository(BusinessUnit).findOne({
      where: { id: options.businessUnitId },
      relations: ['organization']
    });
    if (!bu || bu.organization.id !== org.id) throw new Error('Invalid businessUnitId');
    businessUnit = bu;
  }

  let warehouse = null;
  if (options.importInventory && options.warehouseId) {
    warehouse = await AppDataSource.getRepository(Warehouse).findOne({
      where: { id: options.warehouseId },
      relations: ['location', 'location.businessUnit', 'location.businessUnit.organization']
    });
    const whOrgId = warehouse?.location?.businessUnit?.organization?.id;
    if (!warehouse || whOrgId !== org.id) {
      throw new Error('Invalid warehouseId for inventory import');
    }
  }

  let priceList = null;
  if (options.importPrices && options.priceListId) {
    priceList = await AppDataSource.getRepository(PriceList).findOne({
      where: { id: options.priceListId },
      relations: ['organization']
    });
    if (!priceList || priceList.organization.id !== org.id) {
      throw new Error('Invalid priceListId for price import');
    }
  }

  const catalogRepo = AppDataSource.getRepository(CatalogItem);
  const variantRepo = AppDataSource.getRepository(Variant);
  const mappingRepo = AppDataSource.getRepository(ChannelMapping);
  const mediaRepo = AppDataSource.getRepository(ProductMedia);
  const stockRepo = AppDataSource.getRepository(StockItem);
  const priceItemRepo = AppDataSource.getRepository(PriceListItem);

  for (const product of products) {
    try {
      await AppDataSource.transaction(async (manager) => {
        const catRepo = manager.getRepository(CatalogItem);
        const varRepo = manager.getRepository(Variant);
        const mapRepo = manager.getRepository(ChannelMapping);
        const medRepo = manager.getRepository(ProductMedia);
        const stkRepo = manager.getRepository(StockItem);
        const pliRepo = manager.getRepository(PriceListItem);
        const barcodeRepo = manager.getRepository(Barcode);

        let catalogItem = await catRepo.findOne({
          where: {
            organization: { id: org.id },
            sku: product.sku
          },
          relations: ['organization']
        });

        if (catalogItem && options.duplicateMode === 'skip') {
          summary.productsSkipped++;
          // Still create channel mappings for existing products if they don't have one yet
          if (options.importChannelMappings) {
            for (const pv of product.variants) {
              const variant = await varRepo.findOne({ where: { variantSku: pv.variantSku } });
              if (!variant) continue;
              const existingMap = await mapRepo.findOne({
                where: {
                  catalogItem: { id: catalogItem.id },
                  channel: dbChannel(channel),
                  channelVariantId: pv.channelVariantId
                }
              });
              if (!existingMap) {
                await mapRepo.save(
                  mapRepo.create({
                    catalogItem,
                    variant,
                    channel: dbChannel(channel),
                    channelProductId: product.handle,
                    channelVariantId: pv.channelVariantId,
                    syncEnabled: true,
                    syncStatus: 'synced',
                    lastSyncedAt: new Date(),
                    attributes: { importedAt: new Date().toISOString() }
                  })
                );
                summary.channelMappingsCreated++;
              }
            }
          }
          return;
        }

        if (!catalogItem && options.importProducts) {
          catalogItem = catRepo.create({
            organization: org,
            businessUnit,
            sku: product.sku,
            name: product.name,
            description: product.productType ?? null,
            category: product.category ?? null,
            brand: product.brand ?? null,
            attributes: product.tags?.length
              ? { tags: product.tags, sourceHandle: product.handle }
              : { sourceHandle: product.handle },
            status: product.status
          });
          await catRepo.save(catalogItem);
          summary.productsCreated++;
        } else if (catalogItem && options.duplicateMode === 'update' && options.importProducts) {
          catalogItem.name = product.name;
          if (product.category) catalogItem.category = product.category;
          if (product.brand) catalogItem.brand = product.brand;
          catalogItem.status = product.status;
          await catRepo.save(catalogItem);
          summary.productsUpdated++;
        } else if (!catalogItem) {
          summary.errors.push({ handle: product.handle, message: 'Product skipped (import products disabled)' });
          return;
        }

        if (!catalogItem) return;

        for (const pv of product.variants) {
          if (!options.importVariants) continue;

          let variant = await varRepo.findOne({
            where: { variantSku: pv.variantSku }
          });

          if (variant && options.duplicateMode === 'skip') {
            summary.variantsSkipped++;
            continue;
          }

          if (!variant) {
            variant = varRepo.create({
              catalogItem,
              variantSku: pv.variantSku,
              name: pv.name ?? null,
              option1Name: pv.option1Name ?? null,
              option1Value: pv.option1Value ?? null,
              option2Name: pv.option2Name ?? null,
              option2Value: pv.option2Value ?? null,
              costPrice: pv.price ?? null,
              costCurrency: 'GBP',
              imageUrl: pv.imageUrl ?? null,
              status: pv.status
            });
            await varRepo.save(variant);
            summary.variantsCreated++;
          } else if (options.duplicateMode === 'update') {
            variant.name = pv.name ?? variant.name;
            variant.option1Name = pv.option1Name ?? variant.option1Name;
            variant.option1Value = pv.option1Value ?? variant.option1Value;
            variant.option2Name = pv.option2Name ?? variant.option2Name;
            variant.option2Value = pv.option2Value ?? variant.option2Value;
            if (pv.price !== undefined) variant.costPrice = pv.price;
            if (pv.imageUrl) variant.imageUrl = pv.imageUrl;
            variant.status = pv.status;
            await varRepo.save(variant);
            summary.variantsUpdated++;
          }

          if (pv.barcode) {
            const existingBarcode = await barcodeRepo.findOne({
              where: { barcode: pv.barcode }
            });
            if (!existingBarcode) {
              await barcodeRepo.save(
                barcodeRepo.create({
                  variant,
                  barcode: pv.barcode,
                  type: 'EAN',
                  isPrimary: true
                })
              );
            }
          }

          if (options.importChannelMappings) {
            const existingMap = await mapRepo.findOne({
              where: {
                catalogItem: { id: catalogItem.id },
                channel: dbChannel(channel),
                channelVariantId: pv.channelVariantId
              }
            });
            if (!existingMap) {
              await mapRepo.save(
                mapRepo.create({
                  catalogItem,
                  variant,
                  channel: dbChannel(channel),
                  channelProductId: product.handle,
                  channelVariantId: pv.channelVariantId,
                  syncEnabled: true,
                  syncStatus: 'synced',
                  lastSyncedAt: new Date(),
                  attributes: { importedAt: new Date().toISOString() }
                })
              );
              summary.channelMappingsCreated++;
            }
          }

          if (options.importInventory && warehouse && pv.inventoryQty !== undefined && pv.inventoryQty > 0) {
            let stock = await stkRepo.findOne({
              where: {
                variant: { id: variant.id },
                warehouse: { id: warehouse.id }
              }
            });
            if (!stock) {
              await stkRepo.save(
                stkRepo.create({
                  variant,
                  warehouse,
                  quantityOnHand: pv.inventoryQty,
                  status: 'available'
                })
              );
              summary.stockItemsCreated++;
            } else if (options.duplicateMode === 'update') {
              stock.quantityOnHand = pv.inventoryQty;
              await stkRepo.save(stock);
              summary.stockItemsUpdated++;
            }
          }

          if (priceList && options.importPrices && pv.price !== undefined) {
            const existingPrice = await pliRepo.findOne({
              where: {
                priceList: { id: priceList.id },
                variant: { id: variant.id }
              }
            });
            if (!existingPrice) {
              await pliRepo.save(
                pliRepo.create({
                  priceList,
                  variant,
                  price: pv.price,
                  compareAtPrice: pv.compareAtPrice ?? null
                })
              );
              summary.priceListItemsCreated++;
            }
          }
        }

        if (options.importMedia) {
          for (const m of product.media) {
            const exists = await medRepo.findOne({
              where: {
                catalogItem: { id: catalogItem.id },
                url: m.url
              }
            });
            if (exists) continue;
            let variantForMedia = null;
            if (m.variantSku) {
              variantForMedia = await varRepo.findOne({
                where: { variantSku: m.variantSku }
              });
            }
            await medRepo.save(
              medRepo.create({
                catalogItem,
                variant: variantForMedia,
                type: 'image',
                url: m.url,
                position: m.position,
                isPrimary: m.position === 1
              })
            );
            summary.mediaCreated++;
          }
        }

        if (options.importChannelMappings) {
          const productMap = await mapRepo.findOne({
            where: {
              catalogItem: { id: catalogItem.id },
              channel: dbChannel(channel),
              channelProductId: product.handle,
              variant: IsNull()
            }
          });
          if (!productMap) {
            await mapRepo.save(
              mapRepo.create({
                catalogItem,
                variant: null,
                channel: dbChannel(channel),
                channelProductId: product.handle,
                syncEnabled: true,
                syncStatus: 'synced',
                lastSyncedAt: new Date()
              })
            );
            summary.channelMappingsCreated++;
          }
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      summary.errors.push({ handle: product.handle, message });
    }
  }

  return summary;
}
