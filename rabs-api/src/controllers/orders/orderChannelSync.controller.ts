/**
 * Pull orders + payments from connected sales channels (Good Till EPOS and
 * WooCommerce/WordPress stores) into the Orders and Payments modules.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { ChannelConnection } from '@entities/catalog/ChannelConnection.js';
import { Organization } from '@entities/iam/Organization.js';
import {
  fetchOrdersForConnection,
  getSyncStatus,
  loadConnection,
  recordManualSync
} from '@services/orders/channelOrderSync.service.js';
import { runOrderImport } from '@services/import/orderImportService.js';
import type { ParsedExternalOrder } from '@services/import/externalOrderTypes.js';

const syncSchema = z.object({
  organizationId: z.string().min(1),
  connectionId: z.string().min(1),
  /** ISO dates; default to the trailing 90 days. */
  from: z.string().optional(),
  to: z.string().optional(),
  /** WooCommerce: match from/to against the order's creation (default) or last-modified date. */
  dateField: z.enum(['created', 'modified']).optional(),
  includeVoided: z.coerce.boolean().optional().default(false),
  statuses: z.array(z.string()).optional(),
  maxOrders: z.coerce.number().int().positive().max(5000).optional(),
  createCustomers: z.coerce.boolean().optional().default(true),
  importPayments: z.coerce.boolean().optional().default(true),
  updateExisting: z.coerce.boolean().optional().default(true)
});

function summarizeForPreview(orders: ParsedExternalOrder[]) {
  const totalValue = orders.reduce((sum, o) => sum + o.total, 0);
  const paymentsTotal = orders.reduce(
    (sum, o) => sum + o.payments.reduce((s, p) => s + p.amount, 0),
    0
  );
  return {
    totalOrders: orders.length,
    totalLines: orders.reduce((sum, o) => sum + o.lines.length, 0),
    totalPayments: orders.reduce((sum, o) => sum + o.payments.length, 0),
    totalValue: Number(totalValue.toFixed(2)),
    paymentsTotal: Number(paymentsTotal.toFixed(2)),
    currency: orders[0]?.currency ?? 'GBP',
    byStatus: orders.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {}),
    orders: orders.slice(0, 2000).map((o) => ({
      externalId: o.externalId,
      externalNumber: o.externalNumber,
      orderNumber: o.orderNumber,
      orderDate: o.orderDate,
      total: o.total,
      currency: o.currency,
      status: o.status,
      paymentStatus: o.paymentStatus,
      customerEmail: o.customerEmail,
      lineCount: o.lines.length,
      paymentCount: o.payments.length
    }))
  };
}

export class OrderChannelSyncController {
  /**
   * GET /api/orders/channel-sync/connections
   * Channels that can supply orders (EPOS + WooCommerce/WordPress stores).
   */
  static async listConnections(req: Request, res: Response): Promise<void> {
    const orgId = req.query.organizationId as string | undefined;
    const repo = AppDataSource.getRepository(ChannelConnection);
    const qb = repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.organization', 'org')
      .orderBy('c.createdAt', 'DESC');
    if (orgId) qb.where('org.id = :orgId', { orgId });

    const rows = await qb.getMany();

    // Collapse the duplicate legacy EPOS rows down to the newest per store.
    const seen = new Set<string>();
    const supported = rows
      .map((c) => {
        const isGoodTill =
          c.channel === 'goodtill' ||
          (!c.channel && (c.storeUrl ?? '').includes('thegoodtill.com'));
        const kind = isGoodTill
          ? 'pos'
          : c.channel === 'wordpress' || c.channel === 'woocommerce'
            ? 'web'
            : null;
        return { c, kind, isGoodTill };
      })
      .filter((x) => x.kind !== null)
      .filter((x) => {
        const key = `${x.kind}:${x.c.storeUrl ?? x.c.shopDomain ?? x.c.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ c, kind, isGoodTill }) => ({
        id: c.id,
        name: c.name,
        kind,
        channel: isGoodTill ? 'goodtill' : c.channel,
        storeUrl: c.storeUrl,
        status: c.status,
        organizationId: c.organization?.id ?? null,
        lastTestOk: c.lastTestOk,
        lastTestedAt: c.lastTestedAt
      }));

    res.json({ data: supported });
  }

  /** GET /api/orders/channel-sync/status — cron flag and last-synced time per connection. */
  static async status(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: await getSyncStatus(req.query.organizationId as string | undefined) });
    } catch (err) {
      res.status(500).json({ error: { message: err instanceof Error ? err.message : 'Failed to load sync status' } });
    }
  }

  /** POST /api/orders/channel-sync/preview — fetch and summarise without writing. */
  static async preview(req: Request, res: Response): Promise<void> {
    const parsed = syncSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), details: parsed.error.issues }
      });
      return;
    }

    try {
      const conn = await loadConnection(parsed.data.connectionId, parsed.data.organizationId);
      const orders = await fetchOrdersForConnection(conn, parsed.data);
      res.json({
        data: {
          connection: { id: conn.id, name: conn.name, channel: conn.channel },
          ...summarizeForPreview(orders)
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Order preview failed';
      res.status(400).json({ error: { message } });
    }
  }

  /** POST /api/orders/channel-sync/import — fetch and persist orders + payments. */
  static async import(req: Request, res: Response): Promise<void> {
    const parsed = syncSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), details: parsed.error.issues }
      });
      return;
    }

    const org = await AppDataSource.getRepository(Organization).findOne({
      where: { id: parsed.data.organizationId }
    });
    if (!org) {
      res.status(400).json({ error: { message: 'Invalid organizationId' } });
      return;
    }

    try {
      const conn = await loadConnection(parsed.data.connectionId, parsed.data.organizationId);
      const orders = await fetchOrdersForConnection(conn, parsed.data);

      const summary = await runOrderImport(orders, {
        organizationId: parsed.data.organizationId,
        connectionId: conn.id,
        createCustomers: parsed.data.createCustomers,
        importPayments: parsed.data.importPayments,
        updateExisting: parsed.data.updateExisting
      });
      await recordManualSync(conn.id).catch(() => undefined);

      res.json({
        data: {
          connection: { id: conn.id, name: conn.name, channel: conn.channel },
          fetched: orders.length,
          ...summary
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Order import failed';
      res.status(500).json({ error: { message } });
    }
  }
}
