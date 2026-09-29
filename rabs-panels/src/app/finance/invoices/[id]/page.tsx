'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { UnifiedInvoiceDocument, type InvoiceDocumentData } from '@/components/unified-invoice';
import { getInvoice } from '@/lib/api';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [invoice, setInvoice] = useState<InvoiceDocumentData | null>(null);
  const [loading, setLoading] = useState(true);

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
              <button
                onClick={() => window.print()}
                disabled={!invoice}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                Print / Save PDF
              </button>
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
              <UnifiedInvoiceDocument invoice={invoice} />
            )}
          </div>
        </main>
      </div>

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
