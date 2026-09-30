import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { OrderNote } from '@entities/orders/OrderNote.js';
import { z } from 'zod';
import { Order } from '@entities/orders/Order.js';
import { User } from '@entities/iam/User.js';

const createOrderNoteSchema = z.object({
  orderId: z.string(),
  noteType: z.enum(['internal', 'customer', 'system']).optional(),
  note: z.string().min(1),
  isCustomerVisible: z.boolean().optional()
});

const updateOrderNoteSchema = z.object({
  noteType: z.enum(['internal', 'customer', 'system']).optional(),
  note: z.string().min(1).optional(),
  isCustomerVisible: z.boolean().optional()
});

export class OrderNotesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(OrderNote);
      const { orderId, noteType } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('on')
        .leftJoinAndSelect('on.order', 'ord')
        .leftJoinAndSelect('on.createdBy', 'user')
        .orderBy('on.createdAt', 'DESC');

      if (orderId) {
        queryBuilder.andWhere('on.order_id = :orderId', { orderId });
      }

      if (noteType) {
        queryBuilder.andWhere('on.note_type = :noteType', { noteType });
      }

      const items = await queryBuilder.getMany();
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(OrderNote);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['order', 'createdBy']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Order note not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createOrderNoteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const orderRepo = AppDataSource.getRepository(Order);
      const order = await orderRepo.findOne({ where: { id: parsed.data.orderId } });
      if (!order) {
        res.status(400).json({ error: { message: 'Invalid orderId' } });
        return;
      }

      const repo = AppDataSource.getRepository(OrderNote);
      const item = repo.create({
        order,
        noteType: parsed.data.noteType ?? 'internal',
        note: parsed.data.note,
        isCustomerVisible: parsed.data.isCustomerVisible ?? false,
        createdBy: (req as any).user ? { id: (req as any).user.id } as User : null
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['order', 'createdBy']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateOrderNoteSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(OrderNote);
      const item = await repo.findOne({
        where: { id },
        relations: ['order', 'createdBy']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Order note not found' } });
        return;
      }

      if (parsed.data.noteType) item.noteType = parsed.data.noteType;
      if (parsed.data.note) item.note = parsed.data.note;
      if (parsed.data.isCustomerVisible !== undefined) item.isCustomerVisible = parsed.data.isCustomerVisible;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['order', 'createdBy']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(OrderNote);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Order note not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

