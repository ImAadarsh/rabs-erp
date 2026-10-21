'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import {
  downloadPriceListImportTemplate,
  importPriceListItemsFile,
  type PriceListImportResult
} from '@/lib/api';

const ACCEPT = '.csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadErrorReport(result: PriceListImportResult, listCode: string) {
  const lines = [['row', 'identifier', 'error'].join(',')];
  for (const e of result.errors) lines.push([e.row, csvCell(e.identifier), csvCell(e.message)].join(','));
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `price-list-${listCode || 'import'}-errors.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Upload CSV/XLSX rows into one price list: validate first (dry run), then import the valid rows.
 * Rows are upserted per variant.
 */
export function PriceListImportModal({
  priceList,
  initialFile,
  onClose,
  onImported
}: {
  priceList: { id: string; name: string; code: string; currency: string };
  initialFile?: File | null;
  onClose: () => void;
  onImported?: (result: PriceListImportResult) => void;
}) {
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [preview, setPreview] = useState<PriceListImportResult | null>(null);
  const [result, setResult] = useState<PriceListImportResult | null>(null);
  const [busy, setBusy] = useState<'validate' | 'import' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback(async (f: File) => {
    setBusy('validate');
    setPreview(null);
    setResult(null);
    try {
      const res = await importPriceListItemsFile(priceList.id, f, { dryRun: true });
      setPreview(res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Could not read the file');
    } finally {
      setBusy(null);
    }
  }, [priceList.id]);

  useEffect(() => {
    if (initialFile) void validate(initialFile);
  }, [initialFile, validate]);

  async function runImport() {
    if (!file) return;
    setBusy('import');
    try {
      const res = await importPriceListItemsFile(priceList.id, file);
      setResult(res.data);
      setPreview(null);
      onImported?.(res.data);
      toast.success(`Imported ${res.data.created + res.data.updated} item(s) into ${priceList.name}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Import failed');
    } finally {
      setBusy(null);
    }
  }

  async function template(format: 'csv' | 'xlsx') {
    try {
      await downloadPriceListImportTemplate(format);
    } catch {
      toast.error('Could not download the template');
    }
  }

  const shown = result ?? preview;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold">Import items · {priceList.name}</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Upload a CSV or Excel file with one row per product variant. Identify each row by <b>sku</b>,{' '}
          <b>barcode</b> or <b>variant_id</b> and give a <b>price</b> in {priceList.currency}. Optional columns:
          compare_at_price, cost_price, min_quantity, max_quantity, currency. Existing items for the same
          variant are updated; new ones are added.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm text-muted-foreground">Template:</span>
          <button type="button" onClick={() => template('xlsx')} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
            <Download className="h-4 w-4" /> Excel (.xlsx)
          </button>
          <button type="button" onClick={() => template('csv')} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>

        <div
          className="rounded-xl border border-dashed border-border p-5 text-center cursor-pointer hover:bg-muted/40"
          onClick={() => inputRef.current?.click()}
        >
          <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">{file ? file.name : 'Choose a .csv or .xlsx file'}</p>
          {file && <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · click to choose another</p>}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = '';
              setFile(f);
              if (f) void validate(f);
            }}
          />
        </div>

        {busy === 'validate' && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Validating rows…
          </div>
        )}

        {shown && (
          <div className="mt-4 space-y-3">
            <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${shown.failed ? 'border-amber-500/30 bg-amber-500/10 text-amber-700' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'}`}>
              {shown.failed ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>
                {result ? 'Import finished: ' : 'Checked: '}
                {shown.totalRows} row(s) · {shown.validRows} valid
                {result
                  ? ` (${shown.created} added, ${shown.updated} updated)`
                  : ` (${shown.created} new, ${shown.updated} existing to update)`}
                {shown.failed > 0 && <> · {shown.failed} with errors{result ? ' (skipped)' : ' will be skipped'}</>}
              </span>
            </div>

            {shown.errors.length > 0 && (
              <div className="rounded-lg border border-border">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-sm font-medium">Rows with errors</span>
                  <button
                    type="button"
                    onClick={() => downloadErrorReport(shown, priceList.code)}
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <Download className="h-4 w-4" /> Download error report
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground sticky top-0">
                      <tr>
                        <th className="w-16 px-3 py-2 text-left font-medium">Row</th>
                        <th className="w-40 px-3 py-2 text-left font-medium">SKU / barcode</th>
                        <th className="px-3 py-2 text-left font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {shown.errors.slice(0, 500).map((e, i) => (
                        <tr key={`${e.row}-${i}`}>
                          <td className="px-3 py-1.5 font-mono">{e.row}</td>
                          <td className="px-3 py-1.5 truncate max-w-[10rem]">{e.identifier}</td>
                          <td className="px-3 py-1.5 text-red-600">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <button type="button" onClick={onClose} className="btn btn-outline">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={runImport}
              disabled={!file || !preview || preview.validRows === 0 || busy !== null}
              className="btn btn-primary inline-flex items-center gap-2 disabled:opacity-50"
            >
              {busy === 'import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import {preview ? preview.validRows : ''} valid row{preview?.validRows === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
