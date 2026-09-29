'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import {
  createGoodTillConnection,
  listEposConnections,
  testChannelConnection,
  deleteChannelConnection,
  browseGoodTillProducts,
  importGoodTillProducts,
  exportToGoodTill,
  previewGoodTillExport,
  listGoodTillVatRates,
  generateEposBarcodes,
  generateEposProductBarcodes,
  deleteGoodTillProduct,
  deleteGoodTillProducts,
  listOrganizations,
  listWarehouses,
  listPriceLists,
  listBusinessUnits
} from '@/lib/api';
import { toast } from 'sonner';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  RefreshCw,
  ShoppingCart,
  Plus,
  Trash2,
  Zap,
  Loader2,
  Search,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  QrCode,
  Barcode,
  Tag,
  Eye,
  X
} from 'lucide-react';
import { EposLabelDesigner, type LabelProduct } from '@/components/epos-label-designer';
import { BarcodePreview } from '@/components/barcode-preview';

type EposConnection = {
  id: string;
  name: string;
  subdomain: string;
  outletId: string | null;
  defaultVatCodeId: string | null;
  keyHint: string | null;
  status: 'active' | 'inactive';
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
};

type GtProduct = {
  product_id: string;
  product_name: string;
  product_sku: string;
  barcode: string | null;
  selling_price: string;
  inventory: string;
  category: string | null;
  has_variant: number;
};

type ErpItem = { id: string; sku: string; name: string; status: string; category: string };

type ActiveTab = 'connections' | 'browse' | 'import' | 'export';

