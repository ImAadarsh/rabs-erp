import { Request, Response } from 'express';
import { z } from 'zod';
import { parseInventoryExcel } from '@services/import/inventoryExcelParser.js';
import { runInventoryExcelImport } from '@services/import/inventoryExcelImport.js';

const optionsSchema = z.object({
  organizationId: z.string().min(1),
  businessUnitId: z.string().optional(),
  duplicateMode: z.enum(['skip', 'update']).default('update'),
  importInventory: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined) return true;
      if (typeof v === 'boolean') return v;
      return v === 'true' || v === '1';
    })
});

function getUploadedBuffer(req: Request): Buffer {
  const file = req.file;
  if (!file?.buffer?.length) {
    throw new Error('Excel file is required (.xlsx)');
  }
  const name = (file.originalname || '').toLowerCase();
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
    throw new Error('Only Excel files (.xlsx / .xls) are supported');
  }
  return file.buffer;
}

export class InventoryExcelImportController {
  /** POST /catalog/inventory-import/preview */
  static async preview(req: Request, res: Response): Promise<void> {
    try {
      const buffer = getUploadedBuffer(req);
      const { preview } = parseInventoryExcel(buffer);
      res.json({ data: preview });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to preview inventory Excel';
      res.status(400).json({ error: { message } });
    }
  }

  /** POST /catalog/inventory-import/execute */
  static async execute(req: Request, res: Response): Promise<void> {
    try {
      const parsed = optionsSchema.safeParse({
        organizationId: req.body.organizationId,
        businessUnitId: req.body.businessUnitId || undefined,
        duplicateMode: req.body.duplicateMode || 'update',
        importInventory: req.body.importInventory
      });
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid options', details: parsed.error.issues } });
        return;
      }

      const buffer = getUploadedBuffer(req);
      const { rows, preview } = parseInventoryExcel(buffer);
      if (!rows.length) {
        res.status(400).json({ error: { message: 'No valid product rows found in the Excel file' } });
        return;
      }

      const result = await runInventoryExcelImport(rows, {
        organizationId: parsed.data.organizationId,
        businessUnitId: parsed.data.businessUnitId,
        duplicateMode: parsed.data.duplicateMode,
        importInventory: parsed.data.importInventory
      });

      res.json({
        data: {
          preview,
          result
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Inventory Excel import failed';
      res.status(500).json({ error: { message } });
    }
  }
}
