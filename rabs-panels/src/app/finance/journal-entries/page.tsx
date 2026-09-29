'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listJournalEntries, createJournalEntry, updateJournalEntry, deleteJournalEntry, listOrganizations, listBusinessUnits, listFiscalPeriods, listLedgerAccounts, listCostCenters } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type JournalLine = {
  ledgerAccountId: string;
  costCenterId?: string;
  lineNumber: number;
  description?: string;
  debitAmount: number;
  creditAmount: number;
  currency?: string;
};

type JournalEntry = {
  id: string;
  journalNumber: string;
  entryDate: string;
  entryType: 'standard' | 'adjusting' | 'closing' | 'reversing' | 'recurring';
  sourceType: 'manual' | 'invoice' | 'payment' | 'order' | 'payroll' | 'inventory' | 'other';
  description?: string;
  status: 'draft' | 'posted' | 'voided';
  fiscalPeriod?: { id: string; periodName: string };
  journalLines?: JournalLine[];
};

export default function JournalEntriesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<JournalEntry[]>([]);
  const [organizations] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<any[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    organizationId: '',
    businessUnitId: '',
    fiscalPeriodId: '',
    journalNumber: '',
    entryDate: new Date().toISOString().split('T')[0],
    entryType: 'standard' as 'standard' | 'adjusting' | 'closing' | 'reversing' | 'recurring',
    sourceType: 'manual' as 'manual' | 'invoice' | 'payment' | 'order' | 'payroll' | 'inventory' | 'other',
    description: '',
    reference: '',
    status: 'draft' as 'draft' | 'posted' | 'voided'
  });
  const [journalLines, setJournalLines] = useState<JournalLine[]>([]);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [editForm, setEditForm] = useState({
    businessUnitId: '',
    fiscalPeriodId: '',
    journalNumber: '',
    entryDate: '',
    entryType: 'standard' as 'standard' | 'adjusting' | 'closing' | 'reversing' | 'recurring',
    sourceType: 'manual' as 'manual' | 'invoice' | 'payment' | 'order' | 'payroll' | 'inventory' | 'other',
    description: '',
    reference: '',
    status: 'draft' as 'draft' | 'posted' | 'voided'
  });
  const [editJournalLines, setEditJournalLines] = useState<JournalLine[]>([]);
  const [confirmDel, setConfirmDel] = useState<JournalEntry | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [entriesRes, ledgerRes, periodRes, centerRes] = await Promise.all([
          listJournalEntries({ organizationId: session?.user?.organizationId }),
          listLedgerAccounts({}),
          listFiscalPeriods({ organizationId: session?.user?.organizationId }),
          listCostCenters({ organizationId: session?.user?.organizationId })
        ]);
        setItems(entriesRes.data || []);
        setLedgerAccounts(ledgerRes.data || []);
        setFiscalPeriods(periodRes.data || []);
        setCostCenters(centerRes.data || []);
        
        if (session?.user?.organizationId) {
          setForm(prev => ({ ...prev, organizationId: session.user.organizationId }));
          try {
            const busRes = await listBusinessUnits(session.user.organizationId);
            setBusinessUnits(busRes.data || []);
          } catch (e) {
            console.error('Failed to load business units:', e);
          }
        }
      } catch (e: any) {
        if (e?.response?.status === 403) {
          toast.error('You do not have permission to view journal entries.');
        } else {
          toast.error('Failed to load journal entries');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  function addJournalLine() {
    setJournalLines([...journalLines, {
      ledgerAccountId: '',
      costCenterId: '',
      lineNumber: journalLines.length + 1,
      description: '',
      debitAmount: 0,
      creditAmount: 0,
      currency: 'GBP'
    }]);
  }

  function removeJournalLine(index: number) {
    const updated = journalLines.filter((_, i) => i !== index).map((line, i) => ({ ...line, lineNumber: i + 1 }));
    setJournalLines(updated);
  }

  function updateJournalLine(index: number, field: keyof JournalLine, value: any) {
    const updated = [...journalLines];
    updated[index] = { ...updated[index], [field]: value };
    setJournalLines(updated);
  }

  function addEditJournalLine() {
    setEditJournalLines([...editJournalLines, {
      ledgerAccountId: '',
      costCenterId: '',
      lineNumber: editJournalLines.length + 1,
      description: '',
      debitAmount: 0,
      creditAmount: 0,
      currency: 'GBP'
    }]);
  }

  function removeEditJournalLine(index: number) {
    const updated = editJournalLines.filter((_, i) => i !== index).map((line, i) => ({ ...line, lineNumber: i + 1 }));
    setEditJournalLines(updated);
  }

  function updateEditJournalLine(index: number, field: keyof JournalLine, value: any) {
    const updated = [...editJournalLines];
    updated[index] = { ...updated[index], [field]: value };
    setEditJournalLines(updated);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fiscalPeriodId || !form.journalNumber || journalLines.length < 2) {
      toast.error('Please fill in required fields and add at least 2 journal lines');
      return;
    }

    const totalDebits = journalLines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
    const totalCredits = journalLines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);
    
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      toast.error(`Journal entry must balance. Debits: £${totalDebits.toFixed(2)}, Credits: £${totalCredits.toFixed(2)}`);
      return;
    }

    try {
      await createJournalEntry({
        ...form,
        organizationId: session?.user?.organizationId || form.organizationId,
        journalLines: journalLines.map(line => ({
          ...line,
          ledgerAccountId: line.ledgerAccountId,
          costCenterId: line.costCenterId || undefined,
          currency: line.currency || 'GBP'
        }))
      });
      toast.success('Journal Entry created');
      setShowCreate(false);
      setForm({
        organizationId: session?.user?.organizationId || '',
        businessUnitId: '',
        fiscalPeriodId: '',
        journalNumber: '',
        entryDate: new Date().toISOString().split('T')[0],
        entryType: 'standard',
        sourceType: 'manual',
        description: '',
        reference: '',
        status: 'draft'
      });
      setJournalLines([]);
      const res = await listJournalEntries({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create journal entry');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editForm.fiscalPeriodId || !editForm.journalNumber || editJournalLines.length < 2) {
      toast.error('Please fill in required fields and add at least 2 journal lines');
      return;
    }

    const totalDebits = editJournalLines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
    const totalCredits = editJournalLines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);
    
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      toast.error(`Journal entry must balance. Debits: £${totalDebits.toFixed(2)}, Credits: £${totalCredits.toFixed(2)}`);
      return;
    }

    try {
      await updateJournalEntry(editing.id, {
        ...editForm,
        journalLines: editJournalLines.map(line => ({
          ...line,
          ledgerAccountId: line.ledgerAccountId,
          costCenterId: line.costCenterId || undefined,
          currency: line.currency || 'GBP'
        }))
      });
      toast.success('Journal Entry updated');
      setEditing(null);
      const res = await listJournalEntries({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update journal entry');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteJournalEntry(confirmDel.id);
      toast.success('Journal Entry deleted');
      setConfirmDel(null);
      const res = await listJournalEntries({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete journal entry');
    }
  }

  const columns = useMemo<ColumnDef<JournalEntry>[]>(() => [
    { accessorKey: 'journalNumber', header: 'Journal Number' },
    { 
      accessorKey: 'entryDate', 
      header: 'Date',
      cell: ({ row }) => new Date(row.original.entryDate).toLocaleDateString()
    },
    { 
      accessorKey: 'entryType', 
      header: 'Type',
      cell: ({ row }) => row.original.entryType.charAt(0).toUpperCase() + row.original.entryType.slice(1)
    },
    { 
      accessorKey: 'sourceType', 
      header: 'Source',
      cell: ({ row }) => row.original.sourceType.charAt(0).toUpperCase() + row.original.sourceType.slice(1)
    },
    { 
      accessorKey: 'description', 
      header: 'Description',
      cell: ({ row }) => row.original.description || '-'
    },
    { 
      accessorKey: 'fiscalPeriod.periodName', 
      header: 'Period',
      cell: ({ row }) => row.original.fiscalPeriod?.periodName || '-'
    },
    { accessorKey: 'status', header: 'Status' },
    {
      id: 'actions',
      cell: ({ row }) => {
        const canEdit = row.original.status === 'draft';
        return (
          <div className="flex gap-2">
            {canEdit && (
              <button onClick={() => {
                const item = row.original;
                setEditing(item);
                setEditForm({
                  businessUnitId: (item as any).businessUnit?.id || '',
                  fiscalPeriodId: item.fiscalPeriod?.id || '',
                  journalNumber: item.journalNumber,
                  entryDate: item.entryDate,
                  entryType: item.entryType,
                  sourceType: item.sourceType,
                  description: item.description || '',
                  reference: (item as any).reference || '',
                  status: item.status
                });
                setEditJournalLines((item.journalLines || []).map(line => ({
                  ledgerAccountId: (line as any).ledgerAccount?.id || line.ledgerAccountId,
                  costCenterId: (line as any).costCenter?.id || line.costCenterId || '',
                  lineNumber: line.lineNumber,
                  description: line.description || '',
                  debitAmount: line.debitAmount,
                  creditAmount: line.creditAmount,
                  currency: line.currency || 'GBP'
                })));
              }} className="p-1.5 hover:bg-muted rounded">
                <Pencil size={16} />
              </button>
            )}
            {canEdit && (
              <button onClick={() => setConfirmDel(row.original)} className="p-1.5 hover:bg-muted rounded text-destructive">
                <Trash2 size={16} />
              </button>
            )}
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
          <Header title="Finance · Journal Entries" />
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
          <Header title="Finance · Journal Entries" />
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

  const calculateBalance = (lines: JournalLine[]) => {
    const debits = lines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
    const credits = lines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);
    return { debits, credits, difference: debits - credits };
  };

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Finance · Journal Entries" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Journal Entries</h1>
                <p className="text-muted-foreground mt-1">Create and manage journal entries with debits and credits</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New Journal Entry
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-5xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create Journal Entry</h2>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Journal Number *</label>
                        <input
                          type="text"
                          value={form.journalNumber}
                          onChange={(e) => setForm({ ...form, journalNumber: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Entry Date *</label>
                        <input
                          type="date"
                          value={form.entryDate}
                          onChange={(e) => setForm({ ...form, entryDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Fiscal Period *</label>
                        <select
                          value={form.fiscalPeriodId}
                          onChange={(e) => setForm({ ...form, fiscalPeriodId: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="">Select Fiscal Period</option>
                          {fiscalPeriods.filter(fp => !fp.isClosed).map(fp => (
                            <option key={fp.id} value={fp.id}>{fp.periodName}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Entry Type *</label>
                        <select
                          value={form.entryType}
                          onChange={(e) => setForm({ ...form, entryType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="standard">Standard</option>
                          <option value="adjusting">Adjusting</option>
                          <option value="closing">Closing</option>
                          <option value="reversing">Reversing</option>
                          <option value="recurring">Recurring</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Source Type</label>
                      <select
                        value={form.sourceType}
                        onChange={(e) => setForm({ ...form, sourceType: e.target.value as any })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="manual">Manual</option>
                        <option value="invoice">Invoice</option>
                        <option value="payment">Payment</option>
                        <option value="order">Order</option>
                        <option value="payroll">Payroll</option>
                        <option value="inventory">Inventory</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        rows={2}
                      />
                    </div>

                    <div className="border-t border-border pt-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Journal Lines *</h3>
                        <button
                          type="button"
                          onClick={addJournalLine}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-lg"
                        >
                          <Plus size={16} />
                          Add Line
                        </button>
                      </div>
                      {journalLines.length === 0 && (
                        <p className="text-sm text-muted-foreground mb-4">Add at least 2 journal lines (debits must equal credits)</p>
                      )}
                      <div className="space-y-3">
                        {journalLines.map((line, index) => (
                          <div key={index} className="p-4 border border-border rounded-lg space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Line {line.lineNumber}</span>
                              <button
                                type="button"
                                onClick={() => removeJournalLine(index)}
                                className="text-destructive hover:text-destructive/80"
                              >
                                <X size={16} />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium mb-1">Ledger Account *</label>
                                <select
                                  value={line.ledgerAccountId}
                                  onChange={(e) => updateJournalLine(index, 'ledgerAccountId', e.target.value)}
                                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                                  required
                                >
                                  <option value="">Select Account</option>
                                  {ledgerAccounts.map(la => (
                                    <option key={la.id} value={la.id}>{la.accountCode} - {la.accountName}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1">Cost Center</label>
                                <select
                                  value={line.costCenterId || ''}
                                  onChange={(e) => updateJournalLine(index, 'costCenterId', e.target.value)}
                                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                                >
                                  <option value="">None</option>
                                  {costCenters.map(cc => (
                                    <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Description</label>
                              <input
                                type="text"
                                value={line.description || ''}
                                onChange={(e) => updateJournalLine(index, 'description', e.target.value)}
                                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium mb-1">Debit Amount</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={line.debitAmount || 0}
                                  onChange={(e) => {
                                    updateJournalLine(index, 'debitAmount', parseFloat(e.target.value) || 0);
                                    updateJournalLine(index, 'creditAmount', 0);
                                  }}
                                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1">Credit Amount</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={line.creditAmount || 0}
                                  onChange={(e) => {
                                    updateJournalLine(index, 'creditAmount', parseFloat(e.target.value) || 0);
                                    updateJournalLine(index, 'debitAmount', 0);
                                  }}
                                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {journalLines.length > 0 && (
                        <div className="mt-4 p-3 bg-muted rounded-lg">
                          <div className="flex justify-between text-sm">
                            <span>Total Debits:</span>
                            <span className="font-medium">£{calculateBalance(journalLines).debits.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm mt-1">
                            <span>Total Credits:</span>
                            <span className="font-medium">£{calculateBalance(journalLines).credits.toFixed(2)}</span>
                          </div>
                          <div className={`flex justify-between text-sm mt-2 pt-2 border-t border-border ${Math.abs(calculateBalance(journalLines).difference) > 0.01 ? 'text-destructive' : 'text-green-600'}`}>
                            <span>Difference:</span>
                            <span className="font-bold">£{calculateBalance(journalLines).difference.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-border">
                      <button type="submit" className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
                        Create
                      </button>
                      <button type="button" onClick={() => {
                        setShowCreate(false);
                        setJournalLines([]);
                      }} className="px-4 py-2 border border-border rounded-lg hover:bg-muted">
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {editing && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-5xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Edit Journal Entry</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Journal Number *</label>
                        <input
                          type="text"
                          value={editForm.journalNumber}
                          onChange={(e) => setEditForm({ ...editForm, journalNumber: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Entry Date *</label>
                        <input
                          type="date"
                          value={editForm.entryDate}
                          onChange={(e) => setEditForm({ ...editForm, entryDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Fiscal Period *</label>
                        <select
                          value={editForm.fiscalPeriodId}
                          onChange={(e) => setEditForm({ ...editForm, fiscalPeriodId: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="">Select Fiscal Period</option>
                          {fiscalPeriods.filter(fp => !fp.isClosed).map(fp => (
                            <option key={fp.id} value={fp.id}>{fp.periodName}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Entry Type *</label>
                        <select
                          value={editForm.entryType}
                          onChange={(e) => setEditForm({ ...editForm, entryType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="standard">Standard</option>
                          <option value="adjusting">Adjusting</option>
                          <option value="closing">Closing</option>
                          <option value="reversing">Reversing</option>
                          <option value="recurring">Recurring</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Source Type</label>
                      <select
                        value={editForm.sourceType}
                        onChange={(e) => setEditForm({ ...editForm, sourceType: e.target.value as any })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="manual">Manual</option>
                        <option value="invoice">Invoice</option>
                        <option value="payment">Payment</option>
                        <option value="order">Order</option>
                        <option value="payroll">Payroll</option>
                        <option value="inventory">Inventory</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        rows={2}
                      />
                    </div>

                    <div className="border-t border-border pt-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Journal Lines *</h3>
                        <button
                          type="button"
                          onClick={addEditJournalLine}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-lg"
                        >
                          <Plus size={16} />
                          Add Line
                        </button>
                      </div>
                      <div className="space-y-3">
                        {editJournalLines.map((line, index) => (
                          <div key={index} className="p-4 border border-border rounded-lg space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Line {line.lineNumber}</span>
                              <button
                                type="button"
                                onClick={() => removeEditJournalLine(index)}
                                className="text-destructive hover:text-destructive/80"
                              >
                                <X size={16} />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium mb-1">Ledger Account *</label>
                                <select
                                  value={line.ledgerAccountId}
                                  onChange={(e) => updateEditJournalLine(index, 'ledgerAccountId', e.target.value)}
                                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                                  required
                                >
                                  <option value="">Select Account</option>
                                  {ledgerAccounts.map(la => (
                                    <option key={la.id} value={la.id}>{la.accountCode} - {la.accountName}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1">Cost Center</label>
                                <select
                                  value={line.costCenterId || ''}
                                  onChange={(e) => updateEditJournalLine(index, 'costCenterId', e.target.value)}
                                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                                >
                                  <option value="">None</option>
                                  {costCenters.map(cc => (
                                    <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Description</label>
                              <input
                                type="text"
                                value={line.description || ''}
                                onChange={(e) => updateEditJournalLine(index, 'description', e.target.value)}
                                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium mb-1">Debit Amount</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={line.debitAmount || 0}
                                  onChange={(e) => {
                                    updateEditJournalLine(index, 'debitAmount', parseFloat(e.target.value) || 0);
                                    updateEditJournalLine(index, 'creditAmount', 0);
                                  }}
                                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1">Credit Amount</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={line.creditAmount || 0}
                                  onChange={(e) => {
                                    updateEditJournalLine(index, 'creditAmount', parseFloat(e.target.value) || 0);
                                    updateEditJournalLine(index, 'debitAmount', 0);
                                  }}
                                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {editJournalLines.length > 0 && (
                        <div className="mt-4 p-3 bg-muted rounded-lg">
                          <div className="flex justify-between text-sm">
                            <span>Total Debits:</span>
                            <span className="font-medium">£{calculateBalance(editJournalLines).debits.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm mt-1">
                            <span>Total Credits:</span>
                            <span className="font-medium">£{calculateBalance(editJournalLines).credits.toFixed(2)}</span>
                          </div>
                          <div className={`flex justify-between text-sm mt-2 pt-2 border-t border-border ${Math.abs(calculateBalance(editJournalLines).difference) > 0.01 ? 'text-destructive' : 'text-green-600'}`}>
                            <span>Difference:</span>
                            <span className="font-bold">£{calculateBalance(editJournalLines).difference.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-border">
                      <button type="submit" className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
                        Update
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 border border-border rounded-lg hover:bg-muted">
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {confirmDel && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-md w-full p-6">
                  <h2 className="text-xl font-bold mb-4">Confirm Delete</h2>
                  <p className="text-muted-foreground mb-6">
                    Are you sure you want to delete "{confirmDel.journalNumber}"? This action cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={onDelete}
                      className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDel(null)}
                      className="px-4 py-2 border border-border rounded-lg hover:bg-muted"
                    >
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

