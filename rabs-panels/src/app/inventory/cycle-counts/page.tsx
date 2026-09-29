'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listCycleCounts, createCycleCount, updateCycleCount, deleteCycleCount, listWarehouses, listStockItems } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Trash2, Plus, X, ClipboardList, Search } from 'lucide-react';

type CycleCount = {
  id: string;
  countNumber: string;
  countDate: string;
  countType: string;
  status: string;
  totalSkus: number;
  countedSkus: number;
  discrepancies: number;
  warehouse?: { id: string; name: string };
  [key: string]: any;
};

export default function CycleCountsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CycleCount[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<CycleCount | null>(null);
  const [stockItemSearch, setStockItemSearch] = useState('');
  const [showStockItemDropdown, setShowStockItemDropdown] = useState(false);
  
  const [form, setForm] = useState({
    warehouseId: '',
    countNumber: '',
    countDate: new Date().toISOString().split('T')[0],
    countType: 'partial' as 'full' | 'partial' | 'abc_class_a' | 'abc_class_b' | 'abc_class_c' | 'spot_check',
    status: 'planned' as 'planned' | 'in_progress' | 'completed' | 'reconciled' | 'cancelled',
    notes: '',
    lines: [] as Array<{
      stockItemId: string;
      expectedQuantity: number;
      countedQuantity?: number;
    }>
  });

  const [filteredStockItems, setFilteredStockItems] = useState<any[]>([]);

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
      const [countsRes, warehousesRes, stockItemsRes] = await Promise.all([
        listCycleCounts({ organizationId: session?.user?.organizationId }),
        listWarehouses(),
        listStockItems()
      ]);
      setItems(countsRes.data || []);
      setWarehouses(warehousesRes.data || []);
      setStockItems(stockItemsRes.data || []);
      setFilteredStockItems(stockItemsRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load cycle counts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (form.warehouseId && stockItemSearch) {
      const filtered = stockItems.filter(si => 
        si.warehouse?.id === form.warehouseId &&
        (si.variant?.variantSku.toLowerCase().includes(stockItemSearch.toLowerCase()) ||
         si.variant?.catalogItem?.name.toLowerCase().includes(stockItemSearch.toLowerCase()))
      );
      setFilteredStockItems(filtered);
    } else if (form.warehouseId) {
      const filtered = stockItems.filter(si => si.warehouse?.id === form.warehouseId);
      setFilteredStockItems(filtered);
    } else {
      setFilteredStockItems(stockItems);
    }
  }, [form.warehouseId, stockItemSearch, stockItems]);

  function addLine() {
    setForm(prev => ({
      ...prev,
      lines: [...prev.lines, { stockItemId: '', expectedQuantity: 0 }]
    }));
  }

  function removeLine(index: number) {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index)
    }));
  }

  function updateLine(index: number, field: string, value: any) {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.map((line, i) => i === index ? { ...line, [field]: value } : line)
    }));
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.warehouseId || !form.countNumber || form.lines.length === 0) {
      toast.error('Please fill in required fields and add at least one line item');
      return;
    }
    try {
      const payload: any = {
        organizationId: session?.user?.organizationId,
        warehouseId: form.warehouseId,
        countNumber: form.countNumber,
        countDate: form.countDate,
        countType: form.countType,
        status: form.status,
        lines: form.lines.map(line => ({
          stockItemId: line.stockItemId,
          expectedQuantity: line.expectedQuantity,
          countedQuantity: line.countedQuantity
        }))
      };
      if (form.notes) payload.notes = form.notes;

      const res = await createCycleCount(payload);
      setItems(prev => [res.data, ...prev]);
      setShowCreate(false);
      resetForm();
      toast.success('Cycle count created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create cycle count');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteCycleCount(confirmDel.id);
      setItems(prev => prev.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Cycle count deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete cycle count');
    }
  }

  function resetForm() {
    setForm({
      warehouseId: '',
      countNumber: '',
      countDate: new Date().toISOString().split('T')[0],
      countType: 'partial',
      status: 'planned',
      notes: '',
      lines: []
    });
    setStockItemSearch('');
  }

  function selectStockItemForLine(item: any, lineIndex: number) {
    updateLine(lineIndex, 'stockItemId', item.id);
    updateLine(lineIndex, 'expectedQuantity', item.quantityOnHand || 0);
    setStockItemSearch('');
    setShowStockItemDropdown(false);
  }

  const columns = useMemo<ColumnDef<CycleCount>[]>(() => [
    {
      accessorKey: 'countNumber',
      header: 'Count Number',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-muted-foreground" />
          <span className="font-medium">{row.original.countNumber}</span>
        </div>
      )
    },
    {
      accessorKey: 'warehouse.name',
      header: 'Warehouse',
      cell: ({ row }) => <span className="text-sm">{row.original.warehouse?.name || 'N/A'}</span>
    },
    {
      accessorKey: 'countType',
      header: 'Type',
      cell: ({ row }) => {
        const type = row.original.countType || 'partial';
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </span>
        );
      }
    },
    {
      accessorKey: 'countDate',
      header: 'Count Date',
      cell: ({ row }) => <span className="text-sm">{new Date(row.original.countDate).toLocaleDateString()}</span>
    },
    {
      accessorKey: 'totalSkus',
      header: 'Total SKUs',
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.totalSkus || 0}</span>
    },
    {
      accessorKey: 'countedSkus',
      header: 'Counted',
      cell: ({ row }) => <span className="text-sm">{row.original.countedSkus || 0}</span>
    },
    {
      accessorKey: 'discrepancies',
      header: 'Discrepancies',
      cell: ({ row }) => {
        const disc = row.original.discrepancies || 0;
        return (
          <span className={`text-sm font-medium ${disc > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {disc}
          </span>
        );
      }
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status || 'planned';
        const colors: Record<string, string> = {
          planned: 'bg-gray-100 text-gray-800',
          in_progress: 'bg-blue-100 text-blue-800',
          completed: 'bg-green-100 text-green-800',
          reconciled: 'bg-purple-100 text-purple-800',
          cancelled: 'bg-red-100 text-red-800'
        };
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || colors.planned}`}>
            {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </span>
        );
      }
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
          <Header title="Inventory · Cycle Counts" />
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
          <Header title="Inventory · Cycle Counts" />
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
        <Header title="Inventory · Cycle Counts" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold">Cycle Counts</h1>
                <p className="text-muted-foreground mt-1">Physical inventory audits and reconciliation</p>
              </div>
              <button
                onClick={() => {
                  setShowCreate(true);
                  resetForm();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create Cycle Count
              </button>
            </div>

            <div className="rounded-2xl border border-border bg-card">
              <RichDataTable columns={columns} data={items} searchPlaceholder="Search cycle counts..." />
            </div>

            {/* Create Modal */}
            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-4xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Cycle Count</h3>
                    <button onClick={() => { setShowCreate(false); resetForm(); }} className="p-1 hover:bg-muted rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Count Number <span className="text-destructive">*</span></label>
                        <input
                          type="text"
                          value={form.countNumber}
                          onChange={e => setForm(prev => ({ ...prev, countNumber: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Warehouse <span className="text-destructive">*</span></label>
                        <select
                          value={form.warehouseId}
                          onChange={e => setForm(prev => ({ ...prev, warehouseId: e.target.value }))}
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
                        <label className="block text-sm font-medium mb-2">Count Date <span className="text-destructive">*</span></label>
                        <input
                          type="date"
                          value={form.countDate}
                          onChange={e => setForm(prev => ({ ...prev, countDate: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Count Type <span className="text-destructive">*</span></label>
                        <select
                          value={form.countType}
                          onChange={e => setForm(prev => ({ ...prev, countType: e.target.value as any }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        >
                          <option value="full">Full</option>
                          <option value="partial">Partial</option>
                          <option value="abc_class_a">ABC Class A</option>
                          <option value="abc_class_b">ABC Class B</option>
                          <option value="abc_class_c">ABC Class C</option>
                          <option value="spot_check">Spot Check</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="planned">Planned</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                          <option value="reconciled">Reconciled</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Notes</label>
                      <textarea
                        value={form.notes}
                        onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                        className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        rows={2}
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium">Count Lines <span className="text-destructive">*</span></label>
                        <button type="button" onClick={addLine} className="text-sm text-primary hover:underline">
                          + Add Line
                        </button>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {form.lines.map((line, index) => {
                          const stockItem = stockItems.find(si => si.id === line.stockItemId);
                          return (
                            <div key={index} className="p-3 border border-border rounded-lg bg-muted/50">
                              <div className="flex items-start justify-between mb-2">
                                <span className="text-sm font-medium">Line {index + 1}</span>
                                <button type="button" onClick={() => removeLine(index)} className="text-red-500 hover:text-red-700">
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="relative col-span-2">
                                  <div className="flex items-center gap-2">
                                    <Search className="absolute left-2 h-4 w-4 text-muted-foreground" />
                                    <input
                                      type="text"
                                      placeholder="Search stock item..."
                                      value={stockItem ? `${stockItem.variant?.variantSku || ''} - ${stockItem.warehouse?.name || ''}` : stockItemSearch}
                                      onChange={e => {
                                        setStockItemSearch(e.target.value);
                                        setShowStockItemDropdown(true);
                                      }}
                                      onFocus={() => {
                                        setShowStockItemDropdown(true);
                                      }}
                                      className="w-full pl-8 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                    />
                                  </div>
                                  {showStockItemDropdown && form.warehouseId && filteredStockItems.length > 0 && (
                                    <>
                                      <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                        {filteredStockItems.map(item => (
                                          <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => selectStockItemForLine(item, index)}
                                            className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b border-border last:border-0 text-sm"
                                          >
                                            <div className="font-medium">{item.variant?.variantSku || 'N/A'}</div>
                                            <div className="text-xs text-muted-foreground">
                                              {item.variant?.catalogItem?.name || ''} - Qty: {item.quantityOnHand || 0}
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
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="number"
                                    placeholder="Expected"
                                    value={line.expectedQuantity || ''}
                                    onChange={e => updateLine(index, 'expectedQuantity', parseInt(e.target.value) || 0)}
                                    className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                    min="0"
                                  />
                                  <input
                                    type="number"
                                    placeholder="Counted"
                                    value={line.countedQuantity || ''}
                                    onChange={e => updateLine(index, 'countedQuantity', parseInt(e.target.value) || undefined)}
                                    className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                    min="0"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
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
                  <h3 className="text-lg font-semibold mb-2">Delete Cycle Count</h3>
                  <p className="text-muted-foreground mb-4">
                    Are you sure you want to delete cycle count {confirmDel.countNumber}? This action cannot be undone.
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

