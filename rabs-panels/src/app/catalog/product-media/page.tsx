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
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, Image as ImageIcon, Download, Eye } from 'lucide-react';

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
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes: Record<string, string[]> = {
        image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
        video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
        document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        '3d_model': ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream']
      };

      const mediaType = isEdit ? editForm.type : form.type;
      const allowed = allowedTypes[mediaType] || ['*/*'];
      
      if (!allowed.includes(file.type) && !allowed.includes('*/*')) {
        toast.error(`Invalid file type for ${mediaType}. Allowed: ${allowed.join(', ')}`);
        return;
      }

      const maxSize = mediaType === 'video' ? 100 : mediaType === '3d_model' ? 50 : 10;
      if (file.size > maxSize * 1024 * 1024) {
        toast.error(`File size must be less than ${maxSize}MB`);
        return;
      }

      if (isEdit) {
        setEditMediaFile(file);
        if (mediaType === 'image') {
          const reader = new FileReader();
          reader.onloadend = () => setEditMediaPreview(reader.result as string);
          reader.readAsDataURL(file);
        } else {
          setEditMediaPreview(null);
        }
      } else {
        setMediaFile(file);
        if (mediaType === 'image') {
          const reader = new FileReader();
          reader.onloadend = () => setMediaPreview(reader.result as string);
          reader.readAsDataURL(file);
        } else {
          setMediaPreview(null);
        }
      }
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!form.catalogItemId || !form.type || !mediaFile) {
      toast.error('Please fill in required fields (Catalog Item, Type, File)');
      return;
    }
    try {
      const res = await createProductMedia({
        catalogItemId: form.catalogItemId,
        variantId: form.variantId || undefined,
        type: form.type,
        altText: form.altText || undefined,
        position: parseInt(form.position) || 0,
        isPrimary: form.isPrimary
      }, mediaFile);
      
      setItems([res.data, ...items]);
      setShowCreate(false);
      setForm({ 
        catalogItemId: '',
        variantId: '',
        type: 'image',
        altText: '',
        position: '0',
        isPrimary: false
      });
      setMediaFile(null);
      setMediaPreview(null);
      toast.success('Product media created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Create failed');
    }
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
          return (
            <div className="w-16 h-16 relative rounded overflow-hidden border border-border">
              <img 
                src={media.url} 
                alt={media.altText || 'Product media'} 
                className="w-full h-full object-cover"
              />
            </div>
          );
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
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-gray-100 rounded"
                title="View"
              >
                <Eye className="h-4 w-4" />
              </a>
            )}
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
                setEditMediaPreview(item.type === 'image' ? item.url : null);
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
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Media
              </button>
            </div>

            <RichDataTable columns={columns} data={items} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Product Media</h3>
                    <button onClick={() => {
                      setShowCreate(false);
                      setMediaFile(null);
                      setMediaPreview(null);
                    }} className="p-1 hover:bg-muted rounded-lg transition-colors">
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
                            setMediaFile(null);
                            setMediaPreview(null);
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
                        <label className="block text-sm font-medium mb-1.5">Media File *</label>
                        <input
                          type="file"
                          accept={form.type === 'image' ? 'image/*' : form.type === 'video' ? 'video/*' : form.type === 'document' ? '.pdf,.doc,.docx' : '*'}
                          onChange={(e) => handleFileChange(e, false)}
                          className="input"
                          required
                        />
                        {mediaFile && (
                          <p className="text-xs text-muted-foreground mt-1">Selected: {mediaFile.name} ({(mediaFile.size / 1024 / 1024).toFixed(2)} MB)</p>
                        )}
                        {mediaPreview && (
                          <div className="mt-2 w-full max-w-xs">
                            <img src={mediaPreview} alt="Preview" className="w-full h-auto rounded border border-border" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreate(false);
                          setMediaFile(null);
                          setMediaPreview(null);
                        }}
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
                          onChange={(e) => handleFileChange(e, true)}
                          className="input"
                        />
                        {editMediaFile && (
                          <p className="text-xs text-muted-foreground mt-1">New file: {editMediaFile.name} ({(editMediaFile.size / 1024 / 1024).toFixed(2)} MB)</p>
                        )}
                        {editMediaPreview && (
                          <div className="mt-2 w-full max-w-xs">
                            <img src={editMediaPreview} alt="Preview" className="w-full h-auto rounded border border-border" />
                          </div>
                        )}
                        {editing.url && !editMediaFile && editForm.type === 'image' && (
                          <div className="mt-2 w-full max-w-xs">
                            <p className="text-xs text-muted-foreground mb-1">Current file:</p>
                            <img src={editing.url} alt={editing.altText || 'Current media'} className="w-full h-auto rounded border border-border" />
                          </div>
                        )}
                        {editing.url && !editMediaFile && editForm.type !== 'image' && (
                          <p className="text-xs text-muted-foreground mt-1">Current file: <a href={editing.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">View</a></p>
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

