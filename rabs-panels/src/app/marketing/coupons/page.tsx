'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listCoupons, createCoupon, updateCoupon, deleteCoupon } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

export default function CouponsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'MARKETING']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    couponCode: '',
    couponName: '',
    discountType: 'percentage',
    discountValue: 0,
    minimumPurchase: 0,
    usageLimit: 0,
    isActive: true
  });
  const [editing, setEditing] = useState<any>(null);
  const [confirmDel, setConfirmDel] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const res = await listCoupons();
      setItems(res.data || []);
    } catch (e: any) {
      toast.error('Failed to load coupons');
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
    loadData();
  }, [hydrated, hasAccess, router, session?.accessToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await updateCoupon(editing.id, form);
        toast.success('Coupon updated');
      } else {
        await createCoupon({ ...form, organizationId: session?.user?.organizationId });
        toast.success('Coupon created');
      }
      setShowCreate(false);
      setEditing(null);
      setForm({ couponCode: '', couponName: '', discountType: 'percentage', discountValue: 0, minimumPurchase: 0, usageLimit: 0, isActive: true });
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Error saving coupon');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await deleteCoupon(confirmDel.id);
      toast.success('Coupon deleted');
      setConfirmDel(null);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Error deleting coupon');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: 'couponCode', header: 'Code' },
    { accessorKey: 'couponName', header: 'Name' },
    { accessorKey: 'discountType', header: 'Type' },
    { accessorKey: 'discountValue', header: 'Value' },
    { accessorKey: 'usageCount', header: 'Used' },
    { 
      accessorKey: 'isActive', 
      header: 'Active',
      cell: ({ row }) => (
        <span className={`px-2 py-1 rounded text-xs ${row.original.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {row.original.isActive ? 'Yes' : 'No'}
        </span>
      )
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditing(row.original);
              setForm({
                couponCode: row.original.couponCode,
                couponName: row.original.couponName,
                discountType: row.original.discountType,
                discountValue: Number(row.original.discountValue || 0),
                minimumPurchase: Number(row.original.minimumPurchase || 0),
                usageLimit: Number(row.original.usageLimit || 0),
                isActive: row.original.isActive
              });
              setShowCreate(true);
            }}
            className="p-1 hover:bg-secondary rounded text-primary transition-colors"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => setConfirmDel(row.original)}
            className="p-1 hover:bg-destructive/10 rounded text-destructive transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ], []);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Marketing · Coupons" />
          <main className="flex-1 p-6 flex justify-center items-center">
            <div className="text-muted-foreground animate-pulse">Loading...</div>
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
          <Header title="Marketing · Coupons" />
          <main className="flex-1 p-6 flex justify-center items-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2 text-destructive">Access Denied</h2>
              <p className="text-muted-foreground">You do not have permission to view marketing coupons.</p>
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
        <Header title="Marketing · Coupons" />
        <main className="flex-1 overflow-auto p-4 md:p-6 pb-24">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">Coupons</h1>
              <p className="text-muted-foreground text-sm">Manage promotional and discount coupons</p>
            </div>
            <button
              onClick={() => {
                setEditing(null);
                setForm({ couponCode: '', couponName: '', discountType: 'percentage', discountValue: 0, minimumPurchase: 0, usageLimit: 0, isActive: true });
                setShowCreate(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" /> Create Coupon
            </button>
          </div>

          {items.length === 0 ? (
            <div className="bg-card rounded-lg border shadow-sm p-12 text-center space-y-4">
              <p className="font-medium">No coupons yet</p>
              <p className="text-sm text-muted-foreground">Create a discount code for promotions and checkout.</p>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setForm({ couponCode: '', couponName: '', discountType: 'percentage', discountValue: 0, minimumPurchase: 0, usageLimit: 0, isActive: true });
                  setShowCreate(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 mx-auto"
              >
                <Plus className="h-4 w-4" /> Create Coupon
              </button>
            </div>
          ) : (
            <div className="bg-card rounded-lg border shadow-sm">
              <RichDataTable columns={columns} data={items} />
            </div>
          )}

          {showCreate && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card w-full max-w-md rounded-lg shadow-lg border border-border flex flex-col">
                <div className="p-4 border-b border-border flex justify-between items-center bg-muted/50 rounded-t-lg">
                  <h3 className="font-semibold">{editing ? 'Edit Coupon' : 'Create Coupon'}</h3>
                  <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Code <span className="text-destructive">*</span></label>
                      <input
                        type="text"
                        required
                        value={form.couponCode}
                        onChange={e => setForm({ ...form, couponCode: e.target.value.toUpperCase() })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none transition-shadow"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
                      <input
                        type="text"
                        required
                        value={form.couponName}
                        onChange={e => setForm({ ...form, couponName: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none transition-shadow"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Type</label>
                      <select
                        value={form.discountType}
                        onChange={e => setForm({ ...form, discountType: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed_amount">Fixed Amount</option>
                        <option value="free_shipping">Free Shipping</option>
                        <option value="buy_x_get_y">Buy X Get Y</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Value</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.discountValue}
                        onChange={e => setForm({ ...form, discountValue: parseFloat(e.target.value) })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none transition-shadow"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={form.isActive}
                      onChange={e => setForm({ ...form, isActive: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="isActive" className="text-sm font-medium">Active</label>
                  </div>
                  
                  <div className="pt-4 flex justify-end gap-2 border-t border-border">
                    <button
                      type="button"
                      onClick={() => setShowCreate(false)}
                      className="px-4 py-2 rounded-md hover:bg-secondary/80 text-sm font-medium transition-colors"
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      {submitting ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {confirmDel && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card w-full max-w-sm rounded-lg shadow-lg border border-border flex flex-col p-6 text-center">
                <h3 className="text-lg font-bold mb-2">Confirm Delete</h3>
                <p className="text-muted-foreground text-sm mb-6">
                  Are you sure you want to delete coupon "{confirmDel.couponCode}"? This action cannot be undone.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setConfirmDel(null)}
                    className="px-4 py-2 rounded-md border border-input hover:bg-secondary/50 text-sm font-medium transition-colors"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={submitting}
                    className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors"
                  >
                    {submitting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
