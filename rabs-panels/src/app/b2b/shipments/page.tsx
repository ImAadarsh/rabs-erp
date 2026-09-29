'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listB2bShipments, updateB2bShipment } from '@/lib/api';
import { toast } from 'sonner';
import { Truck } from 'lucide-react';

export default function B2bShipmentsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP']);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const orgId = session?.user?.organizationId;

  const load = async () => {
    if (!orgId) return;
    try {
      const res = await listB2bShipments({ organizationId: orgId });
      setItems(res.data || []);
    } catch {
      toast.error('Failed to load shipments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    load();
  }, [hydrated, hasAccess, session?.accessToken, orgId]);

  const columns = [
    { accessorFn: (r: any) => r.order?.orderNumber || r.orderId, header: 'Order' },
    { accessorFn: (r: any) => r.customer?.companyName || r.customer?.email, header: 'Retailer' },
    { accessorKey: 'status', header: 'Status' },
    { accessorKey: 'carrier', header: 'Carrier' },
    { accessorKey: 'trackingNumber', header: 'Tracking' },
    {
      header: 'Actions',
      cell: ({ row }: any) => (
        <div className="flex gap-2">
          <button
            className="text-xs px-2 py-1 border rounded"
            onClick={async () => {
              try {
                const tracking = prompt('Tracking number', row.original.trackingNumber || '') || undefined;
                await updateB2bShipment(row.original.id, {
                  organizationId: orgId,
                  status: 'dispatched',
                  trackingNumber: tracking,
                  carrier: row.original.carrier || 'ABS Interiors Freight'
                });
                toast.success('Marked dispatched');
                load();
              } catch {
                toast.error('Update failed');
              }
            }}
          >
            Dispatch
          </button>
          <button
            className="text-xs px-2 py-1 border rounded"
            onClick={async () => {
              try {
                await updateB2bShipment(row.original.id, { organizationId: orgId, status: 'delivered' });
                toast.success('Marked delivered');
                load();
              } catch {
                toast.error('Update failed');
              }
            }}
          >
            Delivered
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="B2B · Shipments" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Truck />
            <div>
              <h1 className="text-xl font-bold">Fulfilment & tracking</h1>
              <p className="text-sm text-muted-foreground">Update B2B shipment status and tracking numbers.</p>
            </div>
          </div>
          {loading ? <div className="text-muted-foreground">Loading...</div> : (
            <RichDataTable data={items} columns={columns as any} searchPlaceholder="Search shipments..." />
          )}
        </main>
      </div>
    </div>
  );
}
