import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import createError from 'http-errors';
import { env } from './config/env.js';
import { iamRouter } from './routes/iam.js';
import { catalogRouter } from './routes/catalog.js';
import { inventoryRouter } from './routes/inventory.js';
import { ordersRouter } from './routes/orders.js';
import { financeRouter } from './routes/finance.js';
import { hrRouter } from './routes/hr.js';
import { crmRouter } from './routes/crm.js';
import { marketingRouter } from './routes/marketing.js';
import { socialRouter } from './routes/social.js';
import { analyticsRouter } from './routes/analytics.js';
import { b2bRouter } from './routes/b2b.js';
import { integrationsRouter } from './routes/integrations.js';
import { pmRouter } from './routes/pm.js';
import { fulfillmentRouter } from './routes/fulfillment.js';
import { rabsRouter } from './routes/rabs.js';
import { UPLOADS_ROOT } from './services/rabs/rabsCore.js';

const app = express();

app.use(
  helmet({
    // Allow B2B website (and other frontends) to read public API responses cross-origin
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);
app.use(cors({
  origin: true,
  credentials: true
}));
// Login for Business Finish may probe/frame or form-post the OAuth callback.
app.use('/api/social/meta/callback', (_req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; form-action *; frame-ancestors *"
  );
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: env.NODE_ENV });
});

// Welcome message for API root
app.get('/api', (_req, res) => {
  res.json({
    message: 'Welcome to RABS API',
    version: '1.0.0',
    status: 'operational',
    documentation: `${env.PUBLIC_API_URL}/health`,
    endpoints: {
      health: '/api/health',
      iam: '/api/iam',
      catalog: '/api/catalog',
      inventory: '/api/inventory',
      orders: '/api/orders',
      finance: '/api/finance',
      hr: '/api/hr',
      crm: '/api/crm',
      marketing: '/api/marketing',
      social: '/api/social',
      analytics: '/api/analytics',
      b2b: '/api/b2b',
      integrations: '/api/integrations',
      pm: '/api/pm',
      fulfillment: '/api/fulfillment'
    }
  });
});

const apiRouter = express.Router();
apiRouter.use('/iam', iamRouter);
apiRouter.use('/catalog', catalogRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/finance', financeRouter);
apiRouter.use('/crm', crmRouter);
apiRouter.use('/hr', hrRouter);
apiRouter.use('/marketing', marketingRouter);
apiRouter.use('/social', socialRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/b2b', b2bRouter);
apiRouter.use('/integrations', integrationsRouter);
apiRouter.use('/pm', pmRouter);
apiRouter.use('/fulfillment', fulfillmentRouter);
apiRouter.use('/rabs', rabsRouter);

// Local file storage fallback (used when S3 is not configured)
app.use('/uploads', express.static(UPLOADS_ROOT, { maxAge: '30d', index: false, dotfiles: 'deny' }));

// Register base API router
app.use('/api', apiRouter);

app.use((_req, _res, next) => {
  next(createError(404, 'Route not found'));
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status || 500;
  res.status(status).json({
    error: {
      message: err.message || 'Internal Server Error',
      status
    }
  });
});

export default app;


