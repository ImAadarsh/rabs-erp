import { AppDataSource } from '@config/data-source.js';

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await AppDataSource.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

/** Idempotent extras for the Social inbox. Safe to run on every boot. */
export async function ensureSocialSchema(): Promise<void> {
  if (!(await columnExists('social_messages', 'tags'))) {
    await AppDataSource.query(`ALTER TABLE social_messages ADD COLUMN tags JSON NULL`);
  }
  if (!(await columnExists('social_messages', 'folder'))) {
    await AppDataSource.query(`ALTER TABLE social_messages ADD COLUMN folder VARCHAR(64) NULL`);
  }
  if (!(await columnExists('social_messages', 'platform_message_id'))) {
    await AppDataSource.query(
      `ALTER TABLE social_messages ADD COLUMN platform_message_id VARCHAR(255) NULL`
    );
  }
}
