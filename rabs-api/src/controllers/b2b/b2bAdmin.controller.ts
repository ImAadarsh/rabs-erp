import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { B2bPortalSettings } from '@entities/b2b/B2bPortalSettings.js';
import { RetailerAccount } from '@entities/b2b/RetailerAccount.js';
import { CatalogItem } from '@entities/catalog/CatalogItem.js';
import { ChannelMapping } from '@entities/catalog/ChannelMapping.js';
import { PriceList } from '@entities/catalog/PriceList.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { Customer } from '@entities/orders/Customer.js';
import { Order } from '@entities/orders/Order.js';
import { Organization } from '@entities/iam/Organization.js';
import { hashPassword } from '@utils/password.js';
import { getOrCreateB2bSettings } from '@services/b2b/b2bCatalog.service.js';
import { In, IsNull } from 'typeorm';
import { B2bCreditRequest } from '@entities/b2b/B2bCreditRequest.js';
import { Payment } from '@entities/finance/Payment.js';
import {
  adminListShipments,
  adminUpdateShipment,
  adminUpsertShippingMethod,
  ensureDefaultShippingMethods
} from '@services/b2b/b2bShipping.service.js';
import { adminListNotifications, createNotification } from '@services/b2b/b2bNotifications.service.js';
import { adminListReferrals, adminUpdateReferral } from '@services/b2b/b2bReferrals.service.js';
import { B2bShippingMethod } from '@entities/b2b/B2bShippingMethod.js';
import { AppDataSource as DS } from '@config/data-source.js';

function orgIdFromReq(req: Request): string | undefined {
  return (req.query.organizationId as string) || req.body?.organizationId || (req as any).auth?.orgId;
}

const settingsSchema = z.object({
  organizationId: z.string(),
  enabled: z.boolean().optional(),
  publishMode: z.enum(['all_active', 'mapped_only']).optional(),
  defaultPriceListId: z.string().nullable().optional(),
  defaultWarehouseId: z.string().nullable().optional(),
  assignedRepName: z.string().nullable().optional(),
  assignedRepPhone: z.string().nullable().optional(),
  assignedRepEmail: z.string().email().nullable().optional().or(z.literal('')),
  bankTransferInstructions: z.string().nullable().optional(),
  referralRewardAmount: z.number().optional(),
  paymentProviderNotes: z.string().nullable().optional()
});

const retailerSchema = z.object({
  organizationId: z.string(),
  customerId: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(6),
  companyName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  customerNumber: z.string().optional(),
  tier: z.enum(['standard', 'silver', 'gold', 'platinum']).optional(),
  creditLimit: z.number().optional(),
  paymentTerms: z.string().optional()
});

export class B2bAdminController {
  static async dashboard(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req);
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const settings = await getOrCreateB2bSettings(organizationId);
      const itemRepo = AppDataSource.getRepository(CatalogItem);
      const mappingRepo = AppDataSource.getRepository(ChannelMapping);
      const accountRepo = AppDataSource.getRepository(RetailerAccount);
      const orderRepo = AppDataSource.getRepository(Order);

      const totalCatalog = await itemRepo.count({
        where: { organization: { id: organizationId }, status: 'active', deletedAt: IsNull() }
      });
      const publishedMappings = await mappingRepo
        .createQueryBuilder('cm')
        .innerJoin('cm.catalogItem', 'ci')
        .where('ci.organization_id = :organizationId', { organizationId })
        .andWhere('cm.channel = :channel', { channel: 'b2b_portal' })
        .andWhere('cm.sync_enabled = 1')
        .getCount();
      const retailers = await accountRepo.count({ where: { organization: { id: organizationId } } });
      const ordersQb = orderRepo.createQueryBuilder('o')
        .where('o.organization_id = :organizationId', { organizationId })
        .andWhere('o.channel = :channel', { channel: 'b2b_portal' });
      const totalOrders = await ordersQb.clone().getCount();
      const openOrders = await ordersQb.clone()
        .andWhere('o.status IN (:...st)', { st: ['pending', 'confirmed', 'processing', 'on_hold'] })
        .getCount();
      const gmvRow = await ordersQb.clone()
        .select('COALESCE(SUM(o.total), 0)', 'gmv')
        .andWhere("o.status NOT IN ('cancelled', 'refunded')")
        .getRawOne();

