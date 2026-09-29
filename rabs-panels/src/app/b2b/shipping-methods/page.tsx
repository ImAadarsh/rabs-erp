'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listB2bShippingMethods, upsertB2bShippingMethod } from '@/lib/api';
import { toast } from 'sonner';
import { Truck } from 'lucide-react';

type MethodForm = {
  id?: string;
  code: string;
  name: string;
  description: string;
  price: string;
  freeOverAmount: string;
  etaLabel: string;
  isActive: boolean;
  sortOrder: string;
};

const emptyForm = (): MethodForm => ({
  code: '',
  name: '',
  description: '',
  price: '0',
  freeOverAmount: '',
  etaLabel: '',
  isActive: true,
  sortOrder: '0'
});

export default function B2bShippingMethodsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP']);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<MethodForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const orgId = session?.user?.organizationId;

  const load = async () => {
    if (!orgId) return;
    try {
      const res = await listB2bShippingMethods({ organizationId: orgId });
      setItems(res.data || []);
    } catch {
      toast.error('Failed to load shipping methods');
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

  const save = async () => {
    if (!orgId || !form.code.trim() || !form.name.trim()) {
      toast.error('Code and name are required');
      return;
    }
    setSaving(true);
    try {
      await upsertB2bShippingMethod({
        organizationId: orgId,
        id: form.id,
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description || null,
        price: Number(form.price) || 0,
        freeOverAmount: form.freeOverAmount === '' ? null : Number(form.freeOverAmount),
        etaLabel: form.etaLabel || null,
        isActive: form.isActive,
        sortOrder: Number(form.sortOrder) || 0
      });
      toast.success(form.id ? 'Shipping method updated' : 'Shipping method created');
      setForm(emptyForm());
      await load();
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { accessorKey: 'code', header: 'Code' },
    { accessorKey: 'name', header: 'Name' },
    {
      header: 'Price (ex VAT)',
      cell: ({ row }: any) => `£${Number(row.original.price || 0).toFixed(2)}`
    },
    {
      header: 'Free over',
      cell: ({ row }: any) =>
        row.original.freeOverAmount != null ? `£${Number(row.original.freeOverAmount).toFixed(2)}` : '—'
    },
    { accessorKey: 'etaLabel', header: 'Lead time' },
    {
      header: 'Active',
      cell: ({ row }: any) => (row.original.isActive ? 'Yes' : 'No')
    },
    {
      header: 'Actions',
      cell: ({ row }: any) => (
        <div className="flex gap-2">
          <button
            className="text-xs px-2 py-1 border rounded"
            onClick={() =>
              setForm({
                id: row.original.id,
                code: row.original.code,
                name: row.original.name,
                description: row.original.description || '',
                price: String(row.original.price ?? 0),
                freeOverAmount:
                  row.original.freeOverAmount != null ? String(row.original.freeOverAmount) : '',
                etaLabel: row.original.etaLabel || '',
                isActive: !!row.original.isActive,
                sortOrder: String(row.original.sortOrder ?? 0)
              })
            }
          >
            Edit
          </button>
          <button
            className="text-xs px-2 py-1 border rounded"
            onClick={async () => {
              try {
                await upsertB2bShippingMethod({
                  organizationId: orgId!,
                  id: row.original.id,
                  code: row.original.code,
                  name: row.original.name,
                  description: row.original.description,
                  price: Number(row.original.price),
                  freeOverAmount: row.original.freeOverAmount,
                  etaLabel: row.original.etaLabel,
                  isActive: !row.original.isActive,
                  sortOrder: row.original.sortOrder
                });
                toast.success(row.original.isActive ? 'Disabled' : 'Enabled');
                load();
              } catch {
                toast.error('Update failed');
              }
            }}
          >
            {row.original.isActive ? 'Disable' : 'Enable'}
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="B2B · Shipping Methods" />
        <main className="flex-1 p-6 space-y-6">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Truck className="h-5 w-5" /> Shipping methods
            </h1>
            <p className="text-sm text-muted-foreground">
              Create and edit B2B delivery options shown on the retailer portal checkout (price, free-over threshold, lead
              time).
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 bg-card border rounded-xl p-4">
            <label className="text-xs space-y-1">
              <span className="font-semibold">Code</span>
              <input
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="next-day"
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="font-semibold">Name</span>
              <input
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="font-semibold">Price (ex VAT £)</span>
              <input
                type="number"
                step="0.01"
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="font-semibold">Free over £ (optional)</span>
              <input
                type="number"
                step="0.01"
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.freeOverAmount}
                onChange={(e) => setForm({ ...form, freeOverAmount: e.target.value })}
                placeholder="1000"
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="font-semibold">Lead time label</span>
              <input
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.etaLabel}
                onChange={(e) => setForm({ ...form, etaLabel: e.target.value })}
                placeholder="2–3 working days"
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="font-semibold">Sort order</span>
              <input
                type="number"
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              />
            </label>
            <label className="text-xs space-y-1 md:col-span-2">
              <span className="font-semibold">Description</span>
              <input
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <label className="text-xs flex items-center gap-2 mt-5">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active / enabled for checkout
            </label>
            <div className="flex items-end gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Saving…' : form.id ? 'Update method' : 'Create method'}
              </button>
              {form.id && (
                <button type="button" className="px-3 py-2 text-sm border rounded" onClick={() => setForm(emptyForm())}>
                  Cancel edit
                </button>
              )}
            </div>
          </div>

          <RichDataTable columns={columns as any} data={items} searchPlaceholder="Search shipping methods..." />
        </main>
      </div>
    </div>
  );
}
