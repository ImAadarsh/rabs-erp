import { AppDataSource } from '@config/data-source.js';
import { DataExport } from '@entities/analytics/DataExport.js';
import { EXPORT_ENTITY_DATASETS, runDataset, toCsv, toXml, writeExportFile } from './reportEngine.service.js';

export const EXPORT_TTL_DAYS = 7;
const inFlight = new Set<string>();

export function isExportInFlight(id: string): boolean {
  return inFlight.has(id);
}

export function exportFileName(item: Pick<DataExport, 'exportFormat' | 'organizationId' | 'id'>): string {
  const ext = item.exportFormat === 'json' ? 'json' : item.exportFormat === 'xml' ? 'xml' : 'csv';
  return `export-${item.organizationId}-${item.id}.${ext}`;
}

/** Generate the export file in-process and record COMPLETED/FAILED on the row. */
export async function processExport(id: string): Promise<void> {
  if (inFlight.has(id)) return;
  inFlight.add(id);
  const repo = AppDataSource.getRepository(DataExport);
  try {
    const item = await repo.findOne({ where: { id } });
    if (!item || item.status === 'completed' || item.status === 'failed') return;
    item.status = 'processing';
    item.startedAt = new Date();
    await repo.save(item);

    try {
      const datasetKey = EXPORT_ENTITY_DATASETS[item.entityType];
      if (!datasetKey) {
        throw new Error(
          `Unsupported entity "${item.entityType}". Supported: ${Object.keys(EXPORT_ENTITY_DATASETS).join(', ')}`
        );
      }
      const filters = (item.filters && typeof item.filters === 'object' ? item.filters : {}) as {
        from?: string;
        to?: string;
      };
      const result = await runDataset(datasetKey, String(item.organizationId), {
        from: filters.from,
        to: filters.to
      });
      let columns = result.columns;
      if (Array.isArray(item.columns) && item.columns.length) {
        const wanted = item.columns.map(String).filter((c: string) => columns.includes(c));
        if (wanted.length) columns = wanted;
      }

      let content: string;
      if (item.exportFormat === 'json') {
        content = JSON.stringify(
          result.rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]]))),
          null,
          2
        );
      } else if (item.exportFormat === 'xml') {
        content = toXml(columns, result.rows);
      } else {
        // Excel requests are delivered as UTF-8 CSV (BOM so Excel detects encoding).
        content = (item.exportFormat === 'excel' ? '\uFEFF' : '') + toCsv(columns, result.rows);
      }

      const { size } = await writeExportFile(exportFileName(item), content);
      item.status = 'completed';
      item.completedAt = new Date();
      item.rowCount = result.rows.length;
      item.fileSize = size;
      item.fileUrl = `/api/analytics/exports/${item.id}/download`;
      item.errorMessage = undefined;
      item.expiresAt = new Date(Date.now() + EXPORT_TTL_DAYS * 86400000);
      await repo.save(item);
    } catch (err: any) {
      item.status = 'failed';
      item.completedAt = new Date();
      item.errorMessage = String(err?.message || 'Export failed').slice(0, 2000);
      await repo.save(item);
    }
  } catch (err) {
    console.error('[exports] processing error', err);
  } finally {
    inFlight.delete(id);
  }
}

/** Pick up exports left queued, or stuck in processing after a restart. Returns how many were started. */
export async function processPendingExports(organizationId?: string | null): Promise<number> {
  const repo = AppDataSource.getRepository(DataExport);
  const qb = repo
    .createQueryBuilder('e')
    .where('e.status IN (:...statuses)', { statuses: ['queued', 'processing'] })
    .orderBy('e.id', 'ASC')
    .take(20);
  if (organizationId) qb.andWhere('e.organization_id = :org', { org: organizationId });
  const pending = await qb.getMany();
  let started = 0;
  for (const it of pending) {
    const id = String(it.id);
    if (inFlight.has(id)) continue;
    if (it.status === 'processing') {
      it.status = 'queued';
      await repo.save(it);
    }
    started++;
    await processExport(id);
  }
  return started;
}
