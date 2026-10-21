import { AppDataSource } from '@config/data-source.js';
import { env } from '@config/env.js';
import { DataExport } from '@entities/analytics/DataExport.js';
import { ReportDefinition } from '@entities/analytics/ReportDefinition.js';
import { ReportExecution } from '@entities/analytics/ReportExecution.js';
import { ScheduledReport } from '@entities/analytics/ScheduledReport.js';
import { getDefaultConnector } from '@services/marketing/emailConnector.service.js';
import { createDefaultEnvProvider, createEmailProvider } from '@services/marketing/email/index.js';
import { isSmtpConfigured } from '@services/marketing/email/SmtpGmailProvider.js';
import type { EmailProvider } from '@services/marketing/email/EmailProvider.js';
import { EXPORT_TTL_DAYS, exportFileName, processPendingExports } from './dataExport.service.js';
import { resolveDatasetKey, runDataset, toCsv, writeExportFile } from './reportEngine.service.js';

type Frequency = ScheduledReport['frequency'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalise recipients ({ emailList } or a plain array / comma string) to a de-duplicated list of valid emails. */
export function recipientEmails(recipients: unknown): string[] {
  let raw: unknown[] = [];
  if (Array.isArray(recipients)) raw = recipients;
  else if (typeof recipients === 'string') raw = recipients.split(/[,;\s]+/);
  else if (recipients && typeof recipients === 'object' && Array.isArray((recipients as any).emailList)) {
    raw = (recipients as any).emailList;
  }
  const out = new Set<string>();
  for (const r of raw) {
    const e = String(r ?? '').trim().toLowerCase();
    if (e && EMAIL_RE.test(e)) out.add(e);
  }
  return [...out];
}

function parseRunTime(runTime?: string | null): [number, number] {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(runTime || '09:00'));
  const h = m ? Math.min(23, Number(m[1])) : 9;
  const min = m ? Math.min(59, Number(m[2])) : 0;
  return [h, min];
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function at(year: number, month: number, day: number, h: number, min: number): Date {
  const d = Math.min(Math.max(1, day), daysInMonth(year, month));
  return new Date(year, month, d, h, min, 0, 0);
}

/**
 * Next run strictly after `after`, in the server's local time zone (TZ=Europe/London on prod).
 * weekly uses dayOfWeek (0 = Sunday, default Monday); monthly/quarterly/yearly use dayOfMonth (default 1,
 * clamped to the month length); quarterly runs in Jan/Apr/Jul/Oct, yearly in January.
 */
export function computeNextRun(
  s: Pick<ScheduledReport, 'frequency' | 'runTime' | 'dayOfWeek' | 'dayOfMonth'>,
  after: Date = new Date()
): Date {
  const [h, min] = parseRunTime(s.runTime);
  const y = after.getFullYear();
  const mo = after.getMonth();
  const dom = s.dayOfMonth && s.dayOfMonth > 0 ? s.dayOfMonth : 1;

  switch (s.frequency as Frequency) {
    case 'daily': {
      const c = new Date(y, mo, after.getDate(), h, min, 0, 0);
      return c > after ? c : new Date(y, mo, after.getDate() + 1, h, min, 0, 0);
    }
    case 'weekly': {
      const dow = s.dayOfWeek != null && s.dayOfWeek >= 0 && s.dayOfWeek <= 6 ? s.dayOfWeek : 1;
      for (let i = 0; i <= 7; i++) {
        const c = new Date(y, mo, after.getDate() + i, h, min, 0, 0);
        if (c.getDay() === dow && c > after) return c;
      }
      return new Date(y, mo, after.getDate() + 7, h, min, 0, 0);
    }
    case 'monthly': {
      for (let i = 0; i <= 12; i++) {
        const first = new Date(y, mo + i, 1);
        const cand = at(first.getFullYear(), first.getMonth(), dom, h, min);
        if (cand > after) return cand;
      }
      break;
    }
    case 'quarterly': {
      for (let i = 0; i <= 12; i++) {
        const first = new Date(y, mo + i, 1);
        if (first.getMonth() % 3 !== 0) continue;
        const cand = at(first.getFullYear(), first.getMonth(), dom, h, min);
        if (cand > after) return cand;
      }
      break;
    }
    case 'yearly': {
      for (let i = 0; i <= 1; i++) {
        const cand = at(y + i, 0, dom, h, min);
        if (cand > after) return cand;
      }
      break;
    }
  }
  return new Date(after.getTime() + 86400000);
}

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Reporting window for a run at `runAt`: the previous full period (yesterday, last 7 days, last month/quarter/year). */
export function reportRangeFor(frequency: Frequency, runAt: Date, parameters?: any): { from: string; to: string } {
  if (parameters && typeof parameters.from === 'string' && typeof parameters.to === 'string') {
    return { from: parameters.from, to: parameters.to };
  }
  const y = runAt.getFullYear();
  const m = runAt.getMonth();
  const d = runAt.getDate();
  switch (frequency) {
    case 'daily':
      return { from: ymd(new Date(y, m, d - 1)), to: ymd(new Date(y, m, d - 1)) };
    case 'weekly':
      return { from: ymd(new Date(y, m, d - 7)), to: ymd(new Date(y, m, d - 1)) };
    case 'monthly':
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case 'quarterly': {
      const qStart = m - (m % 3);
      return { from: ymd(new Date(y, qStart - 3, 1)), to: ymd(new Date(y, qStart, 0)) };
    }
    case 'yearly':
      return { from: ymd(new Date(y - 1, 0, 1)), to: ymd(new Date(y - 1, 11, 31)) };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function resolveEmailProvider(organizationId: string): Promise<EmailProvider | null> {
  const connector = await getDefaultConnector(organizationId).catch(() => null);
  if (connector) return createEmailProvider(connector);
  if (process.env.SENDGRID_API_KEY || isSmtpConfigured()) return createDefaultEnvProvider();
  return null;
}

export type ScheduledRunResult = {
  executionId: string | null;
  exportId: string | null;
  rowCount: number;
  range: { from: string; to: string };
  delivery: { status: 'sent' | 'partial' | 'failed' | 'skipped'; recipients: string[]; message: string };
};

/** Run one schedule now: execute its dataset, store a downloadable CSV (Data Exports) and email the recipients. */
export async function runScheduledReport(
  schedule: ScheduledReport,
  opts: { trigger: 'schedule' | 'manual'; requestedById?: string | null; runAt?: Date } = { trigger: 'schedule' }
): Promise<ScheduledRunResult> {
  const runAt = opts.runAt ?? new Date();
  const started = Date.now();
  const execRepo = AppDataSource.getRepository(ReportExecution);
  const def = await AppDataSource.getRepository(ReportDefinition).findOne({ where: { id: schedule.reportDefinitionId } });
  if (!def) throw Object.assign(new Error('Report definition not found'), { status: 404 });

  const datasetKey = resolveDatasetKey(def.reportCategory, def.parameters);
  const range = reportRangeFor(schedule.frequency, runAt, schedule.parameters);
  const recipients = recipientEmails(schedule.recipients);

  const execution = await execRepo.save(
    execRepo.create({
      reportDefinitionId: def.id,
      scheduledReportId: schedule.id,
      parameters: { dataset: datasetKey, from: range.from, to: range.to, trigger: opts.trigger },
      status: 'running',
      startedAt: new Date(),
      requestedById: opts.requestedById ?? undefined
    })
  );

  try {
    const result = await runDataset(datasetKey, String(def.organizationId), range);
    const csv = '\uFEFF' + toCsv(result.columns, result.rows);

    let exportId: string | null = null;
    let downloadUrl: string | null = null;
    const ownerId = opts.requestedById || schedule.createdById || (def as any).createdById || null;
    if (ownerId) {
      const exportRepo = AppDataSource.getRepository(DataExport);
      const exp = await exportRepo.save(
        exportRepo.create({
          organizationId: def.organizationId,
          exportName: `${schedule.scheduleName} (${range.from} to ${range.to})`.slice(0, 255),
          entityType: `scheduled:${datasetKey}`.slice(0, 100),
          exportFormat: 'csv',
          filters: { from: range.from, to: range.to, scheduledReportId: String(schedule.id), executionId: String(execution.id) },
          status: 'processing',
          startedAt: new Date(),
          requestedById: String(ownerId)
        })
      );
      const { size } = await writeExportFile(exportFileName(exp), csv);
      exp.status = 'completed';
      exp.completedAt = new Date();
      exp.rowCount = result.rows.length;
      exp.fileSize = size;
      exp.fileUrl = `/api/analytics/exports/${exp.id}/download`;
      exp.expiresAt = new Date(Date.now() + EXPORT_TTL_DAYS * 86400000);
      await exportRepo.save(exp);
      exportId = String(exp.id);
      downloadUrl = exp.fileUrl;
    }

    let delivery: ScheduledRunResult['delivery'];
    if (!recipients.length) {
      delivery = { status: 'skipped', recipients, message: 'No recipients set on this schedule' };
    } else if (String(process.env.REPORT_SCHEDULER_EMAIL || 'on').toLowerCase() === 'off') {
      delivery = { status: 'skipped', recipients, message: 'Report emails are disabled on this server (REPORT_SCHEDULER_EMAIL=off)' };
    } else {
      const provider = await resolveEmailProvider(String(def.organizationId));
      if (!provider) {
        delivery = {
          status: 'skipped',
          recipients,
          message: 'Email not sent: no email connector configured (Marketing > Email Connectors)'
        };
      } else {
        const exportsLink = `${env.FRONTEND_URL.replace(/\/$/, '')}/analytics/exports`;
        const preview = result.rows.slice(0, 25);
        const table = result.columns.length
          ? `<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:12px">
<tr>${result.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>
${preview.map((r) => `<tr>${result.columns.map((c) => `<td>${escapeHtml(r[c] == null ? '' : String(r[c]))}</td>`).join('')}</tr>`).join('\n')}
</table>`
          : '<p>No rows for this period.</p>';
        const html = `<p><strong>${escapeHtml(schedule.scheduleName)}</strong> - ${escapeHtml(def.reportName)}</p>
<p>Period ${range.from} to ${range.to}: ${result.rows.length} row(s).</p>
${table}
${result.rows.length > preview.length ? `<p>Showing the first ${preview.length} rows.</p>` : ''}
<p>Download the full CSV from Analytics &gt; Data Exports: <a href="${exportsLink}">${exportsLink}</a></p>`;
        const send = await provider.sendBulk({
          recipients: recipients.map((email) => ({ email })),
          subject: `[RABS] ${schedule.scheduleName} (${range.from} to ${range.to})`,
          html,
          customArgs: { scheduledReportId: String(schedule.id), executionId: String(execution.id) }
        });
        const okCount = send.recipientResults ? send.recipientResults.filter((r) => r.ok).length : send.ok ? recipients.length : 0;
        delivery = {
          status: okCount === recipients.length ? 'sent' : okCount > 0 ? 'partial' : 'failed',
          recipients,
          message: okCount === recipients.length ? `Emailed ${okCount} recipient(s)` : `Email failed: ${send.error || 'unknown error'}`
        };
      }
    }

    execution.status = 'completed';
    execution.completedAt = new Date();
    execution.executionTimeSeconds = Math.round((Date.now() - started) / 1000);
    execution.rowCount = result.rows.length;
    execution.outputUrl = downloadUrl ?? undefined;
    execution.parameters = { ...(execution.parameters || {}), exportId, delivery };
    await execRepo.save(execution);
    console.log(
      `[report-scheduler] schedule ${schedule.id} ran (${opts.trigger}): ${result.rows.length} rows, export ${exportId ?? '-'}, delivery ${delivery.status}: ${delivery.message}`
    );
    return { executionId: String(execution.id), exportId, rowCount: result.rows.length, range, delivery };
  } catch (err: any) {
    execution.status = 'failed';
    execution.completedAt = new Date();
    execution.errorMessage = String(err?.message || 'Scheduled run failed').slice(0, 2000);
    await execRepo.save(execution).catch(() => undefined);
    console.error(`[report-scheduler] schedule ${schedule.id} failed:`, err?.message || err);
    throw err;
  }
}

let ticking = false;

/** One scheduler pass: arm schedules without next_run_at, run the due ones (claimed atomically), then queued exports. */
export async function runSchedulerTick(now: Date = new Date()): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const repo = AppDataSource.getRepository(ScheduledReport);
    const active = await repo.find({ where: { isActive: true } });
    for (const s of active) {
      if (!s.nextRunAt) {
        await repo.update({ id: s.id }, { nextRunAt: computeNextRun(s, now) });
        continue;
      }
      if (new Date(s.nextRunAt).getTime() > now.getTime()) continue;
      const next = computeNextRun(s, now);
      const claim: any = await AppDataSource.query(
        'UPDATE scheduled_reports SET next_run_at = ?, last_run_at = ? WHERE id = ? AND is_active = 1 AND next_run_at = ?',
        [next, now, s.id, s.nextRunAt]
      );
      const affected = claim?.affectedRows ?? claim?.[1] ?? 0;
      if (!affected) continue;
      await runScheduledReport(s, { trigger: 'schedule', runAt: now }).catch(() => undefined);
    }
    await processPendingExports().catch((err) => console.error('[exports] worker error', err));
  } catch (err) {
    console.error('[report-scheduler] tick failed', err);
  } finally {
    ticking = false;
  }
}

export function startReportSchedulerCron(): void {
  if (String(process.env.REPORT_SCHEDULER_CRON || 'on').toLowerCase() === 'off') return;
  console.log('[report-scheduler] checking scheduled reports and queued exports every 60s');
  setTimeout(() => void runSchedulerTick(), 15000).unref();
  setInterval(() => void runSchedulerTick(), 60000).unref();
}
