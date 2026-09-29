import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Return } from '@entities/orders/Return.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { Order } from '@entities/orders/Order.js';
import { Customer } from '@entities/orders/Customer.js';
import { IsNull } from 'typeorm';
import { refundOrderOnChannel } from '@services/orders/channelRefund.service.js';

const createReturnSchema = z.object({
  organizationId: z.string(),
  returnNumber: z.string().min(1),
  orderId: z.string(),
  customerId: z.string(),
  returnDate: z.string(),
  reasonCode: z.enum(['defective', 'wrong_item', 'not_as_described', 'size_issue', 'changed_mind', 'damaged_in_transit', 'other']),
  reasonNotes: z.string().optional(),
  refundMethod: z.enum(['original_payment', 'store_credit', 'exchange', 'no_refund']).optional(),
  refundAmount: z.number().optional(),
  restockingFee: z.number().optional(),
  returnShippingPaidBy: z.enum(['customer', 'merchant']).optional(),
  status: z.enum(['requested', 'approved', 'rejected', 'received', 'refunded', 'completed', 'cancelled']).optional(),
  notes: z.string().optional()
});

const updateReturnSchema = z.object({
  returnNumber: z.string().min(1).optional(),
  returnDate: z.string().optional(),
  reasonCode: z.enum(['defective', 'wrong_item', 'not_as_described', 'size_issue', 'changed_mind', 'damaged_in_transit', 'other']).optional(),
  reasonNotes: z.string().optional(),
  refundMethod: z.enum(['original_payment', 'store_credit', 'exchange', 'no_refund']).optional(),
  refundAmount: z.number().optional(),
  restockingFee: z.number().optional(),
  returnShippingPaidBy: z.enum(['customer', 'merchant']).optional(),
  status: z.enum(['requested', 'approved', 'rejected', 'received', 'refunded', 'completed', 'cancelled']).optional(),
  notes: z.string().optional()
});

const processRefundSchema = z.object({
  amount: z.coerce.number().positive().optional()
});

