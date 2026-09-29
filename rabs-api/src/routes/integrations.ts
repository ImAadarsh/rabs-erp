import { Router } from 'express';
import { LeadIngestController } from '@controllers/integrations/leadIngest.controller.js';
import { integrationApiKeyMiddleware } from '@middlewares/integrationApiKey.js';

export const integrationsRouter = Router();

// External systems (Salesforce, HubSpot, Zapier) — API key auth, not staff JWT
integrationsRouter.post('/leads', integrationApiKeyMiddleware, LeadIngestController.ingest);