      res.json({
        data: {
          settings,
          stats: {
            catalogProducts: totalCatalog,
            publishedProducts: settings.publishMode === 'all_active' ? totalCatalog : publishedMappings,
            retailers,
            totalOrders,
            openOrders,
            gmv: Number(gmvRow?.gmv ?? 0)
          }
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async getSettings(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req);
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const settings = await getOrCreateB2bSettings(organizationId);
      res.json({ data: settings });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const parsed = settingsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const settings = await getOrCreateB2bSettings(parsed.data.organizationId);
      if (parsed.data.enabled !== undefined) settings.enabled = parsed.data.enabled;
      if (parsed.data.publishMode) settings.publishMode = parsed.data.publishMode;
      if (parsed.data.assignedRepName !== undefined) settings.assignedRepName = parsed.data.assignedRepName;
      if (parsed.data.assignedRepPhone !== undefined) settings.assignedRepPhone = parsed.data.assignedRepPhone;
      if (parsed.data.assignedRepEmail !== undefined) {
        settings.assignedRepEmail = parsed.data.assignedRepEmail || null;
      }
      if (parsed.data.bankTransferInstructions !== undefined) {
        settings.bankTransferInstructions = parsed.data.bankTransferInstructions;
      }
      if (parsed.data.referralRewardAmount !== undefined) {
        settings.referralRewardAmount = parsed.data.referralRewardAmount;
      }
      if (parsed.data.paymentProviderNotes !== undefined) {
        settings.paymentProviderNotes = parsed.data.paymentProviderNotes;
      }
      if (parsed.data.defaultPriceListId !== undefined) {
        settings.defaultPriceList = parsed.data.defaultPriceListId
          ? await AppDataSource.getRepository(PriceList).findOne({ where: { id: parsed.data.defaultPriceListId } })
          : null;
      }
      if (parsed.data.defaultWarehouseId !== undefined) {
        settings.defaultWarehouse = parsed.data.defaultWarehouseId
          ? await AppDataSource.getRepository(Warehouse).findOne({ where: { id: parsed.data.defaultWarehouseId } })
          : null;
      }
      await AppDataSource.getRepository(B2bPortalSettings).save(settings);
      const saved = await getOrCreateB2bSettings(parsed.data.organizationId);
      res.json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async products(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req);
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const search = req.query.search ? String(req.query.search) : '';
      const publishedFilter = req.query.published ? String(req.query.published) : '';
      const page = parseInt(String(req.query.page ?? '1'), 10);
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);

      const qb = AppDataSource.getRepository(CatalogItem).createQueryBuilder('ci')
        .leftJoinAndSelect('ci.variants', 'v')
        .where('ci.organization_id = :organizationId', { organizationId })
        .andWhere('ci.deleted_at IS NULL')
        .orderBy('ci.name', 'ASC');
      if (search) {
        qb.andWhere('(ci.name LIKE :q OR ci.sku LIKE :q OR ci.brand LIKE :q)', { q: `%${search}%` });
      }

      const mappings = await AppDataSource.getRepository(ChannelMapping)
        .createQueryBuilder('cm')
        .innerJoin('cm.catalogItem', 'ci')
        .where('ci.organization_id = :organizationId', { organizationId })
        .andWhere('cm.channel = :channel', { channel: 'b2b_portal' })
        .getMany();
      const publishedIds = new Set(mappings.filter((m) => m.syncEnabled).map((m) => m.catalogItem?.id ?? (m as any).catalog_item_id).filter(Boolean).map(String));

      // Reload mappings with catalogItem ids
      const mappingRows = await AppDataSource.query(
        `SELECT catalog_item_id AS id FROM channel_mappings cm
         INNER JOIN catalog_items ci ON ci.id = cm.catalog_item_id
         WHERE ci.organization_id = ? AND cm.channel = 'b2b_portal' AND cm.sync_enabled = 1`,
        [organizationId]
      );
      const published = new Set((mappingRows as { id: string }[]).map((r) => String(r.id)));

      if (publishedFilter === 'true') {
        const ids = Array.from(published);
        if (ids.length === 0) {
          res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
          return;
        }
        qb.andWhere('ci.id IN (:...ids)', { ids });
      } else if (publishedFilter === 'false') {
        const ids = Array.from(published);
        if (ids.length > 0) qb.andWhere('ci.id NOT IN (:...ids)', { ids });
      }

      const [items, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
      res.json({
        data: items.map((item) => ({
          ...item,
          published: published.has(String(item.id))
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
      void publishedIds;
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async publish(req: Request, res: Response): Promise<void> {
    try {
      const parsed = z.object({
        organizationId: z.string(),
        catalogItemIds: z.array(z.string()).min(1)
      }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const items = await AppDataSource.getRepository(CatalogItem).find({
        where: { id: In(parsed.data.catalogItemIds), organization: { id: parsed.data.organizationId } }
      });
      const mappingRepo = AppDataSource.getRepository(ChannelMapping);
      for (const item of items) {
        let mapping = await mappingRepo.findOne({
          where: { catalogItem: { id: item.id }, channel: 'b2b_portal' }
        });
        if (!mapping) {
          mapping = mappingRepo.create({
            catalogItem: item,
            channel: 'b2b_portal',
            channelProductId: item.sku,
            syncEnabled: true,
            syncStatus: 'synced',
            lastSyncedAt: new Date()
          });
        } else {
          mapping.syncEnabled = true;
          mapping.syncStatus = 'synced';
          mapping.lastSyncedAt = new Date();
        }
        await mappingRepo.save(mapping);
      }
      res.json({ data: { published: items.length } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async unpublish(req: Request, res: Response): Promise<void> {
    try {
      const parsed = z.object({
        organizationId: z.string(),
        catalogItemIds: z.array(z.string()).min(1)
      }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      await AppDataSource.getRepository(ChannelMapping)
        .createQueryBuilder()
        .update(ChannelMapping)
        .set({ syncEnabled: false, syncStatus: 'disabled' })
        .where('channel = :channel', { channel: 'b2b_portal' })
        .andWhere('catalog_item_id IN (:...ids)', { ids: parsed.data.catalogItemIds })
        .execute();
      res.json({ data: { unpublished: parsed.data.catalogItemIds.length } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async retailers(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req);
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const search = req.query.search ? String(req.query.search) : '';
      const qb = AppDataSource.getRepository(RetailerAccount).createQueryBuilder('ra')
        .leftJoinAndSelect('ra.customer', 'c')
        .leftJoinAndSelect('ra.organization', 'org')
        .where('ra.organization_id = :organizationId', { organizationId })
        .orderBy('ra.createdAt', 'DESC');
      if (search) {
        qb.andWhere('(ra.email LIKE :q OR c.company_name LIKE :q OR c.first_name LIKE :q OR c.last_name LIKE :q)', {
          q: `%${search}%`
        });
      }
      const accounts = await qb.getMany();
      res.json({ data: accounts });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async createRetailer(req: Request, res: Response): Promise<void> {
    try {
      const parsed = retailerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const org = await AppDataSource.getRepository(Organization).findOne({ where: { id: parsed.data.organizationId } });
      if (!org) {
        res.status(400).json({ error: { message: 'Invalid organizationId' } });
        return;
      }
      const accountRepo = AppDataSource.getRepository(RetailerAccount);
      const existing = await accountRepo.findOne({
        where: { organization: { id: org.id }, email: parsed.data.email.toLowerCase() }
      });
      if (existing) {
        res.status(400).json({ error: { message: 'A retailer login already exists for this email' } });
        return;
      }

      const customerRepo = AppDataSource.getRepository(Customer);
      let customer: Customer | null = null;
      if (parsed.data.customerId) {
        customer = await customerRepo.findOne({ where: { id: parsed.data.customerId } });
        if (!customer) {
          res.status(400).json({ error: { message: 'Customer not found' } });
          return;
        }
      } else {
        customer = customerRepo.create({
          organization: org,
          email: parsed.data.email.toLowerCase(),
          phone: parsed.data.phone ?? null,
          firstName: parsed.data.firstName ?? null,
          lastName: parsed.data.lastName ?? null,
          companyName: parsed.data.companyName ?? null,
          customerType: 'wholesale',
          customerNumber: parsed.data.customerNumber ?? null,
          taxId: parsed.data.taxId ?? null,
          tier: parsed.data.tier ?? 'standard',
          creditLimit: parsed.data.creditLimit ?? 0,
          creditUsed: 0,
          paymentTerms: parsed.data.paymentTerms ?? '30 Days Net',
          status: 'active'
        });
        await customerRepo.save(customer);
      }

      if (parsed.data.creditLimit !== undefined) customer.creditLimit = parsed.data.creditLimit;
      if (parsed.data.paymentTerms) customer.paymentTerms = parsed.data.paymentTerms;
      if (parsed.data.tier) customer.tier = parsed.data.tier;
      customer.customerType = 'wholesale';
      await customerRepo.save(customer);

      const account = accountRepo.create({
        organization: org,
        customer,
        email: parsed.data.email.toLowerCase(),
        passwordHash: await hashPassword(parsed.data.password),
        status: 'active'
      });
      await accountRepo.save(account);
      const saved = await accountRepo.findOne({
        where: { id: account.id },
        relations: ['customer', 'organization']
      });
      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async updateRetailer(req: Request, res: Response): Promise<void> {
    try {
      const parsed = z.object({
        status: z.enum(['active', 'invited', 'disabled']).optional(),
        password: z.string().min(6).optional(),
        creditLimit: z.number().optional(),
        creditUsed: z.number().optional(),
        paymentTerms: z.string().nullable().optional(),
        tier: z.enum(['standard', 'silver', 'gold', 'platinum']).optional()
      }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const accountRepo = AppDataSource.getRepository(RetailerAccount);
      const account = await accountRepo.findOne({
        where: { id: req.params.id },
        relations: ['customer']
      });
      if (!account) {
        res.status(404).json({ error: { message: 'Retailer not found' } });
        return;
      }
      if (parsed.data.status) account.status = parsed.data.status;
      if (parsed.data.password) account.passwordHash = await hashPassword(parsed.data.password);
      await accountRepo.save(account);

      if (account.customer) {
        if (parsed.data.creditLimit !== undefined) account.customer.creditLimit = parsed.data.creditLimit;
        if (parsed.data.creditUsed !== undefined) account.customer.creditUsed = parsed.data.creditUsed;
        if (parsed.data.paymentTerms !== undefined) account.customer.paymentTerms = parsed.data.paymentTerms;
        if (parsed.data.tier) account.customer.tier = parsed.data.tier;
        await AppDataSource.getRepository(Customer).save(account.customer);
      }

      const saved = await accountRepo.findOne({
        where: { id: account.id },
        relations: ['customer', 'organization']
      });
      res.json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async orders(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req);
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const page = parseInt(String(req.query.page ?? '1'), 10);
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);
      const status = req.query.status ? String(req.query.status) : '';
      const search = req.query.search ? String(req.query.search) : '';
      const qb = AppDataSource.getRepository(Order).createQueryBuilder('o')
        .leftJoinAndSelect('o.customer', 'c')
        .leftJoinAndSelect('o.lines', 'l')
        .where('o.organization_id = :organizationId', { organizationId })
        .andWhere('o.channel = :channel', { channel: 'b2b_portal' })
        .orderBy('o.createdAt', 'DESC');
      if (status) qb.andWhere('o.status = :status', { status });
      if (search) {
        qb.andWhere('(o.order_number LIKE :q OR c.company_name LIKE :q OR c.email LIKE :q)', { q: `%${search}%` });
      }
      const [items, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
      res.json({
        data: items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async shipments(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req);
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      res.json({ data: await adminListShipments(organizationId) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async updateShipment(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req);
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const data = await adminUpdateShipment({
        organizationId,
        shipmentId: req.params.id,
        status: req.body?.status,
        carrier: req.body?.carrier,
        trackingNumber: req.body?.trackingNumber,
        notes: req.body?.notes,
        userId: (req as any).auth?.sub
      });
      res.json({ data });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async shippingMethods(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req);
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      await ensureDefaultShippingMethods(organizationId);
      const methods = await DS.getRepository(B2bShippingMethod).find({
        where: { organization: { id: organizationId } },
        order: { sortOrder: 'ASC' }
      });
      res.json({ data: methods });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async upsertShippingMethod(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req) || req.body?.organizationId;
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const data = await adminUpsertShippingMethod({
        organizationId,
        id: req.body?.id,
        data: req.body
      });
      res.json({ data });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async creditRequests(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req);
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const rows = await AppDataSource.getRepository(B2bCreditRequest).find({
        where: { organization: { id: organizationId } },
        relations: ['customer'],
        order: { createdAt: 'DESC' },
        take: 200
      });
      res.json({ data: rows });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async reviewCreditRequest(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req);
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const parsed = z
        .object({
          status: z.enum(['approved', 'rejected']),
          reviewNotes: z.string().optional(),
          approvedLimit: z.number().optional()
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const repo = AppDataSource.getRepository(B2bCreditRequest);
      const row = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'customer']
      });
      if (!row || row.organization.id !== organizationId) {
        res.status(404).json({ error: { message: 'Credit request not found' } });
        return;
      }
      if (row.status !== 'pending') {
        res.status(400).json({ error: { message: 'Request already reviewed' } });
        return;
      }
      row.status = parsed.data.status;
      row.reviewNotes = parsed.data.reviewNotes || null;
      row.reviewedAt = new Date();
      row.reviewedByUserId = (req as any).auth?.sub || null;
      if (parsed.data.status === 'approved' && row.customer) {
        row.customer.creditLimit = parsed.data.approvedLimit ?? Number(row.requestedLimit);
        await AppDataSource.getRepository(Customer).save(row.customer);
      }
      await repo.save(row);
      res.json({ data: row });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async notifications(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req);
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      res.json({ data: await adminListNotifications(organizationId) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async createNotification(req: Request, res: Response): Promise<void> {
    try {
      const parsed = z
        .object({
          organizationId: z.string(),
          customerId: z.string(),
          title: z.string().min(1),
          message: z.string().min(1),
          type: z.enum(['promo', 'system', 'delivery', 'credit']).optional(),
          actionUrl: z.string().nullable().optional()
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const row = await createNotification({
        orgId: parsed.data.organizationId,
        customerId: parsed.data.customerId,
        title: parsed.data.title,
        message: parsed.data.message,
        type: parsed.data.type,
        actionUrl: parsed.data.actionUrl
      });
      res.status(201).json({ data: row });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async referrals(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req);
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      res.json({ data: await adminListReferrals(organizationId) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async updateReferral(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req);
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const data = await adminUpdateReferral({
        organizationId,
        id: req.params.id,
        status: req.body?.status,
        notes: req.body?.notes
      });
      res.json({ data });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async payments(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = orgIdFromReq(req);
      if (!organizationId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const payments = await AppDataSource.getRepository(Payment).find({
        where: { organizationId },
        order: { createdAt: 'DESC' },
        take: 200
      });
      res.json({ data: payments });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
