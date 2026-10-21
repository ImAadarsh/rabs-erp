/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getAccBill, submitAccBill, approveAccBill, postAccBill, payAccBill } from '@/lib/accounting-api';
import { formatMoney, formatDate, statusBadgeClass, accApiError, accFieldErrors, printElement, printTable, escapeHtml } from '@/lib/accounting-utils';
import { AccModal, AccField, AccModalActions, accInputClass } from '@/components/accounting/acc-modal';
import { ArrowLeft, Printer, Loader2, Paperclip, ExternalLink, Wallet } from 'lucide-react';
import { toast } from 'sonner';

type Action = 'submit' | 'approve' | 'post';

const btn = 'inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50';
const primaryBtn = 'inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50';

/** Reverse-charge VAT is in the VAT figure but not in the amount owed to the supplier. */
function reverseChargeVat(bill: any) {
  const rc = Number(bill?.subtotal || 0) + Number(bill?.taxAmount || 0) - Number(bill?.total || 0);
  return rc > 0.004 ? Math.round(rc * 100) / 100 : 0;
}

export default function AccountingBillDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [bill, setBill] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Action | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payForm, setPayForm] = useState({ paymentDate: '', amount: '', reference: '' });
  const [payErrors, setPayErrors] = useState<Record<string, string>>({});
  const orgId = session?.user?.organizationId;
  const id = params?.id;

  const load = useCallback(async () => {
    if (!id || !orgId) return;
    try {
      const res = await getAccBill(id, orgId);
      setBill(res.data);
    } catch (e) {
      toast.error(accApiError(e, 'Failed to load bill'));
      setBill(null);
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

  async function runAction(action: Action) {
    if (!id) return;
    const labels: Record<Action, string> = { submit: 'Bill submitted for approval', approve: 'Bill approved', post: 'Bill posted to the ledger' };
    setPending(action);
    try {
      const fn = action === 'submit' ? submitAccBill : action === 'approve' ? approveAccBill : postAccBill;
      const res: any = await fn(id);
      if (res?.data) setBill((b: any) => ({ ...b, ...res.data, supplier: b?.supplier, lines: b?.lines }));
      toast.success(labels[action]);
      await load();
    } catch (err) {
      toast.error(accApiError(err));
    } finally {
      setPending(null);
    }
  }

  async function onPay(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    const amount = Number(payForm.amount);
    const next: Record<string, string> = {};
    if (!payForm.paymentDate) next.paymentDate = 'Payment date is required';
    if (!(amount > 0)) next.amount = 'Amount must be greater than 0';
    else if (amount > Number(bill?.outstanding ?? 0) + 0.005) next.amount = `Amount cannot exceed the outstanding ${formatMoney(bill?.outstanding, bill?.currency || 'GBP')}`;
    setPayErrors(next);
    if (Object.keys(next).length) return;
    setPaying(true);
    try {
      await payAccBill(id, { paymentDate: payForm.paymentDate, amount, reference: payForm.reference.trim() || undefined });
      toast.success('Payment recorded');
      setPayOpen(false);
      await load();
    } catch (err) {
      setPayErrors(accFieldErrors(err));
      toast.error(accApiError(err, 'Failed to record payment'));
    } finally {
      setPaying(false);
    }
  }

  function onPrint() {
    if (!bill) return;
    const cur = bill.currency || 'GBP';
    const meta = printTable(
      [{ label: 'Supplier' }, { label: 'Bill date' }, { label: 'Due date' }, { label: 'Status' }],
      [[bill.supplier?.name || '—', formatDate(bill.billDate), formatDate(bill.dueDate), bill.status]]
    );
    const lines = printTable(
      [{ label: 'Description' }, { label: 'Qty', num: true }, { label: 'Unit price', num: true }, { label: 'VAT', num: true }, { label: 'VAT amount', num: true }, { label: 'Line total', num: true }],
      (bill.lines || []).map((l: any) => [l.description, Number(l.quantity), formatMoney(l.unitPrice, cur), vatLabel(l), formatMoney(l.taxAmount, cur), formatMoney(l.lineTotal, cur)]),
      [
        ['Net', '', '', '', '', formatMoney(bill.subtotal, cur)],
        ['VAT', '', '', '', '', formatMoney(bill.taxAmount, cur)],
        ...(reverseChargeVat(bill) > 0 ? [['Less reverse-charge VAT (not payable)', '', '', '', '', formatMoney(-reverseChargeVat(bill), cur)]] : []),
        ['Total', '', '', '', '', formatMoney(bill.total, cur)],
        ['Paid', '', '', '', '', formatMoney(bill.paidAmount, cur)],
        ['Outstanding', '', '', '', '', formatMoney(bill.outstanding, cur)],
      ]
    );
    const payments = (bill.payments || []).length
      ? `<h2>Payments</h2>${printTable(
          [{ label: 'Date' }, { label: 'Reference' }, { label: 'Journal' }, { label: 'Amount', num: true }],
          bill.payments.map((p: any) => [formatDate(p.paymentDate), p.reference || '—', p.journalNumber || '—', formatMoney(p.amount, cur)])
        )}`
      : '';
    const notes = bill.notes ? `<h2>Notes</h2><p>${escapeHtml(bill.notes)}</p>` : '';
    printElement(`Bill ${bill.billNumber}`, `${meta}<h2>Lines</h2>${lines}${payments}${notes}`, bill.supplier?.name);
  }

  if (!hydrated || !hasAccess) return null;

  const cur = bill?.currency || 'GBP';
  const status = bill?.status as string | undefined;
  const posted = Boolean(bill?.journalEntryId);
  const canSubmit = status === 'draft';
  const canApprove = status === 'draft' || status === 'pending_approval';
  const canPost = !posted && ['draft', 'pending_approval', 'approved'].includes(status || '');
  const canPay = Boolean(bill) && status !== 'void' && status !== 'paid' && Number(bill?.outstanding ?? 0) > 0;
  const journal = bill?.journalEntry;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Purchases · Bill" />
        <main className="p-6 md:p-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/accounting/purchases" className={btn}>
              <ArrowLeft className="h-4 w-4" /> Back to bills
            </Link>
            {bill ? (
              <div className="flex flex-wrap items-center gap-2">
                {canSubmit && (
                  <button type="button" className={btn} disabled={pending !== null} onClick={() => runAction('submit')}>
                    {pending === 'submit' ? 'Submitting…' : 'Submit for approval'}
                  </button>
                )}
                {canApprove && (
                  <button type="button" className={btn} disabled={pending !== null} onClick={() => runAction('approve')}>
                    {pending === 'approve' ? 'Approving…' : 'Approve'}
                  </button>
                )}
                {canPost && (
                  <button type="button" className={btn} disabled={pending !== null} onClick={() => runAction('post')}>
                    {pending === 'post' ? 'Posting…' : 'Post to ledger'}
                  </button>
                )}
                {canPay && (
                  <button
                    type="button"
                    className={btn}
                    disabled={pending !== null}
                    onClick={() => {
                      setPayForm({ paymentDate: new Date().toISOString().slice(0, 10), amount: Number(bill.outstanding).toFixed(2), reference: '' });
                      setPayErrors({});
                      setPayOpen(true);
                    }}
                  >
                    <Wallet className="h-4 w-4" /> Record payment
                  </button>
                )}
                <Link href={`/accounting/documents?entityType=bill&entityId=${bill.id}`} className={btn}>
                  <Paperclip className="h-4 w-4" /> Attach document
                </Link>
                <button type="button" className={primaryBtn} onClick={onPrint}>
                  <Printer className="h-4 w-4" /> Print
                </button>
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading bill…
            </div>
          ) : !bill ? (
            <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">Bill not found</div>
          ) : (
            <>
              <section className="glass-panel rounded-2xl border border-border/50 p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground font-semibold">Bill</div>
                    <h1 className="text-2xl font-bold font-mono">{bill.billNumber}</h1>
                    <div className="text-sm text-muted-foreground mt-1">{bill.supplier?.name || '—'}</div>
                  </div>
                  <span className={statusBadgeClass(status)}>{String(status || 'draft').replace(/_/g, ' ')}</span>
                </div>
                <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <Info label="Bill date" value={formatDate(bill.billDate)} />
                  <Info label="Due date" value={formatDate(bill.dueDate)} />
                  <Info label="Currency" value={cur} />
                  <Info label="Approved" value={bill.approvedAt ? formatDate(bill.approvedAt) : '—'} />
                  <Info label="Supplier email" value={bill.supplier?.email || '—'} />
                  <Info label="Supplier code" value={bill.supplier?.code || '—'} />
                  <Info label="Posted to ledger" value={posted ? formatDate(bill.postedAt) : 'Not posted'} />
                  <Info label="Created" value={formatDate(bill.createdAt)} />
                </dl>
                {bill.notes ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{bill.notes}</p> : null}
              </section>

              <section className="glass-panel rounded-2xl border border-border/50 p-6 space-y-3">
                <h2 className="font-semibold">Lines</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left py-2">Description</th>
                        <th className="text-left py-2">Account</th>
                        <th className="text-right py-2">Qty</th>
                        <th className="text-right py-2">Unit price</th>
                        <th className="text-right py-2">VAT</th>
                        <th className="text-right py-2">VAT amount</th>
                        <th className="text-right py-2">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bill.lines || []).map((l: any) => (
                        <tr key={l.id} className="border-b border-border/40">
                          <td className="py-2">{l.description}</td>
                          <td className="py-2 text-muted-foreground">{l.ledgerAccount ? `${l.ledgerAccount.accountCode} ${l.ledgerAccount.accountName}` : 'Default (6600)'}</td>
                          <td className="py-2 text-right tabular-nums">{Number(l.quantity)}</td>
                          <td className="py-2 text-right tabular-nums">{formatMoney(l.unitPrice, cur)}</td>
                          <td className="py-2 text-right">{vatLabel(l)}</td>
                          <td className="py-2 text-right tabular-nums">{formatMoney(l.taxAmount, cur)}</td>
                          <td className="py-2 text-right tabular-nums">{formatMoney(l.lineTotal, cur)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ml-auto w-full max-w-xs space-y-1 text-sm pt-2">
                  <Total label="Net" value={formatMoney(bill.subtotal, cur)} />
                  <Total label="VAT" value={formatMoney(bill.taxAmount, cur)} />
                  {reverseChargeVat(bill) > 0 ? (
                    <Total label="Less reverse-charge VAT (not payable)" value={formatMoney(-reverseChargeVat(bill), cur)} />
                  ) : null}
                  <Total label="Total" value={formatMoney(bill.total, cur)} strong />
                  <Total label="Paid" value={formatMoney(bill.paidAmount, cur)} />
                  <Total label="Outstanding" value={formatMoney(bill.outstanding, cur)} strong />
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="glass-panel rounded-2xl border border-border/50 p-6 space-y-3">
                  <h2 className="font-semibold">Payments</h2>
                  {(bill.payments || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payments recorded.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b">
                          <th className="text-left py-2">Date</th>
                          <th className="text-left py-2">Reference</th>
                          <th className="text-left py-2">Journal</th>
                          <th className="text-right py-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bill.payments.map((p: any) => (
                          <tr key={p.id} className="border-b border-border/40">
                            <td className="py-2">{formatDate(p.paymentDate)}</td>
                            <td className="py-2">{p.reference || '—'}{p.bankAccount?.accountName ? <span className="text-muted-foreground"> · {p.bankAccount.accountName}</span> : null}</td>
                            <td className="py-2 font-mono text-xs">{p.journalNumber || '—'}</td>
                            <td className="py-2 text-right tabular-nums">{formatMoney(p.amount, p.currency || cur)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>

                <section className="glass-panel rounded-2xl border border-border/50 p-6 space-y-3">
                  <h2 className="font-semibold">Attached documents</h2>
                  {(bill.documents || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No documents yet.{' '}
                      <Link href={`/accounting/documents?entityType=bill&entityId=${bill.id}`} className="text-brand hover:underline">Attach one</Link>
                    </p>
                  ) : (
                    <ul className="divide-y divide-border/40 text-sm">
                      {bill.documents.map((d: any, i: number) => (
                        <li key={d.id || i} className="py-2 flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate">
                            {d.id ? (
                              <Link href={`/accounting/documents/${d.id}`} className="hover:underline">{d.documentName || 'Document'}</Link>
                            ) : (
                              d.documentName || 'Document'
                            )}
                            <span className="text-muted-foreground"> · {formatDate(d.createdAt)}</span>
                          </span>
                          {d.documentUrl ? (
                            <a href={d.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand text-xs hover:underline shrink-0">
                              Open <ExternalLink size={12} />
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              <section className="glass-panel rounded-2xl border border-border/50 p-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">Ledger journal</h2>
                  {journal ? (
                    <Link href={`/finance/journal-entries/${journal.id}`} className="text-xs text-brand hover:underline">
                      Open journal
                    </Link>
                  ) : null}
                </div>
                {!journal ? (
                  <p className="text-sm text-muted-foreground">Not posted yet. Use “Post to ledger” to create the purchase journal (Dr expense + VAT, Cr creditors).</p>
                ) : (
                  <>
                    <div className="text-sm">
                      <span className="font-mono text-xs">{journal.journalNumber}</span> · {formatDate(journal.entryDate)} ·{' '}
                      <span className={statusBadgeClass(journal.status)}>{journal.status}</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b">
                          <th className="text-left py-2">Account</th>
                          <th className="text-left py-2">Description</th>
                          <th className="text-right py-2">Debit</th>
                          <th className="text-right py-2">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(journal.journalLines || []).map((jl: any) => (
                          <tr key={jl.id} className="border-b border-border/40">
                            <td className="py-2">
                              <span className="font-mono text-xs">{jl.ledgerAccount?.accountCode}</span> {jl.ledgerAccount?.accountName}
                            </td>
                            <td className="py-2 text-muted-foreground">{jl.description || '—'}</td>
                            <td className="py-2 text-right tabular-nums">{Number(jl.debitAmount) ? formatMoney(jl.debitAmount, cur) : '—'}</td>
                            <td className="py-2 text-right tabular-nums">{Number(jl.creditAmount) ? formatMoney(jl.creditAmount, cur) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </section>
            </>
          )}
        </main>
      </div>

      <AccModal open={payOpen} onClose={() => setPayOpen(false)} title="Record payment" icon={Wallet}>
        <form onSubmit={onPay} className="space-y-3" noValidate>
          <p className="text-xs text-muted-foreground">Posts Dr creditors (2000) / Cr bank (1000) and updates the bill status.</p>
          <AccField label="Payment date" error={payErrors.paymentDate}>
            <input type="date" className={accInputClass} value={payForm.paymentDate} onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} />
          </AccField>
          <AccField label="Amount" error={payErrors.amount} hint={`Outstanding ${formatMoney(bill?.outstanding, cur)}`}>
            <input type="number" step="0.01" min="0.01" className={accInputClass} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
          </AccField>
          <AccField label="Reference" error={payErrors.reference}>
            <input className={accInputClass} value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
          </AccField>
          <AccModalActions onCancel={() => setPayOpen(false)} submitLabel="Record payment" submitting={paying} />
        </form>
      </AccModal>
    </div>
  );
}

function vatLabel(l: any) {
  if (l.vatCode?.code) return l.vatCode.code;
  const rate = Number(l.taxRate || 0);
  return `${Math.round((rate > 1 ? rate : rate * 100) * 100) / 100}%`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.14em]">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'font-semibold border-t border-border/50 pt-1' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
