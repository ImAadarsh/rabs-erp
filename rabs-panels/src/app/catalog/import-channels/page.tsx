'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import {
  listImportSources,
  previewProductImport,
  executeProductImport,
  previewProductImportApi,
  executeProductImportApi,
  listProductImportJobs,
  listOrganizations,
  getOrganization,
  listBusinessUnits,
  listWarehouses,
  listPriceLists,
  listChannelConnections,
  createWooCommerceConnection,
  testChannelConnection,
  deleteChannelConnection,
  type ProductImportOptions,
  type ShopifyApiCredentials,
  type WooCommerceApiCredentials
} from '@/lib/api';
import { toast } from 'sonner';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  Loader2,
  Package2,
  Layers,
  ImageIcon,
  RefreshCw,
  AlertTriangle,
  X,
  Plug,
  Store,
  Plus,
  Trash2,
  Zap
} from 'lucide-react';

type ImportSource = {
  id: string;
  label: string;
  available: boolean;
  format?: 'csv' | 'api';
  hint?: string;
};

const DEFAULT_SOURCES: ImportSource[] = [
  { id: 'shopify_csv', label: 'Shopify (CSV export)', available: true, format: 'csv' },
  { id: 'woocommerce_csv', label: 'WooCommerce (CSV)', available: true, format: 'csv' },
  { id: 'wordpress_csv', label: 'WordPress (CSV)', available: true, format: 'csv' },
  { id: 'shopify_api', label: 'Shopify (API)', available: true, format: 'api' },
  { id: 'woocommerce_api', label: 'WooCommerce (API)', available: true, format: 'api' },
  { id: 'wordpress_api', label: 'WordPress (API)', available: true, format: 'api', hint: 'WordPress Application Password or WooCommerce consumer key/secret — use WordPress Channels page for full management' }
];

type PreviewData = {
  productCount: number;
  variantCount: number;
  mediaCount: number;
  sampleProducts: Array<{
    handle: string;
    sku: string;
    name: string;
    brand?: string;
    variants: Array<{ variantSku: string; price?: number; inventoryQty?: number }>;
  }>;
};

type ImportSummary = {
  productsCreated?: number;
  productsUpdated?: number;
  productsSkipped?: number;
  variantsCreated?: number;
  variantsUpdated?: number;
  variantsSkipped?: number;
  stockItemsCreated?: number;
  mediaCreated?: number;
  channelMappingsCreated?: number;
  priceListItemsCreated?: number;
  errors?: Array<{ handle: string; message: string }>;
  productCount?: number;
};

