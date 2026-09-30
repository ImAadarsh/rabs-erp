'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listB2bProducts, publishB2bProducts, unpublishB2bProducts, getB2bSettings } from '@/lib/api';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { Package2 } from 'lucide-react';

export default function B2bProductsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [publishMode, setPublishMode] = useState('all_active');
  const orgId = session?.user?.organizationId;

  const load = async () => {
    if (!orgId) return;
    const [prod, settings] = await Promise.all([
      listB2bProducts({ organizationId: orgId, limit: 200 }),
      getB2bSettings(orgId)
    ]);
    setItems(prod.data || []);
    setPublishMode(settings.data?.publishMode || 'all_active');
  };

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    load().catch(() => toast.error('Failed to load B2B products')).finally(() => setLoading(false));
  }, [hydrated, hasAccess, session?.accessToken, orgId]);

  const toggle = async (row: any, published: boolean) => {
    if (!orgId) return;
    try {
      if (published) await unpublishB2bProducts({ organizationId: orgId, catalogItemIds: [row.id] });
      else await publishB2bProducts({ organizationId: orgId, catalogItemIds: [row.id] });
      toast.success(published ? 'Removed from B2B portal' : 'Published to B2B portal');
      await load();
    } catch {
      toast.error('Update failed');
    }
  };

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: 'sku', header: 'SKU' },
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'brand', header: 'Brand' },
    { accessorKey: 'category', header: 'Category' },
    {
      accessorKey: 'sellingPrice',
      header: 'Selling',
      cell: ({ row }) => row.original.sellingPrice != null ? `£${Number(row.original.sellingPrice).toFixed(2)}` : '—'
    },
    {
      accessorKey: 'published',
      header: 'On portal',
      cell: ({ row }) => publishMode === 'all_active'
        ? (row.original.status === 'active' ? 'Yes (all active)' : 'No')
        : (row.original.published ? 'Published' : 'Hidden')
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => publishMode === 'mapped_only' ? (
        <button
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:border-primary"
          onClick={() => toggle(row.original, Boolean(row.original.published))}
        >
          {row.original.published ? 'Unpublish' : 'Publish'}
        </button>
      ) : null
    }
  ], [publishMode]);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="B2B · Products" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Package2 />
            <div>
              <h1 className="text-xl font-bold">ERP products on B2B</h1>
              <p className="text-sm text-muted-foreground">
                {publishMode === 'all_active'
                  ? 'All active catalog items are visible on the wholesale site. Switch to mapped-only in Settings to pick SKUs.'
                  : 'Only published SKUs appear on the wholesale site.'}
              </p>
            </div>
          </div>
          {loading ? <div className="text-muted-foreground">Loading...</div> : (
            <RichDataTable data={items} columns={columns} searchPlaceholder="Search SKU, name, brand..." />
          )}
        </main>
      </div>
    </div>
  );
}
