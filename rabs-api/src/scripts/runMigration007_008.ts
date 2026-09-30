import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AppDataSource } from '../config/data-source.js';

async function runFile(name: string) {
  const sql = readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8');
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, '').trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    try {
      await AppDataSource.query(statement);
      console.log('OK:', statement.slice(0, 90).replace(/\s+/g, ' '));
    } catch (err: any) {
      // Idempotent tolerance for duplicate columns / enum already updated
      const msg = String(err.message || '');
      if (/Duplicate column|already exists|check that.+exists/i.test(msg)) {
        console.log('SKIP:', statement.slice(0, 90).replace(/\s+/g, ' '), '→', msg.slice(0, 120));
        continue;
      }
      console.error('FAIL:', statement.slice(0, 90).replace(/\s+/g, ' '));
      throw err;
    }
  }
  console.log(`Migration ${name} complete.`);
}

async function run() {
  await AppDataSource.initialize();
  await runFile('007_b2b_portal_ops.sql');
  await runFile('008_worldpay_gateway.sql');
  await AppDataSource.destroy();
}

run().catch(async (err) => {
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
