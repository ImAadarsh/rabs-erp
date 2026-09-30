import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AppDataSource } from '../config/data-source.js';

async function run() {
  const sql = readFileSync(resolve(process.cwd(), 'migrations/009_marketing_ops.sql'), 'utf8');
  await AppDataSource.initialize();
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, '').trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    try {
      await AppDataSource.query(statement);
      console.log('OK:', statement.slice(0, 100).replace(/\s+/g, ' '));
    } catch (err: any) {
      // Ignore duplicate / already-exists style errors for idempotency
      const msg = String(err.message || '');
      if (/Duplicate|already exists|Duplicate column/i.test(msg)) {
        console.log('SKIP:', statement.slice(0, 80).replace(/\s+/g, ' '), '→', msg.split('\n')[0]);
        continue;
      }
      console.error('FAIL:', statement.slice(0, 80).replace(/\s+/g, ' '));
      console.error(err.message);
      throw err;
    }
  }
  await AppDataSource.destroy();
  console.log('Migration 009 complete.');
}

run().catch(async (err) => {
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
