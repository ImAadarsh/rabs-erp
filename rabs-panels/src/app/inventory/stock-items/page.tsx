'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { 
  listStockItems, 
  createStockItem, 
  updateStockItem, 
  deleteStockItem,
  listWarehouses,
  listBins,
  listVariants
} from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Package2, Plus, X, Pencil, Trash2, Search } from 'lucide-react';

type StockItem = {
  id: string;
  variant?: { 
    id: string; 
    variantSku: string; 
    name?: string | null;
    option1Value?: string | null;
    option2Value?: string | null;
    option3Value?: string | null;
    catalogItem?: { 
      id: string;
      name: string;
      sku: string;
    } | null;
    [key: string]: any;
  } | null;
  warehouse?: { id: string; name: string } | null;
  bin?: { id: string; code: string; name?: string } | null;
  quantityOnHand?: number;
  quantityReserved?: number;
  quantityAvailable?: number;
  status?: string;
  lotNumber?: string | null;
  serialNumber?: string | null;
  expiryDate?: string | null;
  manufactureDate?: string | null;
  costPrice?: number | null;
  safetyStockLevel?: number | null;
  reorderPoint?: number | null;
  reorderQuantity?: number | null;
  [key: string]: any;
};

type Variant = {
  id: string;
  variantSku: string;
  name?: string | null;
  catalogItem?: {
    id: string;
    name: string;
    sku: string;
  } | null;
  option1Value?: string | null;
  option2Value?: string | null;
  option3Value?: string | null;
  [key: string]: any;
};

