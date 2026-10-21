import express, { Router } from 'express';
import { LeadIngestController } from '@controllers/integrations/leadIngest.controller.js';
import { integrationApiKeyMiddleware } from '@middlewares/integrationApiKey.js';

export const integrationsRouter = Router();

// External systems (Salesforce, HubSpot, Zapier) — API key auth, not staff JWT.
// Salesforce Outbound Messages post SOAP XML, so accept XML bodies as text here.
integrationsRouter.post(
  '/leads',
  express.text({ type: ['text/xml', 'application/xml', 'application/soap+xml'], limit: '2mb' }),
  integrationApiKeyMiddleware,
  LeadIngestController.ingest
);
integrationsRouter.get('/leads', (_req, res) => {
  res.status(405).json({
    error: {
      message:
        'Use POST with a JSON lead body (or Salesforce Outbound Message XML) and the integration key in header ' +
        'X-Rabs-Api-Key, Authorization: Bearer <key>, or ?api_key=<key>.'
    }
  });
});
