'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { getJournalEntry, postJournalEntry, reverseJournalEntry } from '@/lib/api';
import { ArrowLeft, BookOpen, CheckCircle2, AlertTriangle, Loader2, Pencil, Send, Undo2, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

/* eslint-disable @typescript-eslint/no-explicit-any */

const gbp = (n: number) => n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const cap = (s?: string | null) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');
const person = (u?: { firstName?: string; lastName?: string; email?: string } | null) =>
  u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '—' : '—';

const statusClass: Record<string, string> = {
  draft: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  posted: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  voided: 'bg-red-500/10 text-red-600 border-red-500/20'
};

/** Where the document that produced this journal can be opened. */
function sourceLink(entry: any): { href: string; label: string } | null {
  const id = entry.sourceId;
  switch (entry.sourceType) {
    case 'invoice':
      return id ? { href: `/finance/invoices/${id}`, label: `Invoice ${entry.reference || `#${id}`}` } : null;
    case 'order':
      return id ? { href: `/orders/orders/${id}`, label: `Order ${entry.reference || `#${id}`}` } : null;
    case 'payment':
      return { href: '/finance/payments', label: `Payment ${entry.reference || (id ? `#${id}` : '')}`.trim() };
    case 'payroll':
      return { href: '/hr/payroll-runs', label: `Payroll run ${entry.reference || (id ? `#${id}` : '')}`.trim() };
    case 'other':
      if (/^supplier bill/i.test(entry.description || '')) {
        return {
          href: id ? `/accounting/purchases/${id}` : '/accounting/purchases',
          label: `Supplier bill ${entry.reference || ''}`.trim()
        };
      }
      return null;
    default:
      return null;
  }
}

export default function JournalEntryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [entry, setEntry] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showReverse, setShowReverse] = useState(false);
  const [reverseDate, setReverseDate] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    const id = params?.id;
    if (!id) return;
    setLoading(true);
    try {
      const res = await getJournalEntry(id);
      setEntry(res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to load journal entry');
      setEntry(null);
    } finally {
      setLoading(false);
    }
  }, [params?.id]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  const lines = useMemo(
    () => [...(entry?.journalLines || [])].sort((a: any, b: any) => a.lineNumber - b.lineNumber),
    [entry]
  );
  const totals = useMemo(() => {
    const debit = Math.round(lines.reduce((s: number, l: any) => s + num(l.debitAmount), 0) * 100) / 100;
    const credit = Math.round(lines.reduce((s: number, l: any) => s + num(l.creditAmount), 0) * 100) / 100;
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.005 && debit > 0 };
  }, [lines]);

  async function onPost() {
    if (!entry) return;
    setBusy(true);
    try {
      await postJournalEntry(entry.id);
      toast.success(`Journal ${entry.journalNumber} posted`);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to post journal entry');
    } finally {
      setBusy(false);
    }
  }

  async function onReverse() {
    if (!entry) return;
    setBusy(true);
    try {
      const res = await reverseJournalEntry(entry.id, { entryDate: reverseDate });
      toast.success(`Reversal ${res.data?.journalNumber ?? ''} posted`);
      setShowReverse(false);
      if (res.data?.id) router.push(`/finance/journal-entries/${res.data.id}`);
      else await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to reverse journal entry');
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || !hasAccess) return null;

  const source = entry ? sourceLink(entry) : null;
  const details: Array<[string, React.ReactNode]> = entry
    ? [
        ['Entry date', fmtDate(entry.entryDate)],
        ['Type', cap(entry.entryType)],
        [
          'Source',
          source ? (
            <Link href={source.href} className="inline-flex items-center gap-1 text-primary hover:underline">
              {cap(entry.sourceType)} · {source.label} <ExternalLink className="h-3 w-3" />
            </Link>
          ) : (
            cap(entry.sourceType)
          )
        ],
        [
          'Fiscal period',
          entry.fiscalPeriod ? (
            <Link href={`/finance/fiscal-periods/${entry.fiscalPeriod.id}`} className="text-primary hover:underline">
              {entry.fiscalPeriod.periodName}
            </Link>
          ) : (
            '—'
          )
        ],
        ['Reference', entry.reference || '—'],
        ['Business unit', entry.businessUnit?.name || '—'],
        ['Created by', `${person(entry.createdBy)} · ${fmtDate(entry.createdAt)}`],
        ['Posted', entry.postedAt ? `${person(entry.postedBy)} · ${new Date(entry.postedAt).toLocaleString('en-GB')}` : '—']
      ]
    : [];

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Finance · Journal Entry" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="flex w-full flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/finance/journal-entries"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to journal entries
              </Link>
              {entry && (
                <div className="flex flex-wrap items-center gap-2">
                  {entry.status === 'draft' && (
                    <>
                      <Link
                        href={`/finance/journal-entries?edit=${entry.id}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit draft
                      </Link>
                      <button
                        onClick={() => void onPost()}
                        disabled={busy || !totals.balanced}
                        title={totals.balanced ? 'Post to the general ledger' : 'Debits and credits must balance before posting'}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                        Post
                      </button>
                    </>
                  )}
                  {entry.status === 'posted' && !entry.reversedBy && (
                    <button
                      onClick={() => setShowReverse(true)}
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <Undo2 className="h-4 w-4" />
                      Reverse
                    </button>
                  )}
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading journal entry…
              </div>
            ) : !entry ? (
              <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
                Journal entry not found
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h1 className="flex items-center gap-3 text-2xl font-bold">
                        <div className="rounded-xl bg-primary/10 p-2 text-primary">
                          <BookOpen size={24} />
                        </div>
                        {entry.journalNumber}
                      </h1>
                      {entry.description && (
                        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{entry.description}</p>
                      )}
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusClass[entry.status] ?? 'bg-muted text-foreground border-border'}`}
                    >
                      {entry.status}
                    </span>
                  </div>

                  {(entry.reversedBy || entry.reversalOf) && (
                    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
                      {entry.reversedBy && (
                        <span>
                          Reversed by{' '}
                          <Link href={`/finance/journal-entries/${entry.reversedBy.id}`} className="font-medium text-primary hover:underline">
                            {entry.reversedBy.journalNumber}
                          </Link>{' '}
                          on {fmtDate(entry.reversedBy.entryDate)}
                        </span>
                      )}
                      {entry.reversalOf && (
                        <span>
                          Reversal of{' '}
                          <Link href={`/finance/journal-entries/${entry.reversalOf.id}`} className="font-medium text-primary hover:underline">
                            {entry.reversalOf.journalNumber}
                          </Link>
                        </span>
                      )}
                    </div>
                  )}

                  <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    {details.map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                        <dd className="mt-0.5 break-words font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">Journal lines</h2>
                    {totals.balanced ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Balanced
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Out of balance by {gbp(Math.abs(totals.debit - totals.credit))}
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Account</th>
                          <th className="px-3 py-2">Description</th>
                          <th className="px-3 py-2">Cost centre</th>
                          <th className="px-3 py-2 text-right">Debit</th>
                          <th className="px-3 py-2 text-right">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                              No lines on this journal.
                            </td>
                          </tr>
                        )}
                        {lines.map((l: any) => (
                          <tr key={l.id} className="border-b border-border/60">
                            <td className="px-3 py-2 text-muted-foreground">{l.lineNumber}</td>
                            <td className="px-3 py-2">
                              {l.ledgerAccount ? (
                                <>
                                  <span className="font-mono text-xs">{l.ledgerAccount.accountCode}</span>{' '}
                                  <span className="font-medium">{l.ledgerAccount.accountName}</span>
                                </>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 py-2">{l.description || '—'}</td>
                            <td className="px-3 py-2">{l.costCenter?.name || '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{num(l.debitAmount) ? gbp(num(l.debitAmount)) : ''}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{num(l.creditAmount) ? gbp(num(l.creditAmount)) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-semibold">
                          <td colSpan={4} className="px-3 py-3 text-right">Totals</td>
                          <td className="px-3 py-3 text-right tabular-nums">{gbp(totals.debit)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{gbp(totals.credit)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {showReverse && entry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">Reverse {entry.journalNumber}</h2>
              <button onClick={() => setShowReverse(false)} className="rounded p-1 hover:bg-muted" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Posts a new journal ({entry.journalNumber}-REV) with every debit and credit swapped, cancelling this entry
              in the ledger. The original stays posted for the audit trail. The reversal date must fall in an open fiscal period.
            </p>
            <label className="mb-1 block text-sm font-medium">Reversal date</label>
            <input
              type="date"
              value={reverseDate}
              onChange={(e) => setReverseDate(e.target.value)}
              className="mb-6 w-full rounded-lg border border-border bg-background px-3 py-2"
            />
            <div className="flex gap-2">
              <button
                onClick={() => void onReverse()}
                disabled={busy || !reverseDate}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? 'Reversing…' : 'Post reversal'}
              </button>
              <button onClick={() => setShowReverse(false)} className="rounded-lg border border-border px-4 py-2 hover:bg-muted">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
