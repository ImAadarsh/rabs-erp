import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { CatalogItem } from '@entities/catalog/CatalogItem.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { TaxCode } from '@entities/catalog/TaxCode.js';
import { User } from '@entities/iam/User.js';
import {
  loadSheetFieldsForItems,
  decorateItemsWithSheetFields,
  syncProductSheetFields
} from '@services/catalog/productSheetFields.js';

/** Inventory-sheet fields stored outside catalog_items. */
const sheetFieldsSchema = {
  barcode: z.string().optional(),
  openingQuantity: z.coerce.number().optional(),
  reorderLevel: z.coerce.number().optional(),
  reorderQuantity: z.coerce.number().optional(),
  warehouseName: z.string().optional(),
  binCode: z.string().optional(),
  supplierName: z.string().optional(),
  lotNumber: z.string().optional(),
  expiryDate: z.string().optional()
};

/** Keep sheet values that have no dedicated column inside attributes JSON. */
function mergeSheetAttributes(
  base: Record<string, any> | null | undefined,
  data: Record<string, any>
): Record<string, any> | null {
  const attrs: Record<string, any> = { ...(base ?? {}) };
  for (const key of ['supplierName', 'warehouseName', 'binCode', 'lotNumber'] as const) {
    const value = data[key];
    if (value === undefined) continue;
    if (value === '' || value === null) delete attrs[key];
    else attrs[key] = value;
  }
  return Object.keys(attrs).length ? attrs : null;
}

const createCatalogItemSchema = z.object({
  ...sheetFieldsSchema,
  organizationId: z.string(),
  businessUnitId: z.string().optional(),
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  longDescription: z.string().optional(),
  category: z.string().optional(),
  subCategory: z.string().optional(),
  brand: z.string().optional(),
  manufacturer: z.string().optional(),
  uom: z.string().optional(),
  packSize: z.string().optional(),
  costPrice: z.coerce.number().optional(),
  sellingPrice: z.coerce.number().optional(),
  currency: z.string().length(3).optional(),
  supplierSku: z.string().optional(),
  leadTimeDays: z.coerce.number().int().optional(),
  remarks: z.string().optional(),
  hsCode: z.string().optional(),
  countryOfOrigin: z.string().length(2).optional(),
  taxCodeId: z.string().optional(),
  weightValue: z.coerce.number().optional(),
  weightUnit: z.enum(['g', 'kg', 'lb', 'oz']).optional(),
  lengthValue: z.coerce.number().optional(),
  widthValue: z.coerce.number().optional(),
  heightValue: z.coerce.number().optional(),
  dimensionUnit: z.enum(['cm', 'm', 'in', 'ft']).optional(),
  attributes: z.record(z.any()).optional(),
  status: z.enum(['active', 'inactive', 'discontinued']).optional()
});

const updateCatalogItemSchema = z.object({
  ...sheetFieldsSchema,
  businessUnitId: z.string().optional(),
  sku: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  longDescription: z.string().optional(),
  category: z.string().optional(),
  subCategory: z.string().optional(),
  brand: z.string().optional(),
  manufacturer: z.string().optional(),
  uom: z.string().optional(),
  packSize: z.string().optional(),
  costPrice: z.coerce.number().optional(),
  sellingPrice: z.coerce.number().optional(),
  currency: z.string().length(3).optional(),
  supplierSku: z.string().optional(),
  leadTimeDays: z.coerce.number().int().optional(),
  remarks: z.string().optional(),
  hsCode: z.string().optional(),
  countryOfOrigin: z.string().length(2).optional(),
  taxCodeId: z.string().optional(),
  weightValue: z.coerce.number().optional(),
  weightUnit: z.enum(['g', 'kg', 'lb', 'oz']).optional(),
  lengthValue: z.coerce.number().optional(),
  widthValue: z.coerce.number().optional(),
  heightValue: z.coerce.number().optional(),
  dimensionUnit: z.enum(['cm', 'm', 'in', 'ft']).optional(),
  attributes: z.record(z.any()).optional(),
  status: z.enum(['active', 'inactive', 'discontinued']).optional()
});

