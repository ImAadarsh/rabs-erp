import { Request, Response } from 'express';
import { AppDataSource } from '../../config/data-source.js';
import { Settlement } from '../../entities/finance/Settlement.js';
import { z } from 'zod';

const createSchema = z.object({
    organizationId: z.string().min(1),
    businessUnitId: z.string().optional(),
    channel: z.enum(['amazon', 'ebay', 'tiktok', 'etsy', 'shopify', 'woocommerce', 'other']),
    settlementId: z.string().min(1),
    settlementDate: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    currency: z.string().length(3).default('GBP'),
    totalAmount: z.number(),
    orderCount: z.number().int().nonnegative().default(0),
    status: z.enum(['pending', 'imported', 'reconciled', 'disputed']).default('pending'),
    lines: z.array(z.object({
        type: z.enum(['order', 'refund', 'fee', 'adjustment', 'other']),
        amount: z.number(),
        orderId: z.string().optional(),
        description: z.string().optional()
    })).optional()
});

const updateSchema = createSchema.partial().omit({ organizationId: true, lines: true });

export class SettlementController {
    static async list(req: Request, res: Response) {
        try {
            const orgId = req.query.organizationId as string;
            if (!orgId) return res.status(400).json({ error: { message: 'organizationId is required' } });

            const repo = AppDataSource.getRepository(Settlement);
            const items = await repo.find({
                where: { organizationId: orgId },
                order: { settlementDate: 'DESC' }
            });

            res.json({ data: items });
        } catch (error: any) {
            res.status(500).json({ error: { message: error.message } });
        }
    }

    static async get(req: Request, res: Response) {
        try {
            const repo = AppDataSource.getRepository(Settlement);
            const item = await repo.findOne({
                where: { id: req.params.id },
                relations: ['lines']
            });

            if (!item) return res.status(404).json({ error: { message: 'Settlement not found' } });
            res.json({ data: item });
        } catch (error: any) {
            res.status(500).json({ error: { message: error.message } });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const data = createSchema.parse(req.body);
            const repo = AppDataSource.getRepository(Settlement);

            const item = repo.create({
                ...data,
                settlementDate: new Date(data.settlementDate),
                startDate: new Date(data.startDate),
                endDate: new Date(data.endDate),
                lines: data.lines // Cascade save should handle this
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
            const repo = AppDataSource.getRepository(Settlement);

            const item = await repo.findOne({ where: { id: req.params.id } });
            if (!item) return res.status(404).json({ error: { message: 'Settlement not found' } });

            Object.assign(item, data);
            if (data.settlementDate) item.settlementDate = new Date(data.settlementDate);
            if (data.startDate) item.startDate = new Date(data.startDate);
            if (data.endDate) item.endDate = new Date(data.endDate);

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
            const repo = AppDataSource.getRepository(Settlement);
            const item = await repo.findOne({ where: { id: req.params.id } });
            if (!item) return res.status(404).json({ error: { message: 'Settlement not found' } });

            await repo.remove(item);
            res.status(204).send();
        } catch (error: any) {
            res.status(500).json({ error: { message: error.message } });
        }
    }
}
