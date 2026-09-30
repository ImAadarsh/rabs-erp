import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { Customer } from '@entities/orders/Customer.js';
import { B2bAuthPayload } from '@middlewares/b2bAuth.js';
import {
  findPortalProductByBarcode,
  getOrCreateB2bSettings,
  listPortalCategories,
  listPortalProducts,
  mapCustomerToProfile,
  mapOrderToPortal
} from '@services/b2b/b2bCatalog.service.js';
import {
  applyTradeCredit,
  createPaymentIntent,
  createPortalOrder,
  getPortalOrder,
  listPortalOrders
} from '@services/b2b/b2bOrders.service.js';
import {
  changeRetailerPassword,
  deleteBranch,
  deleteBuyer,
  listBranches,
  listBuyers,
  updateRetailerProfile,
  upsertBranch,
  upsertBuyer
} from '@services/b2b/b2bAccount.service.js';
import {
  buildStatementCsv,
  getWalletSummary,
  listCreditRequests,
  listLedger,
  requestCreditIncrease
} from '@services/b2b/b2bWallet.service.js';
import { listCustomerShipments, listShippingOptions } from '@services/b2b/b2bShipping.service.js';
import {
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences
} from '@services/b2b/b2bNotifications.service.js';
import { createReferralInvite, getOrCreateReferral, listReferrals } from '@services/b2b/b2bReferrals.service.js';
import { validateCoupon } from '@services/marketing/coupon.service.js';
import { AppDataSource as DS } from '@config/data-source.js';
import { PaymentGateway } from '@entities/finance/PaymentGateway.js';
import { maskGatewayForApi } from '@services/payments/worldpay.service.js';

function auth(req: Request): B2bAuthPayload {
  return (req as any).b2bAuth as B2bAuthPayload;
}

const createOrderSchema = z.object({
  lines: z
    .array(
      z.object({
        variantId: z.string(),
        quantity: z.number().int().positive()
      })
    )
    .min(1),
  shippingMethod: z.string().optional(),
  shippingMethodCode: z.string().optional(),
  customerNotes: z.string().optional(),
  paymentMethod: z.enum(['bank_transfer', 'card', 'credit']).optional(),
  addressId: z.string().optional(),
  couponCode: z.string().optional(),
  affiliateCode: z.string().optional(),
  affiliateTrackingCode: z.string().optional(),
  affiliateSessionId: z.string().optional(),
  affiliateClickId: z.string().optional()
});

