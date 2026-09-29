import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@config/env.js';

export interface AuthPayload {
  sub: string; // user id
  orgId: string;
  roles: string[];
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: { message: 'Unauthorized' } });
    return;
  }
  const token = header.substring(7);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;
    (req as any).auth = payload;
    next();
  } catch (err) {
    console.error('JWT Verification Failed:', err);
    res.status(401).json({ error: { message: 'Invalid token' } });
  }
}


