import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

export const letterheadSettingsSchema = z.object({
  logoUrl: optionalText(1000),
  companyName: optionalText(255),
  addressLines: z
    .array(z.string().trim().max(255))
    .max(8)
    .optional()
    .transform((lines) => (lines ?? []).filter(Boolean)),
  phone: optionalText(50),
  email: optionalText(255),
  website: optionalText(255),
  vatNumber: optionalText(100),
  companyNumber: optionalText(100),
  footerText: optionalText(2000),
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Accent colour must be a hex colour like #D4A017')
    .nullable()
    .optional()
    .transform((v) => v || null)
});

export type LetterheadSettings = z.infer<typeof letterheadSettingsSchema>;

function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; errno?: number };
  return e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146;
}

/** Saved letterhead for an organization, or null (also when migration 020c has not run yet). */
export async function getOrganizationLetterhead(organizationId: string): Promise<LetterheadSettings | null> {
  try {
    const rows: Array<{ settings: unknown }> = await AppDataSource.query(
      'SELECT settings FROM organization_letterheads WHERE organization_id = ?',
      [organizationId]
    );
    if (!rows.length) return null;
    const raw = typeof rows[0].settings === 'string' ? JSON.parse(rows[0].settings) : rows[0].settings;
    const parsed = letterheadSettingsSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : null;
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

export async function saveOrganizationLetterhead(
  organizationId: string,
  settings: LetterheadSettings,
  userId: string | null
): Promise<LetterheadSettings> {
  try {
    await AppDataSource.query(
      `INSERT INTO organization_letterheads (organization_id, settings, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE settings = VALUES(settings), updated_by = VALUES(updated_by)`,
      [organizationId, JSON.stringify(settings), userId]
    );
  } catch (err) {
    if (isMissingTable(err)) {
      throw Object.assign(
        new Error('Letterhead storage is not set up yet (migration 020c_organization_letterheads.sql has not been run).'),
        { status: 503 }
      );
    }
    throw err;
  }
  return settings;
}
