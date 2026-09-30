'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listSegments, createSegment, updateSegment, deleteSegment, recalculateSegment } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, RefreshCw } from 'lucide-react';

export default function SegmentsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'MARKETING']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', channel: '', marketingOptIn: false });
  const [editing, setEditing] = useState<any>(null);
  const [confirmDel, setConfirmDel] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const res = await listSegments();
      setItems(res.data || []);
    } catch (e: any) {
      toast.error('Failed to load segments');
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
      const rules: any = {};
      if (form.channel) rules.channel = form.channel;
      if (form.marketingOptIn) rules.marketingOptIn = true;
      const payload = { name: form.name, description: form.description, rules };
      if (editing) {
        await updateSegment(editing.id, payload);
        toast.success('Segment updated');
      } else {
        await createSegment({ ...payload, organizationId: session?.user?.organizationId });
        toast.success('Segment created');
      }
      setShowCreate(false);
      setEditing(null);
      setForm({ name: '', description: '', channel: '', marketingOptIn: false });
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Error saving segment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecalc = async (seg: any) => {
    try {
      const res = await recalculateSegment(seg.id);
      toast.success(`Recalculated · ${res.data?.memberCount ?? 0} members`);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Recalculate failed');
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await deleteSegment(confirmDel.id);
      toast.success('Segment deleted');
      setConfirmDel(null);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Error deleting segment');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'description', header: 'Description' },
    { accessorKey: 'totalMembers', header: 'Members' },
    { accessorKey: 'segmentType', header: 'Type' },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button
            onClick={() => handleRecalc(row.original)}
            className="p-1 hover:bg-secondary rounded text-primary transition-colors"
            title="Recalculate members"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setEditing(row.original);
              setForm({
                name: row.original.name,
                description: row.original.description || '',
                channel: row.original.rules?.channel || '',
                marketingOptIn: Boolean(row.original.rules?.marketingOptIn)
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
          <Header title="Marketing · Segments" />
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
          <Header title="Marketing · Segments" />
          <main className="flex-1 p-6 flex justify-center items-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2 text-destructive">Access Denied</h2>
              <p className="text-muted-foreground">You do not have permission to view marketing segments.</p>
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
        <Header title="Marketing · Segments" />
        <main className="flex-1 overflow-auto p-4 md:p-6 pb-24">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">Segments</h1>
              <p className="text-muted-foreground text-sm">Manage customer targeting segments</p>
            </div>
            <button
              onClick={() => {
                setEditing(null);
                setForm({ name: '', description: '', channel: '', marketingOptIn: false });
                setShowCreate(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" /> Create Segment
            </button>
          </div>

          {items.length === 0 ? (
            <div className="bg-card rounded-lg border shadow-sm p-12 text-center space-y-4">
              <p className="font-medium">No segments yet</p>
              <p className="text-sm text-muted-foreground">Create a targeting segment for email and campaigns.</p>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setForm({ name: '', description: '', channel: '', marketingOptIn: false });
                  setShowCreate(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 mx-auto"
              >
                <Plus className="h-4 w-4" /> Create Segment
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
                  <h3 className="font-semibold">{editing ? 'Edit Segment' : 'Create Segment'}</h3>
                  <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none transition-shadow"
                      placeholder="e.g. High Value Customers"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description</label>
                    <textarea
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      className="w-full p-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none transition-shadow min-h-[100px]"
                      placeholder="Customers who spent over $500..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Channel filter</label>
                    <select
                      value={form.channel}
                      onChange={e => setForm({ ...form, channel: e.target.value })}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background/50"
                    >
                      <option value="">Any channel</option>
                      <option value="b2b_portal">B2B Portal</option>
                      <option value="woocommerce">WooCommerce</option>
                      <option value="goodtill">GoodTill</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.marketingOptIn}
                      onChange={e => setForm({ ...form, marketingOptIn: e.target.checked })}
                    />
                    Marketing opt-in only
                  </label>
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
                  Are you sure you want to delete segment "{confirmDel.name}"? This action cannot be undone.
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
