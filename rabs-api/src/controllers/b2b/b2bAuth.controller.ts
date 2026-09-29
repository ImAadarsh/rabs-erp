import { Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '@config/data-source.js';
import { env } from '@config/env.js';
import { RetailerAccount } from '@entities/b2b/RetailerAccount.js';
import { verifyPassword } from '@utils/password.js';
import { getOrCreateB2bSettings, mapCustomerToProfile } from '@services/b2b/b2bCatalog.service.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

function signB2bTokens(account: RetailerAccount) {
  const payload = {
    typ: 'b2b' as const,
    sub: account.id,
    retailerAccountId: account.id,
    customerId: account.customer.id,
    orgId: account.organization.id
  };
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL });
  const refreshToken = jwt.sign({ ...payload, typ: 'b2b_refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL
  });
  return { accessToken, refreshToken };
}

export class B2bAuthController {
  static async login(req: Request, res: Response): Promise<void> {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }
    const repo = AppDataSource.getRepository(RetailerAccount);
    const account = await repo.findOne({
      where: { email: parsed.data.email.toLowerCase() },
      relations: ['organization', 'customer', 'customer.addresses']
    });
    if (!account || account.status === 'disabled') {
      res.status(401).json({ error: { message: 'Invalid credentials' } });
      return;
    }
    const ok = await verifyPassword(parsed.data.password, account.passwordHash);
    if (!ok) {
      res.status(401).json({ error: { message: 'Invalid credentials' } });
      return;
    }
    if (account.customer.status !== 'active') {
      res.status(403).json({ error: { message: 'Retailer account is not active' } });
      return;
    }
    const settings = await getOrCreateB2bSettings(account.organization.id);
    if (!settings.enabled) {
      res.status(403).json({ error: { message: 'B2B portal is disabled' } });
      return;
    }
    account.lastLoginAt = new Date();
    await repo.save(account);
    const tokens = signB2bTokens(account);
    res.json({
      ...tokens,
      retailer: mapCustomerToProfile(account.customer, settings)
    });
  }

  static async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) {
      res.status(400).json({ error: { message: 'refreshToken required' } });
      return;
    }
    try {
      const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as any;
      if (payload.typ !== 'b2b_refresh') {
        res.status(401).json({ error: { message: 'Invalid refresh token' } });
        return;
      }
      const repo = AppDataSource.getRepository(RetailerAccount);
      const account = await repo.findOne({
        where: { id: payload.retailerAccountId },
        relations: ['organization', 'customer']
      });
      if (!account || account.status === 'disabled') {
        res.status(401).json({ error: { message: 'Invalid refresh token' } });
        return;
      }
      const tokens = signB2bTokens(account);
      res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    } catch {
      res.status(401).json({ error: { message: 'Invalid refresh token' } });
    }
  }
}
