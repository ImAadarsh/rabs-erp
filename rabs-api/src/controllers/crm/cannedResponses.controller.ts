import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { CannedResponse } from '@entities/crm/CannedResponse.js';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';
import { z } from 'zod';

const createCannedResponseSchema = z.object({
    organizationId: z.string(),
    title: z.string().min(1).max(255),
    shortcut: z.string().max(50).nullable().optional(),
    content: z.string().min(1),
    category: z.string().max(100).nullable().optional(),
    isActive: z.boolean().default(true)
});

const updateCannedResponseSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    shortcut: z.string().max(50).nullable().optional(),
    content: z.string().min(1).optional(),
    category: z.string().max(100).nullable().optional(),
    isActive: z.boolean().optional()
});

export class CannedResponsesController {
    static async list(req: Request, res: Response): Promise<void> {
        const repo = AppDataSource.getRepository(CannedResponse);
        const items = await repo.find({
            take: 200,
            relations: ['organization'],
            order: { title: 'ASC' }
        });
        res.json({ data: items });
    }

    static async get(req: Request, res: Response): Promise<void> {
        const repo = AppDataSource.getRepository(CannedResponse);
        const item = await repo.findOne({
            where: { id: req.params.id },
            relations: ['organization', 'createdBy']
        });
        if (!item) {
            res.status(404).json({ error: { message: 'Canned response not found' } });
            return;
        }
        res.json({ data: item });
    }

    static async create(req: Request, res: Response): Promise<void> {
        const parsed = createCannedResponseSchema.safeParse(req.body);
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

        const repo = AppDataSource.getRepository(CannedResponse);
        const item = repo.create({
            ...parsed.data,
            organization: org,
            createdBy: (req as any).user // Assuming auth middleware attaches user
        });

        await repo.save(item);
        res.status(201).json({ data: item });
    }

    static async update(req: Request, res: Response): Promise<void> {
        const parsed = updateCannedResponseSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
            return;
        }

        const repo = AppDataSource.getRepository(CannedResponse);
        const item = await repo.findOne({ where: { id: req.params.id } });
        if (!item) {
            res.status(404).json({ error: { message: 'Canned response not found' } });
            return;
        }

        Object.assign(item, parsed.data);
        await repo.save(item);
        res.json({ data: item });
    }

    static async remove(req: Request, res: Response): Promise<void> {
        const repo = AppDataSource.getRepository(CannedResponse);
        const item = await repo.findOne({ where: { id: req.params.id } });
        if (!item) {
            res.status(404).json({ error: { message: 'Canned response not found' } });
            return;
        }
        await repo.remove(item);
        res.status(204).send();
    }

    static async incrementUsage(req: Request, res: Response): Promise<void> {
        const repo = AppDataSource.getRepository(CannedResponse);
        const item = await repo.findOne({ where: { id: req.params.id } });
        if (!item) {
            res.status(404).json({ error: { message: 'Canned response not found' } });
            return;
        }
        item.usageCount += 1;
        await repo.save(item);
        res.json({ data: item });
    }
}
