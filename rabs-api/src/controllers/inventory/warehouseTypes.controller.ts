import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import {
  getWarehouseType,
  listWarehouseTypes,
  warehouseTypeCodeFromName
} from '@services/inventory/warehouseTypes.js';

const createWarehouseTypeSchema = z.object({
  organizationId: z.string().optional(),
  name: z.string().trim().min(1, 'Name is required').max(100),
  code: z.string().trim().max(50).regex(/^[a-z0-9_]*$/, 'Code may only contain lowercase letters, digits and _').optional(),
  isActive: z.boolean().optional()
});

const updateWarehouseTypeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional()
});

function orgIdOf(req: Request): string {
  return String((req.query.organizationId as string) || req.body?.organizationId || (req as any).auth?.orgId || '');
}

export class WarehouseTypesController {
  /** GET /inventory/warehouse-types?active=true */
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdOf(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId is required' } });
        return;
      }
      const activeOnly = req.query.active === 'true' || req.query.active === '1';
      res.json({ data: await listWarehouseTypes(orgId, activeOnly) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createWarehouseTypeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: parsed.error.issues[0]?.message ?? 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const orgId = orgIdOf(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId is required' } });
        return;
      }
      const code = parsed.data.code || warehouseTypeCodeFromName(parsed.data.name);
      if (!code) {
        res.status(400).json({ error: { message: 'Name must contain at least one letter or digit' } });
        return;
      }

      const existing = await listWarehouseTypes(orgId);
      if (existing.some((t) => t.code === code)) {
        res.status(400).json({ error: { message: `Warehouse type "${code}" already exists` } });
        return;
      }
      if (existing.some((t) => t.name.toLowerCase() === parsed.data.name.toLowerCase())) {
        res.status(400).json({ error: { message: `Warehouse type "${parsed.data.name}" already exists` } });
        return;
      }

      const sortOrder = existing.reduce((max, t) => Math.max(max, t.sortOrder), 0) + 10;
      const result: any = await AppDataSource.query(
        'INSERT INTO warehouse_types (organization_id, code, name, is_active, sort_order) VALUES (?, ?, ?, ?, ?)',
        [orgId, code, parsed.data.name, parsed.data.isActive === false ? 0 : 1, sortOrder]
      );
      res.status(201).json({ data: await getWarehouseType(orgId, String(result.insertId)) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  /** The code is immutable because warehouses store it; only name, order and active flag change. */
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateWarehouseTypeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: parsed.error.issues[0]?.message ?? 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const orgId = orgIdOf(req);
      const current = await getWarehouseType(orgId, req.params.id);
      if (!current) {
        res.status(404).json({ error: { message: 'Warehouse type not found' } });
        return;
      }

      const sets: string[] = [];
      const params: unknown[] = [];
      if (parsed.data.name !== undefined) { sets.push('name = ?'); params.push(parsed.data.name); }
      if (parsed.data.isActive !== undefined) { sets.push('is_active = ?'); params.push(parsed.data.isActive ? 1 : 0); }
      if (parsed.data.sortOrder !== undefined) { sets.push('sort_order = ?'); params.push(parsed.data.sortOrder); }
      if (sets.length) {
        await AppDataSource.query(
          `UPDATE warehouse_types SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`,
          [...params, current.id, orgId]
        );
      }
      res.json({ data: await getWarehouseType(orgId, current.id) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdOf(req);
      const current = await getWarehouseType(orgId, req.params.id);
      if (!current) {
        res.status(404).json({ error: { message: 'Warehouse type not found' } });
        return;
      }
      if (current.inUse > 0) {
        res.status(400).json({
          error: { message: `"${current.name}" is used by ${current.inUse} warehouse(s). Deactivate it instead, or change those warehouses first.` }
        });
        return;
      }
      await AppDataSource.query('DELETE FROM warehouse_types WHERE id = ? AND organization_id = ?', [current.id, orgId]);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
