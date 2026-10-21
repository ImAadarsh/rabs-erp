'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { 
  listVariants, createVariant, updateVariant, deleteVariant,
  listCatalogItems, listProductMedia, createProductMedia, deleteProductMedia
} from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { useApiAccess } from '@/hooks/use-api-access';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, Tag, Loader2 } from 'lucide-react';
import { MediaThumb } from '@/components/catalog/media-preview';

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
  imageUrl?: string | null;
  status: 'active' | 'inactive' | 'discontinued';
  catalogItem?: {
    id: string;
    sku: string;
    name: string;
  };
  [key: string]: any;
};

type OptionRow = { name: string; values: string };

/** The variants table stores options in option1..option3 columns (also the Shopify/WooCommerce limit). */
const MAX_OPTIONS = 3;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

const emptyCreateForm = {
  catalogItemId: '',
  variantSku: '',
  name: '',
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
};

function splitValues(raw: string) {
  return Array.from(new Set(raw.split(',').map((v) => v.trim()).filter(Boolean)));
}

/** Every combination of option values, e.g. Size[S,M] x Colour[Red] -> [[S,Red],[M,Red]]. */
function cartesian(options: { name: string; values: string[] }[]): string[][] {
  return options.reduce<string[][]>(
    (acc, opt) => acc.flatMap((combo) => opt.values.map((v) => [...combo, v])),
    [[]]
  );
}

function skuPart(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function optionsToPayload(rows: OptionRow[], values: string[]) {
  const payload: Record<string, string> = {};
  for (let i = 0; i < MAX_OPTIONS; i++) {
    payload[`option${i + 1}Name`] = rows[i]?.name.trim() ?? '';
    payload[`option${i + 1}Value`] = values[i] ?? '';
  }
  return payload as {
    option1Name: string; option1Value: string;
    option2Name: string; option2Value: string;
    option3Name: string; option3Value: string;
  };
}

function optionRowsFromVariant(v: Variant): OptionRow[] {
  const rows: OptionRow[] = [];
  for (let i = 1; i <= MAX_OPTIONS; i++) {
    const name = (v[`option${i}Name`] as string | null) ?? '';
    const value = (v[`option${i}Value`] as string | null) ?? '';
    if (name || value) rows.push({ name, values: value });
  }
  return rows.length ? rows : [{ name: '', values: '' }];
}

function pickImages(e: React.ChangeEvent<HTMLInputElement>): File[] {
  const files = Array.from(e.target.files ?? []);
  e.target.value = '';
  return files.filter((file) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error(`${file.name}: please upload an image (JPEG, PNG, WebP, GIF, or SVG)`);
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(`${file.name}: file size must be less than 5MB`);
      return false;
    }
    return true;
  });
}

function OptionRowsEditor({
  rows,
  onChange,
  multiValue
}: {
  rows: OptionRow[];
  onChange: (rows: OptionRow[]) => void;
  multiValue: boolean;
}) {
  const update = (i: number, patch: Partial<OptionRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium">Options</label>
        <button
          type="button"
          className="btn btn-outline text-xs inline-flex items-center gap-1"
          disabled={rows.length >= MAX_OPTIONS}
          onClick={() => onChange([...rows, { name: '', values: '' }])}
          title={rows.length >= MAX_OPTIONS ? `Up to ${MAX_OPTIONS} option types per variant` : undefined}
        >
          <Plus className="h-3 w-3" /> Add option
        </button>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
          <input
            type="text"
            value={row.name}
            onChange={(e) => update(i, { name: e.target.value })}
            className="input"
            placeholder={i === 0 ? 'e.g., Size' : i === 1 ? 'e.g., Colour' : 'e.g., Material'}
          />
          <input
            type="text"
            value={row.values}
            onChange={(e) => update(i, { values: e.target.value })}
            className="input"
            placeholder={multiValue ? 'Comma-separated, e.g., Small, Medium, Large' : 'e.g., Large'}
          />
          <button
            type="button"
            onClick={() => onChange(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : [{ name: '', values: '' }])}
            className="p-1 hover:bg-muted rounded text-red-600"
            title="Remove option"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        {multiValue
          ? `Enter several values separated by commas to generate one variant per combination (up to ${MAX_OPTIONS} option types).`
          : `Up to ${MAX_OPTIONS} option types per variant.`}
      </p>
    </div>
  );
}