export class B2bPortalController {
  static async me(req: Request, res: Response): Promise<void> {
    try {
      const { customerId, orgId } = auth(req);
      const customer = await AppDataSource.getRepository(Customer).findOne({
        where: { id: customerId },
        relations: ['addresses']
      });
      if (!customer) {
        res.status(404).json({ error: { message: 'Retailer not found' } });
        return;
      }
      const settings = await getOrCreateB2bSettings(orgId);
      res.json({ data: mapCustomerToProfile(customer, settings) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async updateMe(req: Request, res: Response): Promise<void> {
    try {
      const parsed = z
        .object({
          companyName: z.string().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          phone: z.string().optional(),
          taxId: z.string().optional()
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const { customerId, orgId } = auth(req);
      const profile = await updateRetailerProfile({ customerId, orgId, data: parsed.data });
      res.json({ data: profile });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const parsed = z
        .object({
          currentPassword: z.string().min(6),
          newPassword: z.string().min(6)
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const { retailerAccountId } = auth(req);
      const result = await changeRetailerPassword({
        retailerAccountId,
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword
      });
      res.json({ data: result });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async products(req: Request, res: Response): Promise<void> {
    try {
      const { orgId, customerId } = auth(req);
      const customer = await AppDataSource.getRepository(Customer).findOne({ where: { id: customerId } });
      const products = await listPortalProducts({
        organizationId: orgId,
        customer,
        category: req.query.category ? String(req.query.category) : undefined,
        search: req.query.search ? String(req.query.search) : undefined
      });
      res.json({ data: products });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async productByBarcode(req: Request, res: Response): Promise<void> {
    try {
      const { orgId, customerId } = auth(req);
      const customer = await AppDataSource.getRepository(Customer).findOne({ where: { id: customerId } });
      const product = await findPortalProductByBarcode(orgId, req.params.code, customer);
      if (!product) {
        res.status(404).json({ error: { message: 'Product not found for barcode' } });
        return;
      }
      res.json({ data: product });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async categories(req: Request, res: Response): Promise<void> {
    try {
      const { orgId } = auth(req);
      const categories = await listPortalCategories(orgId);
      res.json({ data: categories });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async orders(req: Request, res: Response): Promise<void> {
    try {
      const { customerId } = auth(req);
      const orders = await listPortalOrders(customerId);
      res.json({ data: orders });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async orderById(req: Request, res: Response): Promise<void> {
    try {
      const { customerId } = auth(req);
      const order = await getPortalOrder(customerId, req.params.id);
      if (!order) {
        res.status(404).json({ error: { message: 'Order not found' } });
        return;
      }
      res.json({ data: order });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async createOrder(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const { orgId, customerId } = auth(req);
      const customer = await AppDataSource.getRepository(Customer).findOne({
        where: { id: customerId },
        relations: ['addresses']
      });
      if (!customer) {
        res.status(404).json({ error: { message: 'Retailer not found' } });
        return;
      }
      const order = await createPortalOrder({
        organizationId: orgId,
        customer,
        lines: parsed.data.lines,
        shippingMethod: parsed.data.shippingMethod,
        shippingMethodCode: parsed.data.shippingMethodCode,
        customerNotes: parsed.data.customerNotes,
        paymentMethod: parsed.data.paymentMethod,
        addressId: parsed.data.addressId,
        couponCode: parsed.data.couponCode,
        affiliateCode: parsed.data.affiliateCode,
        affiliateTrackingCode: parsed.data.affiliateTrackingCode,
        affiliateSessionId: parsed.data.affiliateSessionId,
        affiliateClickId: parsed.data.affiliateClickId
      });
      res.status(201).json({ data: mapOrderToPortal(order as any) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async tradeCredit(req: Request, res: Response): Promise<void> {
    try {
      const orderId = String(req.body?.orderId ?? '');
      if (!orderId) {
        res.status(400).json({ error: { message: 'orderId required' } });
        return;
      }
      const { orgId, customerId } = auth(req);
      const customer = await AppDataSource.getRepository(Customer).findOne({ where: { id: customerId } });
      if (!customer) {
        res.status(404).json({ error: { message: 'Retailer not found' } });
        return;
      }
      const order = await applyTradeCredit({ organizationId: orgId, customer, orderId });
      res.json({ data: mapOrderToPortal(order as any) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async paymentIntent(req: Request, res: Response): Promise<void> {
    try {
      const parsed = z
        .object({
          orderId: z.string(),
          method: z.enum(['card', 'bank_transfer']),
          bankId: z.string().optional(),
          cardDetails: z
            .object({
              cardNumber: z.string(),
              expiry: z.string(),
              cvv: z.string(),
              holderName: z.string().optional()
            })
            .optional()
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const { orgId, customerId } = auth(req);
      const customer = await AppDataSource.getRepository(Customer).findOne({ where: { id: customerId } });
      if (!customer) {
        res.status(404).json({ error: { message: 'Retailer not found' } });
        return;
      }
      const result = await createPaymentIntent({
        organizationId: orgId,
        customer,
        orderId: parsed.data.orderId,
        method: parsed.data.method,
        cardDetails: parsed.data.cardDetails,
        bankId: parsed.data.bankId
      });
      res.json({
        data: {
          payment: result.payment,
          order: result.mappedOrder || mapOrderToPortal(result.order as any),
          gateway: result.gateway,
          clientSecret: result.clientSecret,
          bankTransferInstructions: (result as any).bankTransferInstructions,
          message: result.message
        }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({
        error: {
          message: error.message,
          payment: error.payment,
          gateway: error.gateway
            ? { id: error.gateway.id, name: error.gateway.name, provider: error.gateway.provider, mode: error.gateway.mode }
            : undefined
        }
      });
    }
  }

  static async paymentMethods(req: Request, res: Response): Promise<void> {
    try {
      const { orgId } = auth(req);
      const settings = await getOrCreateB2bSettings(orgId);
      const gateways = await DS.getRepository(PaymentGateway).find({
        where: { organizationId: orgId, isActive: true }
      });
      const cardGateways = gateways.filter((g) =>
        ['worldpay', 'stripe', 'sumup', 'square', 'paypal'].includes(g.provider)
      );
      const bankGateways = gateways.filter((g) => ['open_banking', 'manual', 'worldpay'].includes(g.provider));
      res.json({
        data: {
          card: cardGateways.map(maskGatewayForApi),
          bankTransfer: bankGateways.map(maskGatewayForApi),
          tradeCreditEnabled: true,
          bankTransferInstructions: settings.bankTransferInstructions,
          preferredCardProvider: cardGateways.find((g) => g.provider === 'worldpay')?.provider || cardGateways[0]?.provider || null
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async branches(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: await listBranches(auth(req).customerId) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async createBranch(req: Request, res: Response): Promise<void> {
    try {
      const parsed = z
        .object({
          addressLine1: z.string().min(1),
          addressLine2: z.string().optional(),
          city: z.string().min(1),
          postalCode: z.string().min(1),
          countryCode: z.string().length(2).default('GB'),
          company: z.string().optional(),
          phone: z.string().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          isDefault: z.boolean().optional(),
          addressType: z.enum(['shipping', 'billing', 'both']).optional()
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const row = await upsertBranch({ customerId: auth(req).customerId, data: parsed.data as any });
      res.status(201).json({ data: row });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async updateBranch(req: Request, res: Response): Promise<void> {
    try {
      const row = await upsertBranch({
        customerId: auth(req).customerId,
        id: req.params.id,
        data: req.body
      });
      res.json({ data: row });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async deleteBranch(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: await deleteBranch(auth(req).customerId, req.params.id) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async buyers(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: await listBuyers(auth(req).customerId) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async createBuyer(req: Request, res: Response): Promise<void> {
    try {
      const parsed = z
        .object({
          name: z.string().min(1),
          email: z.string().email(),
          phone: z.string().optional(),
          role: z.enum(['buyer', 'manager', 'viewer']).optional(),
          spendingCap: z.number().nullable().optional(),
          status: z.enum(['active', 'invited', 'disabled']).optional()
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const { orgId, customerId } = auth(req);
      const row = await upsertBuyer({ orgId, customerId, data: parsed.data });
      res.status(201).json({ data: row });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async updateBuyer(req: Request, res: Response): Promise<void> {
    try {
      const { orgId, customerId } = auth(req);
      const row = await upsertBuyer({ orgId, customerId, id: req.params.id, data: req.body });
      res.json({ data: row });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async deleteBuyer(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: await deleteBuyer(auth(req).customerId, req.params.id) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async wallet(req: Request, res: Response): Promise<void> {
    try {
      const { customerId, orgId } = auth(req);
      res.json({ data: await getWalletSummary(customerId, orgId) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async ledger(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: await listLedger(auth(req).customerId) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async creditRequest(req: Request, res: Response): Promise<void> {
    try {
      const parsed = z
        .object({
          requestedLimit: z.number().positive(),
          reason: z.string().optional()
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const { customerId, orgId } = auth(req);
      const row = await requestCreditIncrease({
        orgId,
        customerId,
        requestedLimit: parsed.data.requestedLimit,
        reason: parsed.data.reason
      });
      res.status(201).json({ data: row });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async creditRequests(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: await listCreditRequests(auth(req).customerId) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async statement(req: Request, res: Response): Promise<void> {
    try {
      const csv = await buildStatementCsv(auth(req).customerId);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="rabs-trade-statement.csv"');
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async shippingOptions(req: Request, res: Response): Promise<void> {
    try {
      const amount = req.query.amount ? Number(req.query.amount) : 0;
      res.json({ data: await listShippingOptions(auth(req).orgId, amount) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async shipments(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: await listCustomerShipments(auth(req).customerId) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async notifications(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: await listNotifications(auth(req).customerId) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async markNotificationRead(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: await markNotificationRead(auth(req).customerId, req.params.id) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async markAllNotificationsRead(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: await markAllNotificationsRead(auth(req).customerId) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async notificationPreferences(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: await getNotificationPreferences(auth(req).customerId) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async updateNotificationPreferences(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: await updateNotificationPreferences(auth(req).customerId, req.body) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async referral(req: Request, res: Response): Promise<void> {
    try {
      const { customerId, orgId } = auth(req);
      res.json({ data: await getOrCreateReferral({ orgId, customerId }) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async createReferralInvite(req: Request, res: Response): Promise<void> {
    try {
      const { customerId, orgId } = auth(req);
      const data = await createReferralInvite({
        orgId,
        customerId,
        referredEmail: req.body?.referredEmail,
        referredCompany: req.body?.referredCompany
      });
      res.status(201).json({ data });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async referrals(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: await listReferrals(auth(req).customerId) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async catalogExport(req: Request, res: Response): Promise<void> {
    try {
      const { orgId, customerId } = auth(req);
      const customer = await AppDataSource.getRepository(Customer).findOne({ where: { id: customerId } });
      const products = await listPortalProducts({ organizationId: orgId, customer });
      const header = 'sku,name,brand,category,variant_sku,barcode,case_price,unit_price,stock,vat_rate';
      const lines: string[] = [header];
      for (const p of products) {
        for (const v of p.variants) {
          lines.push(
            [p.sku, JSON.stringify(p.name), JSON.stringify(p.brand), p.category, v.sku, v.barcode, v.casePrice, v.unitPrice, v.stockLevel, v.vatRate].join(',')
          );
        }
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="rabs-b2b-price-list.csv"');
      res.send(lines.join('\n'));
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async validateCoupon(req: Request, res: Response): Promise<void> {
    try {
      const parsed = z
        .object({
          couponCode: z.string().min(1),
          subtotal: z.number().nonnegative()
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const { orgId, customerId } = auth(req);
      const result = await validateCoupon({
        organizationId: orgId,
        couponCode: parsed.data.couponCode,
        customerId,
        subtotal: parsed.data.subtotal
      });
      res.json({
        data: {
          couponCode: result.coupon.couponCode,
          couponName: result.coupon.couponName,
          discountType: result.coupon.discountType,
          discountValue: result.coupon.discountValue,
          discountAmount: result.discountAmount,
          currency: result.currency,
          freeShipping: result.coupon.discountType === 'free_shipping'
        }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
