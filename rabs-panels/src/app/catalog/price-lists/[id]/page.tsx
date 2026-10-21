'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ArrowLeft, DollarSign, Trash2, Upload } from 'lucide-react';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { PriceListImportModal } from '@/components/catalog/price-list-import-modal';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { useApiAccess } from '@/hooks/use-api-access';
import { deletePriceListItem, getPriceList, listPriceListItems } from '@/lib/api';

type PriceListItem = {
  id: string;
  price: number | string;
  compareAtPrice?: number | string | null;
  costPrice?: number | string | null;
  minQuantity: number;
  maxQuantity?: number | null;
  createdAt: string;
  updatedAt: string;
  variant?: { id: string; variantSku: string; name?: string | null; catalogItem?: { name?: string | null } | null };
};

const money = (v: number | string | null | undefined, currency: string) =>
  v === null || v === undefined || v === '' ? '—' : `${currency} ${Number(v).toFixed(2)}`;

export default function PriceListDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'FINANCE']);
  const { can } = useApiAccess();
  const canImport = can('POST', '/api/catalog/price-lists/:id/import');
  const canDeleteItem = can('DELETE', '/api/catalog/price-list-items/:id');
  const [priceList, setPriceList] = useState<any | null>(null);
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [confirmDel, setConfirmDel] = useState<PriceListItem | null>(null);

  const load = useCallback(async () => {
    if (!params?.id) return;
    try {
      const [listRes, itemsRes] = await Promise.all([
        getPriceList(params.id),
        listPriceListItems({ priceListId: params.id })
      ]);
      setPriceList(listRes.data);
      setItems(itemsRes.data || []);
    } catch {
      toast.error('Failed to load price list');
    } finally {
      setLoading(false);
    }
  }, [params?.id]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deletePriceListItem(confirmDel.id);
      setItems((prev) => prev.filter((i) => i.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Item removed from price list');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Delete failed');
    }
  }

  const currency = priceList?.currency || 'GBP';
  const columns = useMemo<ColumnDef<PriceListItem>[]>(() => [
    {
      id: 'sku',
      header: 'SKU',
      accessorFn: (r) => r.variant?.variantSku ?? '',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.variant?.variantSku ?? '—'}</span>
    },
    {
      id: 'product',
      header: 'Product',
      accessorFn: (r) => r.variant?.name || r.variant?.catalogItem?.name || '',
      cell: ({ row }) => (
        <span className="text-sm">{row.original.variant?.name || row.original.variant?.catalogItem?.name || '—'}</span>
      )
    },
    {
      id: 'price',
      header: 'Price',
      accessorFn: (r) => Number(r.price),
      cell: ({ row }) => <span className="font-medium">{money(row.original.price, currency)}</span>
    },
    {
      id: 'compareAtPrice',
      header: 'Compare at',
      accessorFn: (r) => Number(r.compareAtPrice ?? 0),
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{money(row.original.compareAtPrice, currency)}</span>
    },
    {
      id: 'costPrice',
      header: 'Cost',
      accessorFn: (r) => Number(r.costPrice ?? 0),
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{money(row.original.costPrice, currency)}</span>
    },
    {
      id: 'qty',
      header: 'Min / max qty',
      accessorFn: (r) => r.minQuantity,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.minQuantity}{row.original.maxQuantity ? ` – ${row.original.maxQuantity}` : '+'}</span>
      )
    },
    {
      accessorKey: 'updatedAt',
      header: 'Updated',
      cell: ({ row }) => <span className="text-sm whitespace-nowrap">{new Date(row.original.updatedAt).toLocaleDateString('en-GB')}</span>
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => canDeleteItem && (
        <button
          onClick={() => setConfirmDel(row.original)}
          className="p-1 hover:bg-gray-100 rounded text-red-600"
          title="Remove from price list"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )
    }
  ], [currency, canDeleteItem]);

  if (!hydrated || !hasAccess) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Catalog · Price List" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <Link href="/catalog/price-lists" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft size={16} /> Back to price lists
            </Link>

            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
            ) : !priceList ? (
              <div className="py-12 text-center text-sm text-muted-foreground">This price list no longer exists.</div>
            ) : (
              <>
                <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                      <DollarSign className="h-6 w-6" />
                      {priceList.name}
                      <span className="font-mono text-sm font-normal text-muted-foreground">{priceList.code}</span>
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {priceList.type?.replace(/_/g, ' ')} · {currency} · {priceList.status}
                      {priceList.isDefault ? ' · default' : ''} · {items.length} item{items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  {canImport && (
                  <button
                    onClick={() => setShowImport(true)}
                    className="flex items-center gap-2 self-start px-4 py-2 bg-brand text-white rounded hover:bg-brand-600"
                  >
                    <Upload className="h-4 w-4" />
                    Import items
                  </button>
                  )}
                </div>

                <RichDataTable columns={columns} data={items} searchPlaceholder="Search by SKU or product…" />
              </>
            )}

            {showImport && priceList && (
              <PriceListImportModal
                priceList={priceList}
                onClose={() => setShowImport(false)}
                onImported={() => void load()}
              />
            )}

            {confirmDel && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl border border-border p-6">
                  <h3 className="text-lg font-semibold mb-4">Remove item</h3>
                  <p className="mb-4 text-muted-foreground">
                    Remove {confirmDel.variant?.variantSku ?? 'this item'} from {priceList?.name}?
                  </p>
                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <button onClick={() => setConfirmDel(null)} className="btn btn-outline">Cancel</button>
                    <button onClick={onDelete} className="btn bg-red-600 hover:bg-red-700 text-white">Remove</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