function ImagePicker({
  files,
  onChange,
  existing,
  onRemoveExisting
}: {
  files: File[];
  onChange: (files: File[]) => void;
  existing?: { id: string; url: string }[];
  onRemoveExisting?: (id: string) => void;
}) {
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p)), [previews]);
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        Variant Images <span className="text-xs font-normal text-muted-foreground">(select one or more; the first becomes the main image)</span>
      </label>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => onChange([...files, ...pickImages(e)])}
        className="input"
      />
      {((existing?.length ?? 0) > 0 || files.length > 0) && (
        <div className="mt-2 grid grid-cols-5 gap-2">
          {existing?.map((m) => (
            <div key={m.id} className="relative">
              <MediaThumb url={m.url} className="w-full aspect-square" />
              {onRemoveExisting && (
                <button
                  type="button"
                  onClick={() => onRemoveExisting(m.id)}
                  className="absolute top-1 right-1 rounded bg-black/70 text-white p-0.5 hover:bg-red-600"
                  title="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {previews.map((src, i) => (
            <div key={src} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`New image ${i + 1}`} className="w-full aspect-square object-cover rounded border" />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                className="absolute top-1 right-1 rounded bg-black/70 text-white p-0.5 hover:bg-red-600"
                title="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VariantsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP']);
  const { can } = useApiAccess();
  const canCreate = can('POST', '/api/catalog/variants');
  const canUpdate = can('PATCH', '/api/catalog/variants/:id');
  const canDelete = can('DELETE', '/api/catalog/variants/:id');
  const canAddMedia = can('POST', '/api/catalog/media');
  const canDeleteMedia = can('DELETE', '/api/catalog/media/:id');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Variant[]>([]);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyCreateForm);
  const [optionRows, setOptionRows] = useState<OptionRow[]>([{ name: '', values: '' }]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState<Variant | null>(null);
  const [editForm, setEditForm] = useState({
    variantSku: '',
    name: '',
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
  const [editOptionRows, setEditOptionRows] = useState<OptionRow[]>([{ name: '', values: '' }]);
  const [editImageFiles, setEditImageFiles] = useState<File[]>([]);
  const [editGallery, setEditGallery] = useState<{ id: string; url: string }[]>([]);
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

  const parsedOptions = useMemo(
    () => optionRows.map((r) => ({ name: r.name.trim(), values: splitValues(r.values) })).filter((o) => o.values.length > 0),
    [optionRows]
  );

  const plannedVariants = useMemo(() => {
    const combos = cartesian(parsedOptions);
    const base = form.variantSku.trim();
    return combos.map((values) => ({
      values,
      sku: combos.length > 1 && values.length ? [base, ...values.map(skuPart)].filter(Boolean).join('-') : base,
      name:
        combos.length > 1 && values.length
          ? [form.name.trim(), values.join(' / ')].filter(Boolean).join(' - ')
          : form.name.trim()
    }));
  }, [parsedOptions, form.variantSku, form.name]);

  function openCreate() {
    setForm(emptyCreateForm);
    setOptionRows([{ name: '', values: '' }]);
    setImageFiles([]);
    setShowCreate(true);
  }

  async function uploadGallery(variant: Variant, catalogItemId: string, files: File[], startPosition: number) {
    let failed = 0;
    for (const [i, file] of files.entries()) {
      try {
        await createProductMedia({ catalogItemId, variantId: variant.id, type: 'image', position: startPosition + i }, file);
      } catch {
        failed += 1;
      }
    }
    return failed;
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.catalogItemId || !form.variantSku) {
      toast.error('Please fill in required fields (Catalog Item, Variant SKU)');
      return;
    }
    if (parsedOptions.some((o) => !o.name)) {
      toast.error('Every option with values needs a name (e.g., Size)');
      return;
    }
    const rowsForPayload = optionRows.filter((r) => splitValues(r.values).length > 0);
    const [mainImage, ...extraImages] = imageFiles;
    setSaving(true);
    const created: Variant[] = [];
    const errors: string[] = [];
    let galleryFailures = 0;
    for (const [idx, plan] of plannedVariants.entries()) {
      try {
        const res = await createVariant({
          catalogItemId: form.catalogItemId,
          variantSku: plan.sku,
          name: plan.name || undefined,
          ...optionsToPayload(rowsForPayload, plan.values),
          weightValue: form.weightValue ? parseFloat(form.weightValue) : undefined,
          weightUnit: form.weightUnit,
          lengthValue: form.lengthValue ? parseFloat(form.lengthValue) : undefined,
          widthValue: form.widthValue ? parseFloat(form.widthValue) : undefined,
          heightValue: form.heightValue ? parseFloat(form.heightValue) : undefined,
          dimensionUnit: form.dimensionUnit,
          costPrice: form.costPrice ? parseFloat(form.costPrice) : undefined,
          costCurrency: form.costCurrency,
          position: (parseInt(form.position) || 0) + idx,
          status: form.status
        }, mainImage);
        created.push(res.data);
        if (extraImages.length) {
          galleryFailures += await uploadGallery(res.data, form.catalogItemId, extraImages, 1);
        }
      } catch (err: any) {
        errors.push(`${plan.sku}: ${err?.response?.data?.error?.message ?? 'create failed'}`);
      }
    }
    setSaving(false);
    if (created.length) {
      setItems(prev => [...created, ...prev]);
      toast.success(created.length === 1 ? 'Variant created' : `${created.length} variants created`);
    }
    if (galleryFailures) toast.error(`${galleryFailures} additional image(s) failed to upload`);
    if (errors.length) {
      toast.error(errors.join('\n'));
      return;
    }
    setShowCreate(false);
    setForm(emptyCreateForm);
    setOptionRows([{ name: '', values: '' }]);
    setImageFiles([]);
  }

  async function openEdit(item: Variant) {
    setEditing(item);
    setEditForm({
      variantSku: item.variantSku,
      name: item.name || '',
      weightValue: item.weightValue != null ? String(Number(item.weightValue)) : '',
      weightUnit: item.weightUnit || 'kg',
      lengthValue: item.lengthValue != null ? String(Number(item.lengthValue)) : '',
      widthValue: item.widthValue != null ? String(Number(item.widthValue)) : '',
      heightValue: item.heightValue != null ? String(Number(item.heightValue)) : '',
      dimensionUnit: item.dimensionUnit || 'cm',
      costPrice: item.costPrice != null ? String(Number(item.costPrice)) : '',
      costCurrency: item.costCurrency || 'GBP',
      position: item.position?.toString() || '0',
      status: item.status
    });
    setEditOptionRows(optionRowsFromVariant(item));
    setEditImageFiles([]);
    setEditGallery([]);
    try {
      const res = await listProductMedia({ variantId: item.id, type: 'image' });
      setEditGallery((res.data || []).map((m: any) => ({ id: m.id, url: m.url })));
    } catch {
      setEditGallery([]);
    }
  }

  function closeEdit() {
    setEditing(null);
    setEditImageFiles([]);
    setEditGallery([]);
  }

  async function onRemoveGalleryImage(id: string) {
    try {
      await deleteProductMedia(id);
      setEditGallery(prev => prev.filter(m => m.id !== id));
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to remove image');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const rows = editOptionRows.filter((r) => r.name.trim() || r.values.trim());
    if (rows.some((r) => r.values.trim() && !r.name.trim())) {
      toast.error('Every option with a value needs a name');
      return;
    }
    const [mainImage, ...extraImages] = editImageFiles;
    setSaving(true);
    try {
      const res = await updateVariant(editing.id, {
        variantSku: editForm.variantSku,
        name: editForm.name,
        ...optionsToPayload(rows, rows.map((r) => r.values.trim())),
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
      }, mainImage);
      const catalogItemId = editing.catalogItem?.id ?? res.data?.catalogItem?.id;
      let galleryFailures = 0;
      if (extraImages.length && catalogItemId) {
        galleryFailures = await uploadGallery(res.data, catalogItemId, extraImages, editGallery.length + 1);
      }
      setItems(items.map(item => item.id === editing.id ? res.data : item));
      closeEdit();
      toast.success('Variant updated');
      if (galleryFailures) toast.error(`${galleryFailures} additional image(s) failed to upload`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Update failed');
    } finally {
      setSaving(false);
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
      id: 'image',
      header: 'Image',
      cell: ({ row }) => <MediaThumb url={row.original.imageUrl} className="w-10 h-10" />
    },
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
            {canUpdate && (
            <button
              onClick={() => openEdit(item)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <Pencil className="h-4 w-4" />
            </button>
            )}
            {canDelete && (
            <button
              onClick={() => setConfirmDel(item)}
              className="p-1 hover:bg-gray-100 rounded text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            )}
          </div>
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [canUpdate, canDelete]);

  const physicalFields = (
    f: typeof editForm | typeof form,
    set: (patch: Partial<typeof emptyCreateForm>) => void
  ) => (
    <div className="border-t border-border pt-4 mt-4">
      <h4 className="text-sm font-semibold mb-3">Physical Properties</h4>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Weight Value</label>
          <input type="number" step="0.0001" value={f.weightValue} onChange={e => set({ weightValue: e.target.value })} className="select" placeholder="0.0000" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Weight Unit</label>
          <select value={f.weightUnit} onChange={e => set({ weightUnit: e.target.value as any })} className="select">
            <option value="g">g</option>
            <option value="kg">kg</option>
            <option value="lb">lb</option>
            <option value="oz">oz</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Length</label>
          <input type="number" step="0.01" value={f.lengthValue} onChange={e => set({ lengthValue: e.target.value })} className="select" placeholder="0.00" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Width</label>
          <input type="number" step="0.01" value={f.widthValue} onChange={e => set({ widthValue: e.target.value })} className="select" placeholder="0.00" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Height</label>
          <input type="number" step="0.01" value={f.heightValue} onChange={e => set({ heightValue: e.target.value })} className="select" placeholder="0.00" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Dimension Unit</label>
          <select value={f.dimensionUnit} onChange={e => set({ dimensionUnit: e.target.value as any })} className="select">
            <option value="cm">cm</option>
            <option value="m">m</option>
            <option value="in">in</option>
            <option value="ft">ft</option>
          </select>
        </div>
      </div>
    </div>
  );

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
              {canCreate && (
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Variant
              </button>
              )}
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
                      <div className="col-span-2">
                        <OptionRowsEditor rows={optionRows} onChange={setOptionRows} multiValue />
                        {plannedVariants.length > 1 && (
                          <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2 text-xs">
                            <div className="font-medium mb-1">{plannedVariants.length} variants will be created:</div>
                            <ul className="max-h-28 overflow-y-auto font-mono space-y-0.5">
                              {plannedVariants.map(p => (
                                <li key={p.sku}>{p.sku} — {p.values.join(' / ')}</li>
                              ))}
                            </ul>
                          </div>
                        )}
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
                    {physicalFields(form, (patch) => setForm(prev => ({ ...prev, ...patch })))}
                    {canAddMedia && <ImagePicker files={imageFiles} onChange={setImageFiles} />}
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
                        disabled={saving}
                        className="btn btn-primary inline-flex items-center gap-2"
                      >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {plannedVariants.length > 1 ? `Create ${plannedVariants.length} variants` : 'Create'}
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
                    <button onClick={closeEdit} className="p-1 hover:bg-muted rounded-lg transition-colors">
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
                      <div className="col-span-2">
                        <OptionRowsEditor rows={editOptionRows} onChange={setEditOptionRows} multiValue={false} />
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
                    {physicalFields(editForm, (patch) => setEditForm(prev => ({ ...prev, ...patch })))}
                    {editing.imageUrl && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Current main image (choosing new images replaces it with the first one):</p>
                        <MediaThumb url={editing.imageUrl} className="w-24 h-24" />
                      </div>
                    )}
                    {canAddMedia && (
                    <ImagePicker
                      files={editImageFiles}
                      onChange={setEditImageFiles}
                      existing={editGallery}
                      onRemoveExisting={canDeleteMedia ? onRemoveGalleryImage : undefined}
                    />
                    )}
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                      <button
                        type="button"
                        onClick={closeEdit}
                        className="btn btn-outline"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="btn btn-primary inline-flex items-center gap-2"
                      >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
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