export default function StockItemsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StockItem[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [bins, setBins] = useState<any[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [confirmDel, setConfirmDel] = useState<StockItem | null>(null);
  const [variantSearch, setVariantSearch] = useState('');
  const [filteredVariants, setFilteredVariants] = useState<Variant[]>([]);
  const [showVariantDropdown, setShowVariantDropdown] = useState(false);
  
  const [form, setForm] = useState({
    variantId: '',
    warehouseId: '',
    binId: '',
    quantityOnHand: '',
    lotNumber: '',
    serialNumber: '',
    expiryDate: '',
    manufactureDate: '',
    costPrice: '',
    safetyStockLevel: '',
    reorderPoint: '',
    reorderQuantity: '',
    status: 'available' as 'available' | 'reserved' | 'quarantine' | 'damaged' | 'expired'
  });

  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    loadData();
  }, [hydrated, hasAccess, router, session?.accessToken]);

  async function loadData() {
    try {
      setLoading(true);
      const [stockRes, warehousesRes, variantsRes] = await Promise.all([
        listStockItems(),
        listWarehouses(),
        listVariants({ status: 'active' })
      ]);
      setItems(stockRes.data || []);
      setWarehouses(warehousesRes.data || []);
      setVariants(variantsRes.data || []);
      setFilteredVariants(variantsRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load stock items');
    } finally {
      setLoading(false);
    }
  }

  async function loadBins(warehouseId: string) {
    if (!warehouseId) {
      setBins([]);
      return;
    }
    try {
      const binsRes = await listBins({ warehouseId });
      setBins(binsRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load bins');
    }
  }

  useEffect(() => {
    if (form.warehouseId) {
      loadBins(form.warehouseId);
    } else {
      setBins([]);
      setForm(prev => ({ ...prev, binId: '' }));
    }
  }, [form.warehouseId]);

  useEffect(() => {
    if (variantSearch) {
      const filtered = variants.filter(v => 
        v.variantSku.toLowerCase().includes(variantSearch.toLowerCase()) ||
        v.name?.toLowerCase().includes(variantSearch.toLowerCase()) ||
        v.catalogItem?.name.toLowerCase().includes(variantSearch.toLowerCase()) ||
        v.catalogItem?.sku.toLowerCase().includes(variantSearch.toLowerCase())
      );
      setFilteredVariants(filtered);
    } else {
      setFilteredVariants(variants);
    }
  }, [variantSearch, variants]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.variantId || !form.warehouseId || !form.quantityOnHand) {
      toast.error('Please fill in required fields (Variant, Warehouse, Quantity)');
      return;
    }
    try {
      const payload: any = {
        variantId: form.variantId,
        warehouseId: form.warehouseId,
        quantityOnHand: parseInt(form.quantityOnHand),
        status: form.status
      };
      
      if (form.binId) payload.binId = form.binId;
      if (form.lotNumber) payload.lotNumber = form.lotNumber;
      if (form.serialNumber) payload.serialNumber = form.serialNumber;
      if (form.expiryDate) payload.expiryDate = form.expiryDate;
      if (form.manufactureDate) payload.manufactureDate = form.manufactureDate;
      if (form.costPrice) payload.costPrice = parseFloat(form.costPrice);
      if (form.safetyStockLevel) payload.safetyStockLevel = parseInt(form.safetyStockLevel);
      if (form.reorderPoint) payload.reorderPoint = parseInt(form.reorderPoint);
      if (form.reorderQuantity) payload.reorderQuantity = parseInt(form.reorderQuantity);

      const res = await createStockItem(payload);
      setItems(prev => [res.data, ...prev]);
      setShowCreate(false);
      resetForm();
      toast.success('Stock item created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create stock item');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const payload: any = {
        status: form.status
      };
      
      if (form.binId) payload.binId = form.binId;
      if (form.quantityOnHand) payload.quantityOnHand = parseInt(form.quantityOnHand);
      if (form.lotNumber) payload.lotNumber = form.lotNumber;
      if (form.serialNumber) payload.serialNumber = form.serialNumber;
      if (form.expiryDate) payload.expiryDate = form.expiryDate;
      if (form.manufactureDate) payload.manufactureDate = form.manufactureDate;
      if (form.costPrice) payload.costPrice = parseFloat(form.costPrice);
      if (form.safetyStockLevel) payload.safetyStockLevel = parseInt(form.safetyStockLevel);
      if (form.reorderPoint) payload.reorderPoint = parseInt(form.reorderPoint);
      if (form.reorderQuantity) payload.reorderQuantity = parseInt(form.reorderQuantity);

      const res = await updateStockItem(editing.id, payload);
      setItems(prev => prev.map(item => item.id === editing.id ? res.data : item));
      setEditing(null);
      resetForm();
      toast.success('Stock item updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update stock item');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteStockItem(confirmDel.id);
      setItems(prev => prev.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Stock item deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete stock item');
    }
  }

  function resetForm() {
    setForm({
      variantId: '',
      warehouseId: '',
      binId: '',
      quantityOnHand: '',
      lotNumber: '',
      serialNumber: '',
      expiryDate: '',
      manufactureDate: '',
      costPrice: '',
      safetyStockLevel: '',
      reorderPoint: '',
      reorderQuantity: '',
      status: 'available'
    });
    setSelectedVariant(null);
    setVariantSearch('');
    setBins([]);
  }

  function selectVariant(variant: Variant) {
    setSelectedVariant(variant);
    setForm(prev => ({ ...prev, variantId: variant.id }));
    setVariantSearch(`${variant.variantSku} - ${variant.catalogItem?.name || variant.name || ''}`);
    setShowVariantDropdown(false);
  }

  const columns = useMemo<ColumnDef<StockItem>[]>(() => [
    {
      accessorKey: 'variant.variantSku',
      header: 'SKU',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Package2 size={16} className="text-muted-foreground" />
          <div>
            <div className="font-medium">{row.original.variant?.variantSku || 'N/A'}</div>
            {row.original.variant?.option1Value || row.original.variant?.option2Value ? (
              <div className="text-xs text-muted-foreground">
                {[row.original.variant?.option1Value, row.original.variant?.option2Value, row.original.variant?.option3Value]
                  .filter(Boolean)
                  .join(', ')}
              </div>
            ) : null}
          </div>
        </div>
      )
    },
    {
      accessorKey: 'variant.catalogItem.name',
      header: 'Product',
      cell: ({ row }) => (
        <span className="text-sm">{row.original.variant?.catalogItem?.name || row.original.variant?.name || 'N/A'}</span>
      )
    },
    {
      accessorKey: 'warehouse.name',
      header: 'Warehouse',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.warehouse?.name || 'N/A'}</span>
    },
    {
      accessorKey: 'bin.code',
      header: 'Bin',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.bin?.code || '—'}</span>
    },
    {
      accessorKey: 'quantityOnHand',
      header: 'On Hand',
      cell: ({ row }) => <span className="font-medium">{row.original.quantityOnHand || 0}</span>
    },
    {
      accessorKey: 'quantityReserved',
      header: 'Reserved',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.quantityReserved || 0}</span>
    },
    {
      accessorKey: 'quantityAvailable',
      header: 'Available',
      cell: ({ row }) => <span className="font-medium text-green-600">{row.original.quantityAvailable || 0}</span>
    },
    { 
      accessorKey: 'status', 
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status || 'available';
        const colors: Record<string, string> = {
          available: 'bg-green-100 text-green-800',
          reserved: 'bg-blue-100 text-blue-800',
          quarantine: 'bg-yellow-100 text-yellow-800',
          damaged: 'bg-red-100 text-red-800',
          expired: 'bg-gray-100 text-gray-800'
        };
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || colors.available}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        );
      }
    },
    {
      accessorKey: 'expiryDate',
      header: 'Expiry Date',
      cell: ({ row }) => {
        const date = row.original.expiryDate;
        if (!date) return <span className="text-sm text-muted-foreground">—</span>;
        return <span className="text-sm">{new Date(date).toLocaleDateString()}</span>;
      }
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button
            onClick={() => {
              const item = row.original;
              setEditing(item);
              setSelectedVariant(item.variant ? {
                id: item.variant.id,
                variantSku: item.variant.variantSku,
                name: item.variant.name,
                catalogItem: item.variant.catalogItem
              } : null);
              setForm({
                variantId: item.variant?.id || '',
                warehouseId: item.warehouse?.id || '',
                binId: item.bin?.id || '',
                quantityOnHand: item.quantityOnHand?.toString() || '',
                lotNumber: item.lotNumber || '',
                serialNumber: item.serialNumber || '',
                expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().split('T')[0] : '',
                manufactureDate: item.manufactureDate ? new Date(item.manufactureDate).toISOString().split('T')[0] : '',
                costPrice: item.costPrice?.toString() || '',
                safetyStockLevel: item.safetyStockLevel?.toString() || '',
                reorderPoint: item.reorderPoint?.toString() || '',
                reorderQuantity: item.reorderQuantity?.toString() || '',
                status: (item.status || 'available') as any
              });
              if (item.warehouse?.id) {
                loadBins(item.warehouse.id);
              }
            }}
            className="p-1 hover:bg-muted rounded"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button 
            onClick={() => setConfirmDel(row.original)} 
            className="p-1 hover:bg-muted rounded text-red-500"
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
          <Header title="Inventory · Stock Items" />
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
          <Header title="Inventory · Stock Items" />
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
        <Header title="Inventory · Stock Items" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold">Stock Items</h1>
                <p className="text-muted-foreground mt-1">View and manage inventory stock levels</p>
              </div>
              <button
                onClick={() => {
                  setShowCreate(true);
                  resetForm();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Stock Item
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-sm text-muted-foreground">Loading stock items...</div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card">
                <RichDataTable columns={columns} data={items} searchPlaceholder="Search stock items..." />
              </div>
            )}

            {/* Create Modal */}
            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-3xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Stock Item</h3>
                    <button onClick={() => {
                      setShowCreate(false);
                      resetForm();
                    }} className="p-1 hover:bg-muted rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    {/* Variant Selection */}
                    <div className="relative">
                      <label className="block text-sm font-medium mb-2">
                        Variant (from Catalog) <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <div className="flex items-center gap-2">
                          <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
                          <input
                            type="text"
                            value={variantSearch}
                            onChange={(e) => {
                              setVariantSearch(e.target.value);
                              setShowVariantDropdown(true);
                            }}
                            onFocus={() => setShowVariantDropdown(true)}
                            placeholder="Search by SKU or product name..."
                            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        {showVariantDropdown && filteredVariants.length > 0 && (
                          <>
                            <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                              {filteredVariants.map(variant => (
                                <button
                                  key={variant.id}
                                  type="button"
                                  onClick={() => selectVariant(variant)}
                                  className="w-full text-left px-4 py-2 hover:bg-muted transition-colors border-b border-border last:border-0"
                                >
                                  <div className="font-medium">{variant.variantSku}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {variant.catalogItem?.name || variant.name || ''}
                                    {(variant.option1Value || variant.option2Value) && (
                                      <span className="ml-2">
                                        ({[variant.option1Value, variant.option2Value, variant.option3Value].filter(Boolean).join(', ')})
                                      </span>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                            <div 
                              className="fixed inset-0 z-[5]" 
                              onClick={() => setShowVariantDropdown(false)}
                            />
                          </>
                        )}
                      </div>
                      {selectedVariant && (
                        <div className="mt-2 p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium">{selectedVariant.variantSku}</div>
                          <div className="text-xs text-muted-foreground">{selectedVariant.catalogItem?.name || selectedVariant.name}</div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Warehouse <span className="text-destructive">*</span>
                        </label>
                        <select
                          value={form.warehouseId}
                          onChange={e => setForm(prev => ({ ...prev, warehouseId: e.target.value, binId: '' }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        >
                          <option value="">Select warehouse...</option>
                          {warehouses.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Bin</label>
                        <select
                          value={form.binId}
                          onChange={e => setForm(prev => ({ ...prev, binId: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          disabled={!form.warehouseId}
                        >
                          <option value="">No bin</option>
                          {bins.map(b => (
                            <option key={b.id} value={b.id}>{b.code} {b.name ? `- ${b.name}` : ''}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Quantity On Hand <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="number"
                          value={form.quantityOnHand}
                          onChange={e => setForm(prev => ({ ...prev, quantityOnHand: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="available">Available</option>
                          <option value="reserved">Reserved</option>
                          <option value="quarantine">Quarantine</option>
                          <option value="damaged">Damaged</option>
                          <option value="expired">Expired</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Lot Number</label>
                        <input
                          type="text"
                          value={form.lotNumber}
                          onChange={e => setForm(prev => ({ ...prev, lotNumber: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Serial Number</label>
                        <input
                          type="text"
                          value={form.serialNumber}
                          onChange={e => setForm(prev => ({ ...prev, serialNumber: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Expiry Date</label>
                        <input
                          type="date"
                          value={form.expiryDate}
                          onChange={e => setForm(prev => ({ ...prev, expiryDate: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Manufacture Date</label>
                        <input
                          type="date"
                          value={form.manufactureDate}
                          onChange={e => setForm(prev => ({ ...prev, manufactureDate: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Cost Price</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.costPrice}
                          onChange={e => setForm(prev => ({ ...prev, costPrice: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Safety Stock Level</label>
                        <input
                          type="number"
                          value={form.safetyStockLevel}
                          onChange={e => setForm(prev => ({ ...prev, safetyStockLevel: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Reorder Point</label>
                        <input
                          type="number"
                          value={form.reorderPoint}
                          onChange={e => setForm(prev => ({ ...prev, reorderPoint: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Reorder Quantity</label>
                        <input
                          type="number"
                          value={form.reorderQuantity}
                          onChange={e => setForm(prev => ({ ...prev, reorderQuantity: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          min="0"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <button type="submit" className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-600 transition-colors">
                        Create
                      </button>
                      <button 
                        type="button" 
                        onClick={() => {
                          setShowCreate(false);
                          resetForm();
                        }} 
                        className="px-4 py-2 bg-muted rounded hover:bg-muted/80 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Edit Modal */}
            {editing && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-3xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">Edit Stock Item</h3>
                      {selectedVariant && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {selectedVariant.variantSku} - {selectedVariant.catalogItem?.name || selectedVariant.name}
                        </p>
                      )}
                    </div>
                    <button onClick={() => {
                      setEditing(null);
                      resetForm();
                    }} className="p-1 hover:bg-muted rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Warehouse</label>
                        <div className="px-4 py-2 border border-border rounded-lg bg-muted text-muted-foreground">
                          {editing.warehouse?.name || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Bin</label>
                        <select
                          value={form.binId}
                          onChange={e => setForm(prev => ({ ...prev, binId: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">No bin</option>
                          {bins.map(b => (
                            <option key={b.id} value={b.id}>{b.code} {b.name ? `- ${b.name}` : ''}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Quantity On Hand</label>
                        <input
                          type="number"
                          value={form.quantityOnHand}
                          onChange={e => setForm(prev => ({ ...prev, quantityOnHand: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="available">Available</option>
                          <option value="reserved">Reserved</option>
                          <option value="quarantine">Quarantine</option>
                          <option value="damaged">Damaged</option>
                          <option value="expired">Expired</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Lot Number</label>
                        <input
                          type="text"
                          value={form.lotNumber}
                          onChange={e => setForm(prev => ({ ...prev, lotNumber: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Serial Number</label>
                        <input
                          type="text"
                          value={form.serialNumber}
                          onChange={e => setForm(prev => ({ ...prev, serialNumber: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Expiry Date</label>
                        <input
                          type="date"
                          value={form.expiryDate}
                          onChange={e => setForm(prev => ({ ...prev, expiryDate: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Manufacture Date</label>
                        <input
                          type="date"
                          value={form.manufactureDate}
                          onChange={e => setForm(prev => ({ ...prev, manufactureDate: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Cost Price</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.costPrice}
                          onChange={e => setForm(prev => ({ ...prev, costPrice: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Safety Stock Level</label>
                        <input
                          type="number"
                          value={form.safetyStockLevel}
                          onChange={e => setForm(prev => ({ ...prev, safetyStockLevel: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Reorder Point</label>
                        <input
                          type="number"
                          value={form.reorderPoint}
                          onChange={e => setForm(prev => ({ ...prev, reorderPoint: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Reorder Quantity</label>
                        <input
                          type="number"
                          value={form.reorderQuantity}
                          onChange={e => setForm(prev => ({ ...prev, reorderQuantity: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          min="0"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <button type="submit" className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-600 transition-colors">
                        Update
                      </button>
                      <button 
                        type="button" 
                        onClick={() => {
                          setEditing(null);
                          resetForm();
                        }} 
                        className="px-4 py-2 bg-muted rounded hover:bg-muted/80 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Delete Confirmation */}
            {confirmDel && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl border border-border p-6">
                  <h3 className="text-lg font-semibold mb-2">Delete Stock Item</h3>
                  <p className="text-muted-foreground mb-4">
                    Are you sure you want to delete stock item for {confirmDel.variant?.variantSku}? 
                    This action cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={onDelete} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
                      Delete
                    </button>
                    <button onClick={() => setConfirmDel(null)} className="px-4 py-2 bg-muted rounded hover:bg-muted/80 transition-colors">
                      Cancel
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
