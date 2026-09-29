import { Request, Response } from 'express';
import { env } from '@config/env.js';
import {
  ingestSendGridEvents,
  verifySendGridWebhook
} from '@services/marketing/emailWebhook.service.js';

export class EmailWebhooksController {
  /**
   * POST /api/marketing/webhooks/sendgrid
   * Public — verified via SENDGRID_WEBHOOK_SECRET or signed Event Webhook key.
   */
  static async sendgrid(req: Request, res: Response): Promise<void> {
    try {
      const ok = verifySendGridWebhook({
        query: req.query as Record<string, unknown>,
        headers: req.headers as Record<string, string | string[] | undefined>,
        body: req.body,
        rawBody: (req as any).rawBody
      });
      if (!ok) {
        res.status(401).json({ error: { message: 'Webhook verification failed' } });
        return;
      }
      if (!env.SENDGRID_WEBHOOK_SECRET && !env.SENDGRID_WEBHOOK_VERIFICATION_KEY) {
        // Still process in dev, but clients should configure a secret in production
      }
      const result = await ingestSendGridEvents(req.body);
      res.status(200).json({ data: result });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
