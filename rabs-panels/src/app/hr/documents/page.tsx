'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  listHrDocuments, createHrDocument, deleteHrDocument,
  listEmployees, uploadRtwDocument, createRtwDocument,
} from '@/lib/api';
import { employeeName, formatDate, hrApiError, isApiMissing } from '@/lib/hr-utils';
import { HrModal, HrField, HrModalActions, hrInputClass } from '@/components/hr/hr-modal';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { FileText, Plus, Trash2, Upload } from 'lucide-react';

const DOC_CATEGORIES = [
  { value: 'contract', label: 'Contract' },
  { value: 'handbook', label: 'Handbook' },
  { value: 'policy', label: 'Policy' },
  { value: 'id', label: 'ID' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'other', label: 'Other / RTW' },
] as const;

export default function DocumentsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'HR_ADMIN']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    employeeId: '',
    docCategory: 'contract' as typeof DOC_CATEGORIES[number]['value'],
    documentName: '',
    documentUrl: '',
    issueDate: '',
    expiryDate: '',
    isRtw: false,
  });

  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docs, emp] = await Promise.all([
        listHrDocuments({ limit: 200 }),
        listEmployees({ organizationId: orgId }),
      ]);
      setItems(docs.data || []);
      setEmployees(emp.data || []);
    } catch (err) {
      toast.error(hrApiError(err, 'Failed to load documents'));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      let url = form.documentUrl;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('employeeId', form.employeeId);
        fd.append('docType', form.docCategory);
        fd.append('documentName', form.documentName || file.name);
        if (form.expiryDate) fd.append('expiresAt', form.expiryDate);
        try {
          const up = await uploadRtwDocument(fd);
          url = up.data?.documentUrl || up.data?.fileUrl || up.data?.url || url;
          if (form.isRtw && up.data) {
            toast.success('Document uploaded');
            setOpen(false);
            setFile(null);
            void load();
            setSaving(false);
            return;
          }
        } catch (err) {
          if (!isApiMissing(err)) throw err;
          if (!url) {
            toast.error('Upload endpoint unavailable — paste a document URL');
            setSaving(false);
            return;
          }
        }
      }
      if (!url && !file) {
        toast.error('Document URL or file required');
        setSaving(false);
        return;
      }
      if (form.isRtw) {
        try {
          await createRtwDocument({
            employeeId: form.employeeId,
            docType: form.docCategory,
            documentName: form.documentName,
            documentUrl: url || undefined,
            expiresAt: form.expiryDate || undefined,
          });
        } catch (err) {
          if (!isApiMissing(err)) throw err;
          await createHrDocument({
            employeeId: form.employeeId,
            docCategory: form.docCategory,
            documentName: form.documentName,
            documentUrl: url || undefined,
            issueDate: form.issueDate || undefined,
            expiryDate: form.expiryDate || undefined,
          });
        }
      } else {
        await createHrDocument({
          employeeId: form.employeeId,
          docCategory: form.docCategory,
          documentName: form.documentName,
          documentUrl: url || undefined,
          issueDate: form.issueDate || undefined,
          expiryDate: form.expiryDate || undefined,
        });
      }
      toast.success('Document saved');
      setOpen(false);
      setFile(null);
      void load();
    } catch (err) {
      toast.error(hrApiError(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this document?')) return;
    try {
      await deleteHrDocument(id);
      toast.success('Deleted');
      void load();
    } catch (err) {
      toast.error(hrApiError(err, 'Delete failed'));
    }
  }

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      header: 'Employee',
      cell: ({ row }) => (
        <Link href={`/hr/employees/${row.original.employee?.id || row.original.employeeId}`} className="text-brand hover:underline">
          {employeeName(row.original.employee)}
        </Link>
      ),
    },
    { accessorKey: 'documentName', header: 'Name' },
    {
      header: 'Type',
      cell: ({ row }) => (
        <span className="capitalize">
          {(row.original.docCategory || row.original.documentType || '').replace(/_/g, ' ')}
        </span>
      ),
    },
    { header: 'Issue', cell: ({ row }) => formatDate(row.original.issueDate) },
    { header: 'Expiry', cell: ({ row }) => formatDate(row.original.expiryDate) },
    {
      id: 'link',
      header: '',
      cell: ({ row }) => row.original.documentUrl ? (
        <a href={row.original.documentUrl} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline">Open</a>
      ) : null,
    },
    {
      id: 'del',
      header: '',
      cell: ({ row }) => (
        <button type="button" onClick={() => onDelete(row.original.id)} className="p-1.5 text-red-600 hover:bg-red-500/10 rounded-lg">
          <Trash2 size={14} />
        </button>
      ),
    },
  ], []);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="HR · Documents" />
        <main className="p-6 md:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Documents</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Contracts, RTW &amp; employee files</p>
            </div>
            <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand hover:bg-brand-600 text-white text-sm font-medium shadow-lg shadow-brand/20">
              <Plus size={14} /> Upload / Add document
            </button>
          </div>
          {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!loading && items.length === 0 ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-10 text-center">
              <FileText className="mx-auto text-brand mb-3" size={28} />
              <p className="text-sm text-muted-foreground mb-3">No documents yet.</p>
              <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand text-white text-sm font-medium">
                <Plus size={14} /> Add document
              </button>
            </div>
          ) : (
            <RichDataTable columns={columns} data={items} searchPlaceholder="Search documents…" />
          )}
        </main>
      </div>

      <HrModal open={open} onClose={() => setOpen(false)} title="Employee document" icon={FileText} wide>
        <form onSubmit={onCreate} className="space-y-4">
          <HrField label="Employee">
            <select className={hrInputClass} required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">Select…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{employeeName(e)}</option>)}
            </select>
          </HrField>
          <HrField label="Category">
            <select className={hrInputClass} value={form.docCategory} onChange={(e) => setForm({ ...form, docCategory: e.target.value as any })}>
              {DOC_CATEGORIES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </HrField>
          <HrField label="Name"><input className={hrInputClass} required value={form.documentName} onChange={(e) => setForm({ ...form, documentName: e.target.value })} /></HrField>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Issue date"><input type="date" className={hrInputClass} value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></HrField>
            <HrField label="Expiry"><input type="date" className={hrInputClass} value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></HrField>
          </div>
          <HrField label="Upload file"><input type="file" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} /></HrField>
          <HrField label="Document URL" hint="Required if multipart upload is unavailable">
            <input className={hrInputClass} value={form.documentUrl} onChange={(e) => setForm({ ...form, documentUrl: e.target.value })} placeholder="https://…" />
          </HrField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isRtw} onChange={(e) => setForm({ ...form, isRtw: e.target.checked })} />
            Also treat as Right to Work document
          </label>
          <HrModalActions onCancel={() => setOpen(false)} submitLabel="Save" submitting={saving} submitIcon={<Upload size={14} />} />
        </form>
      </HrModal>
    </div>
  );
}