function Badge({ label, ok }: { label: string; ok: boolean | null }) {
  if (ok === null) return <span className="text-xs text-muted-foreground">{label}</span>;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ok ? 'bg-green-500/15 text-green-600' : 'bg-red-500/15 text-red-500'}`}>
      {label}
    </span>
  );
}

export default function EposChannelsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN']);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('connections');
  const [organizationId, setOrganizationId] = useState('');

  const [connections, setConnections] = useState<EposConnection[]>([]);
  const [selectedConnId, setSelectedConnId] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [savingConn, setSavingConn] = useState(false);
  const [newConn, setNewConn] = useState({
    name: 'RABS EPOS',
    subdomain: '',
    username: '',
    password: '',
    defaultVatCodeId: ''
  });

  const [gtProducts, setGtProducts] = useState<GtProduct[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [browseSearch, setBrowseSearch] = useState('');
  const [browsePage, setBrowsePage] = useState(1);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browseTotalPages, setBrowseTotalPages] = useState(1);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  const [organizations, setOrganizations] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [vatRates, setVatRates] = useState<Array<{ id: string; vat_name: string; vat_rate: string }>>([]);

  const [importOptions, setImportOptions] = useState({
    businessUnitId: '',
    warehouseId: '',
    priceListId: '',
    duplicateMode: 'skip' as 'skip' | 'update',
    importInventory: true,
    importPrices: true,
    importChannelMappings: true
  });
  const [importing, setImporting] = useState(false);

  const [erpItems, setErpItems] = useState<ErpItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [exportOptions, setExportOptions] = useState({
    duplicateMode: 'update' as 'skip' | 'update',
    vatCodeId: '',
    priceListId: '',
    warehouseId: '',
    generateBarcodes: true
  });
  const [exporting, setExporting] = useState(false);
  const [generatingBarcodes, setGeneratingBarcodes] = useState(false);
  const [generatingEposBarcodes, setGeneratingEposBarcodes] = useState(false);
  const [deletingEpos, setDeletingEpos] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<null | {
    mode: 'one' | 'selected' | 'all';
    product?: GtProduct;
  }>(null);
  const [forceRegenerateBarcodes, setForceRegenerateBarcodes] = useState(false);
  const [labelProducts, setLabelProducts] = useState<LabelProduct[] | null>(null);
  const [loadingAllLabels, setLoadingAllLabels] = useState(false);
  const [detailProduct, setDetailProduct] = useState<GtProduct | null>(null);
  const [exportResult, setExportResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    unchanged?: number;
    barcodesGenerated: number;
    errors: Array<{ sku: string; message: string }>;
  } | null>(null);
  const [exportingMode, setExportingMode] = useState<'push' | 'sync' | null>(null);

  const loadConnections = useCallback(async () => {
    const org = organizationId || session?.user?.organizationId;
    const res = await listEposConnections(org ? { organizationId: org } : undefined);
    setConnections(res.data ?? []);
    if (res.data?.length && !selectedConnId) setSelectedConnId(res.data[0].id);
  }, [organizationId, session?.user?.organizationId, selectedConnId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (!hasAccess) return;

    (async () => {
      try {
        const orgRes = await listOrganizations();
        setOrganizations(orgRes.data ?? []);
        const defaultOrg = session.user?.organizationId ?? orgRes.data?.[0]?.id ?? '';
        setOrganizationId(defaultOrg);
        if (defaultOrg) {
          const [wh, pl, bu] = await Promise.all([
            listWarehouses({ limit: 200 }).catch(() => ({ data: [] })),
            listPriceLists({ organizationId: defaultOrg }).catch(() => ({ data: [] })),
            listBusinessUnits(defaultOrg).catch(() => ({ data: [] }))
          ]);
          setWarehouses(wh.data ?? []);
          setPriceLists(pl.data ?? []);
          setBusinessUnits(bu.data ?? []);
        }
      } catch {
        toast.error('Failed to load organization data');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, session, hasAccess, router]);

  useEffect(() => {
    if (!organizationId || !hasAccess) return;
    loadConnections().catch((e: any) => {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to load EPOS connections');
    });
  }, [organizationId, hasAccess, loadConnections]);

  useEffect(() => {
    if (!selectedConnId || !organizationId) return;
    listGoodTillVatRates({ connectionId: selectedConnId, organizationId })
      .then((res) => {
        setVatRates(res.data ?? []);
        const defaultVat = res.data?.find((v) => v.vat_rate === '20.000') ?? res.data?.[0];
        if (defaultVat) {
          setExportOptions((o) => ({ ...o, vatCodeId: o.vatCodeId || defaultVat.id }));
        }
      })
      .catch(() => {});
  }, [selectedConnId, organizationId]);

  const loadBrowse = useCallback(async () => {
    if (!selectedConnId || !organizationId) return;
    setBrowsing(true);
    try {
      const res = await browseGoodTillProducts({
        connectionId: selectedConnId,
        organizationId,
        page: browsePage,
        perPage: 25,
        search: browseSearch || undefined
      });
      setGtProducts(res.data ?? []);
      setBrowseTotal(res.pagination.total);
      setBrowseTotalPages(res.pagination.totalPages);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to browse EPOS products');
    } finally {
      setBrowsing(false);
    }
  }, [selectedConnId, organizationId, browsePage, browseSearch]);

  useEffect(() => {
    if (activeTab === 'browse' && selectedConnId) loadBrowse();
  }, [activeTab, selectedConnId, loadBrowse]);

  const loadExportPreview = useCallback(async () => {
    if (!selectedConnId || !organizationId) return;
    try {
      const res = await previewGoodTillExport({ connectionId: selectedConnId, organizationId });
      setErpItems(res.data.items ?? []);
    } catch {
      toast.error('Failed to load catalog items for export');
    }
  }, [selectedConnId, organizationId]);

  useEffect(() => {
    if (activeTab === 'export' && selectedConnId) loadExportPreview();
  }, [activeTab, selectedConnId, loadExportPreview]);

  async function handleCreateConnection() {
    if (!organizationId) return toast.error('Select an organization');
    if (!newConn.username || !newConn.password) return toast.error('Username and password are required');
    setSavingConn(true);
    try {
      await createGoodTillConnection({
        organizationId,
        name: newConn.name,
        subdomain: newConn.subdomain,
        username: newConn.username,
        password: newConn.password,
        defaultVatCodeId: newConn.defaultVatCodeId || undefined
      });
      toast.success('EPOS connection created');
      setShowAddForm(false);
      setNewConn((c) => ({ ...c, password: '' }));
      await loadConnections();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to create connection');
    } finally {
      setSavingConn(false);
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      const res = await testChannelConnection(id);
      toast.success(res.data.message);
      await loadConnections();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Connection test failed');
      await loadConnections();
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this EPOS connection?')) return;
    try {
      await deleteChannelConnection(id);
      toast.success('Connection deleted');
      if (selectedConnId === id) setSelectedConnId('');
      await loadConnections();
    } catch {
      toast.error('Failed to delete connection');
    }
  }

  async function handleImport(fromBrowse: boolean) {
    if (!selectedConnId || !organizationId) return;
    setImporting(true);
    try {
      const res = await importGoodTillProducts({
        connectionId: selectedConnId,
        organizationId,
        importAll: !fromBrowse,
        productIds: fromBrowse ? Array.from(selectedProductIds) : undefined,
        options: importOptions
      });
      toast.success(`Import completed — job ${res.data.jobId}`);
      setSelectedProductIds(new Set());
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  async function handleExport(mode: 'push' | 'sync') {
    if (!selectedConnId || !organizationId) return;
    if (!exportOptions.vatCodeId) return toast.error('Select a VAT rate for EPOS products');
    setExporting(true);
    setExportingMode(mode);
    setExportResult(null);
    try {
      const res = await exportToGoodTill({
        connectionId: selectedConnId,
        organizationId,
        exportAll: selectedItemIds.size === 0,
        catalogItemIds: selectedItemIds.size ? Array.from(selectedItemIds) : undefined,
        mode,
        duplicateMode: mode === 'sync' ? 'update' : 'skip',
        vatCodeId: exportOptions.vatCodeId,
        priceListId: exportOptions.priceListId || undefined,
        warehouseId: exportOptions.warehouseId || undefined,
        generateBarcodes: exportOptions.generateBarcodes
      });
      setExportResult(res.data);
      if (mode === 'push') {
        toast.success(
          `Push complete: ${res.data.created} created, ${res.data.skipped} already in EPOS`
        );
      } else {
        toast.success(
          `Sync complete: ${res.data.created} added, ${res.data.updated} updated, ${res.data.unchanged ?? 0} unchanged`
        );
      }
      if (res.data.errors?.length) {
        toast.error(`${res.data.errors.length} error(s): ${res.data.errors[0]?.message}`);
      }
      if (activeTab === 'browse') loadBrowse();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Export to EPOS failed');
    } finally {
      setExporting(false);
      setExportingMode(null);
    }
  }

  async function handleGenerateEposBarcodes(fromBrowse: boolean) {
    if (!selectedConnId || !organizationId) return;
    setGeneratingEposBarcodes(true);
    try {
      const res = await generateEposProductBarcodes({
        connectionId: selectedConnId,
        organizationId,
        generateAll: !fromBrowse,
        productIds: fromBrowse ? Array.from(selectedProductIds) : undefined,
        forceRegenerate: forceRegenerateBarcodes
      });
      const { generated, updated, skipped, errors } = res.data;
      if (generated === 0 && updated === 0) {
        toast.info(
          skipped > 0
            ? `All ${skipped} product(s) already have barcodes. Enable "Regenerate" to create new ones.`
            : 'No products to process'
        );
      } else {
        toast.success(`Generated ${generated} barcode(s), updated ${updated} in EPOS`);
      }
      if (errors.length) {
        toast.error(`${errors.length} error(s): ${errors[0]?.message}`);
      }
      await loadBrowse();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'EPOS barcode generation failed');
    } finally {
      setGeneratingEposBarcodes(false);
    }
  }

  async function runDeleteEpos(mode: 'one' | 'selected' | 'all', product?: GtProduct) {
    if (!selectedConnId || !organizationId) return;
    setDeletingEpos(true);
    setConfirmDelete(null);
    try {
      let result: { deleted: number; failed: number; skipped: number; errors: Array<{ productId: string; message: string }> };
      if (mode === 'one' && product) {
        const res = await deleteGoodTillProduct({
          connectionId: selectedConnId,
          organizationId,
          productId: product.product_id
        });
        result = res.data;
      } else if (mode === 'all') {
        const res = await deleteGoodTillProducts({
          connectionId: selectedConnId,
          organizationId,
          deleteAll: true
        });
        result = res.data;
      } else {
        const res = await deleteGoodTillProducts({
          connectionId: selectedConnId,
          organizationId,
          productIds: Array.from(selectedProductIds)
        });
        result = res.data;
      }

      if (result.deleted > 0) {
        toast.success(`Deleted ${result.deleted} EPOS product(s)`);
      } else if (result.failed === 0) {
        toast.info('No matching EPOS products to delete');
      }
      if (result.failed > 0) {
        toast.error(
          `${result.failed} failed${result.errors[0] ? `: ${result.errors[0].message}` : ''}`
        );
      }

      setSelectedProductIds(new Set());
      if (detailProduct && mode === 'one' && product?.product_id === detailProduct.product_id) {
        setDetailProduct(null);
      }
      await loadBrowse();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to delete EPOS product(s)');
    } finally {
      setDeletingEpos(false);
    }
  }

  function toLabelProducts(list: GtProduct[]): LabelProduct[] {
    return list.map((p) => ({
      product_id: p.product_id,
      product_name: p.product_name,
      product_sku: p.product_sku,
      barcode: p.barcode,
      selling_price: p.selling_price
    }));
  }

  function openLabelDesigner(products?: GtProduct[]) {
    const list = products ?? gtProducts.filter((p) => selectedProductIds.has(p.product_id));
    if (!list.length) {
      toast.error('Select at least one EPOS product');
      return;
    }
    setLabelProducts(toLabelProducts(list));
  }

  /** Load every matching EPOS product (not just the current page) into the Brother label panel. */
  async function openLabelDesignerForAll() {
    if (!selectedConnId || !organizationId) return;
    if (!browseTotal) {
      toast.error('No EPOS products to download');
      return;
    }
    setLoadingAllLabels(true);
    try {
      const res = await browseGoodTillProducts({
        connectionId: selectedConnId,
        organizationId,
        page: 1,
        perPage: Math.max(browseTotal, 1),
        search: browseSearch.trim() || undefined
      });
      const list = res.data as GtProduct[];
      if (!list.length) {
        toast.error('No EPOS products to download');
        return;
      }
      setLabelProducts(toLabelProducts(list));
      toast.success(`Loaded ${list.length} product(s) for Brother QL-820 labels`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to load products for labels');
    } finally {
      setLoadingAllLabels(false);
    }
  }

  async function handleGenerateBarcodes() {
    if (!selectedConnId || !organizationId) return;
    setGeneratingBarcodes(true);
    try {
      const res = await generateEposBarcodes({
        connectionId: selectedConnId,
        organizationId,
        exportAll: selectedItemIds.size === 0,
        catalogItemIds: selectedItemIds.size ? Array.from(selectedItemIds) : undefined
      });
      toast.success(
        res.data.generated
          ? `Generated ${res.data.generated} barcode(s) in RABS catalog`
          : `No new barcodes — ${res.data.skipped ?? 0} variant(s) already have barcodes`
      );
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Barcode generation failed');
    } finally {
      setGeneratingBarcodes(false);
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
          <p className="text-muted-foreground">You do not have permission to manage EPOS channels.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {labelProducts && (
        <EposLabelDesigner products={labelProducts} onClose={() => setLabelProducts(null)} />
      )}
      <Sidebar />
      <main className="flex-1 lg:ml-[280px]">
        <Header title="Catalog · EPOS Channels" />
        <div className="p-6 space-y-6 max-w-7xl">
          <div className="flex flex-wrap gap-2 border-b pb-3">
            {([
              { id: 'connections', label: 'Connections', icon: ShoppingCart },
              { id: 'browse', label: 'Browse EPOS', icon: Search },
              { id: 'import', label: 'Import from EPOS', icon: ArrowDownToLine },
              { id: 'export', label: 'Push to EPOS', icon: ArrowUpFromLine }
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === id ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
            <label className="block text-sm font-medium">
              Organization
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
              >
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              EPOS Connection
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={selectedConnId}
                onChange={(e) => setSelectedConnId(e.target.value)}
              >
                <option value="">Select connection…</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.subdomain})</option>
                ))}
              </select>
            </label>
          </div>

          {activeTab === 'connections' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Good Till Connections</h2>
                <button
                  type="button"
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
                >
                  <Plus size={16} /> Add Connection
                </button>
              </div>

              {showAddForm && (
                <div className="rounded-xl border p-4 grid gap-3 sm:grid-cols-2 max-w-2xl bg-card">
                  <label className="text-sm font-medium sm:col-span-2">
                    Connection name
                    <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={newConn.name} onChange={(e) => setNewConn({ ...newConn, name: e.target.value })} />
                  </label>
                  <label className="text-sm font-medium">
                    Subdomain
                    <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" placeholder="yourstore" value={newConn.subdomain} onChange={(e) => setNewConn({ ...newConn, subdomain: e.target.value })} />
                  </label>
                  <label className="text-sm font-medium">
                    Default VAT (optional)
                    <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" placeholder="UUID from EPOS" value={newConn.defaultVatCodeId} onChange={(e) => setNewConn({ ...newConn, defaultVatCodeId: e.target.value })} />
                  </label>
                  <label className="text-sm font-medium sm:col-span-2">
                    Email / Username
                    <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" type="email" value={newConn.username} onChange={(e) => setNewConn({ ...newConn, username: e.target.value })} />
                  </label>
                  <label className="text-sm font-medium sm:col-span-2">
                    Password
                    <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" type="password" value={newConn.password} onChange={(e) => setNewConn({ ...newConn, password: e.target.value })} />
                  </label>
                  <button
                    type="button"
                    disabled={savingConn}
                    onClick={handleCreateConnection}
                    className="sm:col-span-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                  >
                    {savingConn ? 'Saving…' : 'Save Connection'}
                  </button>
                </div>
              )}

              <div className="rounded-xl border divide-y">
                {connections.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No EPOS connections yet. Add your Good Till store credentials above.</p>
                ) : (
                  connections.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.subdomain} · {c.keyHint}</p>
                        <div className="mt-1"><Badge label={c.lastTestOk ? 'Connected' : c.lastTestOk === false ? 'Error' : 'Untested'} ok={c.lastTestOk} /></div>
                        {c.lastTestMessage && <p className="text-xs text-muted-foreground mt-1">{c.lastTestMessage}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handleTest(c.id)} disabled={testingId === c.id} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm">
                          {testingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                          Test
                        </button>
                        <button type="button" onClick={() => handleDelete(c.id)} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600">
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                API docs: <a href="https://apidoc.thegoodtill.com/" target="_blank" rel="noreferrer" className="underline">Good Till API</a>.
                Credentials are encrypted at rest and never returned after save.
              </p>
            </div>
          )}

          {activeTab === 'browse' && (
            <div className="space-y-4">
              {!selectedConnId ? (
                <p className="text-muted-foreground text-sm">Select an EPOS connection first.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      className="rounded-md border px-3 py-2 text-sm flex-1 min-w-[200px]"
                      placeholder="Search by name, SKU, barcode…"
                      value={browseSearch}
                      onChange={(e) => setBrowseSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (setBrowsePage(1), loadBrowse())}
                    />
                    <button type="button" onClick={() => { setBrowsePage(1); loadBrowse(); }} className="rounded-md border px-4 py-2 text-sm">Search</button>
                    <button
                      type="button"
                      disabled={generatingEposBarcodes || !selectedProductIds.size || deletingEpos}
                      onClick={() => handleGenerateEposBarcodes(true)}
                      className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm disabled:opacity-50"
                    >
                      {generatingEposBarcodes ? <Loader2 size={14} className="animate-spin" /> : <Barcode size={14} />}
                      Generate barcode
                    </button>
                    <button
                      type="button"
                      disabled={!selectedProductIds.size || deletingEpos || loadingAllLabels}
                      onClick={() => openLabelDesigner()}
                      className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm disabled:opacity-50"
                    >
                      <Tag size={14} /> Labels (selected)
                    </button>
                    <button
                      type="button"
                      disabled={!browseTotal || deletingEpos || loadingAllLabels}
                      onClick={() => openLabelDesignerForAll()}
                      className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm disabled:opacity-50"
                      title="Download Brother QL-820 29×90 mm labels for all products in one PDF"
                    >
                      {loadingAllLabels ? <Loader2 size={14} className="animate-spin" /> : <Barcode size={14} />}
                      Download all labels
                    </button>
                    <button
                      type="button"
                      disabled={!selectedProductIds.size || importing || deletingEpos}
                      onClick={() => handleImport(true)}
                      className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                    >
                      Import selected ({selectedProductIds.size})
                    </button>
                    <button
                      type="button"
                      disabled={!selectedProductIds.size || deletingEpos}
                      onClick={() => setConfirmDelete({ mode: 'selected' })}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingEpos ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      Delete selected ({selectedProductIds.size})
                    </button>
                    <button
                      type="button"
                      disabled={!browseTotal || deletingEpos}
                      onClick={() => setConfirmDelete({ mode: 'all' })}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-400 bg-red-50 px-4 py-2 text-sm text-red-800 hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      Delete all in EPOS
                    </button>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={forceRegenerateBarcodes}
                      onChange={(e) => setForceRegenerateBarcodes(e.target.checked)}
                    />
                    Regenerate barcodes even if product already has one
                  </label>

                  {browsing ? (
                    <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
                  ) : (
                    <div className="rounded-xl border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="p-3 text-left w-8">
                              <input
                                type="checkbox"
                                title="Select all on this page"
                                checked={
                                  gtProducts.length > 0 &&
                                  gtProducts.every((p) => selectedProductIds.has(p.product_id))
                                }
                                onChange={(e) => {
                                  const next = new Set(selectedProductIds);
                                  if (e.target.checked) {
                                    gtProducts.forEach((p) => next.add(p.product_id));
                                  } else {
                                    gtProducts.forEach((p) => next.delete(p.product_id));
                                  }
                                  setSelectedProductIds(next);
                                }}
                              />
                            </th>
                            <th className="p-3 text-left">Product</th>
                            <th className="p-3 text-left">SKU</th>
                            <th className="p-3 text-left">Barcode</th>
                            <th className="p-3 text-right">Price</th>
                            <th className="p-3 text-right">Stock</th>
                            <th className="p-3 text-right w-36">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gtProducts.map((p) => (
                            <tr key={p.product_id} className="border-t hover:bg-muted/20">
                              <td className="p-3">
                                <input
                                  type="checkbox"
                                  checked={selectedProductIds.has(p.product_id)}
                                  onChange={(e) => {
                                    const next = new Set(selectedProductIds);
                                    if (e.target.checked) next.add(p.product_id);
                                    else next.delete(p.product_id);
                                    setSelectedProductIds(next);
                                  }}
                                />
                              </td>
                              <td className="p-3 font-medium max-w-[200px] truncate" title={p.product_name}>{p.product_name}</td>
                              <td className="p-3 text-muted-foreground max-w-[120px] truncate" title={p.product_sku}>{p.product_sku}</td>
                              <td className="p-3 font-mono text-xs">
                                {p.barcode ? (
                                  <div className="flex flex-col items-start gap-1 max-w-[140px]">
                                    <BarcodePreview value={p.barcode} width={1.2} height={28} showText={false} className="max-w-full h-auto" />
                                    <span className="text-[10px] text-muted-foreground truncate w-full">{p.barcode}</span>
                                  </div>
                                ) : (
                                  <span className="text-amber-600">Missing</span>
                                )}
                              </td>
                              <td className="p-3 text-right">£{p.selling_price}</td>
                              <td className="p-3 text-right">{p.inventory}</td>
                              <td className="p-3 text-right">
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    title="Product details & labels"
                                    onClick={() => setDetailProduct(p)}
                                    className="rounded border p-1.5 hover:bg-muted"
                                  >
                                    <Eye size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Brother QL-820 labels"
                                    onClick={() => openLabelDesigner([p])}
                                    className="rounded border p-1.5 hover:bg-muted"
                                  >
                                    <Tag size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Delete from EPOS"
                                    disabled={deletingEpos}
                                    onClick={() => setConfirmDelete({ mode: 'one', product: p })}
                                    className="rounded border border-red-200 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {!gtProducts.length && (
                            <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No products in EPOS yet — use Push to EPOS to publish your catalog.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{browseTotal} products</span>
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={browsePage <= 1} onClick={() => setBrowsePage((p) => p - 1)} className="rounded border p-1"><ChevronLeft size={16} /></button>
                      <span>Page {browsePage} / {browseTotalPages}</span>
                      <button type="button" disabled={browsePage >= browseTotalPages} onClick={() => setBrowsePage((p) => p + 1)} className="rounded border p-1"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                </>
              )}

              {detailProduct && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
                  <div className="bg-card rounded-xl border shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold">EPOS Product Details</h3>
                      <button type="button" onClick={() => setDetailProduct(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
                    </div>

                    {detailProduct.barcode ? (
                      <div className="rounded-lg border bg-white p-4 flex flex-col items-center gap-2">
                        <p className="text-sm font-medium text-center">{detailProduct.product_name}</p>
                        <BarcodePreview value={detailProduct.barcode} width={2} height={48} showText />
                      </div>
                    ) : (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
                        No barcode yet — generate one below before downloading PDF labels.
                      </div>
                    )}

                    <dl className="text-sm space-y-2 grid grid-cols-2 gap-x-4">
                      <div className="col-span-2"><dt className="text-muted-foreground text-xs">Name</dt><dd className="font-medium">{detailProduct.product_name}</dd></div>
                      <div className="col-span-2"><dt className="text-muted-foreground text-xs">SKU</dt><dd className="font-mono text-xs break-all">{detailProduct.product_sku}</dd></div>
                      <div><dt className="text-muted-foreground text-xs">Barcode</dt><dd className="font-mono text-xs">{detailProduct.barcode ?? '—'}</dd></div>
                      <div><dt className="text-muted-foreground text-xs">Price</dt><dd>£{detailProduct.selling_price}</dd></div>
                      <div><dt className="text-muted-foreground text-xs">Stock</dt><dd>{detailProduct.inventory}</dd></div>
                      {detailProduct.category && <div><dt className="text-muted-foreground text-xs">Category</dt><dd>{detailProduct.category}</dd></div>}
                    </dl>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        disabled={generatingEposBarcodes}
                        onClick={async () => {
                          if (!selectedConnId || !organizationId) return;
                          setGeneratingEposBarcodes(true);
                          try {
                            const res = await generateEposProductBarcodes({
                              connectionId: selectedConnId,
                              organizationId,
                              productIds: [detailProduct.product_id],
                              forceRegenerate: forceRegenerateBarcodes
                            });
                            toast.success(`Barcode: ${res.data.products[0]?.barcode ?? 'updated'}`);
                            await loadBrowse();
                            setDetailProduct(null);
                          } catch (e: any) {
                            toast.error(e?.response?.data?.error?.message ?? 'Failed');
                          } finally {
                            setGeneratingEposBarcodes(false);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm"
                      >
                        <Barcode size={14} /> Generate barcode
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          openLabelDesigner([detailProduct]);
                          setDetailProduct(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                      >
                        <Tag size={14} /> Brother QL-820 labels
                      </button>
                      <button
                        type="button"
                        disabled={deletingEpos}
                        onClick={() => setConfirmDelete({ mode: 'one', product: detailProduct })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 size={14} /> Delete from EPOS
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {confirmDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
                  <div className="bg-card rounded-xl border shadow-xl max-w-md w-full p-5 space-y-4">
                    <h3 className="font-semibold text-lg">
                      {confirmDelete.mode === 'all'
                        ? 'Delete all EPOS products?'
                        : confirmDelete.mode === 'selected'
                          ? `Delete ${selectedProductIds.size} selected product(s)?`
                          : 'Delete this EPOS product?'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {confirmDelete.mode === 'all' ? (
                        <>
                          This will permanently remove <strong>every product</strong> from Good Till / SumUp POS
                          for this outlet (not just the current search page). This cannot be undone from RABS.
                        </>
                      ) : confirmDelete.mode === 'one' && confirmDelete.product ? (
                        <>
                          Remove <strong>{confirmDelete.product.product_name}</strong>
                          {confirmDelete.product.product_sku ? (
                            <> (<span className="font-mono text-xs">{confirmDelete.product.product_sku}</span>)</>
                          ) : null}{' '}
                          from EPOS. Variants of this product (if any) will also be deleted.
                        </>
                      ) : (
                        <>
                          Selected products will be deleted from Good Till / SumUp POS. Variants are included when present.
                        </>
                      )}
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        disabled={deletingEpos}
                        onClick={() => setConfirmDelete(null)}
                        className="rounded-lg border px-4 py-2 text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={deletingEpos}
                        onClick={() => runDeleteEpos(confirmDelete.mode, confirmDelete.product)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {deletingEpos ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        {confirmDelete.mode === 'all' ? 'Delete all' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'import' && (
            <div className="space-y-4 max-w-xl">
              <h2 className="text-lg font-semibold">Import from Good Till → RABS</h2>
              <p className="text-sm text-muted-foreground">Pull EPOS products into your RABS catalog with barcodes and channel mappings.</p>
              <label className="block text-sm font-medium">
                Warehouse (stock)
                <select className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={importOptions.warehouseId} onChange={(e) => setImportOptions({ ...importOptions, warehouseId: e.target.value })}>
                  <option value="">None</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Price list
                <select className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={importOptions.priceListId} onChange={(e) => setImportOptions({ ...importOptions, priceListId: e.target.value })}>
                  <option value="">None</option>
                  {priceLists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Duplicate handling
                <select className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={importOptions.duplicateMode} onChange={(e) => setImportOptions({ ...importOptions, duplicateMode: e.target.value as 'skip' | 'update' })}>
                  <option value="skip">Skip existing SKUs</option>
                  <option value="update">Update existing SKUs</option>
                </select>
              </label>
              <button
                type="button"
                disabled={!selectedConnId || importing}
                onClick={() => handleImport(false)}
                className="rounded-lg bg-primary px-6 py-2.5 text-sm text-primary-foreground disabled:opacity-50"
              >
                {importing ? 'Importing…' : 'Import all EPOS products'}
              </button>
            </div>
          )}

          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Push &amp; sync RABS → Good Till EPOS</h2>
                  <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                    <strong>Push all</strong> creates catalog products that are missing in EPOS.
                    <strong> Sync</strong> also updates name, description, price and stock quantity when ERP data changes, and adds any new products.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={generatingBarcodes || !selectedConnId || exporting}
                    onClick={handleGenerateBarcodes}
                    className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {generatingBarcodes ? <Loader2 size={14} className="animate-spin" /> : <Barcode size={14} />}
                    Generate barcodes
                  </button>
                  <button
                    type="button"
                    disabled={exporting || !selectedConnId}
                    onClick={() => handleExport('push')}
                    className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {exportingMode === 'push' ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpFromLine size={14} />}
                    {selectedItemIds.size
                      ? `Push selected (${selectedItemIds.size})`
                      : 'Push all to EPOS'}
                  </button>
                  <button
                    type="button"
                    disabled={exporting || !selectedConnId}
                    onClick={() => handleExport('sync')}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                  >
                    {exportingMode === 'sync' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {selectedItemIds.size
                      ? `Sync selected (${selectedItemIds.size})`
                      : 'Sync ERP → EPOS'}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
                <label className="text-sm font-medium">
                  VAT rate *
                  <select className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={exportOptions.vatCodeId} onChange={(e) => setExportOptions({ ...exportOptions, vatCodeId: e.target.value })}>
                    <option value="">Select…</option>
                    {vatRates.map((v) => <option key={v.id} value={v.id}>{v.vat_name} ({v.vat_rate}%)</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Price list
                  <select className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={exportOptions.priceListId} onChange={(e) => setExportOptions({ ...exportOptions, priceListId: e.target.value })}>
                    <option value="">Product selling price</option>
                    {priceLists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Warehouse (stock qty)
                  <select className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={exportOptions.warehouseId} onChange={(e) => setExportOptions({ ...exportOptions, warehouseId: e.target.value })}>
                    <option value="">All warehouses (sum)</option>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </label>
              </div>

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={exportOptions.generateBarcodes}
                  onChange={(e) => setExportOptions({ ...exportOptions, generateBarcodes: e.target.checked })}
                />
                Auto-generate EAN barcodes when missing (for EPOS labels &amp; scanning)
              </label>

              {exportResult && (
                <div className="rounded-xl border p-4 bg-muted/30 text-sm space-y-1">
                  <p>
                    <strong>{exportResult.created}</strong> created ·{' '}
                    <strong>{exportResult.updated}</strong> updated ·{' '}
                    <strong>{exportResult.unchanged ?? 0}</strong> unchanged ·{' '}
                    <strong>{exportResult.skipped}</strong> skipped
                  </p>
                  <p className="inline-flex items-center gap-1"><QrCode size={14} /> <strong>{exportResult.barcodesGenerated}</strong> barcodes generated</p>
                  {exportResult.errors.length > 0 && (
                    <ul className="text-red-600 mt-2 list-disc pl-5">
                      {exportResult.errors.slice(0, 5).map((e) => <li key={e.sku}>{e.sku}: {e.message}</li>)}
                    </ul>
                  )}
                </div>
              )}

              <div className="rounded-xl border overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-3 w-8">
                        <input
                          type="checkbox"
                          title="Select all"
                          checked={erpItems.length > 0 && erpItems.every((i) => selectedItemIds.has(i.id))}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedItemIds(new Set(erpItems.map((i) => i.id)));
                            else setSelectedItemIds(new Set());
                          }}
                        />
                      </th>
                      <th className="p-3 text-left">Name</th>
                      <th className="p-3 text-left">SKU</th>
                      <th className="p-3 text-left">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {erpItems.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedItemIds.has(item.id)}
                            onChange={(e) => {
                              const next = new Set(selectedItemIds);
                              if (e.target.checked) next.add(item.id);
                              else next.delete(item.id);
                              setSelectedItemIds(next);
                            }}
                          />
                        </td>
                        <td className="p-3">{item.name}</td>
                        <td className="p-3 text-muted-foreground">{item.sku}</td>
                        <td className="p-3 text-muted-foreground">{item.category ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!erpItems.length && <p className="p-6 text-center text-muted-foreground">No catalog items in this organization.</p>}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave none selected to run against the full active catalog. Sync compares name, description, selling price, stock qty and barcode — unchanged products are skipped.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
