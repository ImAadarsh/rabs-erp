import 'reflect-metadata';
import { createServer } from 'http';
import app from './app.js';
import { AppDataSource } from './config/data-source.js';
import { env } from './config/env.js';

async function bootstrap(): Promise<void> {
  try {
    await AppDataSource.initialize();
    try {
      const { ensureSocialSchema } = await import('@services/social/ensureSocialSchema.js');
      await ensureSocialSchema();
    } catch (schemaErr) {
      console.warn('Social schema ensure skipped:', (schemaErr as Error)?.message);
    }
    const server = createServer(app);
    server.listen(env.PORT, env.HOST, () => {
      // eslint-disable-next-line no-console
      console.log(`RABS API running on http://${env.HOST}:${env.PORT}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to start API:', err);
    process.exit(1);
  }
}

bootstrap();


