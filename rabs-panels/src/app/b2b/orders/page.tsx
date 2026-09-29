'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listB2bOrders } from '@/lib/api';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { ShoppingCart } from 'lucide-react';

export default function B2bOrdersPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const orgId = session?.user?.organizationId;

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    listB2bOrders({ organizationId: orgId, limit: 100 })
      .then((res) => setItems(res.data || []))
      .catch(() => toast.error('Failed to load B2B orders'))
      .finally(() => setLoading(false));
  }, [hydrated, hasAccess, session?.accessToken, orgId]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: 'orderNumber', header: 'Order' },
    { accessorFn: (r) => r.customer?.companyName || r.customerEmail, header: 'Retailer' },
    { accessorKey: 'status', header: 'Status' },
    { accessorKey: 'paymentStatus', header: 'Payment' },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => `£${Number(row.original.total || 0).toFixed(2)}`
    },
    {
      accessorKey: 'orderDate',
      header: 'Date',
      cell: ({ row }) => row.original.orderDate ? new Date(row.original.orderDate).toLocaleString('en-GB') : '—'
    }
  ], []);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="B2B · Orders" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <ShoppingCart />
            <div>
              <h1 className="text-xl font-bold">B2B portal orders</h1>
              <p className="text-sm text-muted-foreground">Orders placed on the wholesale website (channel b2b_portal).</p>
            </div>
          </div>
          {loading ? <div className="text-muted-foreground">Loading...</div> : (
            <RichDataTable data={items} columns={columns} searchPlaceholder="Search order number or retailer..." />
          )}
        </main>
      </div>
    </div>
  );
}