export class CatalogItemsController {
  static async list(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(CatalogItem);
    const { organizationId, businessUnitId, status, search, page = '1', limit = '50' } = req.query;
    
    const queryBuilder = repo.createQueryBuilder('ci')
      .leftJoinAndSelect('ci.organization', 'org')
      .leftJoinAndSelect('ci.businessUnit', 'bu')
      .leftJoinAndSelect('ci.taxCode', 'tc')
      .leftJoinAndSelect('ci.variants', 'v')
      .orderBy('ci.createdAt', 'DESC');

    if (organizationId) {
      queryBuilder.andWhere('ci.organization_id = :orgId', { orgId: organizationId });
    }

    if (businessUnitId) {
      queryBuilder.andWhere('ci.business_unit_id = :buId', { buId: businessUnitId });
    }

    if (status) {
      queryBuilder.andWhere('ci.status = :status', { status });
    }

    if (search) {
      queryBuilder.andWhere(
        '(ci.sku LIKE :search OR ci.name LIKE :search OR ci.description LIKE :search)',
        { search: `%${search}%` }
      );
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    queryBuilder.skip(skip).take(parseInt(limit as string));

    const [items, total] = await queryBuilder.getManyAndCount();

    const sheetFields = await loadSheetFieldsForItems(items.map((i) => i.id));
    const data = decorateItemsWithSheetFields(items as any[], sheetFields);

    res.json({ 
      data, 
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string))
      }
    });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(CatalogItem);
    const item = await repo.findOne({
      where: { id: req.params.id },
      relations: [
        'organization', 
        'businessUnit', 
        'taxCode', 
        'variants', 
        'variants.barcodes',
        'media',
        'bundles',
        'bundles.items',
        'bundles.items.variant',
        'channelMappings',
        'complianceDocuments'
      ]
    });
    
    if (!item) {
      res.status(404).json({ error: { message: 'Catalog item not found' } });
      return;
    }

    const sheetFields = await loadSheetFieldsForItems([item.id]);
    const [data] = decorateItemsWithSheetFields([item as any], sheetFields);

    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createCatalogItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const orgRepo = AppDataSource.getRepository(Organization);
    const org = await orgRepo.findOne({ where: { id: parsed.data.organizationId } });
    if (!org) {
      res.status(400).json({ error: { message: 'Invalid organizationId' } });
      return;
    }

    // Check for duplicate SKU within organization
    const repo = AppDataSource.getRepository(CatalogItem);
    const existing = await repo.findOne({
      where: { 
        organization: { id: parsed.data.organizationId },
        sku: parsed.data.sku 
      }
    });
    
    if (existing) {
      res.status(400).json({ error: { message: 'SKU already exists in this organization' } });
      return;
    }

    let businessUnit = null;
    if (parsed.data.businessUnitId) {
      const buRepo = AppDataSource.getRepository(BusinessUnit);
      businessUnit = await buRepo.findOne({ 
        where: { id: parsed.data.businessUnitId },
        relations: ['organization']
      });
      if (!businessUnit || businessUnit.organization.id !== org.id) {
        res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
        return;
      }
    }

    let taxCode = null;
    if (parsed.data.taxCodeId) {
      const tcRepo = AppDataSource.getRepository(TaxCode);
      taxCode = await tcRepo.findOne({ 
        where: { id: parsed.data.taxCodeId },
        relations: ['organization']
      });
      if (!taxCode || taxCode.organization.id !== org.id) {
        res.status(400).json({ error: { message: 'Invalid taxCodeId' } });
        return;
      }
    }

    const item = repo.create({
      organization: org,
      businessUnit,
      sku: parsed.data.sku,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      longDescription: parsed.data.longDescription ?? null,
      category: parsed.data.category ?? null,
      subCategory: parsed.data.subCategory ?? null,
      brand: parsed.data.brand ?? null,
      manufacturer: parsed.data.manufacturer ?? null,
      uom: parsed.data.uom ?? null,
      packSize: parsed.data.packSize ?? null,
      costPrice: parsed.data.costPrice ?? null,
      sellingPrice: parsed.data.sellingPrice ?? null,
      currency: parsed.data.currency ?? 'GBP',
      supplierSku: parsed.data.supplierSku ?? null,
      leadTimeDays: parsed.data.leadTimeDays ?? null,
      remarks: parsed.data.remarks ?? null,
      hsCode: parsed.data.hsCode ?? null,
      countryOfOrigin: parsed.data.countryOfOrigin ?? null,
      taxCode,
      weightValue: parsed.data.weightValue ?? null,
      weightUnit: parsed.data.weightUnit ?? 'kg',
      lengthValue: parsed.data.lengthValue ?? null,
      widthValue: parsed.data.widthValue ?? null,
      heightValue: parsed.data.heightValue ?? null,
      dimensionUnit: parsed.data.dimensionUnit ?? 'cm',
      attributes: mergeSheetAttributes(parsed.data.attributes ?? null, parsed.data),
      status: parsed.data.status ?? 'active'
    });

    await repo.save(item);

    try {
      await syncProductSheetFields(item, {
        barcode: parsed.data.barcode,
        openingQuantity: parsed.data.openingQuantity,
        reorderLevel: parsed.data.reorderLevel,
        reorderQuantity: parsed.data.reorderQuantity,
        warehouseName: parsed.data.warehouseName,
        binCode: parsed.data.binCode,
        supplierName: parsed.data.supplierName,
        lotNumber: parsed.data.lotNumber,
        expiryDate: parsed.data.expiryDate
      });
    } catch (err) {
      res.status(400).json({
        error: { message: err instanceof Error ? err.message : 'Failed to save inventory fields' }
      });
      return;
    }

    // Fetch with relations
    const saved = await repo.findOne({
      where: { id: item.id },
      relations: ['organization', 'businessUnit', 'taxCode']
    });

    const sheetFields = await loadSheetFieldsForItems([item.id]);
    const [data] = decorateItemsWithSheetFields([saved as any], sheetFields);

    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const parsed = updateCatalogItemSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(CatalogItem);
    const item = await repo.findOne({
      where: { id },
      relations: ['organization', 'businessUnit']
    });

    if (!item) {
      res.status(404).json({ error: { message: 'Catalog item not found' } });
      return;
    }

    // Check for duplicate SKU if SKU is being updated
    if (parsed.data.sku && parsed.data.sku !== item.sku) {
      const existing = await repo.findOne({
        where: { 
          organization: { id: item.organization.id },
          sku: parsed.data.sku 
        }
      });
      
      if (existing) {
        res.status(400).json({ error: { message: 'SKU already exists in this organization' } });
        return;
      }
    }

    // Update business unit if provided
    if (parsed.data.businessUnitId !== undefined) {
      if (parsed.data.businessUnitId) {
        const buRepo = AppDataSource.getRepository(BusinessUnit);
        const businessUnit = await buRepo.findOne({ 
          where: { id: parsed.data.businessUnitId },
          relations: ['organization']
        });
        if (!businessUnit || businessUnit.organization.id !== item.organization.id) {
          res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
          return;
        }
        item.businessUnit = businessUnit;
      } else {
        item.businessUnit = null;
      }
    }

    // Update tax code if provided
    if (parsed.data.taxCodeId !== undefined) {
      if (parsed.data.taxCodeId) {
        const tcRepo = AppDataSource.getRepository(TaxCode);
        const taxCode = await tcRepo.findOne({ 
          where: { id: parsed.data.taxCodeId },
          relations: ['organization']
        });
        if (!taxCode || taxCode.organization.id !== item.organization.id) {
          res.status(400).json({ error: { message: 'Invalid taxCodeId' } });
          return;
        }
        item.taxCode = taxCode;
      } else {
        item.taxCode = null;
      }
    }

    // Update other fields
    if (parsed.data.sku) item.sku = parsed.data.sku;
    if (parsed.data.name) item.name = parsed.data.name;
    if (parsed.data.description !== undefined) item.description = parsed.data.description ?? null;
    if (parsed.data.longDescription !== undefined) item.longDescription = parsed.data.longDescription ?? null;
    if (parsed.data.category !== undefined) item.category = parsed.data.category ?? null;
    if (parsed.data.subCategory !== undefined) item.subCategory = parsed.data.subCategory ?? null;
    if (parsed.data.brand !== undefined) item.brand = parsed.data.brand ?? null;
    if (parsed.data.manufacturer !== undefined) item.manufacturer = parsed.data.manufacturer ?? null;
    if (parsed.data.uom !== undefined) item.uom = parsed.data.uom ?? null;
    if (parsed.data.packSize !== undefined) item.packSize = parsed.data.packSize ?? null;
    if (parsed.data.costPrice !== undefined) item.costPrice = parsed.data.costPrice ?? null;
    if (parsed.data.sellingPrice !== undefined) item.sellingPrice = parsed.data.sellingPrice ?? null;
    if (parsed.data.currency !== undefined) item.currency = parsed.data.currency ?? 'GBP';
    if (parsed.data.supplierSku !== undefined) item.supplierSku = parsed.data.supplierSku ?? null;
    if (parsed.data.leadTimeDays !== undefined) item.leadTimeDays = parsed.data.leadTimeDays ?? null;
    if (parsed.data.remarks !== undefined) item.remarks = parsed.data.remarks ?? null;
    if (parsed.data.hsCode !== undefined) item.hsCode = parsed.data.hsCode ?? null;
    if (parsed.data.countryOfOrigin !== undefined) item.countryOfOrigin = parsed.data.countryOfOrigin ?? null;
    if (parsed.data.weightValue !== undefined) item.weightValue = parsed.data.weightValue ?? null;
    if (parsed.data.weightUnit) item.weightUnit = parsed.data.weightUnit;
    if (parsed.data.lengthValue !== undefined) item.lengthValue = parsed.data.lengthValue ?? null;
    if (parsed.data.widthValue !== undefined) item.widthValue = parsed.data.widthValue ?? null;
    if (parsed.data.heightValue !== undefined) item.heightValue = parsed.data.heightValue ?? null;
    if (parsed.data.dimensionUnit) item.dimensionUnit = parsed.data.dimensionUnit;
    if (parsed.data.attributes !== undefined) item.attributes = parsed.data.attributes ?? null;
    item.attributes = mergeSheetAttributes(item.attributes, parsed.data);
    if (parsed.data.status) item.status = parsed.data.status;

    await repo.save(item);

    try {
      await syncProductSheetFields(item, {
        barcode: parsed.data.barcode,
        openingQuantity: parsed.data.openingQuantity,
        reorderLevel: parsed.data.reorderLevel,
        reorderQuantity: parsed.data.reorderQuantity,
        warehouseName: parsed.data.warehouseName,
        binCode: parsed.data.binCode,
        supplierName: parsed.data.supplierName,
        lotNumber: parsed.data.lotNumber,
        expiryDate: parsed.data.expiryDate
      });
    } catch (err) {
      res.status(400).json({
        error: { message: err instanceof Error ? err.message : 'Failed to save inventory fields' }
      });
      return;
    }

    // Fetch with relations
    const updated = await repo.findOne({
      where: { id: item.id },
      relations: ['organization', 'businessUnit', 'taxCode']
    });

    const sheetFields = await loadSheetFieldsForItems([item.id]);
    const [data] = decorateItemsWithSheetFields([updated as any], sheetFields);

    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(CatalogItem);
    const item = await repo.findOne({ where: { id } });

    if (!item) {
      res.status(404).json({ error: { message: 'Catalog item not found' } });
      return;
    }

    await repo.softRemove(item);
    res.status(204).send();
  }
}

