import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AppDataSource } from '../config/data-source.js';

async function run() {
  const sql = readFileSync(resolve(process.cwd(), 'migrations/019_rabs_workflow.sql'), 'utf8');
  await AppDataSource.initialize();
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, '').trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    try {
      await AppDataSource.query(statement);
      console.log('OK:', statement.slice(0, 80).replace(/\s+/g, ' '));
    } catch (err: any) {
      if (/Duplicate|already exists|ER_DUP_KEYNAME|ER_DUP_FIELDNAME/i.test(String(err.message || ''))) {
        console.log('SKIP:', statement.slice(0, 80).replace(/\s+/g, ' '));
        continue;
      }
      console.error('FAIL:', statement.slice(0, 80).replace(/\s+/g, ' '));
      throw err;
    }
  }
  await AppDataSource.destroy();
  console.log('Migration 019 (RABS workflow) complete.');
}

run().catch(async (err) => {
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
