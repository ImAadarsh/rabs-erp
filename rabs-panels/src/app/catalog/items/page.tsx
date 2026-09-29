'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import {
  listCatalogItems,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  listOrganizations,
  listBusinessUnits,
  listTaxCodes,
  listProductMedia,
  createProductMedia,
  deleteProductMedia
} from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, Upload, Loader2, ImageIcon, Star } from 'lucide-react';
import Link from 'next/link';

type CatalogItem = {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  subCategory?: string | null;
  brand?: string | null;
  uom?: string | null;
  packSize?: string | null;
  costPrice?: number | null;
  sellingPrice?: number | null;
  currency?: string | null;
  supplierSku?: string | null;
  leadTimeDays?: number | null;
  remarks?: string | null;
  attributes?: Record<string, any> | null;
  status: 'active' | 'inactive' | 'discontinued';
  createdAt?: string;
  taxCode?: { id: string; code: string; name: string; rate: number } | null;
  organization?: { id: string; name: string };
  businessUnit?: { id: string; name: string } | null;
  barcode?: string | null;
  openingQuantity?: number | null;
  reorderLevel?: number | null;
  reorderQuantity?: number | null;
  warehouseName?: string | null;
  binCode?: string | null;
  supplierName?: string | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
};

type ProductForm = {
  organizationId: string;
  businessUnitId: string;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  category: string;
  subCategory: string;
  brand: string;
  uom: string;
  packSize: string;
  openingQuantity: string;
  reorderLevel: string;
  reorderQuantity: string;
  costPrice: string;
  sellingPrice: string;
  currency: string;
  taxCodeId: string;
  warehouseName: string;
  binCode: string;
  supplierName: string;
  supplierSku: string;
  leadTimeDays: string;
  lotNumber: string;
  expiryDate: string;
  status: 'active' | 'inactive' | 'discontinued';
  remarks: string;
  attributes: string;
};

const emptyForm: ProductForm = {
  organizationId: '',
  businessUnitId: '',
  sku: '',
  barcode: '',
  name: '',
  description: '',
  category: '',
  subCategory: '',
  brand: '',
  uom: '',
  packSize: '',
  openingQuantity: '',
  reorderLevel: '',
  reorderQuantity: '',
  costPrice: '',
  sellingPrice: '',
  currency: 'GBP',
  taxCodeId: '',
  warehouseName: '',
  binCode: '',
  supplierName: '',
  supplierSku: '',
  leadTimeDays: '',
  lotNumber: '',
  expiryDate: '',
  status: 'active',
  remarks: '',
  attributes: ''
};

/** Attribute keys that have dedicated inputs, so they stay out of the JSON box. */
const MANAGED_ATTRIBUTE_KEYS = ['supplierName', 'warehouseName', 'binCode', 'lotNumber'];

function num(v: string) {
  return v.trim() === '' ? undefined : Number(v);
}

function int(v: string) {
  return v.trim() === '' ? undefined : parseInt(v, 10);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{children}</h4>
  );
}

