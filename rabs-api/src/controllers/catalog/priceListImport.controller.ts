import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { PriceList } from '@entities/catalog/PriceList.js';
import {
  buildPriceListTemplate,
  importPriceListItems,
  parsePriceListFile
} from '@services/catalog/priceListImport.js';

export class PriceListImportController {
  /** GET /catalog/price-lists/import-template?format=csv|xlsx */
  static async template(req: Request, res: Response): Promise<void> {
    try {
      const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
      const body = buildPriceListTemplate(format);
      res.setHeader(
        'Content-Type',
        format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="price-list-items-template.${format}"`);
      res.send(body);
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  /**
   * POST /catalog/price-lists/:id/import (multipart: file, dryRun)
   * dryRun=true validates and reports without writing.
   */
  static async import(req: Request, res: Response): Promise<void> {
    try {
      const priceList = await AppDataSource.getRepository(PriceList).findOne({ where: { id: req.params.id } });
      if (!priceList) {
        res.status(404).json({ error: { message: 'Price list not found' } });
        return;
      }
      const file = req.file;
      if (!file?.buffer?.length) {
        res.status(400).json({ error: { message: 'Upload a .csv or .xlsx file' } });
        return;
      }

      let rows;
      try {
        rows = parsePriceListFile(file.buffer, file.originalname || '');
      } catch (err) {
        res.status(400).json({ error: { message: err instanceof Error ? err.message : 'Could not read the file' } });
        return;
      }
      if (rows.length === 0) {
        res.status(400).json({ error: { message: 'The file has no data rows below the header' } });
        return;
      }

      const dryRun = req.body?.dryRun === true || req.body?.dryRun === 'true' || req.body?.dryRun === '1';
      const result = await importPriceListItems(priceList, rows, dryRun);
      res.json({ data: result });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
