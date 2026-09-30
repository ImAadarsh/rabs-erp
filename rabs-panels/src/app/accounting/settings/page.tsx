/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getAccSettings, saveAccSettings } from '@/lib/accounting-api';
import { accApiError } from '@/lib/accounting-utils';
import { AccField, AccCreateButton, accInputClass, MtdBanner } from '@/components/accounting/acc-modal';
import { toast } from 'sonner';

export default function AccountingSettingsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [saving, setSaving] = useState(false);
  const orgId = session?.user?.organizationId;
  const [form, setForm] = useState({
    currency: 'GBP',
    vatScheme: 'standard',
    flatRatePercent: '',
    cashAccounting: false,
    fiscalYearStartMonth: '4',
    mtdEnabled: false,
    vatNumber: '',
    companyNumber: '',
  });

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await getAccSettings(orgId);
      const d = (res as any).data || {};
      setForm({
        currency: d.currency || 'GBP',
        vatScheme: d.vatScheme || 'standard',
        flatRatePercent: d.flatRatePercent != null ? String(d.flatRatePercent) : '',
        cashAccounting: Boolean(d.cashAccounting),
        fiscalYearStartMonth: String(d.fiscalYearStartMonth ?? 4),
        mtdEnabled: Boolean(d.mtdEnabled),
        vatNumber: d.vatNumber || '',
        companyNumber: d.companyNumber || '',
      });
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

  async function onSave() {
    if (!orgId) return;
    setSaving(true);
    try {
      await saveAccSettings({
        organizationId: orgId,
        currency: form.currency,
        vatScheme: form.vatScheme,
        flatRatePercent: form.flatRatePercent ? Number(form.flatRatePercent) : null,
        cashAccounting: form.cashAccounting,
        fiscalYearStartMonth: Number(form.fiscalYearStartMonth),
        mtdEnabled: form.mtdEnabled,
        vatNumber: form.vatNumber || null,
        companyNumber: form.companyNumber || null,
      });
      toast.success('Settings saved');
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
        <Header title="Accounting Settings" />
        <main className="p-6 md:p-8 space-y-4 max-w-2xl">
          <MtdBanner>
            Enabling MTD only turns on structured export UI. Live HMRC submission still needs credentials and is never silently marked submitted.
          </MtdBanner>

          <div className="glass-panel rounded-2xl border border-border/50 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Organisation accounting</h2>
              <AccCreateButton label={saving ? 'Saving…' : 'Save settings'} onClick={onSave} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AccField label="Base currency">
                <input className={accInputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              </AccField>
              <AccField label="Fiscal year start month">
                <select className={accInputClass} value={form.fiscalYearStartMonth} onChange={(e) => setForm({ ...form, fiscalYearStartMonth: e.target.value })}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </AccField>
              <AccField label="VAT scheme">
                <select className={accInputClass} value={form.vatScheme} onChange={(e) => setForm({ ...form, vatScheme: e.target.value })}>
                  <option value="standard">Standard</option>
                  <option value="flat_rate">Flat rate</option>
                  <option value="cash">Cash accounting</option>
                </select>
              </AccField>
              <AccField label="Flat rate %">
                <input type="number" step="0.01" className={accInputClass} value={form.flatRatePercent} onChange={(e) => setForm({ ...form, flatRatePercent: e.target.value })} disabled={form.vatScheme !== 'flat_rate'} />
              </AccField>
              <AccField label="VAT number">
                <input className={accInputClass} value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} placeholder="GB…" />
              </AccField>
              <AccField label="Company number">
                <input className={accInputClass} value={form.companyNumber} onChange={(e) => setForm({ ...form, companyNumber: e.target.value })} />
              </AccField>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.cashAccounting} onChange={(e) => setForm({ ...form, cashAccounting: e.target.checked })} />
              Cash accounting flag
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.mtdEnabled} onChange={(e) => setForm({ ...form, mtdEnabled: e.target.checked })} />
              MTD export tooling enabled (not live submit)
            </label>

            <p className="text-xs text-muted-foreground">
              Roles: ADMIN / SUPER_ADMIN / FINANCE / ACCOUNTANT. Users are managed in Identity &amp; Access.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
