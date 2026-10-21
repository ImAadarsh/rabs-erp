/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getAccSettings, saveAccSettings } from '@/lib/accounting-api';
import { accApiError, accFieldErrors, statusBadgeClass } from '@/lib/accounting-utils';
import { AccField, AccCreateButton, accInputClass, MtdBanner } from '@/components/accounting/acc-modal';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

type MtdCheck = { key: string; label: string; ok: boolean; action?: string };
type MtdStatus = { liveSubmissionAvailable: boolean; state: string; summary: string; checks: MtdCheck[] };

export default function AccountingSettingsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mtd, setMtd] = useState<MtdStatus | null>(null);
  const orgId = session?.user?.organizationId;
  const [form, setForm] = useState({
    currency: 'GBP',
    vatScheme: 'standard',
    flatRatePercent: '',
    cashAccounting: false,
    fiscalYearStartMonth: '4',
    mtdEnabled: false,
    vatNumber: '',
    hmrcClientId: '',
  });

  const applySettings = useCallback((d: any) => {
    setForm({
      currency: d.defaultCurrency || 'GBP',
      vatScheme: d.vatScheme || 'standard',
      flatRatePercent: d.flatRatePercent != null ? String(Number(d.flatRatePercent)) : '',
      cashAccounting: Boolean(d.cashAccountingEnabled),
      fiscalYearStartMonth: String(d.financialYearStartMonth ?? 4),
      mtdEnabled: Boolean(d.hmrcMtdEnabled),
      vatNumber: d.vatNumber || '',
      hmrcClientId: d.hmrcMtdClientId || '',
    });
    setMtd(d.hmrcMtd || null);
  }, []);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await getAccSettings(orgId);
      applySettings((res as any).data || {});
    } catch (e) {
      toast.error(accApiError(e));
    }
  }, [orgId, applySettings]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    if (hasAccess) load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  async function onSave() {
    if (!orgId) return;
    const next: Record<string, string> = {};
    if (!/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) next.defaultCurrency = 'Use a 3-letter currency code, e.g. GBP';
    const vrn = form.vatNumber.replace(/\s/g, '').toUpperCase();
    if (vrn && !/^(GB)?\d{9}$/.test(vrn)) next.vatNumber = 'VAT number must be 9 digits (optionally prefixed GB)';
    if (form.vatScheme === 'flat_rate' && !(Number(form.flatRatePercent) > 0)) next.flatRatePercent = 'Flat rate % is required for the flat rate scheme';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const res = await saveAccSettings({
        organizationId: orgId,
        defaultCurrency: form.currency.trim().toUpperCase(),
        vatScheme: form.vatScheme,
        flatRateEnabled: form.vatScheme === 'flat_rate',
        flatRatePercent: form.vatScheme === 'flat_rate' && form.flatRatePercent ? Number(form.flatRatePercent) : null,
        cashAccountingEnabled: form.cashAccounting || form.vatScheme === 'cash_accounting',
        financialYearStartMonth: Number(form.fiscalYearStartMonth),
        hmrcMtdEnabled: form.mtdEnabled,
        vatNumber: vrn || null,
        hmrcMtdClientId: form.hmrcClientId.trim() || null,
      });
      applySettings((res as any).data || {});
      toast.success('Settings saved');
    } catch (err) {
      setErrors(accFieldErrors(err));
      toast.error(accApiError(err));
    } finally {
      setSaving(false);
    }
  }

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Accounting Settings" />
        <main className="p-6 md:p-8 space-y-4 max-w-3xl">
          <MtdBanner>
            Live VAT submission to HMRC is blocked until the items in “HMRC MTD connection” below are complete. Returns are never marked submitted without a real HMRC receipt.
          </MtdBanner>

          <div className="glass-panel rounded-2xl border border-border/50 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Organisation accounting</h2>
              <AccCreateButton label={saving ? 'Saving…' : 'Save settings'} onClick={onSave} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AccField label="Base currency" error={errors.defaultCurrency}>
                <input className={accInputClass} value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
              </AccField>
              <AccField label="Financial year starts" error={errors.financialYearStartMonth}>
                <select className={accInputClass} value={form.fiscalYearStartMonth} onChange={(e) => setForm({ ...form, fiscalYearStartMonth: e.target.value })}>
                  {months.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </AccField>
              <AccField label="VAT scheme" error={errors.vatScheme}>
                <select className={accInputClass} value={form.vatScheme} onChange={(e) => setForm({ ...form, vatScheme: e.target.value })}>
                  <option value="standard">Standard</option>
                  <option value="flat_rate">Flat rate</option>
                  <option value="cash_accounting">Cash accounting</option>
                </select>
              </AccField>
              <AccField label="Flat rate %" error={errors.flatRatePercent}>
                <input type="number" step="0.01" className={accInputClass} value={form.flatRatePercent} onChange={(e) => setForm({ ...form, flatRatePercent: e.target.value })} disabled={form.vatScheme !== 'flat_rate'} />
              </AccField>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.cashAccounting} onChange={(e) => setForm({ ...form, cashAccounting: e.target.checked })} />
              Cash accounting flag
            </label>

            <p className="text-xs text-muted-foreground">
              Roles: ADMIN / SUPER_ADMIN / FINANCE / ACCOUNTANT. Users are managed in Identity &amp; Access.
            </p>
          </div>

          <div id="hmrc-mtd" className="glass-panel rounded-2xl border border-border/50 p-6 space-y-4 scroll-mt-24">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-semibold">HMRC MTD connection</h2>
              <span className={statusBadgeClass(mtd?.liveSubmissionAvailable ? 'active' : 'overdue')}>
                {mtd?.liveSubmissionAvailable ? 'Connected' : 'Not connected — blocked on client'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {mtd?.summary ||
                'Live MTD VAT submission is not connected. VAT returns are prepared here and can be exported for filing with HMRC.'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AccField label="VAT registration number (VRN)" error={errors.vatNumber} hint="9 digits, e.g. GB123456789">
                <input className={accInputClass} value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} placeholder="GB…" />
              </AccField>
              <AccField label="HMRC application client ID" error={errors.hmrcMtdClientId} hint="From your HMRC Developer Hub application">
                <input className={accInputClass} value={form.hmrcClientId} onChange={(e) => setForm({ ...form, hmrcClientId: e.target.value })} autoComplete="off" />
              </AccField>
            </div>
            <p className="text-xs text-muted-foreground">
              The client secret is never entered in the browser — send it securely to your RABS administrator, who stores it on the API server.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.mtdEnabled} onChange={(e) => setForm({ ...form, mtdEnabled: e.target.checked })} />
              Use HMRC MTD for VAT for this organisation (takes effect once the connection is complete)
            </label>

            <div>
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.14em] mb-2">What is needed for live submission</h3>
              <ul className="space-y-2">
                {(mtd?.checks || []).map((c) => (
                  <li key={c.key} className="flex gap-2.5 text-sm">
                    {c.ok ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" /> : <XCircle size={18} className="text-red-500 shrink-0 mt-0.5" />}
                    <div>
                      <div className={c.ok ? '' : 'font-medium'}>{c.label}</div>
                      {!c.ok && c.action ? <div className="text-xs text-muted-foreground mt-0.5">{c.action}</div> : null}
                    </div>
                  </li>
                ))}
                {!mtd ? <li className="text-sm text-muted-foreground">Loading connection status…</li> : null}
              </ul>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
