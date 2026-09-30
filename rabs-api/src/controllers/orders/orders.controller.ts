import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Order } from '@entities/orders/Order.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { Customer } from '@entities/orders/Customer.js';
import { IsNull } from 'typeorm';

const createOrderSchema = z.object({
  organizationId: z.string(),
  businessUnitId: z.string().optional(),
  orderNumber: z.string().min(1),
  channel: z.enum(['amazon', 'ebay', 'tiktok', 'etsy', 'shopify', 'woocommerce', 'wix', 'b2b_portal', 'pos', 'phone', 'email', 'other']),
  channelOrderId: z.string().optional(),
  channelOrderNumber: z.string().optional(),
  customerId: z.string().optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  orderDate: z.string(),
  currency: z.string().length(3).optional(),
  subtotal: z.number().optional(),
  discountAmount: z.number().optional(),
  shippingAmount: z.number().optional(),
  taxAmount: z.number().optional(),
  total: z.number(),
  paymentStatus: z.enum(['pending', 'authorized', 'partially_paid', 'paid', 'refunded', 'failed']).optional(),
  fulfillmentStatus: z.enum(['pending', 'processing', 'partially_fulfilled', 'fulfilled', 'cancelled']).optional(),
  shippingMethod: z.string().optional(),
  requestedDeliveryDate: z.string().optional(),
  giftMessage: z.string().optional(),
  internalNotes: z.string().optional(),
  customerNotes: z.string().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  fraudScore: z.number().optional(),
  fraudStatus: z.enum(['clear', 'review', 'flagged', 'blocked']).optional(),
  tags: z.string().optional(),
  status: z.enum(['pending', 'confirmed', 'processing', 'completed', 'cancelled', 'refunded', 'on_hold']).optional()
});

const updateOrderSchema = z.object({
  orderNumber: z.string().min(1).optional(),
  channel: z.enum(['amazon', 'ebay', 'tiktok', 'etsy', 'shopify', 'woocommerce', 'wix', 'b2b_portal', 'pos', 'phone', 'email', 'other']).optional(),
  channelOrderId: z.string().optional(),
  channelOrderNumber: z.string().optional(),
  customerId: z.string().optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  orderDate: z.string().optional(),
  currency: z.string().length(3).optional(),
  subtotal: z.number().optional(),
  discountAmount: z.number().optional(),
  shippingAmount: z.number().optional(),
  taxAmount: z.number().optional(),
  total: z.number().optional(),
  paymentStatus: z.enum(['pending', 'authorized', 'partially_paid', 'paid', 'refunded', 'failed']).optional(),
  fulfillmentStatus: z.enum(['pending', 'processing', 'partially_fulfilled', 'fulfilled', 'cancelled']).optional(),
  shippingMethod: z.string().optional(),
  requestedDeliveryDate: z.string().optional(),
  giftMessage: z.string().optional(),
  internalNotes: z.string().optional(),
  customerNotes: z.string().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  fraudScore: z.number().optional(),
  fraudStatus: z.enum(['clear', 'review', 'flagged', 'blocked']).optional(),
  tags: z.string().optional(),
  status: z.enum(['pending', 'confirmed', 'processing', 'completed', 'cancelled', 'refunded', 'on_hold']).optional()
});

