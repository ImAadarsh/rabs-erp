import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { ChannelConnection } from '@entities/catalog/ChannelConnection.js';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';
import { encryptJson, decryptJson, maskSecret } from '@utils/credentialCrypto.js';
import { testWooCommerceConnection } from '@services/import/woocommerceApiImport.js';
import { fetchShopifyProducts } from '@services/import/shopifyApiImport.js';
import { testWordPressConnection, type WordPressApiCredentials } from '@services/import/wordpressApiImport.js';
import { testGoodTillConnection, type GoodTillCredentials } from '@services/import/goodtillApiClient.js';

const wooConnectionSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1),
  storeUrl: z.string().min(1),
  consumerKey: z.string().min(1),
  consumerSecret: z.string().min(1),
  status: z.enum(['active', 'inactive']).optional()
});

const shopifyConnectionSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1),
  shopDomain: z.string().min(1),
  accessToken: z.string().min(1),
  status: z.enum(['active', 'inactive']).optional()
});

const updateWooSchema = wooConnectionSchema.partial().extend({
  consumerKey: z.string().min(1).optional(),
  consumerSecret: z.string().min(1).optional()
});

function sanitizeUrl(url: string): string {
  let u = url.trim();
  if (!u.startsWith('http')) u = `https://${u}`;
  return u.replace(/\/$/, '');
}

export class ChannelConnectionsController {
  static async list(req: Request, res: Response): Promise<void> {
    const { organizationId, channel, status } = req.query;
    const repo = AppDataSource.getRepository(ChannelConnection);
    const qb = repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.organization', 'org')
      .orderBy('c.name', 'ASC');

    if (organizationId) {
      qb.andWhere('c.organization_id = :orgId', { orgId: organizationId });
    }
    if (channel) {
      qb.andWhere('c.channel = :channel', { channel });
    }
    if (status) {
      qb.andWhere('c.status = :status', { status });
    }

    const rows = await qb.getMany();
    res.json({
      data: rows.map((c) => ({
        id: c.id,
        name: c.name,
        channel: c.channel,
        storeUrl: c.storeUrl,
        shopDomain: c.shopDomain,
        keyHint: c.keyHint,
        status: c.status,
        lastTestedAt: c.lastTestedAt,
        lastTestOk: c.lastTestOk,
        lastTestMessage: c.lastTestMessage,
        organizationId: c.organization.id,
        createdAt: c.createdAt
      }))
    });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const conn = await AppDataSource.getRepository(ChannelConnection).findOne({
      where: { id: req.params.id },
      relations: ['organization']
    });
    if (!conn) {
      res.status(404).json({ error: { message: 'Connection not found' } });
      return;
    }
    res.json({
      data: {
        id: conn.id,
        name: conn.name,
        channel: conn.channel,
        storeUrl: conn.storeUrl,
        shopDomain: conn.shopDomain,
        keyHint: conn.keyHint,
        status: conn.status,
        lastTestedAt: conn.lastTestedAt,
        lastTestOk: conn.lastTestOk,
        lastTestMessage: conn.lastTestMessage,
        organizationId: conn.organization.id
      }
    });
  }

  static async createWooCommerce(req: Request, res: Response): Promise<void> {
    const parsed = wooConnectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const org = await AppDataSource.getRepository(Organization).findOne({
      where: { id: parsed.data.organizationId }
    });
    if (!org) {
      res.status(400).json({ error: { message: 'Invalid organizationId' } });
      return;
    }

    const userId = (req as Request & { auth?: { sub?: string } }).auth?.sub;
    const user = userId
      ? await AppDataSource.getRepository(User).findOne({ where: { id: userId } })
      : null;

    const storeUrl = sanitizeUrl(parsed.data.storeUrl);
    const encrypted = encryptJson({
      consumerKey: parsed.data.consumerKey,
      consumerSecret: parsed.data.consumerSecret
    });

    const repo = AppDataSource.getRepository(ChannelConnection);
    const conn = repo.create({
      organization: org,
      name: parsed.data.name,
      channel: 'woocommerce',
      storeUrl,
      shopDomain: null,
      credentialsEncrypted: encrypted,
      keyHint: maskSecret(parsed.data.consumerKey),
      status: parsed.data.status ?? 'active',
      createdBy: user
    });
    await repo.save(conn);

    res.status(201).json({
      data: {
        id: conn.id,
        name: conn.name,
        channel: conn.channel,
        storeUrl: conn.storeUrl,
        keyHint: conn.keyHint,
        status: conn.status
      }
    });
  }

