'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listGRN, createGRN, updateGRN, deleteGRN, listWarehouses, listASN, listVariants } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, Receipt, Search } from 'lucide-react';

type GRN = {
  id: string;
  grnNumber: string;
  receivedDate: string;
  status: string;
  warehouse?: { id: string; name: string };
  asn?: { id: string; asnNumber: string } | null;
  receivedBy?: { id: string; name: string };
  lines?: Array<{
    id: string;
    variant: { id: string; variantSku: string; catalogItem?: { name: string } };
    quantityExpected: number;
    quantityReceived: number;
    quantityRejected: number;
    qaStatus: string;
  }>;
  [key: string]: any;
};

export default function GRNPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<GRN[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [asns, setAsns] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<GRN | null>(null);
  const [confirmDel, setConfirmDel] = useState<GRN | null>(null);
  
  const [form, setForm] = useState({
    asnId: '',
    warehouseId: '',
    grnNumber: '',
    receivedDate: new Date().toISOString().split('T')[0],
    status: 'draft' as 'draft' | 'qa_pending' | 'approved' | 'rejected' | 'put_away',
    notes: '',
    lines: [] as Array<{
      variantId: string;
      quantityExpected: number;
      quantityReceived: number;
      quantityRejected?: number;
      lotNumber?: string;
      expiryDate?: string;
      qaStatus?: 'pending' | 'passed' | 'failed' | 'quarantine';
    }>
  });

  const [variantSearch, setVariantSearch] = useState('');
  const [showVariantDropdown, setShowVariantDropdown] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState<number | null>(null);

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
      const [grnRes, warehousesRes, asnsRes, variantsRes] = await Promise.all([
        listGRN({ organizationId: session?.user?.organizationId }),
        listWarehouses(),
        listASN({ organizationId: session?.user?.organizationId, status: 'arrived' }),
        listVariants({ status: 'active' })
      ]);
      setItems(grnRes.data || []);
      setWarehouses(warehousesRes.data || []);
      setAsns(asnsRes.data || []);
      setVariants(variantsRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load GRN');
    } finally {
      setLoading(false);
    }
  }

  function addLine() {
    setForm(prev => ({
      ...prev,
      lines: [...prev.lines, { variantId: '', quantityExpected: 0, quantityReceived: 0, quantityRejected: 0, qaStatus: 'pending' }]
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
    if (!form.warehouseId || !form.grnNumber || !form.receivedDate || form.lines.length === 0) {
      toast.error('Please fill in required fields and add at least one line item');
      return;
    }
    try {
      const payload: any = {
        organizationId: session?.user?.organizationId,
        warehouseId: form.warehouseId,
        grnNumber: form.grnNumber,
        receivedDate: form.receivedDate,
        receivedById: session?.user?.id,
        status: form.status,
        lines: form.lines.map(line => ({
          variantId: line.variantId,
          quantityExpected: line.quantityExpected,
          quantityReceived: line.quantityReceived,
          quantityRejected: line.quantityRejected || 0,
          lotNumber: line.lotNumber || '',
          expiryDate: line.expiryDate || '',
          qaStatus: line.qaStatus || 'pending'
        }))
      };
      if (form.asnId) payload.asnId = form.asnId;
      if (form.notes) payload.notes = form.notes;

      const res = await createGRN(payload);
      setItems(prev => [res.data, ...prev]);
      setShowCreate(false);
      resetForm();
      toast.success('GRN created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create GRN');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteGRN(confirmDel.id);
      setItems(prev => prev.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('GRN deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete GRN');
    }
  }

  function resetForm() {
    setForm({
      asnId: '',
      warehouseId: '',
      grnNumber: '',
      receivedDate: new Date().toISOString().split('T')[0],
      status: 'draft',
      notes: '',
      lines: []
    });
  }

  const filteredVariants = variants.filter(v => 
    v.variantSku.toLowerCase().includes(variantSearch.toLowerCase()) ||
    v.name?.toLowerCase().includes(variantSearch.toLowerCase()) ||
    v.catalogItem?.name.toLowerCase().includes(variantSearch.toLowerCase())
  );

  function selectVariantForLine(variant: any, lineIndex: number) {
    updateLine(lineIndex, 'variantId', variant.id);
    updateLine(lineIndex, 'quantityExpected', variant.quantityExpected || 0);
    setVariantSearch('');
    setShowVariantDropdown(false);
    setCurrentLineIndex(null);
  }

  const columns = useMemo<ColumnDef<GRN>[]>(() => [
    {
      accessorKey: 'grnNumber',
      header: 'GRN Number',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Receipt size={16} className="text-muted-foreground" />
          <span className="font-medium">{row.original.grnNumber}</span>
        </div>
      )
    },
    {
      accessorKey: 'warehouse.name',
      header: 'Warehouse',
      cell: ({ row }) => <span className="text-sm">{row.original.warehouse?.name || 'N/A'}</span>
    },
    {
      accessorKey: 'asn.asnNumber',
      header: 'ASN',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.asn?.asnNumber || '—'}</span>
    },
    {
      accessorKey: 'receivedDate',
      header: 'Received Date',
      cell: ({ row }) => <span className="text-sm">{new Date(row.original.receivedDate).toLocaleDateString()}</span>
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status || 'draft';
        const colors: Record<string, string> = {
          draft: 'bg-gray-100 text-gray-800',
          qa_pending: 'bg-yellow-100 text-yellow-800',
          approved: 'bg-green-100 text-green-800',
          rejected: 'bg-red-100 text-red-800',
          put_away: 'bg-blue-100 text-blue-800'
        };
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || colors.draft}`}>
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
          <Header title="Inventory · GRN" />
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
          <Header title="Inventory · GRN" />
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
        <Header title="Inventory · GRN" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold">Goods Receipt Notes</h1>
                <p className="text-muted-foreground mt-1">Record received goods and create stock items</p>
              </div>
              <button
                onClick={() => {
                  setShowCreate(true);
                  resetForm();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create GRN
              </button>
            </div>

            <div className="rounded-2xl border border-border bg-card">
              <RichDataTable columns={columns} data={items} searchPlaceholder="Search GRN..." />
            </div>

            {/* Create Modal */}
            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-4xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create GRN</h3>
                    <button onClick={() => { setShowCreate(false); resetForm(); }} className="p-1 hover:bg-muted rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">GRN Number <span className="text-destructive">*</span></label>
                        <input
                          type="text"
                          value={form.grnNumber}
                          onChange={e => setForm(prev => ({ ...prev, grnNumber: e.target.value }))}
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
                        <label className="block text-sm font-medium mb-2">ASN</label>
                        <select
                          value={form.asnId}
                          onChange={e => setForm(prev => ({ ...prev, asnId: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">None</option>
                          {asns.map(asn => (
                            <option key={asn.id} value={asn.id}>{asn.asnNumber}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Received Date <span className="text-destructive">*</span></label>
                        <input
                          type="date"
                          value={form.receivedDate}
                          onChange={e => setForm(prev => ({ ...prev, receivedDate: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="draft">Draft</option>
                          <option value="qa_pending">QA Pending</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                          <option value="put_away">Put Away</option>
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
                        <label className="block text-sm font-medium">Line Items <span className="text-destructive">*</span></label>
                        <button type="button" onClick={addLine} className="text-sm text-primary hover:underline">
                          + Add Line
                        </button>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {form.lines.map((line, index) => (
                          <div key={index} className="p-3 border border-border rounded-lg bg-muted/50">
                            <div className="flex items-start justify-between mb-2">
                              <span className="text-sm font-medium">Line {index + 1}</span>
                              <button type="button" onClick={() => removeLine(index)} className="text-red-500 hover:text-red-700">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="grid grid-cols-5 gap-2">
                              <div className="relative col-span-2">
                                <div className="flex items-center gap-2">
                                  <Search className="absolute left-2 h-4 w-4 text-muted-foreground" />
                                  <input
                                    type="text"
                                    placeholder="Search variant..."
                                    value={line.variantId ? variants.find(v => v.id === line.variantId)?.variantSku || '' : variantSearch}
                                    onChange={e => {
                                      setVariantSearch(e.target.value);
                                      setShowVariantDropdown(true);
                                      setCurrentLineIndex(index);
                                    }}
                                    onFocus={() => {
                                      setShowVariantDropdown(true);
                                      setCurrentLineIndex(index);
                                    }}
                                    className="w-full pl-8 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                  />
                                </div>
                                {showVariantDropdown && currentLineIndex === index && filteredVariants.length > 0 && (
                                  <>
                                    <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                      {filteredVariants.map(variant => (
                                        <button
                                          key={variant.id}
                                          type="button"
                                          onClick={() => selectVariantForLine(variant, index)}
                                          className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b border-border last:border-0 text-sm"
                                        >
                                          <div className="font-medium">{variant.variantSku}</div>
                                          <div className="text-xs text-muted-foreground">{variant.catalogItem?.name || variant.name || ''}</div>
                                        </button>
                                      ))}
                                    </div>
                                    <div 
                                      className="fixed inset-0 z-[5]" 
                                      onClick={() => { setShowVariantDropdown(false); setCurrentLineIndex(null); }}
                                    />
                                  </>
                                )}
                              </div>
                              <input
                                type="number"
                                placeholder="Expected"
                                value={line.quantityExpected || ''}
                                onChange={e => updateLine(index, 'quantityExpected', parseInt(e.target.value) || 0)}
                                className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                min="0"
                              />
                              <input
                                type="number"
                                placeholder="Received"
                                value={line.quantityReceived || ''}
                                onChange={e => updateLine(index, 'quantityReceived', parseInt(e.target.value) || 0)}
                                className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                min="0"
                              />
                              <input
                                type="number"
                                placeholder="Rejected"
                                value={line.quantityRejected || ''}
                                onChange={e => updateLine(index, 'quantityRejected', parseInt(e.target.value) || 0)}
                                className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                min="0"
                              />
                            </div>
                          </div>
                        ))}
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
                  <h3 className="text-lg font-semibold mb-2">Delete GRN</h3>
                  <p className="text-muted-foreground mb-4">
                    Are you sure you want to delete GRN {confirmDel.grnNumber}? This action cannot be undone.
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

