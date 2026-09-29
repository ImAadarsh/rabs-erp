/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getCorporationTaxWorksheet, saveCorporationTaxWorksheet, getProfitAndLoss } from '@/lib/accounting-api';
import { formatMoney, accApiError } from '@/lib/accounting-utils';
import { AccField, AccCreateButton, accInputClass, accTextareaClass, MtdBanner } from '@/components/accounting/acc-modal';
import { toast } from 'sonner';

export default function AccountingTaxPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [saving, setSaving] = useState(false);
  const [accountingProfit, setAccountingProfit] = useState<number | null>(null);
  const [form, setForm] = useState({
    taxYear: '2025/26',
    accountingProfit: '',
    addBackDepreciation: '',
    disallowableExpenses: '',
    capitalAllowances: '',
    otherAdjustments: '',
    notes: '',
  });
  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const [ct, pl] = await Promise.all([
        getCorporationTaxWorksheet(orgId),
        getProfitAndLoss(orgId).catch(() => null),
      ]);
      const data = (ct as any).data || {};
      const net = (pl as any)?.data?.netProfit;
      setAccountingProfit(net ?? null);
      setForm((f) => ({
        ...f,
        taxYear: data.taxYear || f.taxYear,
        accountingProfit: String(data.accountingProfit ?? net ?? ''),
        addBackDepreciation: String(data.addBackDepreciation ?? ''),
        disallowableExpenses: String(data.disallowableExpenses ?? ''),
        capitalAllowances: String(data.capitalAllowances ?? ''),
        otherAdjustments: String(data.otherAdjustments ?? ''),
        notes: data.notes || '',
      }));
    } catch (e) {
      toast.error(accApiError(e));
    }
  }, [orgId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    if (hasAccess) load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  const taxable =
    Number(form.accountingProfit || 0) +
    Number(form.addBackDepreciation || 0) +
    Number(form.disallowableExpenses || 0) -
    Number(form.capitalAllowances || 0) +
    Number(form.otherAdjustments || 0);

  async function onSave() {
    if (!orgId) return;
    setSaving(true);
    try {
      await saveCorporationTaxWorksheet({
        organizationId: orgId,
        taxYear: form.taxYear,
        accountingProfit: Number(form.accountingProfit || 0),
        addBackDepreciation: Number(form.addBackDepreciation || 0),
        disallowableExpenses: Number(form.disallowableExpenses || 0),
        capitalAllowances: Number(form.capitalAllowances || 0),
        otherAdjustments: Number(form.otherAdjustments || 0),
        taxableProfit: taxable,
        notes: form.notes,
      });
      toast.success('CT worksheet saved (support data — not a CT600 filing)');
    } catch (err) {
      toast.error(accApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Corporation Tax worksheet" />
        <main className="p-6 md:p-8 space-y-4 max-w-3xl">
          <MtdBanner>
            Support worksheet for taxable profit adjustments only — not a full CT600 filing or HMRC submission.
          </MtdBanner>

          <div className="glass-panel rounded-2xl border border-border/50 p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold">Taxable profit adjustments</h2>
                {accountingProfit != null ? (
                  <p className="text-xs text-muted-foreground mt-1">P&amp;L net profit (reference): {formatMoney(accountingProfit)}</p>
                ) : null}
              </div>
              <AccCreateButton label={saving ? 'Saving…' : 'Save worksheet'} onClick={onSave} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AccField label="Tax year">
                <input className={accInputClass} value={form.taxYear} onChange={(e) => setForm({ ...form, taxYear: e.target.value })} />
              </AccField>
              <AccField label="Accounting profit">
                <input type="number" step="0.01" className={accInputClass} value={form.accountingProfit} onChange={(e) => setForm({ ...form, accountingProfit: e.target.value })} />
              </AccField>
              <AccField label="Add-back: depreciation">
                <input type="number" step="0.01" className={accInputClass} value={form.addBackDepreciation} onChange={(e) => setForm({ ...form, addBackDepreciation: e.target.value })} />
              </AccField>
              <AccField label="Add-back: disallowable expenses">
                <input type="number" step="0.01" className={accInputClass} value={form.disallowableExpenses} onChange={(e) => setForm({ ...form, disallowableExpenses: e.target.value })} />
              </AccField>
              <AccField label="Less: capital allowances">
                <input type="number" step="0.01" className={accInputClass} value={form.capitalAllowances} onChange={(e) => setForm({ ...form, capitalAllowances: e.target.value })} />
              </AccField>
              <AccField label="Other adjustments (+/−)">
                <input type="number" step="0.01" className={accInputClass} value={form.otherAdjustments} onChange={(e) => setForm({ ...form, otherAdjustments: e.target.value })} />
              </AccField>
            </div>
            <AccField label="Notes">
              <textarea className={accTextareaClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </AccField>

            <div className="rounded-xl bg-brand/10 border border-brand/25 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium">Estimated taxable profit</span>
              <span className="text-lg font-bold tabular-nums">{formatMoney(taxable)}</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
