/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getAccDocument } from '@/lib/accounting-api';
import { formatDate, accApiError } from '@/lib/accounting-utils';
import { ArrowLeft, Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const btn = 'inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted';

function previewKind(url?: string | null): 'image' | 'pdf' | null {
  if (!url) return null;
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(path)) return 'image';
  if (path.endsWith('.pdf')) return 'pdf';
  return null;
}

function fileName(url?: string | null): string {
  if (!url) return '—';
  try {
    return decodeURIComponent(new URL(url, 'https://x').pathname.split('/').pop() || url);
  } catch {
    return url;
  }
}

export default function AccountingDocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [previewFailed, setPreviewFailed] = useState(false);
  const orgId = session?.user?.organizationId;
  const id = params?.id;

  const load = useCallback(async () => {
    if (!id || !orgId) return;
    try {
      const res = await getAccDocument(id, orgId);
      setDoc(res.data);
    } catch (e) {
      toast.error(accApiError(e, 'Failed to load document'));
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [id, orgId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    if (hasAccess) load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  if (!hydrated || !hasAccess) return null;

  const kind = previewKind(doc?.documentUrl);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Documents · View" />
        <main className="p-6 md:p-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/accounting/documents" className={btn}>
              <ArrowLeft className="h-4 w-4" /> Back to documents
            </Link>
            {doc?.documentUrl ? (
              <div className="flex flex-wrap gap-2">
                <a href={doc.documentUrl} target="_blank" rel="noreferrer" className={btn}>
                  <ExternalLink className="h-4 w-4" /> Open
                </a>
                <a
                  href={doc.documentUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
                >
                  <Download className="h-4 w-4" /> Download
                </a>
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading document…
            </div>
          ) : !doc ? (
            <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">Document not found</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section className="glass-panel rounded-2xl border border-border/50 p-4 min-h-[420px] flex items-center justify-center overflow-hidden">
                {kind === 'image' && !previewFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={doc.documentUrl} alt={doc.documentName || 'Document'} className="max-h-[75vh] max-w-full object-contain rounded-lg" onError={() => setPreviewFailed(true)} />
                ) : kind === 'pdf' && !previewFailed ? (
                  <iframe src={doc.documentUrl} title={doc.documentName || 'Document'} className="w-full h-[75vh] rounded-lg border border-border/50 bg-white" />
                ) : (
                  <div className="text-center text-muted-foreground space-y-3 py-12">
                    <FileText className="h-12 w-12 mx-auto opacity-60" />
                    <p className="text-sm">{previewFailed ? 'The file could not be loaded for preview.' : 'No inline preview for this file type.'}</p>
                    {doc.documentUrl ? (
                      <a href={doc.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
                        Open file <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </div>
                )}
              </section>

              <section className="glass-panel rounded-2xl border border-border/50 p-6 space-y-4 h-fit">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground font-semibold">Document</div>
                  <h1 className="text-xl font-bold break-words">{doc.documentName || 'Document'}</h1>
                </div>
                <dl className="space-y-3 text-sm">
                  <Info label="Linked to">
                    <span className="capitalize">{doc.entityLabel || doc.entityType}</span>
                    {doc.entityType !== 'other' ? (
                      doc.entityHref && doc.entityExists !== false ? (
                        <>
                          {' · '}
                          <Link href={doc.entityHref} className="font-mono text-xs text-brand hover:underline">{doc.entityRef || doc.entityId}</Link>
                        </>
                      ) : (
                        <span className="text-muted-foreground"> · {doc.entityRef || doc.entityId}{doc.entityExists === false ? ' (record no longer exists)' : ''}</span>
                      )
                    ) : null}
                  </Info>
                  <Info label="File">
                    <span className="break-all">{fileName(doc.documentUrl)}</span>
                  </Info>
                  <Info label="Added">{formatDate(doc.createdAt)}</Info>
                  <Info label="Added by">{doc.addedBy || '—'}</Info>
                </dl>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.14em]">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
