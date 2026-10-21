'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { 
  listProductMedia, createProductMedia, updateProductMedia, deleteProductMedia,
  listCatalogItems, listVariants
} from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { useApiAccess } from '@/hooks/use-api-access';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, Image as ImageIcon, Eye, Loader2 } from 'lucide-react';
import { MediaThumb, MediaLink, isLegacyStorageUrl, LEGACY_STORAGE_MESSAGE } from '@/components/catalog/media-preview';

type ProductMedia = {
  id: string;
  type: 'image' | 'video' | 'document' | '3d_model';
  url: string;
  filename?: string | null;
  altText?: string | null;
  position: number;
  isPrimary: boolean;
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

export default function ProductMediaPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP']);
  const { can } = useApiAccess();
  const canCreate = can('POST', '/api/catalog/media');
  const canUpdate = can('PATCH', '/api/catalog/media/:id');
  const canDelete = can('DELETE', '/api/catalog/media/:id');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ProductMedia[]>([]);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ 
    catalogItemId: '',
    variantId: '',
    type: 'image' as 'image' | 'video' | 'document' | '3d_model',
    altText: '',
    position: '0',
    isPrimary: false
  });
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProductMedia | null>(null);
  const [editForm, setEditForm] = useState({
    variantId: '',
    type: 'image' as 'image' | 'video' | 'document' | '3d_model',
    altText: '',
    position: '0',
    isPrimary: false
  });
  const [editMediaFile, setEditMediaFile] = useState<File | null>(null);
  const [editMediaPreview, setEditMediaPreview] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<ProductMedia | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [mediaRes, catalogItemsRes, variantsRes] = await Promise.all([
          listProductMedia(),
          listCatalogItems({ organizationId: session?.user?.organizationId }),
          listVariants()
        ]);
        setItems(mediaRes.data || []);
        setCatalogItems(catalogItemsRes.data || []);
        setVariants(variantsRes.data || []);
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 403) {
          toast.error('You do not have permission to view product media.');
        } else if (status === 401) {
          toast.error('Session expired. Please login again.');
          router.replace('/login');
        } else {
          toast.error('Failed to load product media');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  const ALLOWED_TYPES: Record<string, string[]> = {
    image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
    video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
    document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    '3d_model': ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream']
  };

  function validateFile(file: File, mediaType: string) {
    const allowed = ALLOWED_TYPES[mediaType] || ['*/*'];
    if (!allowed.includes(file.type) && !allowed.includes('*/*')) {
      toast.error(`${file.name}: invalid file type for ${mediaType}. Allowed: ${allowed.join(', ')}`);
      return false;
    }
    const maxSize = mediaType === 'video' ? 100 : mediaType === '3d_model' ? 50 : 10;
    if (file.size > maxSize * 1024 * 1024) {
      toast.error(`${file.name}: file size must be less than ${maxSize}MB`);
      return false;
    }
    return true;
  }

  function handleCreateFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((f) => validateFile(f, form.type));
    setMediaFiles(files);
    setMediaPreviews(form.type === 'image' ? files.map((f) => URL.createObjectURL(f)) : []);
  }

  function resetCreate() {
    setShowCreate(false);
    setMediaFiles([]);
    setMediaPreviews([]);
  }

  function handleEditFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !validateFile(file, editForm.type)) return;
    setEditMediaFile(file);
    setEditMediaPreview(editForm.type === 'image' ? URL.createObjectURL(file) : null);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!form.catalogItemId || !form.type || mediaFiles.length === 0) {
      toast.error('Please fill in required fields (Catalog Item, Type, File)');
      return;
    }
    setCreating(true);
    const created: ProductMedia[] = [];
    const failed: string[] = [];
    const basePosition = parseInt(form.position) || 0;
    for (const [i, file] of mediaFiles.entries()) {
      try {
        const res = await createProductMedia({
          catalogItemId: form.catalogItemId,
          variantId: form.variantId || undefined,
          type: form.type,
          altText: form.altText || undefined,
          position: basePosition + i,
          isPrimary: form.isPrimary && i === 0
        }, file);
        created.push(res.data);
      } catch (err: any) {
        failed.push(`${file.name}: ${err?.response?.data?.error?.message ?? 'upload failed'}`);
      }
    }
    setCreating(false);
    if (created.length) {
      setItems(prev => [...created, ...prev]);
      toast.success(created.length === 1 ? 'Product media created' : `${created.length} media files added`);
    }
    if (failed.length) {
      toast.error(failed.join('\n'));
      return;
    }
    resetCreate();
    setForm({
      catalogItemId: '',
      variantId: '',
      type: 'image',
      altText: '',
      position: '0',
      isPrimary: false
    });
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const res = await updateProductMedia(editing.id, {
        variantId: editForm.variantId || null,
        type: editForm.type,
        altText: editForm.altText || undefined,
        position: parseInt(editForm.position) || 0,
        isPrimary: editForm.isPrimary
      }, editMediaFile || undefined);
      
      setItems(items.map(item => item.id === editing.id ? res.data : item));
      setEditing(null);
      setEditMediaFile(null);
      setEditMediaPreview(null);
      toast.success('Product media updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Update failed');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteProductMedia(confirmDel.id);
      setItems(items.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Product media deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Delete failed');
    }
  }

  const columns = useMemo<ColumnDef<ProductMedia>[]>(() => [
    {
      accessorKey: 'url',
      header: 'Preview',
      cell: ({ row }) => {
        const media = row.original;
        if (media.type === 'image') {
          return <MediaThumb url={media.url} alt={media.altText || 'Product media'} className="w-16 h-16" />;
        } else {
          return (
            <div className="w-16 h-16 flex items-center justify-center bg-muted rounded">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
          );
        }
      }
    },
    {
      id: 'catalogItem',
      accessorFn: (row) => `${row.catalogItem?.sku || ''} ${row.catalogItem?.name || ''} ${row.variant?.variantSku || ''}`.trim(),
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
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => (
        <span className="capitalize">{row.original.type.replace('_', ' ')}</span>
      )
    },
    {
      accessorKey: 'filename',
      header: 'Filename',
      cell: ({ row }) => row.original.filename || '-'
    },
    {
      accessorKey: 'position',
      header: 'Position',
      cell: ({ row }) => row.original.position
    },
    {
      accessorKey: 'isPrimary',
      header: 'Primary',
      cell: ({ row }) => (
        row.original.isPrimary ? (
          <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
            Yes
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )
      )
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex items-center gap-2">
            {item.url && (isLegacyStorageUrl(item.url) ? (
              <span className="p-1 text-amber-600 cursor-not-allowed" title={`${LEGACY_STORAGE_MESSAGE} — re-upload via Edit`}>
                <Eye className="h-4 w-4 opacity-40" />
              </span>
            ) : (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-gray-100 rounded"
                title="View"
              >
                <Eye className="h-4 w-4" />
              </a>
            ))}
            {canUpdate && (
            <button
              onClick={() => {
                setEditing(item);
                setEditForm({
                  variantId: item.variant?.id || '',
                  type: item.type,
                  altText: item.altText || '',
                  position: item.position.toString(),
                  isPrimary: item.isPrimary
                });
                setEditMediaFile(null);
                setEditMediaPreview(null);
              }}
              className="p-1 hover:bg-gray-100 rounded"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            )}
            {canDelete && (
            <button
              onClick={() => setConfirmDel(item)}
              className="p-1 hover:bg-gray-100 rounded text-red-600"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            )}
          </div>
        );
      },
    },
  ], [canUpdate, canDelete]);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Catalog · Product Media" />
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
          <Header title="Catalog · Product Media" />
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
        <Header title="Catalog · Product Media" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <ImageIcon className="h-8 w-8" />
                  Product Media
                </h1>
                <p className="text-muted-foreground mt-1">Manage product images, videos, documents, and 3D models</p>
              </div>
              {canCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Media
              </button>
              )}
            </div>

            <RichDataTable columns={columns} data={items} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Product Media</h3>
                    <button onClick={resetCreate} className="p-1 hover:bg-muted rounded-lg transition-colors">
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
                          <option value="">None (Product-level media)</option>
                          {variants.filter(v => v.catalogItem?.id === form.catalogItemId).map(v => (
                            <option key={v.id} value={v.id}>{v.variantSku} - {v.name || 'N/A'}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Type *</label>
                        <select
                          value={form.type}
                          onChange={e => {
                            setForm(prev => ({ ...prev, type: e.target.value as any }));
                            setMediaFiles([]);
                            setMediaPreviews([]);
                          }}
                          className="select"
                          required
                        >
                          <option value="image">Image</option>
                          <option value="video">Video</option>
                          <option value="document">Document</option>
                          <option value="3d_model">3D Model</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Position</label>
                        <input
                          type="number"
                          min="0"
                          value={form.position}
                          onChange={e => setForm(prev => ({ ...prev, position: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Alt Text</label>
                        <input
                          type="text"
                          value={form.altText}
                          onChange={e => setForm(prev => ({ ...prev, altText: e.target.value }))}
                          className="input"
                          placeholder="Alternative text for accessibility"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.isPrimary}
                            onChange={e => setForm(prev => ({ ...prev, isPrimary: e.target.checked }))}
                            className="rounded"
                          />
                          <span className="text-sm font-medium">Set as primary media</span>
                        </label>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Media Files * <span className="text-xs font-normal text-muted-foreground">(select one or more)</span></label>
                        <input
                          type="file"
                          multiple
                          accept={form.type === 'image' ? 'image/*' : form.type === 'video' ? 'video/*' : form.type === 'document' ? '.pdf,.doc,.docx' : '*'}
                          onChange={handleCreateFilesChange}
                          className="input"
                          required
                        />
                        {mediaFiles.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {mediaFiles.length} file(s) selected: {mediaFiles.map(f => f.name).join(', ')}
                          </p>
                        )}
                        {mediaPreviews.length > 0 && (
                          <div className="mt-2 grid grid-cols-4 gap-2">
                            {mediaPreviews.map((src, i) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={src} src={src} alt={`Preview ${i + 1}`} className="w-full aspect-square object-cover rounded border border-border" />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                      <button
                        type="button"
                        onClick={resetCreate}
                        className="btn btn-outline"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={creating}
                        className="btn btn-primary inline-flex items-center gap-2"
                      >
                        {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                        {mediaFiles.length > 1 ? `Upload ${mediaFiles.length} files` : 'Create'}
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
                    <h3 className="text-lg font-semibold">Edit Product Media</h3>
                    <button onClick={() => {
                      setEditing(null);
                      setEditMediaFile(null);
                      setEditMediaPreview(null);
                    }} className="p-1 hover:bg-muted rounded-lg transition-colors">
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
                          <option value="">None (Product-level media)</option>
                          {variants.filter(v => editing?.catalogItem && v.catalogItem?.id === editing.catalogItem.id).map(v => (
                            <option key={v.id} value={v.id}>{v.variantSku} - {v.name || 'N/A'}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Type *</label>
                        <select
                          value={editForm.type}
                          onChange={e => {
                            setEditForm(prev => ({ ...prev, type: e.target.value as any }));
                            setEditMediaFile(null);
                            setEditMediaPreview(null);
                          }}
                          className="select"
                          required
                        >
                          <option value="image">Image</option>
                          <option value="video">Video</option>
                          <option value="document">Document</option>
                          <option value="3d_model">3D Model</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Position</label>
                        <input
                          type="number"
                          min="0"
                          value={editForm.position}
                          onChange={e => setEditForm(prev => ({ ...prev, position: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Alt Text</label>
                        <input
                          type="text"
                          value={editForm.altText}
                          onChange={e => setEditForm(prev => ({ ...prev, altText: e.target.value }))}
                          className="input"
                          placeholder="Alternative text for accessibility"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editForm.isPrimary}
                            onChange={e => setEditForm(prev => ({ ...prev, isPrimary: e.target.checked }))}
                            className="rounded"
                          />
                          <span className="text-sm font-medium">Set as primary media</span>
                        </label>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Media File (leave empty to keep current)</label>
                        <input
                          type="file"
                          accept={editForm.type === 'image' ? 'image/*' : editForm.type === 'video' ? 'video/*' : editForm.type === 'document' ? '.pdf,.doc,.docx' : '*'}
                          onChange={handleEditFileChange}
                          className="input"
                        />
                        {editMediaFile && (
                          <p className="text-xs text-muted-foreground mt-1">New file: {editMediaFile.name} ({(editMediaFile.size / 1024 / 1024).toFixed(2)} MB)</p>
                        )}
                        {editMediaPreview && (
                          <div className="mt-2">
                            <MediaThumb url={editMediaPreview} alt="Preview" className="w-40 h-40" />
                          </div>
                        )}
                        {editing.url && !editMediaFile && editForm.type === 'image' && (
                          <div className="mt-2">
                            <p className="text-xs text-muted-foreground mb-1">Current file:</p>
                            <MediaThumb url={editing.url} alt={editing.altText || 'Current media'} className="w-40 h-40" />
                            {isLegacyStorageUrl(editing.url) && (
                              <p className="text-xs text-amber-700 mt-1">{LEGACY_STORAGE_MESSAGE} — choose a new file above to replace it.</p>
                            )}
                          </div>
                        )}
                        {editing.url && !editMediaFile && editForm.type !== 'image' && (
                          <p className="text-xs text-muted-foreground mt-1">Current file: <MediaLink url={editing.url} className="text-primary hover:underline">View</MediaLink></p>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          setEditMediaFile(null);
                          setEditMediaPreview(null);
                        }}
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
                  <p className="mb-4 text-muted-foreground">Are you sure you want to delete this product media? This action cannot be undone and will also delete the file from storage.</p>
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