function StatPill({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-4 text-center ${accent ? 'bg-brand/15 border border-brand/30' : 'bg-black/30 border border-white/5'}`}>
      <div className={`text-2xl font-bold tabular-nums ${accent ? 'text-brand' : 'text-white'}`}>{value}</div>
      <div className="text-xs text-white/50 mt-1">{label}</div>
    </div>
  );
}

export default function ImportChannelsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN']);
  const [loading, setLoading] = useState(true);
  const [apiReady, setApiReady] = useState(true);
  const [sources, setSources] = useState(DEFAULT_SOURCES);
  const [sourceType, setSourceType] = useState('shopify_csv');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [jobs, setJobs] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [lastResult, setLastResult] = useState<ImportSummary | null>(null);
  const [detectedSource, setDetectedSource] = useState<string | null>(null);
  const [shopifyCreds, setShopifyCreds] = useState<ShopifyApiCredentials>({
    shopDomain: '',
    accessToken: ''
  });
  const [wooCreds, setWooCreds] = useState<WooCommerceApiCredentials>({
    storeUrl: '',
    consumerKey: '',
    consumerSecret: ''
  });
  const [connections, setConnections] = useState<any[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [showAddStore, setShowAddStore] = useState(false);
  const [newStore, setNewStore] = useState({
    name: '',
    storeUrl: '',
    consumerKey: '',
    consumerSecret: ''
  });
  const [testingConnId, setTestingConnId] = useState<string | null>(null);

  const selectedSource = sources.find((s) => s.id === sourceType) ?? DEFAULT_SOURCES[0];
  const wooConnections = connections.filter((c) => c.channel === 'woocommerce' && c.status === 'active');
  const isApiMode = selectedSource.format === 'api';

  const [options, setOptions] = useState<ProductImportOptions>({
    organizationId: '',
    businessUnitId: '',
    warehouseId: '',
    priceListId: '',
    duplicateMode: 'skip',
    importProducts: true,
    importVariants: true,
    importInventory: true,
    importPrices: false,
    importMedia: true,
    importChannelMappings: true
  });

  const loadOrgDependents = useCallback(async (orgId: string) => {
    if (!orgId) {
      setBusinessUnits([]);
      setPriceLists([]);
      return;
    }
    const [buRes, plRes] = await Promise.allSettled([
      listBusinessUnits(orgId),
      listPriceLists({ organizationId: orgId })
    ]);
    if (buRes.status === 'fulfilled') setBusinessUnits(buRes.value.data || []);
    if (plRes.status === 'fulfilled') setPriceLists(plRes.value.data || []);
  }, []);

  const loadPageData = useCallback(async () => {
    if (!session?.accessToken) return;
    setLoading(true);
    const orgId = session.user?.organizationId || '';
    const errors: string[] = [];

    const sourcesRes = await listImportSources().catch((e) => {
      if (e?.response?.status === 404) setApiReady(false);
      errors.push('import API');
      return null;
    });
    if (sourcesRes?.data?.length) {
      setSources(sourcesRes.data);
      setApiReady(true);
    } else {
      setSources(DEFAULT_SOURCES);
    }

    const orgsRes = await listOrganizations().catch(() => null);
    if (orgsRes?.data?.length) {
      setOrganizations(orgsRes.data);
    } else if (orgId) {
      try {
        const single = await getOrganization(orgId);
        if (single?.data) setOrganizations([single.data]);
      } catch {
        errors.push('organization');
      }
    }

    const whRes = await listWarehouses({ limit: 200 }).catch(() => null);
    if (whRes?.data) setWarehouses(whRes.data);

    if (orgId) {
      setOptions((o) => ({ ...o, organizationId: orgId }));
      await loadOrgDependents(orgId);
    }

    const jobsRes = await listProductImportJobs({ organizationId: orgId, limit: 10 }).catch(() => null);
    if (jobsRes?.data) setJobs(jobsRes.data);

    const connRes = await listChannelConnections({
      organizationId: orgId,
      channel: 'woocommerce'
    }).catch(() => null);
    if (connRes?.data) setConnections(connRes.data);

    setLoading(false);
    if (errors.length && !sourcesRes) {
      toast.error(
        'Import API not available. Restart the backend after building: cd rabs-api && npm run build && npm run dev',
        { duration: 8000 }
      );
    }
  }, [session, loadOrgDependents]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    loadPageData();
  }, [hydrated, hasAccess, session, router, loadPageData]);

  useEffect(() => {
    if (options.organizationId) loadOrgDependents(options.organizationId);
  }, [options.organizationId, loadOrgDependents]);

  function onFileSelect(f: File | null) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a .csv file');
      return;
    }
    setFile(f);
    setPreview(null);
    setLastResult(null);
  }

  function applyPreview(data: {
    productCount: number;
    variantCount: number;
    mediaCount: number;
    sampleProducts: PreviewData['sampleProducts'];
    detectedSourceType?: string | null;
  }) {
    setPreview({
      productCount: data.productCount,
      variantCount: data.variantCount,
      mediaCount: data.mediaCount,
      sampleProducts: data.sampleProducts || []
    });
    setDetectedSource(data.detectedSourceType ?? null);
  }

  function validateImportOptions(): boolean {
    if (!options.organizationId) {
      toast.error('Select an organization');
      return false;
    }
    if (options.importInventory && !options.warehouseId) {
      toast.error('Select a warehouse to import inventory');
      return false;
    }
    if (options.importPrices && !options.priceListId) {
      toast.error('Select a price list to import prices');
      return false;
    }
    return true;
  }

  function buildPayload(): ProductImportOptions {
    return {
      ...options,
      businessUnitId: options.businessUnitId || undefined,
      warehouseId: options.warehouseId || undefined,
      priceListId: options.priceListId || undefined
    };
  }

  async function handlePreview() {
    if (!apiReady) {
      toast.error('Restart the API server to enable import');
      return;
    }
    if (isApiMode) {
      if (!options.organizationId) {
        toast.error('Select an organization first');
        return;
      }
      if (sourceType === 'woocommerce_api' && selectedConnectionId) {
        /* saved connection */
      } else if (sourceType === 'shopify_api' && (!shopifyCreds.shopDomain || !shopifyCreds.accessToken)) {
        toast.error('Select a saved store or enter Shopify credentials');
        return;
      } else if (
        sourceType === 'woocommerce_api' &&
        (!wooCreds.storeUrl || !wooCreds.consumerKey || !wooCreds.consumerSecret)
      ) {
        toast.error('Select a saved WooCommerce store or enter API keys');
        return;
      }
    } else if (!file) {
      toast.error('Select a CSV file first');
      return;
    }

    setPreviewing(true);
    setPreview(null);
    setDetectedSource(null);
    try {
      let count = 0;
      if (isApiMode) {
        const res = await previewProductImportApi({
          sourceType: sourceType as 'shopify_api' | 'woocommerce_api' | 'wordpress_api',
          organizationId: options.organizationId,
          connectionId: sourceType === 'woocommerce_api' && selectedConnectionId ? selectedConnectionId : undefined,
          credentials:
            sourceType === 'woocommerce_api' && selectedConnectionId
              ? undefined
              : sourceType === 'shopify_api'
                ? shopifyCreds
                : wooCreds
        });
        applyPreview(res.data);
        count = res.data.productCount;
      } else {
        const res = await previewProductImport(file!, sourceType);
        applyPreview(res.data);
        count = res.data.productCount;
        if (res.data.detectedSourceType) {
          toast.message(
            `This file looks like ${res.data.detectedSourceType.replace(/_/g, ' ')} — consider switching source type`
          );
        }
      }
      toast.success(`Ready: ${count} products`);
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || 'Preview failed';
      if (e?.response?.status === 404) {
        setApiReady(false);
        toast.error('Import routes missing — rebuild and restart rabs-api');
      } else {
        toast.error(msg);
      }
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImport() {
    if (!apiReady) {
      toast.error('Restart the API server to enable import');
      return;
    }
    if (!preview) {
      toast.error('Preview products before importing');
      return;
    }
    if (!isApiMode && !file) {
      toast.error('Select a CSV file first');
      return;
    }
    if (!validateImportOptions()) return;

    setImporting(true);
    setLastResult(null);
    setImportProgress(
      isApiMode
        ? 'Fetching from store and importing…'
        : 'Processing CSV… this may take several minutes for large catalogs.'
    );
    try {
      const payload = buildPayload();
      const res = isApiMode
        ? await executeProductImportApi({
            sourceType: sourceType as 'shopify_api' | 'woocommerce_api' | 'wordpress_api',
            organizationId: options.organizationId,
            connectionId:
              sourceType === 'woocommerce_api' && selectedConnectionId ? selectedConnectionId : undefined,
            credentials:
              sourceType === 'woocommerce_api' && selectedConnectionId
                ? undefined
                : sourceType === 'shopify_api'
                  ? shopifyCreds
                  : wooCreds,
            options: payload
          })
        : await executeProductImport(file!, sourceType, payload);
      setLastResult(res.data.summary as ImportSummary);
      toast.success('Import completed successfully');
      const jobsRes = await listProductImportJobs({
        organizationId: options.organizationId,
        limit: 10
      }).catch(() => null);
      if (jobsRes?.data) setJobs(jobsRes.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Import failed');
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  }

  const canImport =
    apiReady &&
    !!preview &&
    !!options.organizationId &&
    (!options.importInventory || !!options.warehouseId) &&
    (!options.importPrices || !!options.priceListId) &&
    (isApiMode || !!file) &&
    (!isApiMode ||
      sourceType !== 'woocommerce_api' ||
      selectedConnectionId ||
      (wooCreds.storeUrl && wooCreds.consumerKey && wooCreds.consumerSecret));

  async function handleAddStore(e: React.FormEvent) {
    e.preventDefault();
    if (!options.organizationId) {
      toast.error('Select an organization first');
      return;
    }
    try {
      const res = await createWooCommerceConnection({
        organizationId: options.organizationId,
        name: newStore.name,
        storeUrl: newStore.storeUrl,
        consumerKey: newStore.consumerKey,
        consumerSecret: newStore.consumerSecret
      });
      setConnections((prev) => [...prev, res.data]);
      setSelectedConnectionId(res.data.id);
      setSourceType('woocommerce_api');
      setShowAddStore(false);
      setNewStore({ name: '', storeUrl: '', consumerKey: '', consumerSecret: '' });
      toast.success(`Store "${res.data.name}" saved`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to save store');
    }
  }

  async function handleTestConnection(id: string) {
    setTestingConnId(id);
    try {
      const res = await testChannelConnection(id);
      toast.success(res.data.message);
      setConnections((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                lastTestOk: true,
                lastTestMessage: res.data.message,
                lastTestedAt: new Date().toISOString()
              }
            : c
        )
      );
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Connection test failed');
    } finally {
      setTestingConnId(null);
    }
  }

  if (!hydrated || !hasAccess) return null;

  if (loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Catalog · Import Channels" />
          <main className="flex-1 flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Catalog · Import Channels" />
        <main className="flex-1 overflow-auto p-4 md:p-6 max-w-4xl">
          <p className="text-muted-foreground text-sm mb-6">
            Import products from Shopify, WooCommerce, or WordPress into catalog items, variants, inventory, prices, and channel mappings — via CSV export or live store API.
          </p>

          {!apiReady && (
            <div className="mb-6 flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Backend needs a restart</p>
                <p className="mt-1 text-amber-200/80">
                  The import API is not loaded. From the project folder run:{' '}
                  <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">
                    cd rabs-api && npm run build && npm run dev
                  </code>
                </p>
                <button
                  type="button"
                  onClick={() => loadPageData()}
                  className="mt-3 inline-flex items-center gap-1.5 text-brand hover:underline"
                >
                  <RefreshCw size={14} /> Retry connection
                </button>
              </div>
            </div>
          )}

          {/* Saved WooCommerce stores */}
          <section className="mb-6 rounded-2xl border border-border bg-card/50 p-5 md:p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Store className="h-5 w-5 text-brand" />
                <h2 className="text-lg font-semibold">WooCommerce stores</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddStore(!showAddStore)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                <Plus size={14} /> Add store
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Save REST API keys once, then import from any store without re-entering secrets.
            </p>

            {showAddStore && (
              <form onSubmit={handleAddStore} className="grid gap-3 sm:grid-cols-2 rounded-lg border border-border p-4 bg-background/40">
                <label className="block text-sm font-medium sm:col-span-2">
                  Store name
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="e.g. DeltaPuff"
                    value={newStore.name}
                    onChange={(e) => setNewStore({ ...newStore, name: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium sm:col-span-2">
                  Store URL
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="https://yourstore.com"
                    value={newStore.storeUrl}
                    onChange={(e) => setNewStore({ ...newStore, storeUrl: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Consumer key
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-xs"
                    value={newStore.consumerKey}
                    onChange={(e) => setNewStore({ ...newStore, consumerKey: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Consumer secret
                  <input
                    required
                    type="password"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-xs"
                    value={newStore.consumerSecret}
                    onChange={(e) => setNewStore({ ...newStore, consumerSecret: e.target.value })}
                  />
                </label>
                <div className="sm:col-span-2 flex gap-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-black"
                  >
                    Save connection
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddStore(false)}
                    className="rounded-lg border border-border px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {connections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stores saved yet. Add your WooCommerce REST API keys above.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {connections.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm bg-background/30">
                    <div>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground"> · {c.storeUrl}</span>
                      {c.keyHint && (
                        <span className="block text-xs text-muted-foreground font-mono">{c.keyHint}</span>
                      )}
                      {c.lastTestMessage && (
                        <span className={`block text-xs ${c.lastTestOk ? 'text-green-600' : 'text-red-500'}`}>
                          {c.lastTestMessage}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleTestConnection(c.id)}
                        disabled={testingConnId === c.id}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        {testingConnId === c.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Zap size={12} />
                        )}
                        Test
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Delete connection "${c.name}"?`)) return;
                          await deleteChannelConnection(c.id);
                          setConnections((prev) => prev.filter((x) => x.id !== c.id));
                          if (selectedConnectionId === c.id) setSelectedConnectionId('');
                          toast.success('Store removed');
                        }}
                        className="p-1 text-red-500 hover:bg-red-500/10 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Step 1 */}
          <section className="mb-6 rounded-2xl border border-border bg-card/50 p-5 md:p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/20 text-sm font-bold text-brand">1</span>
              <h2 className="text-lg font-semibold">Import source</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Channel / format
                <select
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                  value={sourceType}
                  onChange={(e) => {
                    setSourceType(e.target.value);
                    setPreview(null);
                    setDetectedSource(null);
                  }}
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id} disabled={!s.available}>
                      {s.label}{!s.available ? ' — coming soon' : ''}
                    </option>
                  ))}
                </select>
                {selectedSource.hint && (
                  <p className="mt-1.5 text-xs text-muted-foreground">{selectedSource.hint}</p>
                )}
              </label>

              {isApiMode ? (
                <div className="text-sm font-medium space-y-3">
                  <div className="flex items-center gap-2 text-brand">
                    <Plug size={16} />
                    Store API credentials
                  </div>
                  {sourceType === 'woocommerce_api' && wooConnections.length > 0 && (
                    <label className="block">
                      Saved WooCommerce store
                      <select
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        value={selectedConnectionId}
                        onChange={(e) => {
                          setSelectedConnectionId(e.target.value);
                          setPreview(null);
                        }}
                      >
                        <option value="">Enter keys manually…</option>
                        {wooConnections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} — {c.storeUrl}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {sourceType === 'shopify_api' ? (
                    <>
                      <label className="block">
                        Shop domain
                        <input
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          placeholder="your-store.myshopify.com"
                          value={shopifyCreds.shopDomain}
                          onChange={(e) =>
                            setShopifyCreds({ ...shopifyCreds, shopDomain: e.target.value })
                          }
                        />
                      </label>
                      <label className="block">
                        Admin API access token
                        <input
                          type="password"
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          placeholder="shpat_…"
                          value={shopifyCreds.accessToken}
                          onChange={(e) =>
                            setShopifyCreds({ ...shopifyCreds, accessToken: e.target.value })
                          }
                        />
                      </label>
                    </>
                  ) : !selectedConnectionId ? (
                    <>
                      <label className="block">
                        Store URL
                        <input
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          placeholder="https://yourstore.com"
                          value={wooCreds.storeUrl}
                          onChange={(e) => setWooCreds({ ...wooCreds, storeUrl: e.target.value })}
                        />
                      </label>
                      <label className="block">
                        Consumer key
                        <input
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-xs"
                          value={wooCreds.consumerKey}
                          onChange={(e) =>
                            setWooCreds({ ...wooCreds, consumerKey: e.target.value })
                          }
                        />
                      </label>
                      <label className="block">
                        Consumer secret
                        <input
                          type="password"
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-xs"
                          value={wooCreds.consumerSecret}
                          onChange={(e) =>
                            setWooCreds({ ...wooCreds, consumerSecret: e.target.value })
                          }
                        />
                      </label>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground rounded-lg bg-muted/40 px-3 py-2">
                      Using saved store:{' '}
                      <strong>{wooConnections.find((c) => c.id === selectedConnectionId)?.name}</strong>
                    </p>
                  )}
                </div>
              ) : (
              <div className="text-sm font-medium">
                CSV file
                <div
                  className={`mt-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
                    dragOver ? 'border-brand bg-brand/5' : 'border-border bg-background/50'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    onFileSelect(e.dataTransfer.files[0] ?? null);
                  }}
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-brand" />
                      <span className="truncate max-w-[200px]">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setFile(null);
                          setPreview(null);
                        }}
                        className="p-1 rounded hover:bg-muted"
                        aria-label="Remove file"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-muted-foreground text-xs">Drag & drop or</p>
                      <label className="mt-2 inline-block cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-medium text-black hover:bg-brand-400">
                        Choose file
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>
              )}
            </div>
            {detectedSource && detectedSource !== sourceType && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Detected format: <strong>{detectedSource.replace(/_/g, ' ')}</strong> — switch source if preview looks wrong.
              </p>
            )}
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewing || !apiReady || (!isApiMode && !file)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {previewing ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              Preview file
            </button>
          </section>

          {/* Step 2 */}
          <section className="mb-6 rounded-2xl border border-border bg-card/50 p-5 md:p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/20 text-sm font-bold text-brand">2</span>
              <h2 className="text-lg font-semibold">Import settings</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Organization <span className="text-red-400">*</span>
                <select
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                  value={options.organizationId}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      organizationId: e.target.value,
                      businessUnitId: '',
                      priceListId: ''
                    })
                  }
                >
                  <option value="">Select organization…</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Business unit
                <select
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                  value={options.businessUnitId}
                  onChange={(e) => setOptions({ ...options, businessUnitId: e.target.value })}
                >
                  <option value="">None</option>
                  {businessUnits.map((bu) => (
                    <option key={bu.id} value={bu.id}>{bu.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Warehouse {options.importInventory && <span className="text-red-400">*</span>}
                <select
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                  value={options.warehouseId}
                  onChange={(e) => setOptions({ ...options, warehouseId: e.target.value })}
                  disabled={!options.importInventory}
                >
                  <option value="">
                    {options.importInventory ? 'Select warehouse…' : 'Enable inventory import first'}
                  </option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Price list {options.importPrices && <span className="text-red-400">*</span>}
                <select
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                  value={options.priceListId}
                  onChange={(e) => setOptions({ ...options, priceListId: e.target.value })}
                  disabled={!options.importPrices}
                >
                  <option value="">
                    {options.importPrices ? 'Select price list…' : 'Enable price import first'}
                  </option>
                  {priceLists.map((pl) => (
                    <option key={pl.id} value={pl.id}>{pl.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium sm:col-span-2">
                If product already exists
                <select
                  className="mt-1.5 w-full max-w-md rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                  value={options.duplicateMode}
                  onChange={(e) =>
                    setOptions({ ...options, duplicateMode: e.target.value as 'skip' | 'update' })
                  }
                >
                  <option value="skip">Skip duplicates (safe for first import)</option>
                  <option value="update">Update existing records</option>
                </select>
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['importProducts', 'Catalog products', Package2],
                  ['importVariants', 'Variants', Layers],
                  ['importInventory', 'Inventory quantities', Package2],
                  ['importPrices', 'Price list prices', Layers],
                  ['importMedia', 'Product images', ImageIcon],
                  [
                    'importChannelMappings',
                    sourceType.includes('shopify')
                      ? 'Shopify channel links'
                      : sourceType.includes('woo') || sourceType.includes('wordpress')
                        ? 'WooCommerce channel links'
                        : 'Channel links',
                    RefreshCw
                  ]
                ] as const
              ).map(([key, label, Icon]) => (
                <label
                  key={key}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 cursor-pointer hover:border-brand/30"
                >
                  <input
                    type="checkbox"
                    checked={options[key]}
                    onChange={(e) => setOptions({ ...options, [key]: e.target.checked })}
                    className="rounded border-border text-brand focus:ring-brand"
                  />
                  <Icon size={16} className="text-muted-foreground shrink-0" />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </section>

          {preview && (
            <section className="mb-6 rounded-2xl border border-brand/25 bg-brand/5 p-5 md:p-6 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle2 className="text-brand" size={20} />
                Preview
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <StatPill label="Products" value={preview.productCount} accent />
                <StatPill label="Variants" value={preview.variantCount} accent />
                <StatPill label="Images" value={preview.mediaCount} accent />
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">SKU</th>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Brand</th>
                      <th className="px-3 py-2 text-right font-medium">Variants</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sampleProducts.map((p) => (
                      <tr key={p.handle} className="border-t border-border/60">
                        <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate">{p.name}</td>
                        <td className="px-3 py-2">{p.brand || '—'}</td>
                        <td className="px-3 py-2 text-right">{p.variants?.length ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Sample of {preview.sampleProducts.length} — full file has {preview.productCount} products
              </p>
            </section>
          )}

          <section className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <button
              type="button"
              onClick={handleImport}
              disabled={!canImport || importing}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-black hover:bg-brand-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              Run import into ERP
            </button>
            {!preview && (file || isApiMode) && (
              <span className="text-sm text-muted-foreground">
                {isApiMode ? 'Test API connection with Preview' : 'Preview your file before importing'}
              </span>
            )}
            {importProgress && (
              <span className="text-sm text-brand">{importProgress}</span>
            )}
          </section>

          {lastResult && (
            <section className="mb-6 rounded-2xl border border-green-500/30 bg-green-500/5 p-5 md:p-6 space-y-4">
              <h3 className="font-semibold text-green-600 dark:text-green-400">Import complete</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatPill label="Products created" value={lastResult.productsCreated ?? 0} />
                <StatPill label="Variants created" value={lastResult.variantsCreated ?? 0} />
                <StatPill label="Stock lines" value={lastResult.stockItemsCreated ?? 0} />
                <StatPill label="Images" value={lastResult.mediaCreated ?? 0} />
              </div>
              {(lastResult.errors?.length ?? 0) > 0 && (
                <p className="text-sm text-amber-600">
                  {lastResult.errors!.length} row(s) had errors (see API logs for details)
                </p>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-border bg-card/50 p-5 md:p-6">
            <h2 className="text-lg font-semibold mb-4">Recent imports</h2>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No imports yet — your history will appear here.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {jobs.map((j) => (
                  <li key={j.id} className="flex justify-between items-center px-4 py-3 text-sm bg-background/30">
                    <span>
                      <span className="font-medium">{j.fileName || j.sourceType}</span>
                      <span className="text-muted-foreground"> · {j.channel}</span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        j.status === 'completed'
                          ? 'bg-green-500/15 text-green-600'
                          : j.status === 'failed'
                            ? 'bg-red-500/15 text-red-600'
                            : 'bg-amber-500/15 text-amber-600'
                      }`}
                    >
                      {j.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
