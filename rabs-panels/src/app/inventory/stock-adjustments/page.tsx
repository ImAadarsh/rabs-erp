'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listStockAdjustments, createStockAdjustment, updateStockAdjustment, deleteStockAdjustment, listStockItems } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Trash2, Plus, X, TrendingUp, TrendingDown, Search } from 'lucide-react';

type StockAdjustment = {
  id: string;
  adjustmentNumber: string;
  adjustmentDate: string;
  adjustmentType: string;
  quantityChange: number;
  reason: string;
  stockItem?: {
    id: string;
    variant?: { variantSku: string; catalogItem?: { name: string } };
    warehouse?: { name: string };
  };
  [key: string]: any;
};

export default function StockAdjustmentsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StockAdjustment[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<StockAdjustment | null>(null);
  const [stockItemSearch, setStockItemSearch] = useState('');
  const [showStockItemDropdown, setShowStockItemDropdown] = useState(false);
  const [selectedStockItem, setSelectedStockItem] = useState<any | null>(null);
  
  const [form, setForm] = useState({
    stockItemId: '',
    adjustmentNumber: '',
    adjustmentDate: new Date().toISOString().split('T')[0],
    adjustmentType: 'increase' as 'increase' | 'decrease' | 'correction' | 'write_off' | 'found' | 'damaged',
    quantityChange: '',
    reason: '',
    costImpact: ''
  });

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
      const [adjustmentsRes, stockItemsRes] = await Promise.all([
        listStockAdjustments({ organizationId: session?.user?.organizationId }),
        listStockItems()
      ]);
      setItems(adjustmentsRes.data || []);
      setStockItems(stockItemsRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load stock adjustments');
    } finally {
      setLoading(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.stockItemId || !form.adjustmentNumber || !form.quantityChange || !form.reason) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      const payload: any = {
        organizationId: session?.user?.organizationId,
        stockItemId: form.stockItemId,
        adjustmentNumber: form.adjustmentNumber,
        adjustmentDate: form.adjustmentDate,
        adjustmentType: form.adjustmentType,
        quantityChange: parseInt(form.quantityChange),
        reason: form.reason,
        adjustedById: session?.user?.id
      };
      if (form.costImpact) payload.costImpact = parseFloat(form.costImpact);

      const res = await createStockAdjustment(payload);
      setItems(prev => [res.data, ...prev]);
      setShowCreate(false);
      resetForm();
      toast.success('Stock adjustment created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create stock adjustment');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteStockAdjustment(confirmDel.id);
      setItems(prev => prev.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Stock adjustment deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete stock adjustment');
    }
  }

  function resetForm() {
    setForm({
      stockItemId: '',
      adjustmentNumber: '',
      adjustmentDate: new Date().toISOString().split('T')[0],
      adjustmentType: 'increase',
      quantityChange: '',
      reason: '',
      costImpact: ''
    });
    setSelectedStockItem(null);
    setStockItemSearch('');
  }

  const filteredStockItems = stockItems.filter(si => 
    si.variant?.variantSku.toLowerCase().includes(stockItemSearch.toLowerCase()) ||
    si.variant?.catalogItem?.name.toLowerCase().includes(stockItemSearch.toLowerCase()) ||
    si.warehouse?.name.toLowerCase().includes(stockItemSearch.toLowerCase())
  );

  function selectStockItem(item: any) {
    setSelectedStockItem(item);
    setForm(prev => ({ ...prev, stockItemId: item.id }));
    setStockItemSearch(`${item.variant?.variantSku || ''} - ${item.warehouse?.name || ''}`);
    setShowStockItemDropdown(false);
  }

  const columns = useMemo<ColumnDef<StockAdjustment>[]>(() => [
    {
      accessorKey: 'adjustmentNumber',
      header: 'Adjustment #',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.adjustmentType === 'increase' || row.original.adjustmentType === 'found' ? (
            <TrendingUp size={16} className="text-green-600" />
          ) : (
            <TrendingDown size={16} className="text-red-600" />
          )}
          <span className="font-medium">{row.original.adjustmentNumber}</span>
        </div>
      )
    },
    {
      accessorKey: 'stockItem.variant.variantSku',
      header: 'SKU',
      cell: ({ row }) => <span className="text-sm">{row.original.stockItem?.variant?.variantSku || 'N/A'}</span>
    },
    {
      accessorKey: 'stockItem.warehouse.name',
      header: 'Warehouse',
      cell: ({ row }) => <span className="text-sm">{row.original.stockItem?.warehouse?.name || 'N/A'}</span>
    },
    {
      accessorKey: 'adjustmentType',
      header: 'Type',
      cell: ({ row }) => {
        const type = row.original.adjustmentType || 'increase';
        const colors: Record<string, string> = {
          increase: 'bg-green-100 text-green-800',
          decrease: 'bg-red-100 text-red-800',
          correction: 'bg-blue-100 text-blue-800',
          write_off: 'bg-gray-100 text-gray-800',
          found: 'bg-green-100 text-green-800',
          damaged: 'bg-orange-100 text-orange-800'
        };
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[type] || colors.increase}`}>
            {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </span>
        );
      }
    },
    {
      accessorKey: 'quantityChange',
      header: 'Quantity Change',
      cell: ({ row }) => {
        const change = row.original.quantityChange || 0;
        return (
          <span className={`font-medium ${change > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {change > 0 ? '+' : ''}{change}
          </span>
        );
      }
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.reason}</span>
    },
    {
      accessorKey: 'adjustmentDate',
      header: 'Date',
      cell: ({ row }) => <span className="text-sm">{new Date(row.original.adjustmentDate).toLocaleDateString()}</span>
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
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
          <Header title="Inventory · Stock Adjustments" />
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
          <Header title="Inventory · Stock Adjustments" />
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
        <Header title="Inventory · Stock Adjustments" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold">Stock Adjustments</h1>
                <p className="text-muted-foreground mt-1">Manual inventory corrections and adjustments</p>
              </div>
              <button
                onClick={() => {
                  setShowCreate(true);
                  resetForm();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create Adjustment
              </button>
            </div>

            <div className="rounded-2xl border border-border bg-card">
              <RichDataTable columns={columns} data={items} searchPlaceholder="Search adjustments..." />
            </div>

            {/* Create Modal */}
            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Stock Adjustment</h3>
                    <button onClick={() => { setShowCreate(false); resetForm(); }} className="p-1 hover:bg-muted rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="relative">
                      <label className="block text-sm font-medium mb-2">Stock Item <span className="text-destructive">*</span></label>
                      <div className="relative">
                        <div className="flex items-center gap-2">
                          <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
                          <input
                            type="text"
                            value={stockItemSearch}
                            onChange={(e) => {
                              setStockItemSearch(e.target.value);
                              setShowStockItemDropdown(true);
                            }}
                            onFocus={() => setShowStockItemDropdown(true)}
                            placeholder="Search by SKU or warehouse..."
                            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        {showStockItemDropdown && filteredStockItems.length > 0 && (
                          <>
                            <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                              {filteredStockItems.map(item => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => selectStockItem(item)}
                                  className="w-full text-left px-4 py-2 hover:bg-muted transition-colors border-b border-border last:border-0"
                                >
                                  <div className="font-medium">{item.variant?.variantSku || 'N/A'}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {item.variant?.catalogItem?.name || ''} - {item.warehouse?.name || ''}
                                  </div>
                                </button>
                              ))}
                            </div>
                            <div 
                              className="fixed inset-0 z-[5]" 
                              onClick={() => setShowStockItemDropdown(false)}
                            />
                          </>
                        )}
                      </div>
                      {selectedStockItem && (
                        <div className="mt-2 p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium">{selectedStockItem.variant?.variantSku}</div>
                          <div className="text-xs text-muted-foreground">
                            {selectedStockItem.variant?.catalogItem?.name} - {selectedStockItem.warehouse?.name}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Adjustment Number <span className="text-destructive">*</span></label>
                        <input
                          type="text"
                          value={form.adjustmentNumber}
                          onChange={e => setForm(prev => ({ ...prev, adjustmentNumber: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Adjustment Date <span className="text-destructive">*</span></label>
                        <input
                          type="date"
                          value={form.adjustmentDate}
                          onChange={e => setForm(prev => ({ ...prev, adjustmentDate: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Adjustment Type <span className="text-destructive">*</span></label>
                        <select
                          value={form.adjustmentType}
                          onChange={e => setForm(prev => ({ ...prev, adjustmentType: e.target.value as any }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        >
                          <option value="increase">Increase</option>
                          <option value="decrease">Decrease</option>
                          <option value="correction">Correction</option>
                          <option value="write_off">Write Off</option>
                          <option value="found">Found</option>
                          <option value="damaged">Damaged</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Quantity Change <span className="text-destructive">*</span></label>
                        <input
                          type="number"
                          value={form.quantityChange}
                          onChange={e => setForm(prev => ({ ...prev, quantityChange: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                          min="0"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-2">Reason <span className="text-destructive">*</span></label>
                        <input
                          type="text"
                          value={form.reason}
                          onChange={e => setForm(prev => ({ ...prev, reason: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Cost Impact</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.costImpact}
                          onChange={e => setForm(prev => ({ ...prev, costImpact: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <button type="submit" className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-600 transition-colors">
                        Create
                      </button>
                      <button 
                        type="button" 
                        onClick={() => { setShowCreate(false); resetForm(); }} 
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
                  <h3 className="text-lg font-semibold mb-2">Delete Stock Adjustment</h3>
                  <p className="text-muted-foreground mb-4">
                    Are you sure you want to delete adjustment {confirmDel.adjustmentNumber}? This action cannot be undone.
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