export class ReturnsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(Return);
      const { organizationId, orderId, customerId, status, search, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('r')
        .leftJoinAndSelect('r.organization', 'org')
        .leftJoinAndSelect('r.order', 'ord')
        .leftJoinAndSelect('r.customer', 'cust')
        .orderBy('r.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('r.organization_id = :orgId', { orgId: organizationId });
      }

      if (orderId) {
        queryBuilder.andWhere('r.order_id = :orderId', { orderId });
      }

      if (customerId) {
        queryBuilder.andWhere('r.customer_id = :customerId', { customerId });
      }

      if (status) {
        queryBuilder.andWhere('r.status = :status', { status });
      }

      if (search) {
        queryBuilder.andWhere(
          '(r.return_number LIKE :search)',
          { search: `%${search}%` }
        );
      }

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      queryBuilder.skip(skip).take(parseInt(limit as string));

      const [items, total] = await queryBuilder.getManyAndCount();
      
      res.json({ 
        data: items, 
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
      const repo = AppDataSource.getRepository(Return);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'order', 'customer', 'lines', 'lines.orderLine', 'lines.variant', 'approvedBy']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Return not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createReturnSchema.safeParse(req.body);
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

      const orderRepo = AppDataSource.getRepository(Order);
      const order = await orderRepo.findOne({
        where: { id: parsed.data.orderId },
        relations: ['organization', 'customer']
      });
      if (!order) {
        res.status(400).json({ error: { message: 'Invalid orderId' } });
        return;
      }
      if (order.organization.id !== org.id) {
        res.status(400).json({ error: { message: 'Order does not belong to this organization' } });
        return;
      }
      if (order.status !== 'completed') {
        res.status(422).json({ error: { message: 'Only completed orders can be returned or refunded' } });
        return;
      }

      const custRepo = AppDataSource.getRepository(Customer);
      const customer = await custRepo.findOne({
        where: { id: parsed.data.customerId, deletedAt: IsNull() },
        relations: ['organization']
      });
      if (!customer) {
        res.status(400).json({ error: { message: 'Invalid customerId' } });
        return;
      }
      if (customer.organization.id !== org.id || order.customer?.id !== customer.id) {
        res.status(400).json({ error: { message: 'Customer does not match the selected order' } });
        return;
      }

      const repo = AppDataSource.getRepository(Return);
      const existing = await repo.findOne({
        where: { returnNumber: parsed.data.returnNumber }
      });
      
      if (existing) {
        res.status(400).json({ error: { message: 'Return number already exists' } });
        return;
      }

      const item = repo.create({
        organization: org,
        returnNumber: parsed.data.returnNumber,
        order: order,
        customer: customer,
        returnDate: new Date(parsed.data.returnDate),
        reasonCode: parsed.data.reasonCode,
        reasonNotes: parsed.data.reasonNotes ?? null,
        refundMethod: parsed.data.refundMethod ?? 'original_payment',
        refundAmount: parsed.data.refundAmount ?? 0.00,
        restockingFee: parsed.data.restockingFee ?? 0.00,
        returnShippingPaidBy: parsed.data.returnShippingPaidBy ?? 'customer',
        status: 'requested',
        notes: parsed.data.notes ?? null
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'order', 'customer']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateReturnSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(Return);
      const item = await repo.findOne({
        where: { id },
        relations: ['organization', 'order', 'customer']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Return not found' } });
        return;
      }
      if (
        parsed.data.status &&
        ['refunded', 'completed'].includes(parsed.data.status) &&
        parsed.data.status !== item.status
      ) {
        res.status(422).json({
          error: { message: 'Use the refund action to mark a return as refunded or completed' }
        });
        return;
      }

      if (parsed.data.returnNumber && parsed.data.returnNumber !== item.returnNumber) {
        const existing = await repo.findOne({
          where: { returnNumber: parsed.data.returnNumber }
        });
        
        if (existing) {
          res.status(400).json({ error: { message: 'Return number already exists' } });
          return;
        }
      }

      if (parsed.data.returnNumber) item.returnNumber = parsed.data.returnNumber;
      if (parsed.data.returnDate) item.returnDate = new Date(parsed.data.returnDate);
      if (parsed.data.reasonCode) item.reasonCode = parsed.data.reasonCode;
      if (parsed.data.reasonNotes !== undefined) item.reasonNotes = parsed.data.reasonNotes ?? null;
      if (parsed.data.refundMethod) item.refundMethod = parsed.data.refundMethod;
      if (parsed.data.refundAmount !== undefined) item.refundAmount = parsed.data.refundAmount;
      if (parsed.data.restockingFee !== undefined) item.restockingFee = parsed.data.restockingFee;
      if (parsed.data.returnShippingPaidBy) item.returnShippingPaidBy = parsed.data.returnShippingPaidBy;
      if (parsed.data.status) item.status = parsed.data.status;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes ?? null;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'order', 'customer']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(Return);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Return not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async refund(req: Request, res: Response): Promise<void> {
    const parsed = processRefundSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid refund amount', details: parsed.error.issues } });
      return;
    }

    try {
      const repo = AppDataSource.getRepository(Return);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: [
          'organization',
          'order',
          'order.organization',
          'order.channelConnection',
          'customer'
        ]
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Return not found' } });
        return;
      }
      if (item.status === 'refunded' || item.status === 'completed') {
        res.status(409).json({ error: { message: 'This return has already been refunded' } });
        return;
      }
      if (item.refundedAt) {
        res.status(409).json({ error: { message: 'A refund is already being processed for this return' } });
        return;
      }
      if (item.status === 'rejected' || item.status === 'cancelled') {
        res.status(422).json({ error: { message: `A ${item.status} return cannot be refunded` } });
        return;
      }
      if (item.refundMethod !== 'original_payment') {
        res.status(422).json({ error: { message: 'Channel refunds require the original payment method' } });
        return;
      }
      if (item.order.organization.id !== item.organization.id) {
        res.status(409).json({ error: { message: 'Return and order organizations do not match' } });
        return;
      }
      if (item.order.status !== 'completed') {
        res.status(422).json({ error: { message: 'Only completed orders can be refunded' } });
        return;
      }

      const amount = parsed.data.amount ?? Number(item.refundAmount);
      const raw = await repo
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r.refund_amount), 0)', 'total')
        .where('r.order_id = :orderId', { orderId: item.order.id })
        .andWhere('r.status IN (:...statuses)', { statuses: ['refunded', 'completed'] })
        .getRawOne<{ total: string }>();
      const alreadyRefunded = Number(raw?.total ?? 0);
      const orderTotal = Number(item.order.total);
      const remaining = Math.max(0, orderTotal - alreadyRefunded);

      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(422).json({ error: { message: 'Refund amount must be greater than zero' } });
        return;
      }
      if (amount > remaining + 0.0001) {
        res.status(422).json({
          error: { message: `Refund amount exceeds the remaining refundable amount of ${item.order.currency} ${remaining.toFixed(2)}` }
        });
        return;
      }

      const reason = item.reasonNotes?.trim() || `Return ${item.returnNumber}: ${item.reasonCode}`;
      // Atomically reserve this return before contacting the remote channel. This
      // prevents double-clicks or concurrent API requests from issuing two refunds.
      const reservationTime = new Date();
      const reservation = await repo
        .createQueryBuilder()
        .update(Return)
        .set({ refundedAt: reservationTime })
        .where('id = :id', { id: item.id })
        .andWhere('refunded_at IS NULL')
        .andWhere('status NOT IN (:...statuses)', { statuses: ['refunded', 'completed'] })
        .execute();
      if (reservation.affected !== 1) {
        res.status(409).json({ error: { message: 'A refund is already being processed for this return' } });
        return;
      }

      let channelResult;
      try {
        channelResult = await refundOrderOnChannel(item.order, amount, reason);
      } catch (error) {
        // The channel rejected the request, so release the reservation for a
        // corrected retry. Once the channel succeeds we deliberately retain it
        // even if a later local save fails, avoiding an accidental double refund.
        await repo
          .createQueryBuilder()
          .update(Return)
          .set({ refundedAt: null })
          .where('id = :id', { id: item.id })
          .andWhere('status NOT IN (:...statuses)', { statuses: ['refunded', 'completed'] })
          .execute();
        throw error;
      }
      const refundedAt = new Date();
      const fullyRefunded = amount >= remaining - 0.0001;

      item.refundAmount = amount;
      item.status = 'refunded';
      item.refundedAt = refundedAt;
      const marker = `External refund: ${channelResult.channel}#${channelResult.externalRefundId}`;
      item.notes = item.notes ? `${item.notes}\n${marker}` : marker;
      if (fullyRefunded) {
        item.order.status = 'refunded';
        item.order.paymentStatus = 'refunded';
      }

      await AppDataSource.transaction(async (manager) => {
        await manager.save(item.order);
        await manager.save(item);
      });

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'order', 'order.channelConnection', 'customer']
      });
      res.json({
        data: saved,
        refund: {
          ...channelResult,
          amount,
          currency: item.order.currency,
          fullyRefunded
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Refund failed';
      res.status(422).json({ error: { message } });
    }
  }
}

