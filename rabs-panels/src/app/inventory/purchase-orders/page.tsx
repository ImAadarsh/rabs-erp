'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listPurchaseOrders } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { FileText } from 'lucide-react';

type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplier?: { id: string; name: string };
  warehouse?: { id: string; name: string };
  orderDate?: string;
  expectedDeliveryDate?: string;
  status?: string;
  total?: number;
  currency?: string;
  [key: string]: any;
};

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PurchaseOrder[]>([]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    loadData();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function loadData() {
    try {
      setLoading(true);
      const poRes = await listPurchaseOrders();
      setItems(poRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }

  const columns = useMemo<ColumnDef<PurchaseOrder>[]>(() => [
    {
      accessorKey: 'poNumber',
      header: 'PO Number',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-muted-foreground" />
          <span className="font-medium">{row.original.poNumber}</span>
        </div>
      )
    },
    {
      accessorKey: 'supplier.name',
      header: 'Supplier',
      cell: ({ row }) => <span className="text-sm">{row.original.supplier?.name || 'N/A'}</span>
    },
    {
      accessorKey: 'warehouse.name',
      header: 'Warehouse',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.warehouse?.name || 'N/A'}</span>
    },
    {
      accessorKey: 'orderDate',
      header: 'Order Date',
      cell: ({ row }) => {
        const date = row.original.orderDate;
        if (!date) return <span className="text-sm text-muted-foreground">—</span>;
        return <span className="text-sm">{new Date(date).toLocaleDateString()}</span>;
      }
    },
    {
      accessorKey: 'expectedDeliveryDate',
      header: 'Expected Delivery',
      cell: ({ row }) => {
        const date = row.original.expectedDeliveryDate;
        if (!date) return <span className="text-sm text-muted-foreground">—</span>;
        return <span className="text-sm">{new Date(date).toLocaleDateString()}</span>;
      }
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => {
        const total = row.original.total;
        const currency = row.original.currency || 'GBP';
        if (!total) return <span className="text-sm text-muted-foreground">—</span>;
        return <span className="font-medium">{currency} {total.toFixed(2)}</span>;
      }
    },
    { accessorKey: 'status', header: 'Status' }
  ], []);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Inventory · Purchase Orders" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground">Loading...</div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Inventory · Purchase Orders" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to view this page.</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Inventory · Purchase Orders" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold">Purchase Orders</h1>
                <p className="text-muted-foreground mt-1">View and manage purchase orders</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-sm text-muted-foreground">Loading purchase orders...</div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card">
                <RichDataTable columns={columns} data={items} searchPlaceholder="Search purchase orders..." />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

