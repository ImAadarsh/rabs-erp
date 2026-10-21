import { AppDataSource } from '@config/data-source.js';

export const DEFAULT_WAREHOUSE_TYPES = [
  { code: 'main_hub', name: 'Main Hub', sortOrder: 10 },
  { code: 'distribution_center', name: 'Distribution Center', sortOrder: 20 },
  { code: 'store', name: 'Store', sortOrder: 30 },
  { code: 'third_party', name: 'Third Party', sortOrder: 40 },
  { code: 'other', name: 'Other', sortOrder: 50 }
];

export type WarehouseTypeRow = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  inUse: number;
};

/** Organisations created after migration 020b get the built-in types the first time they are read. */
export async function ensureDefaultWarehouseTypes(orgId: string): Promise<void> {
  const [row] = await AppDataSource.query('SELECT COUNT(*) AS n FROM warehouse_types WHERE organization_id = ?', [orgId]);
  if (Number(row?.n ?? 0) > 0) return;
  for (const t of DEFAULT_WAREHOUSE_TYPES) {
    await AppDataSource.query(
      'INSERT IGNORE INTO warehouse_types (organization_id, code, name, sort_order) VALUES (?, ?, ?, ?)',
      [orgId, t.code, t.name, t.sortOrder]
    );
  }
}

export async function listWarehouseTypes(orgId: string, activeOnly = false): Promise<WarehouseTypeRow[]> {
  await ensureDefaultWarehouseTypes(orgId);
  const rows: any[] = await AppDataSource.query(
    `SELECT t.id, t.organization_id, t.code, t.name, t.is_active, t.sort_order,
            (SELECT COUNT(*) FROM warehouses w
               JOIN locations l ON l.id = w.location_id
               JOIN business_units bu ON bu.id = l.business_unit_id
              WHERE bu.organization_id = t.organization_id AND w.type = t.code AND w.deleted_at IS NULL) AS in_use
       FROM warehouse_types t
      WHERE t.organization_id = ? ${activeOnly ? 'AND t.is_active = 1' : ''}
      ORDER BY t.sort_order, t.name`,
    [orgId]
  );
  return rows.map(mapType);
}

export async function getWarehouseType(orgId: string, id: string): Promise<WarehouseTypeRow | null> {
  const rows = await listWarehouseTypes(orgId);
  return rows.find((r) => r.id === String(id)) ?? null;
}

/** Organisation that owns a location (warehouses inherit it through location → business unit). */
export async function organizationIdForLocation(locationId: string): Promise<string | null> {
  const [row] = await AppDataSource.query(
    'SELECT bu.organization_id FROM locations l JOIN business_units bu ON bu.id = l.business_unit_id WHERE l.id = ?',
    [locationId]
  );
  return row?.organization_id != null ? String(row.organization_id) : null;
}

/** Error message when [code] is not an active warehouse type of [orgId], otherwise null. */
export async function warehouseTypeError(orgId: string | null, code: string): Promise<string | null> {
  if (!orgId) return 'Could not resolve the organisation of this location';
  await ensureDefaultWarehouseTypes(orgId);
  const [row] = await AppDataSource.query(
    'SELECT is_active FROM warehouse_types WHERE organization_id = ? AND code = ?',
    [orgId, code]
  );
  if (!row) return `Unknown warehouse type "${code}". Add it under warehouse types first.`;
  if (!Number(row.is_active)) return `Warehouse type "${code}" is inactive`;
  return null;
}

/** Turns a display name into a stable code, e.g. "Cold Store #2" → "cold_store_2". */
export function warehouseTypeCodeFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

function mapType(r: any): WarehouseTypeRow {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    code: r.code,
    name: r.name,
    isActive: !!Number(r.is_active),
    sortOrder: Number(r.sort_order ?? 0),
    inUse: Number(r.in_use ?? 0)
  };
}
