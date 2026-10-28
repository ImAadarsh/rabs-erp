import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppDataSource } from '../config/data-source.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await AppDataSource.initialize();
  const sql = fs.readFileSync(path.join(__dirname, '../../migrations/021_rabs_requirements_gaps.sql'), 'utf8');
  for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    try {
      await AppDataSource.query(stmt);
      console.log('OK:', stmt.slice(0, 80).replace(/\s+/g, ' '));
    } catch (e: any) {
      if (String(e?.message || e).includes('Duplicate') || String(e?.code) === 'ER_DUP_FIELDNAME' || String(e?.errno) === '1060') {
        console.log('SKIP (exists):', stmt.slice(0, 60).replace(/\s+/g, ' '));
      } else {
        throw e;
      }
    }
  }
  await AppDataSource.destroy();
  console.log('Migration 021 done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
