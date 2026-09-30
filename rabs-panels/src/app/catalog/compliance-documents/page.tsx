'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { 
  listComplianceDocuments, createComplianceDocument, updateComplianceDocument, deleteComplianceDocument,
  listCatalogItems
} from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, FileText, Download } from 'lucide-react';

type ComplianceDocument = {
  id: string;
  type: 'msds' | 'certificate' | 'safety_data' | 'test_report' | 'other';
  name: string;
  documentUrl: string;
  documentNumber?: string | null;
  issuer?: string | null;
  issuedDate?: string | null;
  expiryDate?: string | null;
  status: 'active' | 'expired' | 'pending';
  catalogItem?: {
    id: string;
    sku: string;
    name: string;
  };
  [key: string]: any;
};

export default function ComplianceDocumentsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ComplianceDocument[]>([]);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ 
    catalogItemId: '',
    type: 'certificate' as 'msds' | 'certificate' | 'safety_data' | 'test_report' | 'other',
    name: '',
    documentNumber: '',
    issuer: '',
    issuedDate: '',
    expiryDate: '',
    status: 'active' as 'active' | 'expired' | 'pending'
  });
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<ComplianceDocument | null>(null);
  const [editForm, setEditForm] = useState({
    type: 'certificate' as 'msds' | 'certificate' | 'safety_data' | 'test_report' | 'other',
    name: '',
    documentNumber: '',
    issuer: '',
    issuedDate: '',
    expiryDate: '',
    status: 'active' as 'active' | 'expired' | 'pending'
  });
  const [editDocumentFile, setEditDocumentFile] = useState<File | null>(null);
  const [confirmDel, setConfirmDel] = useState<ComplianceDocument | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [docsRes, catalogItemsRes] = await Promise.all([
          listComplianceDocuments(),
          listCatalogItems({ organizationId: session?.user?.organizationId })
        ]);
        setItems(docsRes.data || []);
        setCatalogItems(catalogItemsRes.data || []);
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 403) {
          toast.error('You do not have permission to view compliance documents.');
        } else if (status === 401) {
          toast.error('Session expired. Please login again.');
          router.replace('/login');
        } else {
          toast.error('Failed to load compliance documents');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'text/plain'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Invalid file type. Please upload a PDF, Word document, or image.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }
      if (isEdit) {
        setEditDocumentFile(file);
      } else {
        setDocumentFile(file);
      }
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!form.catalogItemId || !form.name || !documentFile) {
      toast.error('Please fill in required fields (Catalog Item, Name, Document)');
      return;
    }
    try {
      const res = await createComplianceDocument({
        catalogItemId: form.catalogItemId,
        type: form.type,
        name: form.name,
        documentNumber: form.documentNumber || undefined,
        issuer: form.issuer || undefined,
        issuedDate: form.issuedDate || undefined,
        expiryDate: form.expiryDate || undefined,
        status: form.status
      }, documentFile);
      
      setItems([res.data, ...items]);
      setShowCreate(false);
      setForm({ 
        catalogItemId: '',
        type: 'certificate',
        name: '',
        documentNumber: '',
        issuer: '',
        issuedDate: '',
        expiryDate: '',
        status: 'active'
      });
      setDocumentFile(null);
      toast.success('Compliance document created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Create failed');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const res = await updateComplianceDocument(editing.id, {
        type: editForm.type,
        name: editForm.name,
        documentNumber: editForm.documentNumber || undefined,
        issuer: editForm.issuer || undefined,
        issuedDate: editForm.issuedDate || undefined,
        expiryDate: editForm.expiryDate || undefined,
        status: editForm.status
      }, editDocumentFile || undefined);
      
      setItems(items.map(item => item.id === editing.id ? res.data : item));
      setEditing(null);
      setEditDocumentFile(null);
      toast.success('Compliance document updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Update failed');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteComplianceDocument(confirmDel.id);
      setItems(items.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Compliance document deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Delete failed');
    }
  }

  const columns = useMemo<ColumnDef<ComplianceDocument>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          {row.original.catalogItem && (
            <div className="text-xs text-muted-foreground">{row.original.catalogItem.sku} - {row.original.catalogItem.name}</div>
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
      accessorKey: 'documentNumber',
      header: 'Document Number',
      cell: ({ row }) => row.original.documentNumber || '-'
    },
    {
      accessorKey: 'issuer',
      header: 'Issuer',
      cell: ({ row }) => row.original.issuer || '-'
    },
    {
      accessorKey: 'expiryDate',
      header: 'Expiry Date',
      cell: ({ row }) => row.original.expiryDate ? new Date(row.original.expiryDate).toLocaleDateString() : '-'
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status;
        const colors = {
          active: 'bg-green-100 text-green-800',
          expired: 'bg-red-100 text-red-800',
          pending: 'bg-yellow-100 text-yellow-800'
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
            {item.documentUrl && (
              <a
                href={item.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-gray-100 rounded"
                title="Download"
              >
                <Download className="h-4 w-4" />
              </a>
            )}
            <button
              onClick={() => {
                setEditing(item);
                setEditForm({
                  type: item.type,
                  name: item.name,
                  documentNumber: item.documentNumber || '',
                  issuer: item.issuer || '',
                  issuedDate: item.issuedDate ? new Date(item.issuedDate).toISOString().split('T')[0] : '',
                  expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().split('T')[0] : '',
                  status: item.status
                });
                setEditDocumentFile(null);
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
          <Header title="Catalog · Compliance Documents" />
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
          <Header title="Catalog · Compliance Documents" />
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
        <Header title="Catalog · Compliance Documents" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <FileText className="h-8 w-8" />
                  Compliance Documents
                </h1>
                <p className="text-muted-foreground mt-1">Manage certifications, safety data, and compliance documents</p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Document
              </button>
            </div>

            <RichDataTable columns={columns} data={items} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Compliance Document</h3>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
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
                        <label className="block text-sm font-medium mb-1.5">Type *</label>
                        <select
                          value={form.type}
                          onChange={e => setForm(prev => ({ ...prev, type: e.target.value as any }))}
                          className="select"
                          required
                        >
                          <option value="msds">MSDS</option>
                          <option value="certificate">Certificate</option>
                          <option value="safety_data">Safety Data</option>
                          <option value="test_report">Test Report</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="select"
                        >
                          <option value="active">Active</option>
                          <option value="expired">Expired</option>
                          <option value="pending">Pending</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Name *</label>
                        <input
                          type="text"
                          value={form.name}
                          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Document Number</label>
                        <input
                          type="text"
                          value={form.documentNumber}
                          onChange={e => setForm(prev => ({ ...prev, documentNumber: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Issuer</label>
                        <input
                          type="text"
                          value={form.issuer}
                          onChange={e => setForm(prev => ({ ...prev, issuer: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Issued Date</label>
                        <input
                          type="date"
                          value={form.issuedDate}
                          onChange={e => setForm(prev => ({ ...prev, issuedDate: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Expiry Date</label>
                        <input
                          type="date"
                          value={form.expiryDate}
                          onChange={e => setForm(prev => ({ ...prev, expiryDate: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Document File *</label>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt"
                          onChange={(e) => handleFileChange(e, false)}
                          className="input"
                          required
                        />
                        {documentFile && (
                          <p className="text-xs text-muted-foreground mt-1">Selected: {documentFile.name}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreate(false);
                          setDocumentFile(null);
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
                    <h3 className="text-lg font-semibold">Edit Compliance Document</h3>
                    <button onClick={() => {
                      setEditing(null);
                      setEditDocumentFile(null);
                    }} className="p-1 hover:bg-muted rounded-lg transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Type *</label>
                        <select
                          value={editForm.type}
                          onChange={e => setEditForm(prev => ({ ...prev, type: e.target.value as any }))}
                          className="select"
                          required
                        >
                          <option value="msds">MSDS</option>
                          <option value="certificate">Certificate</option>
                          <option value="safety_data">Safety Data</option>
                          <option value="test_report">Test Report</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Status</label>
                        <select
                          value={editForm.status}
                          onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="select"
                        >
                          <option value="active">Active</option>
                          <option value="expired">Expired</option>
                          <option value="pending">Pending</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Name *</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Document Number</label>
                        <input
                          type="text"
                          value={editForm.documentNumber}
                          onChange={e => setEditForm(prev => ({ ...prev, documentNumber: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Issuer</label>
                        <input
                          type="text"
                          value={editForm.issuer}
                          onChange={e => setEditForm(prev => ({ ...prev, issuer: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Issued Date</label>
                        <input
                          type="date"
                          value={editForm.issuedDate}
                          onChange={e => setEditForm(prev => ({ ...prev, issuedDate: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Expiry Date</label>
                        <input
                          type="date"
                          value={editForm.expiryDate}
                          onChange={e => setEditForm(prev => ({ ...prev, expiryDate: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Document File (leave empty to keep current)</label>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt"
                          onChange={(e) => handleFileChange(e, true)}
                          className="input"
                        />
                        {editDocumentFile && (
                          <p className="text-xs text-muted-foreground mt-1">New file: {editDocumentFile.name}</p>
                        )}
                        {editing.documentUrl && !editDocumentFile && (
                          <p className="text-xs text-muted-foreground mt-1">Current file: <a href={editing.documentUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">View</a></p>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          setEditDocumentFile(null);
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
                  <p className="mb-4 text-muted-foreground">Are you sure you want to delete "{confirmDel.name}"? This action cannot be undone.</p>
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

