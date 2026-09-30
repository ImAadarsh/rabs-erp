'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listCreators, createCreator, updateCreator, deleteCreator } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

export default function CreatorsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SOCIAL_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ creatorName: '', primaryPlatform: 'instagram', status: 'prospect', primaryHandle: '', followerCount: 0 });
  const [editing, setEditing] = useState<any>(null);
  const [confirmDel, setConfirmDel] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const { data } = await listCreators();
      setItems(data || []);
    } catch (e: any) {
      toast.error('Failed to load creators');
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
      const payload: any = { 
        ...form,
        followerCount: Number(form.followerCount) || 0
      };
      if (editing) {
        await updateCreator(editing.id, payload);
        toast.success('Creator updated');
      } else {
        await createCreator({ ...payload, organizationId: session?.user?.organizationId });
        toast.success('Creator created');
      }
      setShowCreate(false);
      setEditing(null);
      setForm({ creatorName: '', primaryPlatform: 'instagram', status: 'prospect', primaryHandle: '', followerCount: 0 });
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Error saving creator');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await deleteCreator(confirmDel.id);
      toast.success('Creator deleted');
      setConfirmDel(null);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Error deleting creator');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: 'creatorName', header: 'Name' },
    { accessorKey: 'primaryPlatform', header: 'Platform' },
    { accessorKey: 'primaryHandle', header: 'Handle' },
    { accessorKey: 'followerCount', header: 'Followers' },
    { accessorKey: 'status', header: 'Status' },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditing(row.original);
              setForm({
                creatorName: row.original.creatorName,
                primaryPlatform: row.original.primaryPlatform,
                primaryHandle: row.original.primaryHandle || '',
                status: row.original.status,
                followerCount: row.original.followerCount || 0
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
          <Header title="Social · Creators" />
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
          <Header title="Social · Creators" />
          <main className="flex-1 p-6 flex justify-center items-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2 text-destructive">Access Denied</h2>
              <p className="text-muted-foreground">You do not have permission to view creators.</p>
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
        <Header title="Social · Creators" />
        <main className="flex-1 overflow-auto p-4 md:p-6 pb-24">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">Creators & Influencers</h1>
              <p className="text-muted-foreground text-sm">Manage VIP relationships and sponsored talent</p>
            </div>
            <button
              onClick={() => {
                setEditing(null);
                setForm({ creatorName: '', primaryPlatform: 'instagram', status: 'prospect', primaryHandle: '', followerCount: 0 });
                setShowCreate(true);
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Add Creator
            </button>
          </div>

          <div className="bg-card rounded-lg border shadow-sm">
            <RichDataTable columns={columns} data={items} />
          </div>

          {showCreate && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card w-full max-w-md rounded-lg shadow-lg border border-border flex flex-col">
                <div className="p-4 border-b border-border flex justify-between items-center bg-muted/50 rounded-t-lg">
                  <h3 className="font-semibold">{editing ? 'Edit Creator' : 'Add Creator'}</h3>
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
                      value={form.creatorName}
                      onChange={e => setForm({ ...form, creatorName: e.target.value })}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Platform</label>
                      <select
                        value={form.primaryPlatform}
                        onChange={e => setForm({ ...form, primaryPlatform: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option value="instagram">Instagram</option>
                        <option value="tiktok">TikTok</option>
                        <option value="youtube">YouTube</option>
                        <option value="twitter">Twitter</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Status</label>
                      <select
                        value={form.status}
                        onChange={e => setForm({ ...form, status: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option value="prospect">Prospect</option>
                        <option value="contacted">Contacted</option>
                        <option value="negotiating">Negotiating</option>
                        <option value="active">Active/Signed</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Main Handle</label>
                    <input
                      type="text"
                      value={form.primaryHandle}
                      onChange={e => setForm({ ...form, primaryHandle: e.target.value })}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                      placeholder="@influencer"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Follower Count</label>
                    <input
                      type="number"
                      value={form.followerCount}
                      onChange={e => setForm({ ...form, followerCount: parseInt(e.target.value) || 0 })}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                    />
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
                  Are you sure you want to delete this creator?
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
