import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AppDataSource } from '../config/data-source.js';

async function run() {
  const sql = readFileSync(resolve(process.cwd(), 'migrations/020_rabs_materials_used.sql'), 'utf8');
  await AppDataSource.initialize();
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, '').trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    await AppDataSource.query(statement);
    console.log('OK:', statement.slice(0, 80).replace(/\s+/g, ' '));
  }
  await AppDataSource.destroy();
  console.log('Migration 020 (RABS materials used) complete.');
}

run().catch(async (err) => {
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
