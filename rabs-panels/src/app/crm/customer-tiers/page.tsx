'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import {
  listCustomerTiers,
  createCustomerTier,
  updateCustomerTier,
  deleteCustomerTier,
} from '@/lib/api';
import { RichDataTable } from '@/components/rich-data-table';
import { Star, Plus, Pencil, Trash2, Save, Send } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { CrmModal, CrmField, CrmModalActions, crmInputClass } from '@/components/crm/crm-modal';

const emptyForm = {
  tierName: '',
  tierCode: '',
  discountPercent: 0,
  prioritySupport: false,
  isActive: true,
  position: 0,
};

export default function CustomerTiersPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadData = useCallback(async () => {
    try {
      const { data } = await listCustomerTiers();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load tiers', err);
      toast.error('Failed to load customer tiers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const s = getSession();
    if (!s?.accessToken) {
      router.replace('/login');
      return;
    }
    loadData();
  }, [router, loadData]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowCreate(true);
  }

  function openEdit(row: any) {
    setEditing(row);
    setForm({
      tierName: row.tierName ?? '',
      tierCode: row.tierCode ?? '',
      discountPercent: Number(row.discountPercent) || 0,
      prioritySupport: !!row.prioritySupport,
      isActive: row.isActive !== false,
      position: Number(row.position) || 0,
    });
    setShowCreate(true);
  }

  function closeModal() {
    setShowCreate(false);
    setEditing(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const s = getSession();
    if (!s?.user?.organizationId) {
      toast.error('Missing organization — re-login and try again');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const res = await updateCustomerTier(editing.id, form);
        setItems((prev) => prev.map((i) => (i.id === editing.id ? res.data : i)));
        toast.success('Tier updated');
      } else {
        const res = await createCustomerTier({
          ...form,
          organizationId: s.user.organizationId,
        });
        setItems((prev) => [...prev, res.data]);
        toast.success('Tier created');
      }
      closeModal();
    } catch (err: any) {
      const apiMsg = err?.response?.data?.error?.message;
      if (typeof apiMsg === 'string' && apiMsg) toast.error(apiMsg);
      else if (err?.response?.status === 403) toast.error('You need Admin / Super Admin access to save tiers');
      else toast.error('Failed to save tier');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this tier?')) return;
    try {
      await deleteCustomerTier(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success('Tier deleted');
    } catch {
      toast.error('Failed to delete tier');
    }
  }

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: 'tierName', header: 'Tier Name' },
      { accessorKey: 'tierCode', header: 'Code' },
      {
        accessorKey: 'discountPercent',
        header: 'Discount',
        cell: (info) => (info.getValue() != null ? `${info.getValue()}%` : '-'),
      },
      {
        accessorKey: 'prioritySupport',
        header: 'Priority Support',
        cell: (info) =>
          info.getValue() ? (
            <span className="flex items-center gap-1 text-amber-500 font-bold text-[10px] uppercase">
              <Star size={10} fill="currentColor" /> Priority
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: (info) => (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
              info.getValue()
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
            }`}
          >
            {info.getValue() ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: (info) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openEdit(info.row.original)}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition"
              aria-label="Edit tier"
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(info.row.original.id)}
              className="p-2 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition"
              aria-label="Delete tier"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title="Customer Tiers"
          actions={[{ label: 'Create Tier', onClick: openCreate, icon: <Plus size={18} /> }]}
        />

        <main className="p-6 md:p-8 space-y-4">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Loyalty / pricing tiers for CRM (discount %, priority support). Managed in the{' '}
            <code className="text-xs">customer_tiers</code> table — separate from the fixed{' '}
            <code className="text-xs">customers.tier</code> enum on each customer record.
          </p>

          {!loading && items.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card p-10 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/25">
                <Star size={22} />
              </div>
              <h2 className="text-lg font-semibold text-foreground">No customer tiers yet</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Create tiers such as Bronze, Silver, Gold, and Platinum to define discounts and
                benefits. Defaults can also be seeded via <code className="text-xs">npm run seed:crm</code>.
              </p>
              <button type="button" onClick={openCreate} className="btn btn-primary inline-flex gap-2 mx-auto">
                <Plus size={18} />
                Create Tier
              </button>
            </div>
          ) : (
            <RichDataTable
              data={items}
              columns={columns}
              searchPlaceholder="Search tiers..."
            />
          )}
        </main>
      </div>

      <CrmModal
        open={showCreate}
        onClose={closeModal}
        title={editing ? 'Edit Tier' : 'Create Tier'}
        icon={editing ? Pencil : Plus}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <CrmField label="Tier Name">
              <input
                required
                value={form.tierName}
                onChange={(e) => setForm({ ...form, tierName: e.target.value })}
                className={crmInputClass}
                placeholder="e.g. Gold"
              />
            </CrmField>
            <CrmField label="Code">
              <input
                required
                value={form.tierCode}
                onChange={(e) => setForm({ ...form, tierCode: e.target.value.toUpperCase() })}
                className={crmInputClass}
                placeholder="e.g. GOLD"
              />
            </CrmField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <CrmField label="Discount (%)">
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                required
                value={form.discountPercent}
                onChange={(e) => setForm({ ...form, discountPercent: Number(e.target.value) })}
                className={crmInputClass}
              />
            </CrmField>
            <CrmField label="Position">
              <input
                type="number"
                required
                value={form.position}
                onChange={(e) => setForm({ ...form, position: Number(e.target.value) })}
                className={crmInputClass}
              />
            </CrmField>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.prioritySupport}
              onChange={(e) => setForm({ ...form, prioritySupport: e.target.checked })}
            />
            Priority support
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Active
          </label>

          <CrmModalActions
            onCancel={closeModal}
            submitLabel={editing ? 'Update Tier' : 'Save Tier'}
            submitting={saving}
            submitIcon={editing ? <Save size={16} /> : <Send size={16} />}
          />
        </form>
      </CrmModal>
    </div>
  );
}
