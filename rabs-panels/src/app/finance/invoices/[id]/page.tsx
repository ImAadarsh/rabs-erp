'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { UnifiedInvoiceDocument, type InvoiceDocumentData } from '@/components/unified-invoice';
import { InvoiceLetterheadEditor } from '@/components/invoice-letterhead-editor';
import { getInvoice } from '@/lib/api';
import { ArrowLeft, Printer, Loader2, PenSquare } from 'lucide-react';
import { toast } from 'sonner';

type Letterhead = NonNullable<InvoiceDocumentData['seller']> & { key: string; label: string };

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [invoice, setInvoice] = useState<
    (InvoiceDocumentData & { letterheads?: Letterhead[]; defaultLetterheadKey?: string }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [letterheadKey, setLetterheadKey] = useState('');
  const [editingLetterhead, setEditingLetterhead] = useState(false);
  const storageKey = `rabs.invoiceLetterhead.${session?.user?.organizationId ?? ''}`;
  const letterheads = invoice?.letterheads ?? [];

  useEffect(() => {
    if (!invoice) return;
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
    const keys = (invoice.letterheads ?? []).map((l) => l.key);
    setLetterheadKey(saved && keys.includes(saved) ? saved : invoice.defaultLetterheadKey || keys[0] || '');
  }, [invoice, storageKey]);

  const docData = useMemo(() => {
    if (!invoice) return null;
    const chosen = letterheads.find((l) => l.key === letterheadKey);
    return chosen ? { ...invoice, seller: chosen } : invoice;
  }, [invoice, letterheads, letterheadKey]);

  function onLetterheadChange(key: string) {
    setLetterheadKey(key);
    window.localStorage.setItem(storageKey, key);
  }

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    const id = params?.id;
    if (!id) return;

    setLoading(true);
    getInvoice(id)
      .then((res) => setInvoice(res.data))
      .catch((e: any) => {
        toast.error(e?.response?.data?.error?.message || 'Failed to load invoice');
        setInvoice(null);
      })
      .finally(() => setLoading(false));
  }, [hydrated, hasAccess, session?.accessToken, params?.id, router]);

  function reloadInvoice() {
    if (!params?.id) return;
    getInvoice(params.id)
      .then((res) => setInvoice(res.data))
      .catch(() => undefined);
  }

  if (!hydrated || !hasAccess) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Finance · Invoice" />
        <main className="flex-1 overflow-auto p-4 md:p-6 print:p-0">
          <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-4 print:max-w-none">
            <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
              <Link
                href="/finance/invoices"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to invoices
              </Link>
              <div className="flex flex-wrap items-center gap-2">
              {letterheads.length > 1 && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Letterhead</span>
                  <select
                    value={letterheadKey}
                    onChange={(e) => onLetterheadChange(e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    {letterheads.map((l) => (
                      <option key={l.key} value={l.key}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                onClick={() => setEditingLetterhead(true)}
                disabled={!invoice}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                title="Logo, company name, address, contact details, VAT number, footer and colour"
              >
                <PenSquare className="h-4 w-4" />
                Edit letterhead
              </button>
              <button
                onClick={() => window.print()}
                disabled={!invoice}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                Print / Save PDF
              </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading invoice…
              </div>
            ) : !invoice ? (
              <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
                Invoice not found
              </div>
            ) : (
              <UnifiedInvoiceDocument invoice={docData ?? invoice} />
            )}
          </div>
        </main>
      </div>

      <InvoiceLetterheadEditor
        open={editingLetterhead}
        organizationId={(invoice as any)?.organizationId ? String((invoice as any).organizationId) : session?.user?.organizationId}
        onClose={() => setEditingLetterhead(false)}
        onSaved={reloadInvoice}
      />

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .invoice-document,
          .invoice-document * {
            visibility: visible !important;
          }
          .invoice-document {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
          aside,
          header,
          nav,
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
