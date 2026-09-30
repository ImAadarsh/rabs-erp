'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import {
  previewInventoryExcelImport,
  executeInventoryExcelImport,
  listOrganizations,
  listBusinessUnits
} from '@/lib/api';
import { toast } from 'sonner';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Package2,
  Warehouse,
  Users,
  X
} from 'lucide-react';

type PreviewData = {
  rowCount: number;
  sample: Array<Record<string, unknown>>;
  categories: string[];
  warehouses: string[];
  suppliers: string[];
  warnings: string[];
};

type ImportResult = {
  productsCreated: number;
  productsUpdated: number;
  productsSkipped: number;
  variantsCreated: number;
  barcodesCreated: number;
  warehousesCreated: number;
  binsCreated: number;
  suppliersCreated: number;
  stockItemsCreated: number;
  stockItemsUpdated: number;
  taxCodesCreated: number;
  errors: Array<{ sku: string; rowNumber: number; message: string }>;
};

export default function InventoryImportPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN']);
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [businessUnitId, setBusinessUnitId] = useState('');
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update'>('update');
  const [importInventory, setImportInventory] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const orgRes = await listOrganizations();
        setOrganizations(orgRes.data ?? []);
        const defaultOrg = session.user?.organizationId ?? orgRes.data?.[0]?.id ?? '';
        setOrganizationId(defaultOrg);
        if (defaultOrg) {
          const buRes = await listBusinessUnits(defaultOrg).catch(() => ({ data: [] }));
          setBusinessUnits(buRes.data ?? []);
          if (buRes.data?.[0]?.id) setBusinessUnitId(buRes.data[0].id);
        }
      } catch {
        toast.error('Failed to load organizations');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, session, hasAccess, router]);

  useEffect(() => {
    if (!organizationId) {
      setBusinessUnits([]);
      return;
    }
    listBusinessUnits(organizationId)
      .then((res) => {
        setBusinessUnits(res.data ?? []);
        setBusinessUnitId((prev) => prev || res.data?.[0]?.id || '');
      })
      .catch(() => setBusinessUnits([]));
  }, [organizationId]);

  async function onPreview() {
    if (!file) {
      toast.error('Choose an Excel file first');
      return;
    }
    setPreviewing(true);
    setResult(null);
    try {
      const res = await previewInventoryExcelImport(file);
      setPreview(res.data);
      toast.success(`Preview ready · ${res.data.rowCount} product row(s)`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Preview failed');
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }

  async function onImport() {
    if (!file || !organizationId) {
      toast.error('File and organization are required');
      return;
    }
    setImporting(true);
    try {
      const res = await executeInventoryExcelImport(file, {
        organizationId,
        businessUnitId: businessUnitId || undefined,
        duplicateMode,
        importInventory
      });
      setPreview(res.data.preview as PreviewData);
      setResult(res.data.result);
      toast.success(
        `Imported · created ${res.data.result.productsCreated}, updated ${res.data.result.productsUpdated}`
      );
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  if (!hydrated || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 lg:ml-[280px] p-8">
          <p className="text-muted-foreground">You do not have permission to import inventory.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 lg:ml-[280px]">
        <Header title="Catalog · Inventory Import" />
        <div className="p-6 space-y-6 max-w-5xl">
          <div>
            <h1 className="text-2xl font-bold">Import Inventory Excel</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload the inventory sheet to create products, barcodes, warehouses, bins, suppliers, and stock levels.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Organization *
                <select
                  className="mt-1 select w-full"
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Business Unit
                <select
                  className="mt-1 select w-full"
                  value={businessUnitId}
                  onChange={(e) => setBusinessUnitId(e.target.value)}
                >
                  <option value="">None</option>
                  {businessUnits.map((bu) => (
                    <option key={bu.id} value={bu.id}>{bu.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Duplicate SKUs
                <select
                  className="mt-1 select w-full"
                  value={duplicateMode}
                  onChange={(e) => setDuplicateMode(e.target.value as 'skip' | 'update')}
                >
                  <option value="update">Update existing</option>
                  <option value="skip">Skip existing</option>
                </select>
              </label>
              <label className="text-sm flex items-end gap-2 pb-2">
                <input
                  type="checkbox"
                  checked={importInventory}
                  onChange={(e) => setImportInventory(e.target.checked)}
                />
                Also import warehouse / stock (qty, reorder, bin, lot, expiry)
              </label>
            </div>

            <div
              className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                file ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/25'
              }`}
            >
              <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium mb-1">
                {file ? file.name : 'Drop inventory Excel here or choose a file'}
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Expected columns: SKU, Barcode, Name, Category, Sub-Category, UOM, Pack Size, Qty, Prices, Tax, Warehouse, Bin, Supplier, Status, Remarks…
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="mx-auto block text-sm"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                  setResult(null);
                }}
              />
              {file && (
                <button
                  type="button"
                  className="mt-3 text-xs text-muted-foreground underline inline-flex items-center gap-1"
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    setResult(null);
                  }}
                >
                  <X size={12} /> Clear file
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!file || previewing}
                onClick={onPreview}
                className="btn btn-outline inline-flex items-center gap-2"
              >
                {previewing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                Preview
              </button>
              <button
                type="button"
                disabled={!file || !organizationId || importing}
                onClick={onImport}
                className="btn btn-primary inline-flex items-center gap-2"
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Import into system
              </button>
            </div>
          </div>

          {preview && (
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h2 className="font-semibold">Preview</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3 flex items-center gap-3">
                  <Package2 className="text-primary" size={20} />
                  <div>
                    <div className="text-lg font-semibold">{preview.rowCount}</div>
                    <div className="text-xs text-muted-foreground">Product rows</div>
                  </div>
                </div>
                <div className="rounded-lg border p-3 flex items-center gap-3">
                  <Warehouse className="text-primary" size={20} />
                  <div>
                    <div className="text-lg font-semibold">{preview.warehouses.length}</div>
                    <div className="text-xs text-muted-foreground">Warehouses</div>
                  </div>
                </div>
                <div className="rounded-lg border p-3 flex items-center gap-3">
                  <Users className="text-primary" size={20} />
                  <div>
                    <div className="text-lg font-semibold">{preview.suppliers.length}</div>
                    <div className="text-xs text-muted-foreground">Suppliers</div>
                  </div>
                </div>
              </div>

              {preview.warnings?.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <div className="font-medium flex items-center gap-1 mb-1">
                    <AlertTriangle size={14} /> Warnings
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {preview.warnings.slice(0, 10).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="overflow-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left">SKU</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-left">Warehouse</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 font-mono">{String(row.sku ?? '')}</td>
                        <td className="px-3 py-2 max-w-[220px] truncate">{String(row.name ?? '')}</td>
                        <td className="px-3 py-2">{String(row.category ?? '-')}</td>
                        <td className="px-3 py-2 max-w-[160px] truncate">{String(row.warehouseName ?? '-')}</td>
                        <td className="px-3 py-2 text-right">{String(row.openingQuantity ?? '-')}</td>
                        <td className="px-3 py-2 text-right">{String(row.costPrice ?? '-')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <CheckCircle2 className="text-green-600" size={18} /> Import result
              </h2>
              <div className="grid gap-2 sm:grid-cols-3 text-sm">
                <div>Products created: <strong>{result.productsCreated}</strong></div>
                <div>Products updated: <strong>{result.productsUpdated}</strong></div>
                <div>Products skipped: <strong>{result.productsSkipped}</strong></div>
                <div>Variants created: <strong>{result.variantsCreated}</strong></div>
                <div>Barcodes created: <strong>{result.barcodesCreated}</strong></div>
                <div>Stock created: <strong>{result.stockItemsCreated}</strong></div>
                <div>Stock updated: <strong>{result.stockItemsUpdated}</strong></div>
                <div>Warehouses created: <strong>{result.warehousesCreated}</strong></div>
                <div>Suppliers created: <strong>{result.suppliersCreated}</strong></div>
                <div>Bins created: <strong>{result.binsCreated}</strong></div>
                <div>Tax codes created: <strong>{result.taxCodesCreated}</strong></div>
                <div>Errors: <strong>{result.errors.length}</strong></div>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 max-h-40 overflow-auto">
                  {result.errors.slice(0, 30).map((e, i) => (
                    <div key={i}>Row {e.rowNumber} · {e.sku}: {e.message}</div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="btn btn-outline text-sm"
                onClick={() => router.push('/catalog/items')}
              >
                Open Catalog Items
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