function ProductFields({
  value,
  onChange,
  includeOrg,
  organizations,
  businessUnits,
  taxCodes
}: {
  value: ProductForm;
  onChange: (next: ProductForm) => void;
  includeOrg?: boolean;
  organizations: any[];
  businessUnits: any[];
  taxCodes: any[];
}) {
  const set = (patch: Partial<ProductForm>) => onChange({ ...value, ...patch });

  const field = (
    label: string,
    key: keyof ProductForm,
    opts: { type?: string; step?: string; placeholder?: string; maxLength?: number } = {}
  ) => (
    <label className="text-sm">
      {label}
      <input
        type={opts.type ?? 'text'}
        step={opts.step}
        maxLength={opts.maxLength}
        placeholder={opts.placeholder}
        className="mt-1 input w-full"
        value={value[key] as string}
        onChange={(e) => set({ [key]: e.target.value } as Partial<ProductForm>)}
      />
    </label>
  );

  return (
    <div className="space-y-5">
      {includeOrg && (
        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm">
            Organization *
            <select
              className="mt-1 select w-full"
              value={value.organizationId}
              onChange={(e) => set({ organizationId: e.target.value })}
              required
            >
              <option value="">Select…</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Business Unit
            <select
              className="mt-1 select w-full"
              value={value.businessUnitId}
              onChange={(e) => set({ businessUnitId: e.target.value })}
            >
              <option value="">None</option>
              {businessUnits.map((bu) => (
                <option key={bu.id} value={bu.id}>
                  {bu.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <section>
        <SectionTitle>Identity</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm">
            SKU / Item Code *
            <input
              className="mt-1 input w-full"
              value={value.sku}
              onChange={(e) => set({ sku: e.target.value })}
              required
            />
          </label>
          {field('Barcode / UPC', 'barcode', { placeholder: 'EAN-13 / UPC-A' })}
          <label className="text-sm col-span-2">
            Product Name *
            <input
              className="mt-1 input w-full"
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
              required
            />
          </label>
          <label className="text-sm col-span-2">
            Description
            <textarea
              className="mt-1 input w-full"
              rows={2}
              value={value.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </label>
        </div>
      </section>

      <section>
        <SectionTitle>Classification</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          {field('Category', 'category')}
          {field('Sub-Category', 'subCategory')}
          {field('Brand / Manufacturer', 'brand')}
          {field('Unit of Measure (UOM)', 'uom', { placeholder: 'SET, PCS, BOX…' })}
          {field('Pack Size', 'packSize', { placeholder: '1, 12x330ml…' })}
          <label className="text-sm">
            Status
            <select
              className="mt-1 select w-full"
              value={value.status}
              onChange={(e) => set({ status: e.target.value as ProductForm['status'] })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </label>
        </div>
      </section>

      <section>
        <SectionTitle>Pricing &amp; Tax</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          {field('Unit Cost Price', 'costPrice', { type: 'number', step: '0.0001' })}
          {field('Unit Selling Price', 'sellingPrice', { type: 'number', step: '0.0001' })}
          {field('Currency', 'currency', { maxLength: 3 })}
          <label className="text-sm">
            Tax / GST %
            <select
              className="mt-1 select w-full"
              value={value.taxCodeId}
              onChange={(e) => set({ taxCodeId: e.target.value })}
            >
              <option value="">None</option>
              {taxCodes.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.code} · {Math.round(Number(tc.rate) * 100)}%
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section>
        <SectionTitle>Inventory &amp; Warehouse</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          {field('Opening Quantity', 'openingQuantity', { type: 'number' })}
          {field('Reorder Level', 'reorderLevel', { type: 'number' })}
          {field('Reorder Quantity', 'reorderQuantity', { type: 'number' })}
          {field('Warehouse / Location', 'warehouseName', { placeholder: 'Unit 1-2 Chepstow House, ST1 5AJ' })}
          {field('Bin / Rack No.', 'binCode')}
          {field('Batch / Lot No.', 'lotNumber')}
          {field('Expiry Date', 'expiryDate', { type: 'date' })}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Stored on this product&apos;s stock record. Missing warehouses, bins and suppliers are created automatically.
        </p>
      </section>

      <section>
        <SectionTitle>Supplier</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          {field('Supplier Name', 'supplierName')}
          {field('Supplier SKU', 'supplierSku')}
          {field('Lead Time (Days)', 'leadTimeDays', { type: 'number' })}
        </div>
      </section>

      <section>
        <SectionTitle>Notes</SectionTitle>
        <div className="grid grid-cols-1 gap-4">
          <label className="text-sm">
            Remarks
            <textarea
              className="mt-1 input w-full"
              rows={2}
              value={value.remarks}
              onChange={(e) => set({ remarks: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Extra attributes (JSON key/value)
            <textarea
              className="mt-1 input w-full font-mono text-xs"
              rows={3}
              placeholder='{"colour":"black","hsCode":"1234.56"}'
              value={value.attributes}
              onChange={(e) => set({ attributes: e.target.value })}
            />
          </label>
        </div>
      </section>
    </div>
  );
}

export default function CatalogItemsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [taxCodes, setTaxCodes] = useState<any[]>([]);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [editForm, setEditForm] = useState<ProductForm>(emptyForm);
  const [confirmDel, setConfirmDel] = useState<CatalogItem | null>(null);
  const [media, setMedia] = useState<any[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [saving, setSaving] = useState(false);

  async function refreshItems() {
    const res = await listCatalogItems({
      organizationId: session?.user?.organizationId,
      limit: 500
    });
    setItems(res.data || []);
  }

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [itemsRes, orgsRes, taxCodesRes] = await Promise.all([
          listCatalogItems({ organizationId: session?.user?.organizationId, limit: 500 }),
          listOrganizations(),
          listTaxCodes({ organizationId: session?.user?.organizationId })
        ]);
        setItems(itemsRes.data || []);
        setOrganizations(orgsRes.data || []);
        setTaxCodes(taxCodesRes.data || []);
        if (session?.user?.organizationId) {
          setForm((prev) => ({ ...prev, organizationId: session.user.organizationId }));
          const busRes = await listBusinessUnits(session.user.organizationId).catch(() => ({ data: [] }));
          setBusinessUnits(busRes.data || []);
        }
      } catch (e: any) {
        if (e?.response?.status === 401) {
          toast.error('Session expired. Please login again.');
          router.replace('/login');
        } else {
          toast.error('Failed to load catalog items');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  useEffect(() => {
    if (!form.organizationId) {
      setBusinessUnits([]);
      return;
    }
    listBusinessUnits(form.organizationId)
      .then((res) => setBusinessUnits(res.data || []))
      .catch(() => setBusinessUnits([]));
  }, [form.organizationId]);

  async function loadMedia(catalogItemId: string) {
    try {
      const res = await listProductMedia({ catalogItemId, type: 'image' });
      setMedia(res.data || []);
    } catch {
      setMedia([]);
    }
  }

  function buildPayload(f: ProductForm) {
    let attributes: Record<string, any> | undefined;
    if (f.attributes.trim()) attributes = JSON.parse(f.attributes);
    return {
      sku: f.sku,
      name: f.name,
      description: f.description || undefined,
      category: f.category || undefined,
      subCategory: f.subCategory || undefined,
      brand: f.brand || undefined,
      manufacturer: f.brand || undefined,
      uom: f.uom || undefined,
      packSize: f.packSize || undefined,
      costPrice: num(f.costPrice),
      sellingPrice: num(f.sellingPrice),
      currency: f.currency || undefined,
      taxCodeId: f.taxCodeId || undefined,
      supplierSku: f.supplierSku || undefined,
      leadTimeDays: int(f.leadTimeDays),
      remarks: f.remarks || undefined,
      status: f.status,
      attributes,
      barcode: f.barcode,
      openingQuantity: num(f.openingQuantity),
      reorderLevel: num(f.reorderLevel),
      reorderQuantity: num(f.reorderQuantity),
      warehouseName: f.warehouseName || undefined,
      binCode: f.binCode || undefined,
      supplierName: f.supplierName || undefined,
      lotNumber: f.lotNumber || undefined,
      expiryDate: f.expiryDate || undefined
    };
  }

  function saveErrorMessage(e: any, fallback: string) {
    if (e?.message?.includes('JSON')) return 'Invalid attributes JSON';
    return e?.response?.data?.error?.message ?? fallback;
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !form.organizationId || !form.sku || !form.name) {
      toast.error('Organization, SKU and Name are required');
      return;
    }
    setSaving(true);
    try {
      await createCatalogItem({
        organizationId: form.organizationId,
        businessUnitId: form.businessUnitId || undefined,
        ...buildPayload(form)
      });
      await refreshItems();
      setShowCreate(false);
      setForm({ ...emptyForm, organizationId: session.user.organizationId || '' });
      toast.success('Catalog item created');
    } catch (e: any) {
      toast.error(saveErrorMessage(e, 'Create failed'));
    } finally {
      setSaving(false);
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await updateCatalogItem(editing.id, {
        businessUnitId: editForm.businessUnitId || undefined,
        ...buildPayload(editForm)
      });
      await refreshItems();
      setEditing(null);
      setMedia([]);
      toast.success('Catalog item updated');
    } catch (e: any) {
      toast.error(saveErrorMessage(e, 'Update failed'));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteCatalogItem(confirmDel.id);
      setItems(items.filter((item) => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Catalog item deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Delete failed');
    }
  }

  async function onUploadImages(files: FileList | null) {
    if (!editing || !files?.length) return;
    setUploadingMedia(true);
    try {
      let position = media.length;
      for (const file of Array.from(files)) {
        await createProductMedia(
          {
            catalogItemId: editing.id,
            type: 'image',
            position,
            isPrimary: position === 0 && media.length === 0
          },
          file
        );
        position += 1;
      }
      await loadMedia(editing.id);
      toast.success('Image(s) uploaded');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Image upload failed');
    } finally {
      setUploadingMedia(false);
    }
  }

  async function onRemoveImage(id: string) {
    try {
      await deleteProductMedia(id);
      setMedia((prev) => prev.filter((m) => m.id !== id));
      toast.success('Image removed');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to remove image');
    }
  }

  function openEdit(item: CatalogItem) {
    setEditing(item);
    const shown = { ...(item.attributes ?? {}) } as Record<string, any>;
    MANAGED_ATTRIBUTE_KEYS.forEach((k) => delete shown[k]);
    setEditForm({
      organizationId: item.organization?.id || '',
      businessUnitId: item.businessUnit?.id || '',
      sku: item.sku,
      barcode: item.barcode || '',
      name: item.name,
      description: item.description || '',
      category: item.category || '',
      subCategory: item.subCategory || '',
      brand: item.brand || '',
      uom: item.uom || '',
      packSize: item.packSize || '',
      openingQuantity: item.openingQuantity?.toString() || '',
      reorderLevel: item.reorderLevel?.toString() || '',
      reorderQuantity: item.reorderQuantity?.toString() || '',
      costPrice: item.costPrice?.toString() || '',
      sellingPrice: item.sellingPrice?.toString() || '',
      currency: item.currency || 'GBP',
      taxCodeId: item.taxCode?.id || '',
      warehouseName: item.warehouseName || '',
      binCode: item.binCode || '',
      supplierName: item.supplierName || '',
      supplierSku: item.supplierSku || '',
      leadTimeDays: item.leadTimeDays?.toString() || '',
      lotNumber: item.lotNumber || '',
      expiryDate: item.expiryDate || '',
      status: item.status,
      remarks: item.remarks || '',
      attributes: Object.keys(shown).length ? JSON.stringify(shown, null, 2) : ''
    });
    loadMedia(item.id);
  }

  const columns = useMemo<ColumnDef<CatalogItem>[]>(
    () => [
      {
        accessorKey: 'sku',
        header: 'SKU / Item Code',
        cell: ({ row }) => <span className="font-mono text-xs whitespace-nowrap">{row.original.sku}</span>
      },
      {
        accessorKey: 'barcode',
        header: 'Barcode / UPC',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.barcode || '—'}</span>
      },
      {
        accessorKey: 'name',
        header: 'Product Name',
        cell: ({ row }) => (
          <span className="font-medium block max-w-[240px] truncate" title={row.original.name}>
            {row.original.name}
          </span>
        )
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <span
            className="block max-w-[200px] truncate text-xs text-muted-foreground"
            title={row.original.description || ''}
          >
            {row.original.description || '—'}
          </span>
        )
      },
      { accessorKey: 'category', header: 'Category', cell: ({ row }) => row.original.category || '—' },
      { accessorKey: 'subCategory', header: 'Sub-Category', cell: ({ row }) => row.original.subCategory || '—' },
      { accessorKey: 'brand', header: 'Brand / Manufacturer', cell: ({ row }) => row.original.brand || '—' },
      { accessorKey: 'uom', header: 'UOM', cell: ({ row }) => row.original.uom || '—' },
      { accessorKey: 'packSize', header: 'Pack Size', cell: ({ row }) => row.original.packSize || '—' },
      {
        accessorKey: 'openingQuantity',
        header: 'Opening Qty',
        cell: ({ row }) => row.original.openingQuantity ?? '—'
      },
      { accessorKey: 'reorderLevel', header: 'Reorder Level', cell: ({ row }) => row.original.reorderLevel ?? '—' },
      {
        accessorKey: 'reorderQuantity',
        header: 'Reorder Qty',
        cell: ({ row }) => row.original.reorderQuantity ?? '—'
      },
      {
        accessorKey: 'costPrice',
        header: 'Unit Cost Price',
        cell: ({ row }) => (row.original.costPrice != null ? Number(row.original.costPrice).toFixed(2) : '—')
      },
      {
        accessorKey: 'sellingPrice',
        header: 'Unit Selling Price',
        cell: ({ row }) => (row.original.sellingPrice != null ? Number(row.original.sellingPrice).toFixed(2) : '—')
      },
      {
        id: 'tax',
        header: 'Tax / GST %',
        cell: ({ row }) =>
          row.original.taxCode ? `${Math.round(Number(row.original.taxCode.rate) * 100)}%` : '—'
      },
      {
        accessorKey: 'warehouseName',
        header: 'Warehouse / Location',
        cell: ({ row }) => (
          <span className="block max-w-[180px] truncate" title={row.original.warehouseName || ''}>
            {row.original.warehouseName || '—'}
          </span>
        )
      },
      { accessorKey: 'binCode', header: 'Bin / Rack No.', cell: ({ row }) => row.original.binCode || '—' },
      {
        accessorKey: 'supplierName',
        header: 'Supplier Name',
        cell: ({ row }) => (
          <span className="block max-w-[180px] truncate" title={row.original.supplierName || ''}>
            {row.original.supplierName || '—'}
          </span>
        )
      },
      { accessorKey: 'supplierSku', header: 'Supplier SKU', cell: ({ row }) => row.original.supplierSku || '—' },
      {
        accessorKey: 'leadTimeDays',
        header: 'Lead Time (Days)',
        cell: ({ row }) => row.original.leadTimeDays ?? '—'
      },
      { accessorKey: 'lotNumber', header: 'Batch / Lot No.', cell: ({ row }) => row.original.lotNumber || '—' },
      { accessorKey: 'expiryDate', header: 'Expiry Date', cell: ({ row }) => row.original.expiryDate || '—' },
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
          return <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status]}`}>{status}</span>;
        }
      },
      {
        id: 'dateAdded',
        header: 'Date Added',
        cell: ({ row }) =>
          row.original.createdAt ? new Date(row.original.createdAt).toISOString().slice(0, 10) : '—'
      },
      {
        accessorKey: 'remarks',
        header: 'Remarks',
        cell: ({ row }) => (
          <span
            className="block max-w-[220px] truncate text-xs text-muted-foreground"
            title={row.original.remarks || ''}
          >
            {row.original.remarks || '—'}
          </span>
        )
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <button
              onClick={() => openEdit(row.original)}
              className="p-1 hover:bg-gray-100 rounded"
              type="button"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setConfirmDel(row.original)}
              className="p-1 hover:bg-gray-100 rounded text-red-600"
              type="button"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      }
    ],
    []
  );

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="lg:ml-[280px] p-8">Access denied</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Catalog · Items" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-[1800px] mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div>
                <h1 className="text-3xl font-bold">Catalog Items</h1>
                <p className="text-muted-foreground mt-1">
                  Every inventory sheet column, plus images and JSON attributes
                </p>
              </div>
              <div className="flex gap-2">
                <Link href="/catalog/inventory-import" className="btn btn-outline inline-flex items-center gap-2">
                  <Upload className="h-4 w-4" /> Import Excel
                </Link>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="btn btn-primary inline-flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" /> Add Item
                </button>
              </div>
            </div>

            <RichDataTable columns={columns} data={items} />

            {showCreate && (
              <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-3xl rounded-2xl bg-card border shadow-2xl p-6 max-h-[92vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Catalog Item</h3>
                    <button
                      type="button"
                      onClick={() => setShowCreate(false)}
                      className="p-1 hover:bg-muted rounded-lg"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <ProductFields
                      value={form}
                      onChange={setForm}
                      includeOrg
                      organizations={organizations}
                      businessUnits={businessUnits}
                      taxCodes={taxCodes}
                    />
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <button type="button" onClick={() => setShowCreate(false)} className="btn btn-outline">
                        Cancel
                      </button>
                      <button type="submit" disabled={saving} className="btn btn-primary inline-flex items-center gap-2">
                        {saving && <Loader2 size={14} className="animate-spin" />} Create
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {editing && (
              <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-3xl rounded-2xl bg-card border shadow-2xl p-6 max-h-[92vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Edit Catalog Item</h3>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setMedia([]);
                      }}
                      className="p-1 hover:bg-muted rounded-lg"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="space-y-4">
                    <ProductFields
                      value={editForm}
                      onChange={setEditForm}
                      organizations={organizations}
                      businessUnits={businessUnits}
                      taxCodes={taxCodes}
                    />

                    <div className="border-t pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold inline-flex items-center gap-2">
                          <ImageIcon size={16} /> Product images
                        </h4>
                        <label className="btn btn-outline text-xs inline-flex items-center gap-1 cursor-pointer">
                          {uploadingMedia ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                          Add images
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            disabled={uploadingMedia}
                            onChange={(e) => {
                              onUploadImages(e.target.files);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                      {media.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No images yet. Upload one or more images for this product.
                        </p>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {media.map((m) => (
                            <div
                              key={m.id}
                              className="relative rounded-lg border overflow-hidden bg-muted/30 aspect-square"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={m.url} alt={m.altText || ''} className="h-full w-full object-cover" />
                              {m.isPrimary && (
                                <span className="absolute top-1 left-1 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5 inline-flex items-center gap-0.5">
                                  <Star size={10} /> Primary
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => onRemoveImage(m.id)}
                                className="absolute top-1 right-1 rounded bg-black/70 text-white p-1 hover:bg-red-600"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          setMedia([]);
                        }}
                        className="btn btn-outline"
                      >
                        Cancel
                      </button>
                      <button type="submit" disabled={saving} className="btn btn-primary inline-flex items-center gap-2">
                        {saving && <Loader2 size={14} className="animate-spin" />} Update
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {confirmDel && (
              <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-card border shadow-2xl p-6">
                  <h3 className="text-lg font-semibold mb-2">Confirm Delete</h3>
                  <p className="text-sm text-muted-foreground mb-4">Delete “{confirmDel.name}”?</p>
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setConfirmDel(null)} className="btn btn-outline">
                      Cancel
                    </button>
                    <button
                      type="button"
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
