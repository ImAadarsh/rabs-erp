'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { 
  listChannelMappings, createChannelMapping, updateChannelMapping, deleteChannelMapping,
  listCatalogItems, listVariants
} from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, Share2 } from 'lucide-react';

type ChannelMapping = {
  id: string;
  channel: 'amazon' | 'ebay' | 'tiktok' | 'etsy' | 'shopify' | 'woocommerce' | 'wix' | 'b2b_portal' | 'pos';
  channelProductId?: string | null;
  channelVariantId?: string | null;
  channelUrl?: string | null;
  attributes?: Record<string, any> | null;
  syncEnabled: boolean;
  syncStatus: 'pending' | 'synced' | 'failed' | 'disabled';
  syncError?: string | null;
  catalogItem?: {
    id: string;
    sku: string;
    name: string;
  };
  variant?: {
    id: string;
    variantSku: string;
  } | null;
  [key: string]: any;
};

export default function ChannelMappingsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ChannelMapping[]>([]);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ 
    catalogItemId: '',
    variantId: '',
    channel: 'amazon' as 'amazon' | 'ebay' | 'tiktok' | 'etsy' | 'shopify' | 'woocommerce' | 'wix' | 'b2b_portal' | 'pos',
    channelProductId: '',
    channelVariantId: '',
    channelUrl: '',
    attributes: '',
    syncEnabled: true,
    syncStatus: 'pending' as 'pending' | 'synced' | 'failed' | 'disabled'
  });
  const [editing, setEditing] = useState<ChannelMapping | null>(null);
  const [editForm, setEditForm] = useState({
    variantId: '',
    channelProductId: '',
    channelVariantId: '',
    channelUrl: '',
    attributes: '',
    syncEnabled: true,
    syncStatus: 'pending' as 'pending' | 'synced' | 'failed' | 'disabled'
  });
  const [confirmDel, setConfirmDel] = useState<ChannelMapping | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [mappingsRes, catalogItemsRes, variantsRes] = await Promise.all([
          listChannelMappings(),
          listCatalogItems({ organizationId: session?.user?.organizationId }),
          listVariants()
        ]);
        setItems(mappingsRes.data || []);
        setCatalogItems(catalogItemsRes.data || []);
        setVariants(variantsRes.data || []);
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 403) {
          toast.error('You do not have permission to view channel mappings.');
        } else if (status === 401) {
          toast.error('Session expired. Please login again.');
          router.replace('/login');
        } else {
          toast.error('Failed to load channel mappings');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  const [filteredVariants, setFilteredVariants] = useState<any[]>([]);

  useEffect(() => {
    if (form.catalogItemId) {
      const itemVariants = variants.filter(v => v.catalogItem?.id === form.catalogItemId);
      setFilteredVariants(itemVariants);
    } else {
      setFilteredVariants([]);
    }
  }, [form.catalogItemId, variants]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!form.catalogItemId || !form.channel) {
      toast.error('Please fill in required fields (Catalog Item, Channel)');
      return;
    }
    try {
      const res = await createChannelMapping({
        catalogItemId: form.catalogItemId,
        variantId: form.variantId || undefined,
        channel: form.channel,
        channelProductId: form.channelProductId || undefined,
        channelVariantId: form.channelVariantId || undefined,
        channelUrl: form.channelUrl || undefined,
        attributes: form.attributes ? JSON.parse(form.attributes) : undefined,
        syncEnabled: form.syncEnabled,
        syncStatus: form.syncStatus
      });
      
      setItems([res.data, ...items]);
      setShowCreate(false);
      setForm({ 
        catalogItemId: '',
        variantId: '',
        channel: 'amazon',
        channelProductId: '',
        channelVariantId: '',
        channelUrl: '',
        attributes: '',
        syncEnabled: true,
        syncStatus: 'pending'
      });
      toast.success('Channel mapping created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Create failed');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const res = await updateChannelMapping(editing.id, {
        variantId: editForm.variantId || null,
        channelProductId: editForm.channelProductId || undefined,
        channelVariantId: editForm.channelVariantId || undefined,
        channelUrl: editForm.channelUrl || undefined,
        attributes: editForm.attributes ? JSON.parse(editForm.attributes) : undefined,
        syncEnabled: editForm.syncEnabled,
        syncStatus: editForm.syncStatus
      });
      
      setItems(items.map(item => item.id === editing.id ? res.data : item));
      setEditing(null);
      toast.success('Channel mapping updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Update failed');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteChannelMapping(confirmDel.id);
      setItems(items.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Channel mapping deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Delete failed');
    }
  }

  const columns = useMemo<ColumnDef<ChannelMapping>[]>(() => [
    {
      accessorKey: 'channel',
      header: 'Channel',
      cell: ({ row }) => (
        <span className="font-medium capitalize">{row.original.channel}</span>
      )
    },
    {
      accessorKey: 'catalogItem',
      header: 'Product',
      cell: ({ row }) => (
        <div>
          {row.original.catalogItem && (
            <div className="text-sm">{row.original.catalogItem.sku} - {row.original.catalogItem.name}</div>
          )}
          {row.original.variant && (
            <div className="text-xs text-muted-foreground">Variant: {row.original.variant.variantSku}</div>
          )}
        </div>
      )
    },
    {
      accessorKey: 'channelProductId',
      header: 'Channel Product ID',
      cell: ({ row }) => row.original.channelProductId || '-'
    },
    {
      accessorKey: 'syncStatus',
      header: 'Sync Status',
      cell: ({ row }) => {
        const status = row.original.syncStatus;
        const colors = {
          pending: 'bg-yellow-100 text-yellow-800',
          synced: 'bg-green-100 text-green-800',
          failed: 'bg-red-100 text-red-800',
          disabled: 'bg-gray-100 text-gray-800'
        };
        return (
          <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status]}`}>
            {status}
          </span>
        );
      }
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditing(item);
                setEditForm({
                  variantId: item.variant?.id || '',
                  channelProductId: item.channelProductId || '',
                  channelVariantId: item.channelVariantId || '',
                  channelUrl: item.channelUrl || '',
                  attributes: item.attributes ? JSON.stringify(item.attributes, null, 2) : '',
                  syncEnabled: item.syncEnabled,
                  syncStatus: item.syncStatus
                });
              }}
              className="p-1 hover:bg-gray-100 rounded"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setConfirmDel(item)}
              className="p-1 hover:bg-gray-100 rounded text-red-600"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      },
    },
  ], []);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Catalog · Channel Mappings" />
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
          <Header title="Catalog · Channel Mappings" />
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
        <Header title="Catalog · Channel Mappings" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <Share2 className="h-8 w-8" />
                  Channel Mappings
                </h1>
                <p className="text-muted-foreground mt-1">Manage platform-specific product mappings</p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Mapping
              </button>
            </div>

            <RichDataTable columns={columns} data={items} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Channel Mapping</h3>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Catalog Item *</label>
                        <select
                          value={form.catalogItemId}
                          onChange={e => setForm(prev => ({ ...prev, catalogItemId: e.target.value, variantId: '' }))}
                          className="select"
                          required
                        >
                          <option value="">Select...</option>
                          {catalogItems.map(item => (
                            <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Variant</label>
                        <select
                          value={form.variantId}
                          onChange={e => setForm(prev => ({ ...prev, variantId: e.target.value }))}
                          className="select"
                          disabled={!form.catalogItemId}
                        >
                          <option value="">None (Product-level mapping)</option>
                          {filteredVariants.map(v => (
                            <option key={v.id} value={v.id}>{v.variantSku} - {v.name || 'N/A'}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Channel *</label>
                        <select
                          value={form.channel}
                          onChange={e => setForm(prev => ({ ...prev, channel: e.target.value as any }))}
                          className="select"
                          required
                        >
                          <option value="amazon">Amazon</option>
                          <option value="ebay">eBay</option>
                          <option value="tiktok">TikTok</option>
                          <option value="etsy">Etsy</option>
                          <option value="shopify">Shopify</option>
                          <option value="woocommerce">WooCommerce</option>
                          <option value="wix">Wix</option>
                          <option value="b2b_portal">B2B Portal</option>
                          <option value="pos">POS</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Channel Product ID</label>
                        <input
                          type="text"
                          value={form.channelProductId}
                          onChange={e => setForm(prev => ({ ...prev, channelProductId: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Channel Variant ID</label>
                        <input
                          type="text"
                          value={form.channelVariantId}
                          onChange={e => setForm(prev => ({ ...prev, channelVariantId: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Channel URL</label>
                        <input
                          type="url"
                          value={form.channelUrl}
                          onChange={e => setForm(prev => ({ ...prev, channelUrl: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Attributes (JSON)</label>
                        <textarea
                          value={form.attributes}
                          onChange={e => setForm(prev => ({ ...prev, attributes: e.target.value }))}
                          className="input font-mono text-xs"
                          rows={4}
                          placeholder='{"key": "value"}'
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Sync Enabled</label>
                        <select
                          value={form.syncEnabled ? 'true' : 'false'}
                          onChange={e => setForm(prev => ({ ...prev, syncEnabled: e.target.value === 'true' }))}
                          className="select"
                        >
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Sync Status</label>
                        <select
                          value={form.syncStatus}
                          onChange={e => setForm(prev => ({ ...prev, syncStatus: e.target.value as any }))}
                          className="select"
                        >
                          <option value="pending">Pending</option>
                          <option value="synced">Synced</option>
                          <option value="failed">Failed</option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                      <button
                        type="button"
                        onClick={() => setShowCreate(false)}
                        className="btn btn-outline"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                      >
                        Create
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {editing && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Edit Channel Mapping</h3>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Variant</label>
                        <select
                          value={editForm.variantId}
                          onChange={e => setEditForm(prev => ({ ...prev, variantId: e.target.value }))}
                          className="select"
                        >
                          <option value="">None (Product-level mapping)</option>
                          {variants.filter(v => editing?.catalogItem && v.catalogItem?.id === editing.catalogItem.id).map(v => (
                            <option key={v.id} value={v.id}>{v.variantSku} - {v.name || 'N/A'}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Channel Product ID</label>
                        <input
                          type="text"
                          value={editForm.channelProductId}
                          onChange={e => setEditForm(prev => ({ ...prev, channelProductId: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Channel Variant ID</label>
                        <input
                          type="text"
                          value={editForm.channelVariantId}
                          onChange={e => setEditForm(prev => ({ ...prev, channelVariantId: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Channel URL</label>
                        <input
                          type="url"
                          value={editForm.channelUrl}
                          onChange={e => setEditForm(prev => ({ ...prev, channelUrl: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Attributes (JSON)</label>
                        <textarea
                          value={editForm.attributes}
                          onChange={e => setEditForm(prev => ({ ...prev, attributes: e.target.value }))}
                          className="input font-mono text-xs"
                          rows={4}
                          placeholder='{"key": "value"}'
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Sync Enabled</label>
                        <select
                          value={editForm.syncEnabled ? 'true' : 'false'}
                          onChange={e => setEditForm(prev => ({ ...prev, syncEnabled: e.target.value === 'true' }))}
                          className="select"
                        >
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Sync Status</label>
                        <select
                          value={editForm.syncStatus}
                          onChange={e => setEditForm(prev => ({ ...prev, syncStatus: e.target.value as any }))}
                          className="select"
                        >
                          <option value="pending">Pending</option>
                          <option value="synced">Synced</option>
                          <option value="failed">Failed</option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="btn btn-outline"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                      >
                        Update
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {confirmDel && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200">
                  <h3 className="text-lg font-semibold mb-4">Confirm Delete</h3>
                  <p className="mb-4 text-muted-foreground">Are you sure you want to delete this channel mapping? This action cannot be undone.</p>
                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <button
                      onClick={() => setConfirmDel(null)}
                      className="btn btn-outline"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={onDelete}
                      className="btn bg-red-600 hover:bg-red-700 text-white"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

