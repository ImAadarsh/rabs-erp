'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  cancelDhlShipment,
  createDhlShipment,
  getDhlShipmentLabel,
  getDhlStatus,
  listDhlShipments,
  listOrders,
  trackDhlShipment,
} from '@/lib/api';
import { toast } from 'sonner';
import { ExternalLink, FileText, MapPin, Plus, RefreshCw, Truck, XCircle } from 'lucide-react';
import Link from 'next/link';
import { CrmModal, CrmField, CrmModalActions, crmInputClass } from '@/components/crm/crm-modal';

const emptyShipForm = {
  orderId: '',
  weightKg: '1',
  pieces: '1',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  productCode: 'N',
  description: '',
};

export default function FulfillmentShipmentsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE', 'WAREHOUSE_MANAGER']);
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [form, setForm] = useState(emptyShipForm);
  const [saving, setSaving] = useState(false);
  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const [shipRes, st] = await Promise.all([
        listDhlShipments({ organizationId: orgId }),
        getDhlStatus().catch(() => ({ data: null })),
      ]);
      setItems(shipRes.data || []);
      setStatus(st.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to load DHL shipments');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  async function openCreate() {
    setForm(emptyShipForm);
    setShowCreate(true);
    try {
      const res = await listOrders({ organizationId: orgId, limit: 50, sortBy: 'orderDate', sortDir: 'desc' });
      setOrders(res.data || []);
    } catch {
      setOrders([]);
      toast.error('Could not load recent orders — paste an order id instead');
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.orderId.trim()) {
      toast.error('Select or enter an order');
      return;
    }
    setSaving(true);
    try {
      const res = await createDhlShipment({
        orderId: form.orderId.trim(),
        organizationId: orgId,
        weightKg: Number(form.weightKg) || 1,
        pieces: Number(form.pieces) || 1,
        lengthCm: form.lengthCm ? Number(form.lengthCm) : undefined,
        widthCm: form.widthCm ? Number(form.widthCm) : undefined,
        heightCm: form.heightCm ? Number(form.heightCm) : undefined,
        productCode: form.productCode || 'N',
        description: form.description || undefined,
      });
      toast.success(res.data?.trackingNumber ? `Shipped · ${res.data.trackingNumber}` : 'DHL shipment created');
      setShowCreate(false);
      setForm(emptyShipForm);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to create DHL shipment');
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      accessorFn: (r: any) => r.orderId,
      header: 'Order',
      cell: ({ row }: any) =>
        row.original.orderId ? (
          <Link className="text-sm underline" href={`/orders/orders/${row.original.orderId}`}>
            #{row.original.orderId}
          </Link>
        ) : (
          '—'
        ),
    },
    { accessorKey: 'carrier', header: 'Carrier' },
    { accessorKey: 'trackingNumber', header: 'Tracking' },
    { accessorKey: 'status', header: 'Status' },
    { accessorKey: 'carrierStatus', header: 'Carrier status' },
    {
      header: 'Actions',
      cell: ({ row }: any) => {
        const s = row.original;
        return (
          <div className="flex flex-wrap gap-1">
            <button
              className="text-xs px-2 py-1 border rounded inline-flex items-center gap-1"
              onClick={async () => {
                try {
                  const res = await getDhlShipmentLabel(s.id);
                  if (res.data?.labelUrl) window.open(res.data.labelUrl, '_blank');
                  else toast.error('No label URL returned');
                  void load();
                } catch (e: any) {
                  toast.error(e?.response?.data?.error?.message || 'Label failed');
                }
              }}
            >
              <FileText className="h-3 w-3" /> Label
            </button>
            <button
              className="text-xs px-2 py-1 border rounded inline-flex items-center gap-1"
              onClick={async () => {
                try {
                  const res = await trackDhlShipment({ shipmentId: s.id });
                  toast.success(res.data?.carrierStatus || 'Tracking refreshed');
                  if (res.data?.trackingUrl) window.open(res.data.trackingUrl, '_blank');
                  void load();
                } catch (e: any) {
                  toast.error(e?.response?.data?.error?.message || 'Track failed');
                }
              }}
            >
              <MapPin className="h-3 w-3" /> Track
            </button>
            {s.status !== 'cancelled' && (
              <button
                className="text-xs px-2 py-1 border rounded inline-flex items-center gap-1 text-red-700"
                onClick={async () => {
                  if (!confirm('Cancel/void this DHL shipment? Only works before pickup.')) return;
                  try {
                    await cancelDhlShipment(s.id);
                    toast.success('Cancel requested');
                    void load();
                  } catch (e: any) {
                    toast.error(e?.response?.data?.error?.message || 'Cancel failed');
                  }
                }}
              >
                <XCircle className="h-3 w-3" /> Cancel
              </button>
            )}
            {s.trackingUrl && (
              <a
                href={s.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-2 py-1 border rounded inline-flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" /> DHL
              </a>
            )}
          </div>
        );
      },
    },
  ];

  if (!hydrated || !hasAccess || !session?.accessToken) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header
          title="Fulfillment · Shipments"
          actions={[
            {
              label: 'Browse orders',
              onClick: () => router.push('/orders/orders'),
              variant: 'secondary',
            },
            {
              label: 'Create shipment',
              onClick: () => void openCreate(),
              icon: <Plus size={18} />,
            },
          ]}
        />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Truck />
              <div>
                <h1 className="text-xl font-bold">DHL shipments</h1>
                <p className="text-sm text-muted-foreground">
                  Labels, tracking, and cancel for orders shipped via MyDHL API.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>

          {status && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                status.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'
              }`}
            >
              <strong>DHL {status.mode}:</strong> {status.message}
              {!status.configured && (
                <span className="block mt-1">
                  Add <code>DHL_API_KEY</code> / <code>DHL_API_SECRET</code> / <code>DHL_ACCOUNT_NUMBER</code> to
                  rabs-api/.env (from developer.dhl.com → Apps → rabs_erp).
                </span>
              )}
            </div>
          )}

          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Prefer shipping from an order? Open any order and use <strong className="text-foreground">Ship with DHL</strong>.
            Or create a shipment here by picking a recent order.
          </div>

          {loading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card p-12 text-center space-y-4">
              <Truck className="mx-auto opacity-40" size={32} />
              <div>
                <p className="font-medium text-foreground">No DHL shipments yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Create a shipment from a recent order, or open an order detail and click Ship with DHL.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void openCreate()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
                >
                  <Plus className="h-4 w-4" />
                  Create shipment
                </button>
                <Link
                  href="/orders/orders"
                  className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium hover:bg-muted"
                >
                  Go to orders
                </Link>
              </div>
            </div>
          ) : (
            <RichDataTable data={items} columns={columns as any} searchPlaceholder="Search shipments..." />
          )}
        </main>
      </div>

      <CrmModal open={showCreate} onClose={() => setShowCreate(false)} title="Create DHL shipment" icon={Truck} wide>
        <form onSubmit={onCreate} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Uses the same MyDHL create flow as order detail. The order must have a ship-to address.
          </p>
          <CrmField label="Order">
            <select
              value={form.orderId}
              onChange={(e) => setForm({ ...form, orderId: e.target.value })}
              className={crmInputClass}
            >
              <option value="">Select recent order…</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber || o.id}
                  {o.customerEmail ? ` · ${o.customerEmail}` : ''}
                  {o.status ? ` · ${o.status}` : ''}
                </option>
              ))}
            </select>
          </CrmField>
          <CrmField label="Or paste order ID">
            <input
              value={form.orderId}
              onChange={(e) => setForm({ ...form, orderId: e.target.value })}
              className={crmInputClass}
              placeholder="Order UUID"
            />
          </CrmField>
          <div className="grid grid-cols-2 gap-4">
            <CrmField label="Weight (kg)">
              <input
                type="number"
                min="0.1"
                step="0.1"
                required
                value={form.weightKg}
                onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
                className={crmInputClass}
              />
            </CrmField>
            <CrmField label="Pieces">
              <input
                type="number"
                min="1"
                required
                value={form.pieces}
                onChange={(e) => setForm({ ...form, pieces: e.target.value })}
                className={crmInputClass}
              />
            </CrmField>
            <CrmField label="Length (cm)">
              <input
                type="number"
                min="0"
                value={form.lengthCm}
                onChange={(e) => setForm({ ...form, lengthCm: e.target.value })}
                className={crmInputClass}
              />
            </CrmField>
            <CrmField label="Width (cm)">
              <input
                type="number"
                min="0"
                value={form.widthCm}
                onChange={(e) => setForm({ ...form, widthCm: e.target.value })}
                className={crmInputClass}
              />
            </CrmField>
            <CrmField label="Height (cm)">
              <input
                type="number"
                min="0"
                value={form.heightCm}
                onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
                className={crmInputClass}
              />
            </CrmField>
            <CrmField label="Product code">
              <select
                value={form.productCode}
                onChange={(e) => setForm({ ...form, productCode: e.target.value })}
                className={crmInputClass}
              >
                <option value="N">N · Domestic Express</option>
                <option value="P">P · Worldwide Express</option>
                <option value="U">U · Express Worldwide</option>
              </select>
            </CrmField>
          </div>
          <CrmField label="Description">
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={crmInputClass}
              placeholder="Optional package description"
            />
          </CrmField>
          <CrmModalActions
            onCancel={() => setShowCreate(false)}
            submitLabel="Create shipment"
            submitting={saving}
            submitIcon={<Truck size={16} />}
          />
        </form>
      </CrmModal>
    </div>
  );
}
