/**
 * Adds social_accounts.metadata JSON for Meta Page/IG/ads linkage.
 * Idempotent. Usage: npx tsx src/scripts/addSocialAccountMetadata.ts
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await AppDataSource.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function main() {
  await AppDataSource.initialize();
  if (await columnExists('social_accounts', 'metadata')) {
    console.log('· social_accounts.metadata already exists');
  } else {
    await AppDataSource.query(
      `ALTER TABLE social_accounts
         ADD COLUMN metadata JSON NULL AFTER token_expires_at`
    );
    console.log('✓ added social_accounts.metadata');
  }
  await AppDataSource.destroy();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await AppDataSource.destroy();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
