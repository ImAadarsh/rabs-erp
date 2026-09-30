'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listCampaigns, createCampaign, updateCampaign, deleteCampaign, listSegments, sendCampaign, listCampaignSends } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, Send } from 'lucide-react';

export default function CampaignsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'MARKETING']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'email', status: 'draft', targetSegmentId: '', description: '' });
  const [editing, setEditing] = useState<any>(null);
  const [confirmDel, setConfirmDel] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendsFor, setSendsFor] = useState<any>(null);
  const [sends, setSends] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const [campRes, segRes] = await Promise.all([listCampaigns(), listSegments()]);
      setItems(campRes.data || []);
      setSegments(segRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load campaigns');
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
      const payload: any = { ...form };
      if (payload.targetSegmentId === '') {
        delete payload.targetSegmentId; // Make it optional
      }
      if (editing) {
        await updateCampaign(editing.id, payload);
        toast.success('Campaign updated');
      } else {
        await createCampaign({ ...payload, organizationId: session?.user?.organizationId });
        toast.success('Campaign created');
      }
      setShowCreate(false);
      setEditing(null);
      setForm({ name: '', type: 'email', status: 'draft', targetSegmentId: '', description: '' });
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Error saving campaign');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSend = async (campaign: any) => {
    setSubmitting(true);
    try {
      const segmentId = campaign.targetAudience?.startsWith('segment:')
        ? campaign.targetAudience.replace(/^segment:/, '')
        : undefined;
      const res = await sendCampaign(campaign.id, { segmentId });
      toast.success(`Sent to ${res.data?.recipientCount || 0} recipients (${res.data?.delivered || 0} delivered)`);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Send failed');
    } finally {
      setSubmitting(false);
    }
  };

  const openSends = async (campaign: any) => {
    setSendsFor(campaign);
    try {
      const res = await listCampaignSends(campaign.id);
      setSends(res.data || []);
    } catch {
      toast.error('Failed to load sends');
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await deleteCampaign(confirmDel.id);
      toast.success('Campaign deleted');
      setConfirmDel(null);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Error deleting campaign');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: 'name', header: 'Campaign Name' },
    { accessorKey: 'type', header: 'Type' },
    { accessorKey: 'status', header: 'Status' },
    { accessorKey: 'totalSent', header: 'Sent' },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button
            onClick={() => handleSend(row.original)}
            className="p-1 hover:bg-secondary rounded text-primary transition-colors"
            title="Send now"
            disabled={submitting}
          >
            <Send className="h-4 w-4" />
          </button>
          <button
            onClick={() => openSends(row.original)}
            className="px-2 text-xs hover:bg-secondary rounded text-muted-foreground"
            title="View sends"
          >
            Logs
          </button>
          <button
            onClick={() => {
              setEditing(row.original);
              setForm({
                name: row.original.name || row.original.campaignName,
                type: row.original.type || row.original.campaignType || 'email',
                status: row.original.status === 'running' ? 'active' : row.original.status,
                targetSegmentId: row.original.targetAudience?.startsWith('segment:')
                  ? row.original.targetAudience.replace(/^segment:/, '')
                  : '',
                description: row.original.description || ''
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
  ], [submitting]);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Marketing · Campaigns" />
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
          <Header title="Marketing · Campaigns" />
          <main className="flex-1 p-6 flex justify-center items-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2 text-destructive">Access Denied</h2>
              <p className="text-muted-foreground">You do not have permission to view marketing campaigns.</p>
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
        <Header title="Marketing · Campaigns" />
        <main className="flex-1 overflow-auto p-4 md:p-6 pb-24">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">Campaigns</h1>
              <p className="text-muted-foreground text-sm">Manage marketing campaigns</p>
            </div>
            <button
              onClick={() => {
                setEditing(null);
                setForm({ name: '', type: 'email', status: 'draft', targetSegmentId: '', description: '' });
                setShowCreate(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" /> Create Campaign
            </button>
          </div>

          {items.length === 0 ? (
            <div className="bg-card rounded-lg border shadow-sm p-12 text-center space-y-4">
              <p className="font-medium">No campaigns yet</p>
              <p className="text-sm text-muted-foreground">Create a draft campaign and send it to a segment.</p>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setForm({ name: '', type: 'email', status: 'draft', targetSegmentId: '', description: '' });
                  setShowCreate(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 mx-auto"
              >
                <Plus className="h-4 w-4" /> Create Campaign
              </button>
            </div>
          ) : (
            <div className="bg-card rounded-lg border shadow-sm">
              <RichDataTable columns={columns} data={items} />
            </div>
          )}

          {sendsFor && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card w-full max-w-lg rounded-lg shadow-lg border border-border p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">Sends · {sendsFor.name || sendsFor.campaignName}</h3>
                  <button onClick={() => setSendsFor(null)}><X className="h-5 w-5" /></button>
                </div>
                {sends.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sends yet.</p>
                ) : (
                  <ul className="text-sm space-y-2 max-h-80 overflow-auto">
                    {sends.map((s) => (
                      <li key={s.id} className="border-b border-border/50 pb-2">
                        <div className="font-medium">{s.sendName}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.status} · {s.recipientCount} recipients · {s.deliveredCount} delivered · {s.failedCount} failed
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {showCreate && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card w-full max-w-md rounded-lg shadow-lg border border-border flex flex-col">
                <div className="p-4 border-b border-border flex justify-between items-center bg-muted/50 rounded-t-lg">
                  <h3 className="font-semibold">{editing ? 'Edit Campaign' : 'Create Campaign'}</h3>
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
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Type</label>
                      <select
                        value={form.type}
                        onChange={e => setForm({ ...form, type: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                        <option value="social">Social</option>
                        <option value="affiliate">Affiliate</option>
                        <option value="paid_ads">Paid Ads</option>
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
                        <option value="draft">Draft</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Target Segment</label>
                    <select
                      value={form.targetSegmentId}
                      onChange={e => setForm({ ...form, targetSegmentId: e.target.value })}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option value="">-- None --</option>
                      {segments.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
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
                  Are you sure you want to delete this campaign? This action cannot be undone.
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
