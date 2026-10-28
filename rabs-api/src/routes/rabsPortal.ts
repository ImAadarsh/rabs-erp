import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { HttpError } from '@services/rabs/rabsCore.js';
import * as P from '@services/rabs/rabsPortal.js';

export const rabsPortalRouter = Router();

function sendErr(res: Response, err: any) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message, status: err.status } });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: { message: err.issues[0]?.message || 'Invalid input', status: 400 } });
    return;
  }
  console.error('[rabs-portal]', err);
  res.status(500).json({ error: { message: 'Something went wrong. Please try again.', status: 500 } });
}

const h = (fn: (req: Request) => Promise<unknown>, status = 200) => async (req: Request, res: Response) => {
  try {
    const out = await fn(req);
    res.status(status).json(out === undefined ? { ok: true } : out);
  } catch (err) {
    sendErr(res, err);
  }
};

const portalAuth = (req: Request, _res: Response, next: NextFunction) => {
  try {
    (req as any).portal = P.parsePortalAuth(req);
    next();
  } catch (err) {
    sendErr(_res, err);
  }
};

rabsPortalRouter.post(
  '/request-otp',
  h(async (req) => {
    const { identifier } = z.object({ identifier: z.string().trim().min(3).max(160) }).parse(req.body);
    return P.requestOtp(identifier);
  })
);

rabsPortalRouter.post(
  '/verify-otp',
  h(async (req) => {
    const b = z.object({ identifier: z.string().trim().min(3).max(160), code: z.string().trim().min(4).max(12) }).parse(req.body);
    return P.verifyOtp(b.identifier, b.code);
  })
);

rabsPortalRouter.get('/me', portalAuth, h(async (req) => P.portalMe((req as any).portal)));
rabsPortalRouter.get('/jobs', portalAuth, h(async (req) => P.portalListJobs((req as any).portal)));
rabsPortalRouter.get('/jobs/:id', portalAuth, h(async (req) => P.portalGetJob((req as any).portal, String(req.params.id))));
rabsPortalRouter.post('/quotes/:id/accept', portalAuth, h(async (req) => P.portalAcceptQuote((req as any).portal, String(req.params.id))));
rabsPortalRouter.post('/quotes/:id/decline', portalAuth, h(async (req) => P.portalDeclineQuote((req as any).portal, String(req.params.id))));
