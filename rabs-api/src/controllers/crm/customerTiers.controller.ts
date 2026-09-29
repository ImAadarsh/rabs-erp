import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { CustomerTier } from '@entities/crm/CustomerTier.js';
import { Organization } from '@entities/iam/Organization.js';
import { z } from 'zod';

const createCustomerTierSchema = z.object({
    organizationId: z.string(),
    tierName: z.string().min(1).max(100),
    tierCode: z.string().min(1).max(50),
    minLifetimeValue: z.number().nullable().optional(),
    minOrders: z.number().int().nullable().optional(),
    benefits: z.any().nullable().optional(),
    discountPercent: z.number().min(0).max(100).nullable().optional(),
    prioritySupport: z.boolean().default(false),
    position: z.number().int().default(0),
    isActive: z.boolean().default(true)
});

const updateCustomerTierSchema = z.object({
    tierName: z.string().min(1).max(100).optional(),
    tierCode: z.string().min(1).max(50).optional(),
    minLifetimeValue: z.number().nullable().optional(),
    minOrders: z.number().int().nullable().optional(),
    benefits: z.any().nullable().optional(),
    discountPercent: z.number().min(0).max(100).nullable().optional(),
    prioritySupport: z.boolean().optional(),
    position: z.number().int().optional(),
    isActive: z.boolean().optional()
});

export class CustomerTiersController {
    static async list(req: Request, res: Response): Promise<void> {
        const repo = AppDataSource.getRepository(CustomerTier);
        const items = await repo.find({
            relations: ['organization'],
            order: { position: 'ASC' }
        });
        res.json({ data: items });
    }

    static async get(req: Request, res: Response): Promise<void> {
        const repo = AppDataSource.getRepository(CustomerTier);
        const item = await repo.findOne({
            where: { id: req.params.id },
            relations: ['organization']
        });
        if (!item) {
            res.status(404).json({ error: { message: 'Customer tier not found' } });
            return;
        }
        res.json({ data: item });
    }

    static async create(req: Request, res: Response): Promise<void> {
        const parsed = createCustomerTierSchema.safeParse(req.body);
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

        const repo = AppDataSource.getRepository(CustomerTier);
        const item = repo.create({
            ...parsed.data,
            organization: org
        });

        await repo.save(item);
        res.status(201).json({ data: item });
    }

    static async update(req: Request, res: Response): Promise<void> {
        const parsed = updateCustomerTierSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
            return;
        }

        const repo = AppDataSource.getRepository(CustomerTier);
        const item = await repo.findOne({ where: { id: req.params.id } });
        if (!item) {
            res.status(404).json({ error: { message: 'Customer tier not found' } });
            return;
        }

        Object.assign(item, parsed.data);
        await repo.save(item);
        res.json({ data: item });
    }

    static async remove(req: Request, res: Response): Promise<void> {
        const repo = AppDataSource.getRepository(CustomerTier);
        const item = await repo.findOne({ where: { id: req.params.id } });
        if (!item) {
            res.status(404).json({ error: { message: 'Customer tier not found' } });
            return;
        }
        await repo.remove(item);
        res.status(204).send();
    }
}
