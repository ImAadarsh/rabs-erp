import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@config/env.js';

export interface B2bAuthPayload {
  typ: 'b2b';
  sub: string;
  retailerAccountId: string;
  customerId: string;
  orgId: string;
}

export function b2bAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: { message: 'Unauthorized' } });
    return;
  }
  const token = header.substring(7);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as B2bAuthPayload;
    if (payload.typ !== 'b2b' || !payload.retailerAccountId || !payload.customerId || !payload.orgId) {
      res.status(401).json({ error: { message: 'Invalid token' } });
      return;
    }
    (req as any).b2bAuth = payload;
    next();
  } catch (err) {
    console.error('B2B JWT verification failed:', err);
    res.status(401).json({ error: { message: 'Invalid token' } });
  }
}
