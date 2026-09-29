'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { 
  listVariants, createVariant, updateVariant, deleteVariant,
  listCatalogItems
} from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Trash2, Plus, X, Tag } from 'lucide-react';

type Variant = {
  id: string;
  variantSku: string;
  name?: string | null;
  option1Name?: string | null;
  option1Value?: string | null;
  option2Name?: string | null;
  option2Value?: string | null;
  option3Name?: string | null;
  option3Value?: string | null;
  costPrice?: number | null;
  costCurrency: string;
  status: 'active' | 'inactive' | 'discontinued';
  catalogItem?: {
    id: string;
    sku: string;
    name: string;
  };
  [key: string]: any;
};

export default function VariantsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Variant[]>([]);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ 
    catalogItemId: '',
    variantSku: '',
    name: '',
    option1Name: '',
    option1Value: '',
    option2Name: '',
    option2Value: '',
    option3Name: '',
    option3Value: '',
    weightValue: '',
    weightUnit: 'kg' as 'g' | 'kg' | 'lb' | 'oz',
    lengthValue: '',
    widthValue: '',
    heightValue: '',
    dimensionUnit: 'cm' as 'cm' | 'm' | 'in' | 'ft',
    costPrice: '',
    costCurrency: 'GBP',
    position: '0',
    status: 'active' as 'active' | 'inactive' | 'discontinued'
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [editing, setEditing] = useState<Variant | null>(null);
  const [editForm, setEditForm] = useState({
    variantSku: '',
    name: '',
    option1Name: '',
    option1Value: '',
    option2Name: '',
    option2Value: '',
    option3Name: '',
    option3Value: '',
    weightValue: '',
    weightUnit: 'kg' as 'g' | 'kg' | 'lb' | 'oz',
    lengthValue: '',
    widthValue: '',
    heightValue: '',
    dimensionUnit: 'cm' as 'cm' | 'm' | 'in' | 'ft',
    costPrice: '',
    costCurrency: 'GBP',
    position: '0',
    status: 'active' as 'active' | 'inactive' | 'discontinued'
  });
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Variant | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [variantsRes, catalogItemsRes] = await Promise.all([
          listVariants(),
          listCatalogItems({ organizationId: session?.user?.organizationId })
        ]);
        setItems(variantsRes.data || []);
        setCatalogItems(catalogItemsRes.data || []);
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 403) {
          toast.error('You do not have permission to view variants.');
        } else if (status === 401) {
          toast.error('Session expired. Please login again.');
          router.replace('/login');
        } else {
          toast.error('Failed to load variants');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.catalogItemId || !form.variantSku) {
      toast.error('Please fill in required fields (Catalog Item, Variant SKU)');
      return;
    }
    try {
      const res = await createVariant({
        catalogItemId: form.catalogItemId,
        variantSku: form.variantSku,
        name: form.name || undefined,
        option1Name: form.option1Name || undefined,
        option1Value: form.option1Value || undefined,
        option2Name: form.option2Name || undefined,
        option2Value: form.option2Value || undefined,
        option3Name: form.option3Name || undefined,
        option3Value: form.option3Value || undefined,
        weightValue: form.weightValue ? parseFloat(form.weightValue) : undefined,
        weightUnit: form.weightUnit,
        lengthValue: form.lengthValue ? parseFloat(form.lengthValue) : undefined,
        widthValue: form.widthValue ? parseFloat(form.widthValue) : undefined,
        heightValue: form.heightValue ? parseFloat(form.heightValue) : undefined,
        dimensionUnit: form.dimensionUnit,
        costPrice: form.costPrice ? parseFloat(form.costPrice) : undefined,
        costCurrency: form.costCurrency,
        position: parseInt(form.position) || 0,
        status: form.status
      }, imageFile || undefined);
      
      setItems([res.data, ...items]);
      setShowCreate(false);
      setForm({ 
        catalogItemId: '',
        variantSku: '',
        name: '',
        option1Name: '',
        option1Value: '',
        option2Name: '',
        option2Value: '',
        option3Name: '',
        option3Value: '',
        weightValue: '',
        weightUnit: 'kg',
        lengthValue: '',
        widthValue: '',
        heightValue: '',
        dimensionUnit: 'cm',
        costPrice: '',
        costCurrency: 'GBP',
        position: '0',
        status: 'active'
      });
      setImageFile(null);
      setImagePreview(null);
      toast.success('Variant created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Create failed');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const res = await updateVariant(editing.id, {
        variantSku: editForm.variantSku,
        name: editForm.name || undefined,
        option1Name: editForm.option1Name || undefined,
        option1Value: editForm.option1Value || undefined,
        option2Name: editForm.option2Name || undefined,
        option2Value: editForm.option2Value || undefined,
        option3Name: editForm.option3Name || undefined,
        option3Value: editForm.option3Value || undefined,
        weightValue: editForm.weightValue ? parseFloat(editForm.weightValue) : undefined,
        weightUnit: editForm.weightUnit,
        lengthValue: editForm.lengthValue ? parseFloat(editForm.lengthValue) : undefined,
        widthValue: editForm.widthValue ? parseFloat(editForm.widthValue) : undefined,
        heightValue: editForm.heightValue ? parseFloat(editForm.heightValue) : undefined,
        dimensionUnit: editForm.dimensionUnit,
        costPrice: editForm.costPrice ? parseFloat(editForm.costPrice) : undefined,
        costCurrency: editForm.costCurrency,
        position: parseInt(editForm.position) || 0,
        status: editForm.status
      }, editImageFile || undefined);
      
      setItems(items.map(item => item.id === editing.id ? res.data : item));
      setEditing(null);
      setEditImageFile(null);
      setEditImagePreview(null);
      toast.success('Variant updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Update failed');
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Invalid file type. Please upload an image (JPEG, PNG, WebP, GIF, or SVG)');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }
      if (isEdit) {
        setEditImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setEditImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteVariant(confirmDel.id);
      setItems(items.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Variant deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Delete failed');
    }
  }

  const columns = useMemo<ColumnDef<Variant>[]>(() => [
    {
      accessorKey: 'variantSku',
      header: 'Variant SKU',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.variantSku}</span>
    },
    {
      accessorKey: 'catalogItem',
      header: 'Product',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.catalogItem?.name || '-'}</div>
          <div className="text-xs text-muted-foreground">{row.original.catalogItem?.sku || '-'}</div>
        </div>
      )
    },
    {
      accessorKey: 'options',
      header: 'Options',
      cell: ({ row }) => {
        const v = row.original;
        const options = [];
        if (v.option1Value) options.push(`${v.option1Name || 'Option 1'}: ${v.option1Value}`);
        if (v.option2Value) options.push(`${v.option2Name || 'Option 2'}: ${v.option2Value}`);
        if (v.option3Value) options.push(`${v.option3Name || 'Option 3'}: ${v.option3Value}`);
        return options.length > 0 ? (
          <div className="text-sm">{options.join(', ')}</div>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      }
    },
    {
      accessorKey: 'costPrice',
      header: 'Cost Price',
      cell: ({ row }) => {
        const price = row.original.costPrice;
        const numPrice = typeof price === 'number' ? price : (price != null ? parseFloat(String(price)) : NaN);
        return price != null && !isNaN(numPrice) ? (
          <span>{row.original.costCurrency} {numPrice.toFixed(2)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      }
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status;
        const colors = {
          active: 'bg-green-100 text-green-800',
          inactive: 'bg-gray-100 text-gray-800',
          discontinued: 'bg-red-100 text-red-800'
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
                  variantSku: item.variantSku,
                  name: item.name || '',
                  option1Name: item.option1Name || '',
                  option1Value: item.option1Value || '',
                  option2Name: item.option2Name || '',
                  option2Value: item.option2Value || '',
                  option3Name: item.option3Name || '',
                  option3Value: item.option3Value || '',
                  weightValue: item.weightValue?.toString() || '',
                  weightUnit: item.weightUnit || 'kg',
                  lengthValue: item.lengthValue?.toString() || '',
                  widthValue: item.widthValue?.toString() || '',
                  heightValue: item.heightValue?.toString() || '',
                  dimensionUnit: item.dimensionUnit || 'cm',
                  costPrice: item.costPrice?.toString() || '',
                  costCurrency: item.costCurrency,
                  position: item.position?.toString() || '0',
                  status: item.status
                });
                setEditImagePreview(item.imageUrl || null);
                setEditImageFile(null);
              }}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setConfirmDel(item)}
              className="p-1 hover:bg-gray-100 rounded text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      }
    }
  ], []);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Catalog · Variants" />
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
          <Header title="Catalog · Variants" />
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
        <Header title="Catalog · Variants" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <Tag className="h-8 w-8" />
                  Variants
                </h1>
                <p className="text-muted-foreground mt-1">Manage product variants</p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Variant
              </button>
            </div>

            <RichDataTable columns={columns} data={items} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Variant</h3>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Catalog Item *</label>
                        <select
                          value={form.catalogItemId}
                          onChange={e => setForm(prev => ({ ...prev, catalogItemId: e.target.value }))}
                          className="select"
                          required
                        >
                          <option value="">Select...</option>
                          {catalogItems.map(item => (
                            <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Variant SKU *</label>
                        <input
                          type="text"
                          value={form.variantSku}
                          onChange={e => setForm(prev => ({ ...prev, variantSku: e.target.value }))}
                          className="select"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Name</label>
                        <input
                          type="text"
                          value={form.name}
                          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                          className="select"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="select"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="discontinued">Discontinued</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Option 1 Name</label>
                        <input
                          type="text"
                          value={form.option1Name}
                          onChange={e => setForm(prev => ({ ...prev, option1Name: e.target.value }))}
                          className="select"
                          placeholder="e.g., Size"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Option 1 Value</label>
                        <input
                          type="text"
                          value={form.option1Value}
                          onChange={e => setForm(prev => ({ ...prev, option1Value: e.target.value }))}
                          className="select"
                          placeholder="e.g., Large"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Option 2 Name</label>
                        <input
                          type="text"
                          value={form.option2Name}
                          onChange={e => setForm(prev => ({ ...prev, option2Name: e.target.value }))}
                          className="select"
                          placeholder="e.g., Color"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Option 2 Value</label>
                        <input
                          type="text"
                          value={form.option2Value}
                          onChange={e => setForm(prev => ({ ...prev, option2Value: e.target.value }))}
                          className="select"
                          placeholder="e.g., Red"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Cost Price</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.costPrice}
                          onChange={e => setForm(prev => ({ ...prev, costPrice: e.target.value }))}
                          className="select"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Currency</label>
                        <select
                          value={form.costCurrency}
                          onChange={e => setForm(prev => ({ ...prev, costCurrency: e.target.value }))}
                          className="select"
                        >
                          <option value="GBP">GBP</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Position</label>
                        <input
                          type="number"
                          value={form.position}
                          onChange={e => setForm(prev => ({ ...prev, position: e.target.value }))}
                          className="select"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className="border-t border-border pt-4 mt-4">
                      <h4 className="text-sm font-semibold mb-3">Physical Properties</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Weight Value</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={form.weightValue}
                            onChange={e => setForm(prev => ({ ...prev, weightValue: e.target.value }))}
                            className="select"
                            placeholder="0.0000"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Weight Unit</label>
                          <select
                            value={form.weightUnit}
                            onChange={e => setForm(prev => ({ ...prev, weightUnit: e.target.value as any }))}
                            className="select"
                          >
                            <option value="g">g</option>
                            <option value="kg">kg</option>
                            <option value="lb">lb</option>
                            <option value="oz">oz</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Length</label>
                          <input
                            type="number"
                            step="0.01"
                            value={form.lengthValue}
                            onChange={e => setForm(prev => ({ ...prev, lengthValue: e.target.value }))}
                            className="select"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Width</label>
                          <input
                            type="number"
                            step="0.01"
                            value={form.widthValue}
                            onChange={e => setForm(prev => ({ ...prev, widthValue: e.target.value }))}
                            className="select"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Height</label>
                          <input
                            type="number"
                            step="0.01"
                            value={form.heightValue}
                            onChange={e => setForm(prev => ({ ...prev, heightValue: e.target.value }))}
                            className="select"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Dimension Unit</label>
                          <select
                            value={form.dimensionUnit}
                            onChange={e => setForm(prev => ({ ...prev, dimensionUnit: e.target.value as any }))}
                            className="select"
                          >
                            <option value="cm">cm</option>
                            <option value="m">m</option>
                            <option value="in">in</option>
                            <option value="ft">ft</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Variant Image</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageChange(e, false)}
                        className="input"
                      />
                      {imagePreview && (
                        <div className="mt-2">
                          <img src={imagePreview} alt="Preview" className="w-32 h-32 object-cover rounded border" />
                        </div>
                      )}
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
                    <h3 className="text-lg font-semibold">Edit Variant</h3>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Variant SKU *</label>
                        <input
                          type="text"
                          value={editForm.variantSku}
                          onChange={e => setEditForm(prev => ({ ...prev, variantSku: e.target.value }))}
                          className="select"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Name</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                          className="select"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Option 1 Name</label>
                        <input
                          type="text"
                          value={editForm.option1Name}
                          onChange={e => setEditForm(prev => ({ ...prev, option1Name: e.target.value }))}
                          className="select"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Option 1 Value</label>
                        <input
                          type="text"
                          value={editForm.option1Value}
                          onChange={e => setEditForm(prev => ({ ...prev, option1Value: e.target.value }))}
                          className="select"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Cost Price</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.costPrice}
                          onChange={e => setEditForm(prev => ({ ...prev, costPrice: e.target.value }))}
                          className="select"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Currency</label>
                        <select
                          value={editForm.costCurrency}
                          onChange={e => setEditForm(prev => ({ ...prev, costCurrency: e.target.value }))}
                          className="select"
                        >
                          <option value="GBP">GBP</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Position</label>
                        <input
                          type="number"
                          value={editForm.position}
                          onChange={e => setEditForm(prev => ({ ...prev, position: e.target.value }))}
                          className="select"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Status</label>
                        <select
                          value={editForm.status}
                          onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="select"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="discontinued">Discontinued</option>
                        </select>
                      </div>
                    </div>
                    <div className="border-t border-border pt-4 mt-4">
                      <h4 className="text-sm font-semibold mb-3">Physical Properties</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Weight Value</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={editForm.weightValue}
                            onChange={e => setEditForm(prev => ({ ...prev, weightValue: e.target.value }))}
                            className="select"
                            placeholder="0.0000"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Weight Unit</label>
                          <select
                            value={editForm.weightUnit}
                            onChange={e => setEditForm(prev => ({ ...prev, weightUnit: e.target.value as any }))}
                            className="select"
                          >
                            <option value="g">g</option>
                            <option value="kg">kg</option>
                            <option value="lb">lb</option>
                            <option value="oz">oz</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Length</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.lengthValue}
                            onChange={e => setEditForm(prev => ({ ...prev, lengthValue: e.target.value }))}
                            className="select"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Width</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.widthValue}
                            onChange={e => setEditForm(prev => ({ ...prev, widthValue: e.target.value }))}
                            className="select"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Height</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.heightValue}
                            onChange={e => setEditForm(prev => ({ ...prev, heightValue: e.target.value }))}
                            className="select"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Dimension Unit</label>
                          <select
                            value={editForm.dimensionUnit}
                            onChange={e => setEditForm(prev => ({ ...prev, dimensionUnit: e.target.value as any }))}
                            className="select"
                          >
                            <option value="cm">cm</option>
                            <option value="m">m</option>
                            <option value="in">in</option>
                            <option value="ft">ft</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Variant Image</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageChange(e, true)}
                        className="input"
                      />
                      {(editImagePreview || editing?.imageUrl) && (
                        <div className="mt-2">
                          <img src={editImagePreview || editing?.imageUrl || ''} alt="Preview" className="w-32 h-32 object-cover rounded border" />
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          setEditImageFile(null);
                          setEditImagePreview(null);
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
                  <p className="mb-4 text-muted-foreground">Are you sure you want to delete variant "{confirmDel.variantSku}"? This action cannot be undone.</p>
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