  static async createShopify(req: Request, res: Response): Promise<void> {
    const parsed = shopifyConnectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const org = await AppDataSource.getRepository(Organization).findOne({
      where: { id: parsed.data.organizationId }
    });
    if (!org) {
      res.status(400).json({ error: { message: 'Invalid organizationId' } });
      return;
    }

    const userId = (req as Request & { auth?: { sub?: string } }).auth?.sub;
    const user = userId
      ? await AppDataSource.getRepository(User).findOne({ where: { id: userId } })
      : null;

    const encrypted = encryptJson({ accessToken: parsed.data.accessToken });
    const repo = AppDataSource.getRepository(ChannelConnection);
    const conn = repo.create({
      organization: org,
      name: parsed.data.name,
      channel: 'shopify',
      storeUrl: null,
      shopDomain: parsed.data.shopDomain.trim(),
      credentialsEncrypted: encrypted,
      keyHint: maskSecret(parsed.data.accessToken),
      status: parsed.data.status ?? 'active',
      createdBy: user
    });
    await repo.save(conn);

    res.status(201).json({ data: { id: conn.id, name: conn.name, channel: 'shopify' } });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(ChannelConnection);
    const conn = await repo.findOne({
      where: { id: req.params.id },
      relations: ['organization']
    });
    if (!conn) {
      res.status(404).json({ error: { message: 'Connection not found' } });
      return;
    }

    const body = req.body;
    if (body.name) conn.name = body.name;
    if (body.status) conn.status = body.status;
    if (body.storeUrl && conn.channel === 'woocommerce') {
      conn.storeUrl = sanitizeUrl(body.storeUrl);
    }
    if (body.shopDomain && conn.channel === 'shopify') {
      conn.shopDomain = body.shopDomain;
    }

    if (conn.channel === 'woocommerce' && (body.consumerKey || body.consumerSecret)) {
      const creds = decryptJson<{ consumerKey: string; consumerSecret: string }>(
        conn.credentialsEncrypted
      );
      if (body.consumerKey) creds.consumerKey = body.consumerKey;
      if (body.consumerSecret) creds.consumerSecret = body.consumerSecret;
      conn.credentialsEncrypted = encryptJson(creds);
      conn.keyHint = maskSecret(creds.consumerKey);
    }

    if (conn.channel === 'shopify' && body.accessToken) {
      conn.credentialsEncrypted = encryptJson({ accessToken: body.accessToken });
      conn.keyHint = maskSecret(body.accessToken);
    }

    await repo.save(conn);
    res.json({ data: { id: conn.id, name: conn.name, status: conn.status } });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(ChannelConnection);
    const conn = await repo.findOne({ where: { id: req.params.id } });
    if (!conn) {
      res.status(404).json({ error: { message: 'Connection not found' } });
      return;
    }
    await repo.remove(conn);
    res.status(204).send();
  }

  static async test(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(ChannelConnection);
    const conn = await repo.findOne({ where: { id: req.params.id } });
    if (!conn) {
      res.status(404).json({ error: { message: 'Connection not found' } });
      return;
    }

    try {
      let productCount = 0;
      let message = '';
      if (conn.channel === 'woocommerce') {
        const creds = decryptJson<{ consumerKey: string; consumerSecret: string }>(
          conn.credentialsEncrypted
        );
        const test = await testWooCommerceConnection({
          storeUrl: conn.storeUrl!,
          consumerKey: creds.consumerKey,
          consumerSecret: creds.consumerSecret
        });
        productCount = test.productCount;
        message = `Connected — ${productCount} products reachable`;
      } else if (conn.channel === 'wordpress') {
        const rawCreds = decryptJson<Omit<WordPressApiCredentials, 'storeUrl'>>(conn.credentialsEncrypted);
        const test = await testWordPressConnection({ storeUrl: conn.storeUrl!, ...rawCreds });
        productCount = test.productCount;
        message = `Connected to "${test.storeName}" — ${productCount} products`;
      } else if (conn.channel === 'goodtill') {
        const creds = decryptJson<GoodTillCredentials & Record<string, unknown>>(conn.credentialsEncrypted);
        const test = await testGoodTillConnection(creds);
        productCount = test.productCount;
        message = `Connected to "${test.storeName}" (${test.outletName}) — ${productCount} EPOS products`;
      } else {
        const creds = decryptJson<{ accessToken: string }>(conn.credentialsEncrypted);
        const products = await fetchShopifyProducts({
          shopDomain: conn.shopDomain!,
          accessToken: creds.accessToken
        });
        productCount = products.length;
        message = `Connected — ${productCount} products reachable`;
      }

      conn.lastTestedAt = new Date();
      conn.lastTestOk = true;
      conn.lastTestMessage = message;
      await repo.save(conn);

      res.json({ data: { ok: true, productCount, message: conn.lastTestMessage } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection test failed';
      conn.lastTestedAt = new Date();
      conn.lastTestOk = false;
      conn.lastTestMessage = message.slice(0, 500);
      await repo.save(conn);
      res.status(400).json({ error: { message } });
    }
  }

  /** Load decrypted credentials for import (internal use). */
  static async loadWooCredentials(connectionId: string, organizationId: string) {
    const conn = await AppDataSource.getRepository(ChannelConnection).findOne({
      where: { id: connectionId, organization: { id: organizationId }, status: 'active' },
      relations: ['organization']
    });
    if (!conn || conn.channel !== 'woocommerce') {
      throw new Error('WooCommerce connection not found');
    }
    const creds = decryptJson<{ consumerKey: string; consumerSecret: string }>(
      conn.credentialsEncrypted
    );
    return {
      storeUrl: conn.storeUrl!,
      consumerKey: creds.consumerKey,
      consumerSecret: creds.consumerSecret
    };
  }

  static async loadShopifyCredentials(connectionId: string, organizationId: string) {
    const conn = await AppDataSource.getRepository(ChannelConnection).findOne({
      where: { id: connectionId, organization: { id: organizationId }, status: 'active' },
      relations: ['organization']
    });
    if (!conn || conn.channel !== 'shopify') {
      throw new Error('Shopify connection not found');
    }
    const creds = decryptJson<{ accessToken: string }>(conn.credentialsEncrypted);
    return {
      shopDomain: conn.shopDomain!,
      accessToken: creds.accessToken
    };
  }
}
