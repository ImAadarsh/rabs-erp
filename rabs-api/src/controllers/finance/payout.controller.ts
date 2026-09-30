import { Request, Response } from 'express';
import { AppDataSource } from '../../config/data-source.js';
import { Payout } from '../../entities/finance/Payout.js';
import { z } from 'zod';

const createSchema = z.object({
    organizationId: z.string().min(1),
    payoutNumber: z.string().min(1),
    payeeType: z.enum(['supplier', 'affiliate', 'employee', 'partner', 'other']),
    payeeId: z.string().min(1),
    payeeName: z.string().min(1),
    amount: z.number().positive(),
    currency: z.string().length(3).default('GBP'),
    paymentMethod: z.enum(['bank_transfer', 'paypal', 'check', 'cash', 'other']),
    bankAccountNumber: z.string().optional(),
    bankRoutingNumber: z.string().optional(),
    paypalEmail: z.string().email().optional(),
    reference: z.string().optional(),
    payoutDate: z.string(),
    status: z.enum(['pending', 'approved', 'processing', 'completed', 'failed', 'cancelled']).default('pending'),
    notes: z.string().optional()
});

const updateSchema = createSchema.partial().omit({ organizationId: true });

export class PayoutController {
    static async list(req: Request, res: Response) {
        try {
            const orgId = req.query.organizationId as string;
            if (!orgId) return res.status(400).json({ error: { message: 'organizationId is required' } });

            const repo = AppDataSource.getRepository(Payout);
            const items = await repo.find({
                where: { organizationId: orgId },
                order: { createdAt: 'DESC' }
            });

            res.json({ data: items });
        } catch (error: any) {
            res.status(500).json({ error: { message: error.message } });
        }
    }

    static async get(req: Request, res: Response) {
        try {
            const repo = AppDataSource.getRepository(Payout);
            const item = await repo.findOne({ where: { id: req.params.id } });

            if (!item) return res.status(404).json({ error: { message: 'Payout not found' } });
            res.json({ data: item });
        } catch (error: any) {
            res.status(500).json({ error: { message: error.message } });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const data = createSchema.parse(req.body);
            const repo = AppDataSource.getRepository(Payout);

            const item = repo.create({
                ...data,
                payoutDate: new Date(data.payoutDate)
            });

            const saved = await repo.save(item);
            res.status(201).json({ data: saved });
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: { message: error.errors[0].message } });
            }
            res.status(500).json({ error: { message: error.message } });
        }
    }

    static async update(req: Request, res: Response) {
        try {
            const data = updateSchema.parse(req.body);
            const repo = AppDataSource.getRepository(Payout);

            const item = await repo.findOne({ where: { id: req.params.id } });
            if (!item) return res.status(404).json({ error: { message: 'Payout not found' } });

            Object.assign(item, data);
            if (data.payoutDate) {
                item.payoutDate = new Date(data.payoutDate);
            }

            const saved = await repo.save(item);
            res.json({ data: saved });
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: { message: error.errors[0].message } });
            }
            res.status(500).json({ error: { message: error.message } });
        }
    }

    static async remove(req: Request, res: Response) {
        try {
            const repo = AppDataSource.getRepository(Payout);
            const item = await repo.findOne({ where: { id: req.params.id } });
            if (!item) return res.status(404).json({ error: { message: 'Payout not found' } });

            await repo.remove(item);
            res.status(204).send();
        } catch (error: any) {
            res.status(500).json({ error: { message: error.message } });
        }
    }
}