export class OrdersController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(Order);
      const {
        organizationId, customerId, status, paymentStatus, fulfillmentStatus, channel,
        connectionId, dateFrom, dateTo, minTotal, maxTotal, currency, hasLines,
        search, sortBy, sortDir, page = '1', limit = '50'
      } = req.query;

      const queryBuilder = repo.createQueryBuilder('o')
        .leftJoinAndSelect('o.organization', 'org')
        .leftJoinAndSelect('o.customer', 'cust')
        .leftJoinAndSelect('o.businessUnit', 'bu')
        .leftJoinAndSelect('o.channelConnection', 'conn');

      // Whitelist sortable columns so the query param can't inject SQL.
      // These must be entity property paths: TypeORM resolves them against the
      // metadata when it wraps a joined query for pagination.
      const sortable: Record<string, string> = {
        orderDate: 'o.orderDate',
        createdAt: 'o.createdAt',
        total: 'o.total',
        orderNumber: 'o.orderNumber',
        status: 'o.status',
        paymentStatus: 'o.paymentStatus',
        channel: 'o.channel'
      };
      const sortColumn = sortable[String(sortBy)] ?? 'o.createdAt';
      const sortDirection = String(sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      queryBuilder.orderBy(sortColumn, sortDirection);

      if (organizationId) {
        queryBuilder.andWhere('o.organization_id = :orgId', { orgId: organizationId });
      }

      if (customerId) {
        queryBuilder.andWhere('o.customer_id = :customerId', { customerId });
      }

      if (status) {
        queryBuilder.andWhere('o.status = :status', { status });
      }

      if (paymentStatus) {
        queryBuilder.andWhere('o.payment_status = :paymentStatus', { paymentStatus });
      }

      if (fulfillmentStatus) {
        queryBuilder.andWhere('o.fulfillment_status = :fulfillmentStatus', { fulfillmentStatus });
      }

      if (channel) {
        queryBuilder.andWhere('o.channel = :channel', { channel });
      }

      if (connectionId) {
        queryBuilder.andWhere('o.channel_connection_id = :connectionId', { connectionId });
      }

      if (dateFrom) {
        queryBuilder.andWhere('o.order_date >= :dateFrom', { dateFrom: new Date(String(dateFrom)) });
      }

      if (dateTo) {
        // Inclusive of the whole end day.
        const end = new Date(String(dateTo));
        end.setHours(23, 59, 59, 999);
        queryBuilder.andWhere('o.order_date <= :dateTo', { dateTo: end });
      }

      if (minTotal) {
        queryBuilder.andWhere('o.total >= :minTotal', { minTotal: Number(minTotal) });
      }

      if (maxTotal) {
        queryBuilder.andWhere('o.total <= :maxTotal', { maxTotal: Number(maxTotal) });
      }

      if (currency) {
        queryBuilder.andWhere('o.currency = :currency', { currency });
      }

      if (hasLines === 'true' || hasLines === 'false') {
        const op = hasLines === 'true' ? 'EXISTS' : 'NOT EXISTS';
        queryBuilder.andWhere(
          `${op} (SELECT 1 FROM order_lines ol WHERE ol.order_id = o.id)`
        );
      }

      if (search) {
        queryBuilder.andWhere(
          '(o.order_number LIKE :search OR o.channel_order_id LIKE :search OR o.channel_order_number LIKE :search OR o.customer_email LIKE :search OR o.customer_phone LIKE :search OR conn.name LIKE :search)',
          { search: `%${search}%` }
        );
      }

      // Totals for the whole filtered set, not just the current page.
      const totals = await queryBuilder
        .clone()
        .select('SUM(o.total)', 'value')
        .addSelect('COUNT(o.id)', 'count')
        .orderBy()
        .getRawOne<{ value: string | null; count: string }>();

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      queryBuilder.skip(skip).take(parseInt(limit as string));

      const [items, total] = await queryBuilder.getManyAndCount();

      res.json({
        data: items,
        summary: {
          totalValue: Number(totals?.value ?? 0),
          count: Number(totals?.count ?? 0)
        },
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string))
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(Order);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'businessUnit', 'customer', 'channelConnection', 'lines', 'lines.variant', 'addresses', 'notes', 'createdBy']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Order not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createOrderSchema.safeParse(req.body);
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

      let businessUnit = null;
      if (parsed.data.businessUnitId) {
        const buRepo = AppDataSource.getRepository(BusinessUnit);
        businessUnit = await buRepo.findOne({ where: { id: parsed.data.businessUnitId } });
        if (!businessUnit) {
          res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
          return;
        }
      }

      let customer = null;
      if (parsed.data.customerId) {
        const custRepo = AppDataSource.getRepository(Customer);
        customer = await custRepo.findOne({ where: { id: parsed.data.customerId, deletedAt: IsNull() } });
        if (!customer) {
          res.status(400).json({ error: { message: 'Invalid customerId' } });
          return;
        }
      }

      const repo = AppDataSource.getRepository(Order);
      const existing = await repo.findOne({
        where: { orderNumber: parsed.data.orderNumber }
      });
      
      if (existing) {
        res.status(400).json({ error: { message: 'Order number already exists' } });
        return;
      }

      const item = repo.create({
        organization: org,
        businessUnit: businessUnit,
        orderNumber: parsed.data.orderNumber,
        channel: parsed.data.channel,
        channelOrderId: parsed.data.channelOrderId ?? null,
        channelOrderNumber: parsed.data.channelOrderNumber ?? null,
        customer: customer,
        customerEmail: parsed.data.customerEmail ?? null,
        customerPhone: parsed.data.customerPhone ?? null,
        orderDate: new Date(parsed.data.orderDate),
        currency: parsed.data.currency ?? 'GBP',
        subtotal: parsed.data.subtotal ?? 0.00,
        discountAmount: parsed.data.discountAmount ?? 0.00,
        shippingAmount: parsed.data.shippingAmount ?? 0.00,
        taxAmount: parsed.data.taxAmount ?? 0.00,
        total: parsed.data.total,
        paymentStatus: parsed.data.paymentStatus ?? 'pending',
        fulfillmentStatus: parsed.data.fulfillmentStatus ?? 'pending',
        shippingMethod: parsed.data.shippingMethod ?? null,
        requestedDeliveryDate: parsed.data.requestedDeliveryDate ? new Date(parsed.data.requestedDeliveryDate) : null,
        giftMessage: parsed.data.giftMessage ?? null,
        internalNotes: parsed.data.internalNotes ?? null,
        customerNotes: parsed.data.customerNotes ?? null,
        ipAddress: parsed.data.ipAddress ?? null,
        userAgent: parsed.data.userAgent ?? null,
        fraudScore: parsed.data.fraudScore ?? null,
        fraudStatus: parsed.data.fraudStatus ?? 'clear',
        tags: parsed.data.tags ?? null,
        status: parsed.data.status ?? 'pending'
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'customer', 'businessUnit']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateOrderSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(Order);
      const item = await repo.findOne({
        where: { id },
        relations: ['organization', 'customer', 'businessUnit']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Order not found' } });
        return;
      }

      if (parsed.data.orderNumber && parsed.data.orderNumber !== item.orderNumber) {
        const existing = await repo.findOne({
          where: { orderNumber: parsed.data.orderNumber }
        });
        
        if (existing) {
          res.status(400).json({ error: { message: 'Order number already exists' } });
          return;
        }
      }

      if (parsed.data.customerId) {
        const custRepo = AppDataSource.getRepository(Customer);
        const customer = await custRepo.findOne({ where: { id: parsed.data.customerId, deletedAt: IsNull() } });
        if (!customer) {
          res.status(400).json({ error: { message: 'Invalid customerId' } });
          return;
        }
        item.customer = customer;
      }

      if (parsed.data.orderNumber) item.orderNumber = parsed.data.orderNumber;
      if (parsed.data.channel) item.channel = parsed.data.channel;
      if (parsed.data.channelOrderId !== undefined) item.channelOrderId = parsed.data.channelOrderId ?? null;
      if (parsed.data.channelOrderNumber !== undefined) item.channelOrderNumber = parsed.data.channelOrderNumber ?? null;
      if (parsed.data.customerEmail !== undefined) item.customerEmail = parsed.data.customerEmail ?? null;
      if (parsed.data.customerPhone !== undefined) item.customerPhone = parsed.data.customerPhone ?? null;
      if (parsed.data.orderDate) item.orderDate = new Date(parsed.data.orderDate);
      if (parsed.data.currency) item.currency = parsed.data.currency;
      if (parsed.data.subtotal !== undefined) item.subtotal = parsed.data.subtotal;
      if (parsed.data.discountAmount !== undefined) item.discountAmount = parsed.data.discountAmount;
      if (parsed.data.shippingAmount !== undefined) item.shippingAmount = parsed.data.shippingAmount;
      if (parsed.data.taxAmount !== undefined) item.taxAmount = parsed.data.taxAmount;
      if (parsed.data.total !== undefined) item.total = parsed.data.total;
      if (parsed.data.paymentStatus) item.paymentStatus = parsed.data.paymentStatus;
      if (parsed.data.fulfillmentStatus) item.fulfillmentStatus = parsed.data.fulfillmentStatus;
      if (parsed.data.shippingMethod !== undefined) item.shippingMethod = parsed.data.shippingMethod ?? null;
      if (parsed.data.requestedDeliveryDate !== undefined) item.requestedDeliveryDate = parsed.data.requestedDeliveryDate ? new Date(parsed.data.requestedDeliveryDate) : null;
      if (parsed.data.giftMessage !== undefined) item.giftMessage = parsed.data.giftMessage ?? null;
      if (parsed.data.internalNotes !== undefined) item.internalNotes = parsed.data.internalNotes ?? null;
      if (parsed.data.customerNotes !== undefined) item.customerNotes = parsed.data.customerNotes ?? null;
      if (parsed.data.ipAddress !== undefined) item.ipAddress = parsed.data.ipAddress ?? null;
      if (parsed.data.userAgent !== undefined) item.userAgent = parsed.data.userAgent ?? null;
      if (parsed.data.fraudScore !== undefined) item.fraudScore = parsed.data.fraudScore ?? null;
      if (parsed.data.fraudStatus) item.fraudStatus = parsed.data.fraudStatus;
      if (parsed.data.tags !== undefined) item.tags = parsed.data.tags ?? null;
      if (parsed.data.status) item.status = parsed.data.status;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'customer', 'businessUnit']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(Order);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Order not found' } });
        return;
      }

      // Orders are hard deleted (no soft delete in schema)
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

