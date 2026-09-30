import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { z } from 'zod';
import { PaymentGateway } from '@entities/finance/PaymentGateway.js';
import { Payment } from '@entities/finance/Payment.js';
import { encryptJson } from '@utils/credentialCrypto.js';
import {
  encryptWorldpayCredentials,
  maskGatewayForApi,
  testWorldpayConnection
} from '@services/payments/worldpay.service.js';

const providers = ['stripe', 'paypal', 'square', 'sumup', 'open_banking', 'manual', 'other', 'worldpay'] as const;

const createSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1),
  provider: z.enum(providers),
  /** Plain credentials from panel — encrypted before storage */
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  merchantEntity: z.string().optional(),
  webhookSecret: z.string().optional(),
  mode: z.enum(['test', 'live']).default('test'),
  supportedCurrencies: z.any().optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

const updateSchema = createSchema.partial().omit({ organizationId: true });

function applyCredentials(item: PaymentGateway, data: z.infer<typeof updateSchema> | z.infer<typeof createSchema>) {
  if (data.provider === 'worldpay' || item.provider === 'worldpay') {
    const username = data.username || data.apiKey;
    const password = data.password || data.apiSecret;
    if (username && password) {
      const enc = encryptWorldpayCredentials({
        username,
        password,
        merchantEntity: data.merchantEntity || 'default'
      });
      item.apiKeyEncrypted = enc.apiKeyEncrypted;
      item.apiSecretEncrypted = enc.apiSecretEncrypted;
    }
  } else {
    if (data.apiKey) item.apiKeyEncrypted = encryptJson({ value: data.apiKey });
    if (data.apiSecret) item.apiSecretEncrypted = encryptJson({ value: data.apiSecret });
  }
  if (data.webhookSecret !== undefined) {
    item.webhookSecret = data.webhookSecret ? encryptJson({ value: data.webhookSecret }) : undefined;
  }
}

export class GatewayController {
  static async list(req: Request, res: Response) {
    try {
      const orgId = req.query.organizationId as string;
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId is required' } });

      const repo = AppDataSource.getRepository(PaymentGateway);
      const items = await repo.find({
        where: { organizationId: orgId },
        order: { createdAt: 'DESC' }
      });
      res.json({ data: items.map(maskGatewayForApi) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(PaymentGateway);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      res.json({ data: maskGatewayForApi(item) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const data = createSchema.parse(req.body);
      const repo = AppDataSource.getRepository(PaymentGateway);

      if (data.isDefault) {
        await repo
          .createQueryBuilder()
          .update(PaymentGateway)
          .set({ isDefault: false })
          .where('organization_id = :orgId', { orgId: data.organizationId })
          .execute();
      }

      const item = repo.create({
        organizationId: data.organizationId,
        name: data.name,
        provider: data.provider,
        mode: data.mode,
        supportedCurrencies: data.supportedCurrencies,
        isDefault: data.isDefault,
        isActive: data.isActive
      });
      applyCredentials(item, data);
      const saved = await repo.save(item);
      res.status(201).json({ data: maskGatewayForApi(saved) });
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
      const repo = AppDataSource.getRepository(PaymentGateway);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });

      if (data.name !== undefined) item.name = data.name;
      if (data.provider !== undefined) item.provider = data.provider;
      if (data.mode !== undefined) item.mode = data.mode;
      if (data.supportedCurrencies !== undefined) item.supportedCurrencies = data.supportedCurrencies;
      if (data.isActive !== undefined) item.isActive = data.isActive;
      if (data.isDefault === true) {
        await repo
          .createQueryBuilder()
          .update(PaymentGateway)
          .set({ isDefault: false })
          .where('organization_id = :orgId', { orgId: item.organizationId })
          .execute();
        item.isDefault = true;
      } else if (data.isDefault === false) {
        item.isDefault = false;
      }

      applyCredentials(item, data);
      const saved = await repo.save(item);
      res.json({ data: maskGatewayForApi(saved) });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: { message: error.errors[0].message } });
      }
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(PaymentGateway);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      await repo.remove(item);
      res.json({ data: { id: item.id } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async testConnection(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(PaymentGateway);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });

      if (item.provider === 'worldpay') {
        const result = await testWorldpayConnection(item);
        res.status(result.ok ? 200 : 400).json({ data: result });
        return;
      }

      if (item.provider === 'manual') {
        res.json({
          data: {
            ok: true,
            message: 'Manual gateway does not call an external provider. Staff confirm payments in the panel.',
            mode: item.mode
          }
        });
        return;
      }

      res.status(400).json({
        data: {
          ok: false,
          message: `Connection test for provider "${item.provider}" is not implemented yet. Configure credentials and verify with a real payment intent.`,
          mode: item.mode
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async dashboard(req: Request, res: Response) {
    try {
      const orgId = (req.query.organizationId as string) || (req as any).auth?.orgId;
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId is required' } });

      const gatewayRepo = AppDataSource.getRepository(PaymentGateway);
      const paymentRepo = AppDataSource.getRepository(Payment);

      const gateways = await gatewayRepo.find({
        where: { organizationId: orgId },
        order: { createdAt: 'DESC' }
      });

      const payments = await paymentRepo.find({
        where: { organizationId: orgId },
        order: { createdAt: 'DESC' },
        take: 50
      });

      const completed = payments.filter((p) => p.status === 'completed');
      const pending = payments.filter((p) => p.status === 'pending' || p.status === 'authorized');
      const failed = payments.filter((p) => p.status === 'failed');
      const gmv = completed.reduce((s, p) => s + Number(p.amount || 0), 0);

      const byProvider: Record<string, number> = {};
      for (const g of gateways) {
        byProvider[g.provider] = (byProvider[g.provider] || 0) + 1;
      }

      res.json({
        data: {
          metrics: {
            gatewaysTotal: gateways.length,
            gatewaysActive: gateways.filter((g) => g.isActive).length,
            paymentsRecent: payments.length,
            completedCount: completed.length,
            pendingCount: pending.length,
            failedCount: failed.length,
            completedVolume: Number(gmv.toFixed(4)),
            byProvider
          },
          gateways: gateways.map(maskGatewayForApi),
          recentPayments: payments.map((p) => ({
            id: p.id,
            orderId: p.orderId,
            transactionId: p.transactionId,
            paymentMethod: p.paymentMethod,
            amount: Number(p.amount),
            currency: p.currency,
            status: p.status,
            reference: p.reference,
            paymentGatewayId: p.paymentGatewayId,
            paymentDate: p.paymentDate,
            processedAt: p.processedAt,
            failureMessage: p.failureMessage,
            createdAt: p.createdAt
          }))
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
