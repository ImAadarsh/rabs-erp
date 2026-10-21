import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@config/env.js';
import { ApiKeyError, authenticateApiKey, extractApiKey } from '@middlewares/apiKeyAuth.js';

export interface AuthPayload {
  sub: string; // user id
  orgId: string;
  roles: string[];
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = extractApiKey(req);
  if (apiKey) {
    authenticateApiKey(apiKey, req)
      .then((auth) => {
        (req as any).auth = auth;
        next();
      })
      .catch((err) => {
        const status = err instanceof ApiKeyError ? err.status : 500;
        res.status(status).json({ error: { message: err instanceof ApiKeyError ? err.message : 'API key check failed' } });
      });
    return;
  }
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: { message: 'Unauthorized' } });
    return;
  }
  const token = header.substring(7);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;
    if (!Array.isArray(payload?.roles)) throw new Error('Not an access token');
    (req as any).auth = payload;
    next();
  } catch (err) {
    console.error('JWT Verification Failed:', err);
    res.status(401).json({ error: { message: 'Invalid token' } });
  }
}
