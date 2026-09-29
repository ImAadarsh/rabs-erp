import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AppDataSource } from '../config/data-source.js';

async function run() {
  const sql = readFileSync(resolve(process.cwd(), 'migrations/012_crm_marketing_email.sql'), 'utf8');
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
      const msg = String(err.message || '');
      if (
        /Duplicate|already exists|Duplicate column|Duplicate key|errno: 1061|ER_DUP_KEYNAME|ER_FK_DUP_NAME/i.test(
          msg
        )
      ) {
        console.log('SKIP:', statement.slice(0, 80).replace(/\s+/g, ' '), '→', msg.split('\n')[0]);
        continue;
      }
      console.error('FAIL:', statement.slice(0, 80).replace(/\s+/g, ' '));
      console.error(err.message);
      throw err;
    }
  }
  await AppDataSource.destroy();
  console.log('Migration 012 complete.');
}

run().catch(async (err) => {
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
