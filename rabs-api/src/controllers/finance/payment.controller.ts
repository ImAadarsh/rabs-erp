import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { z } from 'zod';
import { Payment } from '@entities/finance/Payment.js';

const createSchema = z.object({
    organizationId: z.string(),
    orderId: z.string().optional(),
    paymentGatewayId: z.string().optional(),
    transactionId: z.string().optional(),
    paymentMethod: z.enum(['card', 'bank_transfer', 'paypal', 'cash', 'check', 'other']),
    paymentType: z.enum(['sale', 'refund', 'partial_refund', 'authorization', 'capture']).default('sale'),
    amount: z.number().positive(),
    currency: z.string().length(3).default('GBP'),
    feeAmount: z.number().min(0).default(0),
    status: z.enum(['pending', 'authorized', 'completed', 'failed', 'refunded', 'cancelled', 'expired']).default('pending'),
    paymentDate: z.string().or(z.date()),
    reference: z.string().optional(),
    cardLast4: z.string().length(4).optional(),
    cardBrand: z.string().optional(),
    bankName: z.string().optional(),
    payerEmail: z.string().email().optional().or(z.literal('')),
    payerName: z.string().optional(),
    notes: z.string().optional()
});

const updateSchema = createSchema.partial().omit({ organizationId: true });

export class PaymentController {
    static async list(req: Request, res: Response) {
        try {
            const orgId = req.query.organizationId as string;
            if (!orgId) return res.status(400).json({ error: { message: 'organizationId is required' } });

            const {
                status, paymentMethod, paymentType, currency, channel, connectionId,
                dateFrom, dateTo, minAmount, maxAmount, search, sortBy, sortDir,
                page = '1', limit = '50'
            } = req.query;

            const qb = AppDataSource.getRepository(Payment).createQueryBuilder('p')
                .leftJoinAndSelect('p.order', 'o')
                .leftJoinAndSelect('o.channelConnection', 'conn')
                .leftJoinAndSelect('p.paymentGateway', 'gw')
                .where('p.organization_id = :orgId', { orgId });

            if (status) qb.andWhere('p.status = :status', { status });
            if (paymentMethod) qb.andWhere('p.payment_method = :paymentMethod', { paymentMethod });
            if (paymentType) qb.andWhere('p.payment_type = :paymentType', { paymentType });
            if (currency) qb.andWhere('p.currency = :currency', { currency });
            if (channel) qb.andWhere('o.channel = :channel', { channel });
            if (connectionId) qb.andWhere('o.channel_connection_id = :connectionId', { connectionId });
            if (minAmount) qb.andWhere('p.amount >= :minAmount', { minAmount: Number(minAmount) });
            if (maxAmount) qb.andWhere('p.amount <= :maxAmount', { maxAmount: Number(maxAmount) });
            if (dateFrom) qb.andWhere('p.payment_date >= :dateFrom', { dateFrom: String(dateFrom) });
            if (dateTo) qb.andWhere('p.payment_date <= :dateTo', { dateTo: String(dateTo) });

            if (search) {
                qb.andWhere(
                    '(p.transaction_id LIKE :s OR p.reference LIKE :s OR p.payer_email LIKE :s OR p.payer_name LIKE :s OR o.order_number LIKE :s OR conn.name LIKE :s)',
                    { s: `%${search}%` }
                );
            }

            // Whitelist sortable columns so the query param can't inject SQL.
            // These must be entity property paths: TypeORM resolves them against
            // the metadata when it wraps a joined query for pagination.
            const sortable: Record<string, string> = {
                paymentDate: 'p.paymentDate',
                createdAt: 'p.createdAt',
                amount: 'p.amount',
                status: 'p.status',
                paymentMethod: 'p.paymentMethod'
            };
            qb.orderBy(
                sortable[String(sortBy)] ?? 'p.paymentDate',
                String(sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
            );

            const totals = await qb
                .clone()
                .select('SUM(p.amount)', 'value')
                .addSelect('COUNT(p.id)', 'count')
                .orderBy()
                .getRawOne<{ value: string | null; count: string }>();

            const pageNum = Math.max(1, parseInt(page as string) || 1);
            const take = Math.min(500, Math.max(1, parseInt(limit as string) || 50));
            qb.skip((pageNum - 1) * take).take(take);

            const [items, total] = await qb.getManyAndCount();

            res.json({
                data: items,
                summary: {
                    totalValue: Number(totals?.value ?? 0),
                    count: Number(totals?.count ?? 0)
                },
                pagination: { page: pageNum, limit: take, total, totalPages: Math.ceil(total / take) }
            });
        } catch (error: any) {
            res.status(500).json({ error: { message: error.message } });
        }
    }

    static async get(req: Request, res: Response) {
        try {
            const repo = AppDataSource.getRepository(Payment);
            const item = await repo.findOne({
                where: { id: req.params.id },
                relations: ['order', 'paymentGateway']
            });
            if (!item) return res.status(404).json({ error: { message: 'Not found' } });
            res.json({ data: item });
        } catch (error: any) {
            res.status(500).json({ error: { message: error.message } });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const data = createSchema.parse(req.body);
            const repo = AppDataSource.getRepository(Payment);
            const item = repo.create({
                ...data,
                paymentDate: new Date(data.paymentDate)
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
            const repo = AppDataSource.getRepository(Payment);
            const item = await repo.findOne({ where: { id: req.params.id } });
            if (!item) return res.status(404).json({ error: { message: 'Not found' } });

            Object.assign(item, data);
            if (data.paymentDate) {
                item.paymentDate = new Date(data.paymentDate);
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
            const repo = AppDataSource.getRepository(Payment);
            const item = await repo.findOne({ where: { id: req.params.id } });
            if (!item) return res.status(404).json({ error: { message: 'Not found' } });

            await repo.remove(item);
            res.json({ data: { id: item.id } });
        } catch (error: any) {
            res.status(500).json({ error: { message: error.message } });
        }
    }
}
