/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil } from 'lucide-react';
import clsx from 'clsx';
import { useRabs } from '@/components/rabs/shell';
import { Btn, Card, Empty, Field, Modal, Spinner, StatusBadge, Tabs, Toggle, inputCls, textareaCls } from '@/components/rabs/ui';
import { rabs, errMsg, gbp, num, fmtDateTime, UNIT_LABEL } from '@/lib/rabs-api';

type Tab = 'settings' | 'statuses' | 'products' | 'labour' | 'permissions' | 'staff' | 'audit';

export default function AdminPage() {
  const { can } = useRabs();
  const [tab, setTab] = useState<Tab>('settings');
  if (!can('admin')) return <div className="rounded-2xl bg-amber-50 text-amber-800 p-4 text-sm">Only administrators can change RABS settings.</div>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Admin</h1>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'settings', label: 'Settings' },
          { key: 'statuses', label: 'Statuses & colours' },
          { key: 'products', label: 'Products & prices' },
          { key: 'labour', label: 'Labour rules' },
          { key: 'permissions', label: 'Permissions' },
          { key: 'staff', label: 'Staff' },
          { key: 'audit', label: 'Price changes' }
        ]}
      />
      {tab === 'settings' && <SettingsTab />}
      {tab === 'statuses' && <StatusesTab />}
      {tab === 'products' && <ProductsTab />}
      {tab === 'labour' && <LabourTab />}
      {tab === 'permissions' && <PermissionsTab />}
      {tab === 'staff' && <StaffTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await rabs.get<T>(path));
    } catch (e) {
      setError(errMsg(e));
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, setData, error, load };
}

// ---- Settings -----------------------------------------------------------------------

const COMPANY_FIELDS: Array<[string, string]> = [
  ['name', 'Company name'],
  ['tagline', 'Tagline'],
  ['address', 'Address'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['vatNumber', 'VAT number'],
  ['companyNumber', 'Company number'],
  ['bankDetails', 'Bank details (for invoices)']
];

function SettingsTab() {
  const { reload } = useRabs();
  const { data, error, load } = useLoad<any>('/admin/settings');
  const [f, setF] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setF({ ...data, vatPercent: num(data.vatRate * 100, 2), companyDetails: { ...(data.companyDetails || {}) } });
  }, [data]);
  if (error) return <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>;
  if (!f) return <Spinner />;
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const setCo = (k: string, v: string) => setF((p: any) => ({ ...p, companyDetails: { ...p.companyDetails, [k]: v } }));
  const save = async () => {
    setSaving(true);
    try {
      await rabs.put('/admin/settings', {
        vatRate: Number(f.vatPercent) / 100,
        depositMode: f.depositMode,
        depositPercent: Number(f.depositPercent),
        depositFixedAmount: Number(f.depositFixedAmount),
        depositMinAmount: Number(f.depositMinAmount),
        autoCloseWhenPaid: !!f.autoCloseWhenPaid,
        defaultDeliveryCharge: Number(f.defaultDeliveryCharge),
        quoteValidityDays: Number(f.quoteValidityDays),
        jobPrefix: f.jobPrefix,
        quotePrefix: f.quotePrefix,
        invoicePrefix: f.invoicePrefix,
        nextJobNumber: Number(f.nextJobNumber),
        nextQuoteNumber: Number(f.nextQuoteNumber),
        nextInvoiceNumber: Number(f.nextInvoiceNumber),
        documentFooter: f.documentFooter || null,
        quoteTerms: f.quoteTerms || null,
        companyDetails: Object.fromEntries(Object.entries(f.companyDetails || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined))
      });
      toast.success('Settings saved');
      await load();
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-4 max-w-3xl">
      <Card title="Money">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="VAT rate (%)">
            <input className={inputCls} inputMode="decimal" value={f.vatPercent} onChange={(e) => set('vatPercent', e.target.value)} />
          </Field>
          <Field label="Default delivery charge (£ ex VAT)" hint="Added to quotes for jobs that need delivery">
            <input className={inputCls} inputMode="decimal" value={f.defaultDeliveryCharge} onChange={(e) => set('defaultDeliveryCharge', e.target.value)} />
          </Field>
          <Field label="Deposit rule">
            <select className={inputCls} value={f.depositMode} onChange={(e) => set('depositMode', e.target.value)}>
              <option value="percent">Percentage of total</option>
              <option value="fixed">Fixed amount</option>
              <option value="none">No deposit needed</option>
            </select>
          </Field>
          {f.depositMode === 'percent' && (
            <Field label="Deposit (%)">
              <input className={inputCls} inputMode="decimal" value={f.depositPercent} onChange={(e) => set('depositPercent', e.target.value)} />
            </Field>
          )}
          {f.depositMode === 'fixed' && (
            <Field label="Deposit amount (£)">
              <input className={inputCls} inputMode="decimal" value={f.depositFixedAmount} onChange={(e) => set('depositFixedAmount', e.target.value)} />
            </Field>
          )}
          {f.depositMode !== 'none' && (
            <Field label="Minimum deposit (£)">
              <input className={inputCls} inputMode="decimal" value={f.depositMinAmount} onChange={(e) => set('depositMinAmount', e.target.value)} />
            </Field>
          )}
          <Field label="Quote valid for (days)">
            <input className={inputCls} inputMode="numeric" value={f.quoteValidityDays} onChange={(e) => set('quoteValidityDays', e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Toggle checked={!!f.autoCloseWhenPaid} onChange={(v) => set('autoCloseWhenPaid', v)} label="Close jobs automatically once work is complete and fully paid" />
        </div>
      </Card>

      <Card title="Document numbers">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Job prefix">
            <input className={inputCls} value={f.jobPrefix} onChange={(e) => set('jobPrefix', e.target.value)} />
          </Field>
          <Field label="Quote prefix">
            <input className={inputCls} value={f.quotePrefix} onChange={(e) => set('quotePrefix', e.target.value)} />
          </Field>
          <Field label="Invoice prefix">
            <input className={inputCls} value={f.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value)} />
          </Field>
          <Field label="Next job no.">
            <input className={inputCls} inputMode="numeric" value={f.nextJobNumber} onChange={(e) => set('nextJobNumber', e.target.value)} />
          </Field>
          <Field label="Next quote no.">
            <input className={inputCls} inputMode="numeric" value={f.nextQuoteNumber} onChange={(e) => set('nextQuoteNumber', e.target.value)} />
          </Field>
          <Field label="Next invoice no.">
            <input className={inputCls} inputMode="numeric" value={f.nextInvoiceNumber} onChange={(e) => set('nextInvoiceNumber', e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Numbers can only move forwards so documents are never duplicated.</p>
      </Card>

      <Card title="Company details on documents">
        <div className="grid sm:grid-cols-2 gap-4">
          {COMPANY_FIELDS.map(([k, label]) => (
            <Field key={k} label={label} className={k === 'address' || k === 'bankDetails' ? 'sm:col-span-2' : ''}>
              <input className={inputCls} value={f.companyDetails?.[k] || ''} onChange={(e) => setCo(k, e.target.value)} />
            </Field>
          ))}
        </div>
      </Card>

      <Card title="Wording">
        <div className="space-y-4">
          <Field label="Quote terms">
            <textarea className={textareaCls} value={f.quoteTerms || ''} onChange={(e) => set('quoteTerms', e.target.value)} />
          </Field>
          <Field label="Document footer">
            <textarea className={textareaCls} value={f.documentFooter || ''} onChange={(e) => set('documentFooter', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Btn size="lg" className="w-full" loading={saving} onClick={save}>
        Save settings
      </Btn>
    </div>
  );
}

// ---- Statuses -----------------------------------------------------------------------

function StatusesTab() {
  const { reload } = useRabs();
  const { data, setData, error, load } = useLoad<any[]>('/admin/statuses');
  const [saving, setSaving] = useState(false);
  if (error) return <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>;
  if (!data) return <Spinner />;
  const upd = (code: string, k: string, v: any) => setData(data.map((s) => (s.code === code ? { ...s, [k]: v } : s)));
  const save = async () => {
    setSaving(true);
    try {
      await rabs.put('/admin/statuses', {
        statuses: data.map((s) => ({ code: s.code, label: s.label, color: s.color, textColor: s.textColor, nextActionLabel: s.nextActionLabel || null, isActive: s.isActive }))
      });
      toast.success('Statuses saved');
      await load();
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-4">
      <Card pad={false}>
        <div className="divide-y divide-border/60">
          {data.map((s) => (
            <div key={s.code} className="grid grid-cols-1 md:grid-cols-[180px_1fr_1fr_auto] gap-3 items-center px-4 py-3">
              <div className="flex items-center gap-2">
                <StatusBadge label={s.label} color={s.color} textColor={s.textColor} />
              </div>
              <div className="flex gap-2 items-center">
                <input type="color" value={s.color} onChange={(e) => upd(s.code, 'color', e.target.value.toUpperCase())} className="h-10 w-12 rounded-lg border border-border cursor-pointer" aria-label={`${s.label} colour`} />
                <input type="color" value={s.textColor} onChange={(e) => upd(s.code, 'textColor', e.target.value.toUpperCase())} className="h-10 w-12 rounded-lg border border-border cursor-pointer" aria-label={`${s.label} text colour`} />
                <input className={clsx(inputCls, 'h-10')} value={s.label} onChange={(e) => upd(s.code, 'label', e.target.value)} aria-label="Label" />
              </div>
              <input className={clsx(inputCls, 'h-10')} value={s.nextActionLabel || ''} onChange={(e) => upd(s.code, 'nextActionLabel', e.target.value)} placeholder="Next button text" aria-label="Next action label" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={s.isActive} onChange={(e) => upd(s.code, 'isActive', e.target.checked)} className="h-5 w-5" /> Show
              </label>
            </div>
          ))}
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">Statuses are set automatically by the workflow; here you control their names, colours and the big “Next step” button text.</p>
      <Btn size="lg" className="w-full" loading={saving} onClick={save}>
        Save statuses
      </Btn>
    </div>
  );
}

// ---- Products -----------------------------------------------------------------------

const KINDS = ['flooring', 'accessory', 'furniture', 'service'];
const UNITS = ['m2', 'sqyd', 'linear_m', 'item', 'pack', 'roll'];
const METHODS: Array<[string, string]> = [
  ['per_m2', 'Per m² (area)'],
  ['per_sqyd', 'Per square yard'],
  ['per_linear_m', 'Per linear metre (perimeter)'],
  ['per_pack', 'Per pack (coverage)'],
  ['per_item', 'Per item']
];

function ProductsTab() {
  const { reload } = useRabs();
  const { data, error, load } = useLoad<any[]>('/admin/products');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any | null>(null);
  const list = useMemo(
    () => (data || []).filter((p) => (!kind || p.kind === kind) && (!q || `${p.name} ${p.code} ${p.category} ${p.colour || ''}`.toLowerCase().includes(q.toLowerCase()))),
    [data, kind, q]
  );
  if (error) return <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <input className={inputCls} placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={clsx(inputCls, 'sm:w-48')} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          {KINDS.map((k) => (
            <option key={k} value={k} className="capitalize">
              {k}
            </option>
          ))}
        </select>
        <Btn icon={<Plus size={16} />} className="h-12" onClick={() => setEdit({ kind: 'flooring', unit: 'm2', calcMethod: 'per_m2', wastagePercent: 0, costPrice: 0, sellPrice: 0, isActive: true, category: '' })}>
          Add
        </Btn>
      </div>
      <Card pad={false}>
        {list.length === 0 ? (
          <Empty>No products.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="px-4 py-2">Product</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Method</th>
                  <th className="px-2 py-2 text-right">Cost</th>
                  <th className="px-2 py-2 text-right">Sell</th>
                  <th className="px-2 py-2 text-right">Margin</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className={clsx('border-b border-border/60', !p.isActive && 'opacity-50')}>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold">
                        {p.name}
                        {p.colour ? ` — ${p.colour}` : ''}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.code} · {p.category}
                        {p.rollWidthM ? ` · ${num(p.rollWidthM)} m roll` : ''}
                        {p.packCoverageM2 ? ` · ${num(p.packCoverageM2)} m²/pack` : ''}
                        {p.wastagePercent ? ` · +${num(p.wastagePercent)}% waste` : ''}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 capitalize">{p.kind}</td>
                    <td className="px-2 py-2.5 text-xs">{METHODS.find((m) => m[0] === p.calcMethod)?.[1] || p.calcMethod}</td>
                    <td className="px-2 py-2.5 text-right">{gbp(p.costPrice)}</td>
                    <td className="px-2 py-2.5 text-right font-semibold">
                      {gbp(p.sellPrice)}
                      <span className="text-xs text-muted-foreground">/{UNIT_LABEL[p.unit] || p.unit}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right text-xs">{p.sellPrice > 0 ? `${num(((p.sellPrice - p.costPrice) / p.sellPrice) * 100, 0)}%` : '—'}</td>
                    <td className="px-2 py-2.5">
                      <button onClick={() => setEdit(p)} className="p-2 rounded-lg hover:bg-muted" aria-label={`Edit ${p.name}`}>
                        <Pencil size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {edit && (
        <ProductModal
          p={edit}
          categories={[...new Set((data || []).filter((x) => x.kind !== 'accessory').map((x) => x.category))]}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            setEdit(null);
            await load();
            await reload();
          }}
        />
      )}
    </div>
  );
}

function ProductModal({ p, categories, onClose, onSaved }: { p: any; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({ ...p, appliesToText: (p.appliesTo || []).join(', ') });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        code: f.code,
        name: f.name,
        category: f.category,
        kind: f.kind,
        unit: f.unit,
        calcMethod: f.calcMethod,
        rollWidthM: f.rollWidthM ? Number(f.rollWidthM) : null,
        packCoverageM2: f.packCoverageM2 ? Number(f.packCoverageM2) : null,
        wastagePercent: Number(f.wastagePercent || 0),
        costPrice: Number(f.costPrice || 0),
        sellPrice: Number(f.sellPrice || 0),
        accessoryBasis: f.kind === 'accessory' ? f.accessoryBasis || 'each' : null,
        accessoryFactor: f.kind === 'accessory' && f.accessoryFactor !== '' && f.accessoryFactor !== null && f.accessoryFactor !== undefined ? Number(f.accessoryFactor) : null,
        appliesTo: f.kind === 'accessory' ? String(f.appliesToText || '').split(',').map((s: string) => s.trim()).filter(Boolean) : null,
        defaultSelected: !!f.defaultSelected,
        colour: f.colour || null,
        supplier: f.supplier || null,
        isActive: f.isActive !== false
      };
      if (p.id) await rabs.patch(`/admin/products/${p.id}`, body);
      else await rabs.post('/admin/products', body);
      toast.success('Product saved');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={p.id ? `Edit ${p.name}` : 'New product'}
      wide
      footer={
        <Btn loading={busy} onClick={save}>
          Save product
        </Btn>
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Name">
          <input className={inputCls} value={f.name || ''} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Code">
          <input className={inputCls} value={f.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())} />
        </Field>
        <Field label="Type">
          <select className={inputCls} value={f.kind} onChange={(e) => set('kind', e.target.value)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <input list="rabs-cats" className={inputCls} value={f.category || ''} onChange={(e) => set('category', e.target.value)} placeholder="Carpet, Laminate, LVT, Vinyl, Beds…" />
          <datalist id="rabs-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Colour / finish">
          <input className={inputCls} value={f.colour || ''} onChange={(e) => set('colour', e.target.value)} />
        </Field>
        <Field label="Supplier">
          <input className={inputCls} value={f.supplier || ''} onChange={(e) => set('supplier', e.target.value)} />
        </Field>
        <Field label="Sold per (unit)">
          <select className={inputCls} value={f.unit} onChange={(e) => set('unit', e.target.value)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="How quantity is calculated">
          <select className={inputCls} value={f.calcMethod} onChange={(e) => set('calcMethod', e.target.value)}>
            {METHODS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {f.calcMethod === 'per_m2' && (
          <Field label="Roll width (m)" hint="For carpet/vinyl: cut from the roll, not just area">
            <input className={inputCls} inputMode="decimal" value={f.rollWidthM ?? ''} onChange={(e) => set('rollWidthM', e.target.value)} />
          </Field>
        )}
        {f.calcMethod === 'per_pack' && (
          <Field label="Pack coverage (m²)">
            <input className={inputCls} inputMode="decimal" value={f.packCoverageM2 ?? ''} onChange={(e) => set('packCoverageM2', e.target.value)} />
          </Field>
        )}
        <Field label="Wastage (%)">
          <input className={inputCls} inputMode="decimal" value={f.wastagePercent ?? 0} onChange={(e) => set('wastagePercent', e.target.value)} />
        </Field>
        <Field label="Cost price (£ ex VAT)">
          <input className={inputCls} inputMode="decimal" value={f.costPrice ?? ''} onChange={(e) => set('costPrice', e.target.value)} />
        </Field>
        <Field label="Selling price (£ ex VAT)">
          <input className={inputCls} inputMode="decimal" value={f.sellPrice ?? ''} onChange={(e) => set('sellPrice', e.target.value)} />
        </Field>
        {f.kind === 'accessory' && (
          <>
            <Field label="Accessory quantity based on">
              <select className={inputCls} value={f.accessoryBasis || 'each'} onChange={(e) => set('accessoryBasis', e.target.value)}>
                <option value="area">Room area (m²)</option>
                <option value="perimeter">Room perimeter (m)</option>
                <option value="door">Number of doors</option>
                <option value="each">One per room</option>
              </select>
            </Field>
            <Field label="Multiplier" hint="e.g. 1.05 for 5% extra underlay">
              <input className={inputCls} inputMode="decimal" value={f.accessoryFactor ?? ''} onChange={(e) => set('accessoryFactor', e.target.value)} />
            </Field>
            <Field label="Suggest for categories" hint="Comma separated, e.g. Carpet, Stairs. Leave blank for all flooring." className="sm:col-span-2">
              <input className={inputCls} value={f.appliesToText || ''} onChange={(e) => set('appliesToText', e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Toggle checked={!!f.defaultSelected} onChange={(v) => set('defaultSelected', v)} label="Ticked by default when measuring" />
            </div>
          </>
        )}
        <div className="sm:col-span-2">
          <Toggle checked={f.isActive !== false} onChange={(v) => set('isActive', v)} label="Available for new quotes" />
        </div>
      </div>
      {p.id && <p className="text-xs text-muted-foreground">Price changes are recorded in the audit log. Existing quotes keep the price they were created with.</p>}
    </Modal>
  );
}

// ---- Labour -------------------------------------------------------------------------

const BASES: Array<[string, string]> = [
  ['per_m2', 'Per m²'],
  ['per_sqyd', 'Per sq yd'],
  ['per_room', 'Per room'],
  ['per_stair', 'Per stair'],
  ['per_item', 'Per item'],
  ['fixed', 'Fixed']
];

function LabourTab() {
  const { data, error, load } = useLoad<any[]>('/admin/labour-rules');
  const [edit, setEdit] = useState<any | null>(null);
  if (error) return <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3">
        <p className="text-sm text-muted-foreground">Fitting charges are added to each room automatically by product category (ANY = all flooring). Room-type rules are added on top.</p>
        <Btn icon={<Plus size={16} />} onClick={() => setEdit({ category: 'ANY', basis: 'per_m2', costRate: 0, sellRate: 0, minCharge: 0, isActive: true })}>
          Add
        </Btn>
      </div>
      <Card pad={false}>
        {data.length === 0 ? (
          <Empty>No labour rules.</Empty>
        ) : (
          <div className="divide-y divide-border/60">
            {data.map((l) => (
              <div key={l.id} className={clsx('flex items-center gap-3 px-4 py-3 text-sm', !l.isActive && 'opacity-50')}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{l.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.category}
                    {l.roomType ? ` · room: ${l.roomType}` : ''} · {BASES.find((b) => b[0] === l.basis)?.[1]}
                    {l.minCharge ? ` · min ${gbp(l.minCharge)}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{gbp(l.sellRate)}</div>
                  <div className="text-xs text-muted-foreground">cost {gbp(l.costRate)}</div>
                </div>
                <button onClick={() => setEdit(l)} className="p-2 rounded-lg hover:bg-muted" aria-label={`Edit ${l.name}`}>
                  <Pencil size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
      {edit && <LabourModal l={edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), load())} />}
    </div>
  );
}

function LabourModal({ l, onClose, onSaved }: { l: any; onClose: () => void; onSaved: () => void }) {
  const { meta } = useRabs();
  const [f, setF] = useState<any>({ ...l });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: f.name, category: f.category || 'ANY', roomType: f.roomType || null, basis: f.basis, costRate: Number(f.costRate || 0), sellRate: Number(f.sellRate || 0), minCharge: Number(f.minCharge || 0), isActive: f.isActive !== false };
      if (l.id) await rabs.patch(`/admin/labour-rules/${l.id}`, body);
      else await rabs.post('/admin/labour-rules', body);
      toast.success('Labour rule saved');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={l.id ? `Edit ${l.name}` : 'New labour rule'}
      footer={
        <Btn loading={busy} onClick={save}>
          Save
        </Btn>
      }
    >
      <Field label="Name">
        <input className={inputCls} value={f.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Carpet fitting" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Product category">
          <select className={inputCls} value={f.category} onChange={(e) => set('category', e.target.value)}>
            <option value="ANY">ANY (all flooring)</option>
            {(meta?.categories || []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Only for room type" hint="Optional, e.g. Stairs">
          <input className={inputCls} value={f.roomType || ''} onChange={(e) => set('roomType', e.target.value)} />
        </Field>
        <Field label="Charged">
          <select className={inputCls} value={f.basis} onChange={(e) => set('basis', e.target.value)}>
            {BASES.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Minimum charge (£)">
          <input className={inputCls} inputMode="decimal" value={f.minCharge ?? 0} onChange={(e) => set('minCharge', e.target.value)} />
        </Field>
        <Field label="Cost rate (£)">
          <input className={inputCls} inputMode="decimal" value={f.costRate ?? 0} onChange={(e) => set('costRate', e.target.value)} />
        </Field>
        <Field label="Selling rate (£)">
          <input className={inputCls} inputMode="decimal" value={f.sellRate ?? 0} onChange={(e) => set('sellRate', e.target.value)} />
        </Field>
      </div>
      <Toggle checked={f.isActive !== false} onChange={(v) => set('isActive', v)} label="Active" />
    </Modal>
  );
}

// ---- Permissions --------------------------------------------------------------------

const ROLE_COLUMNS = ['ADMIN', 'OFFICE', 'SURVEYOR', 'SALES_REP', 'FITTER', 'DRIVER', 'ACCOUNTANT', 'FINANCE', 'WAREHOUSE_MANAGER', 'CUSTOMER_SERVICE'];

function PermissionsTab() {
  const { reload } = useRabs();
  const { data, setData, error, load } = useLoad<any>('/admin/permissions');
  const [saving, setSaving] = useState(false);
  if (error) return <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>;
  if (!data) return <Spinner />;
  const roles = ROLE_COLUMNS.filter((r) => data.roles.some((x: any) => x.code === r));
  const roleName = (code: string) => data.roles.find((x: any) => x.code === code)?.name || code;
  const toggle = (cap: string, role: string) => {
    const cur: string[] = data.matrix[cap] || [];
    const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
    setData({ ...data, matrix: { ...data.matrix, [cap]: next } });
  };
  const save = async () => {
    setSaving(true);
    try {
      await rabs.put('/admin/permissions', { matrix: data.matrix });
      toast.success('Permissions saved');
      await load();
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-4">
      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 sticky left-0 bg-card">Can…</th>
                {roles.map((r) => (
                  <th key={r} className="px-2 py-3 text-xs font-semibold text-center whitespace-nowrap">
                    {roleName(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.capabilities.map((c: any) => (
                <tr key={c.key} className="border-b border-border/60">
                  <td className="px-4 py-2.5 sticky left-0 bg-card whitespace-nowrap">{c.label}</td>
                  {roles.map((r) => (
                    <td key={r} className="text-center">
                      <input type="checkbox" className="h-5 w-5 cursor-pointer" checked={(data.matrix[c.key] || []).includes(r)} onChange={() => toggle(c.key, r)} aria-label={`${roleName(r)}: ${c.label}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">Super admins can always do everything. Fitters and drivers only ever see jobs they are booked on.</p>
      <Btn size="lg" className="w-full" loading={saving} onClick={save}>
        Save permissions
      </Btn>
    </div>
  );
}

// ---- Staff --------------------------------------------------------------------------

function StaffTab() {
  const { meta, reload } = useRabs();
  const { data, error, load } = useLoad<any[]>('/admin/staff');
  const perms = useLoad<any>('/admin/permissions');
  const [adding, setAdding] = useState(false);
  const roles: Array<{ code: string; name: string }> = perms.data?.roles || [];
  const setRole = async (id: string, roleCode: string) => {
    try {
      await rabs.patch(`/admin/staff/${id}/role`, { roleCode });
      toast.success('Role updated');
      load();
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  if (error) return <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Btn icon={<Plus size={16} />} onClick={() => setAdding(true)}>
          Add staff
        </Btn>
      </div>
      <Card pad={false}>
        <div className="divide-y divide-border/60">
          {data.map((s) => (
            <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold">
                  {s.name} {s.id === meta?.me.id && <span className="text-xs text-muted-foreground">(you)</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.email} · {s.status}
                </div>
              </div>
              <select className={clsx(inputCls, 'h-10 sm:w-56')} value={s.roles[0] || ''} onChange={(e) => setRole(s.id, e.target.value)} disabled={s.roles.includes('SUPER_ADMIN')}>
                {!s.roles.length && <option value="">No role</option>}
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </Card>
      {adding && <StaffModal roles={roles} onClose={() => setAdding(false)} onSaved={() => (setAdding(false), load(), reload())} />}
    </div>
  );
}

function StaffModal({ roles, onClose, onSaved }: { roles: Array<{ code: string; name: string }>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', roleCode: 'OFFICE', password: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await rabs.post('/admin/staff', { ...f, lastName: f.lastName || null });
      toast.success('Staff account created — share the password securely');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Add staff member"
      footer={
        <Btn loading={busy} onClick={save}>
          Create account
        </Btn>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name">
          <input className={inputCls} value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
        </Field>
        <Field label="Last name">
          <input className={inputCls} value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
        </Field>
      </div>
      <Field label="Email (login)">
        <input className={inputCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </Field>
      <Field label="Role">
        <select className={inputCls} value={f.roleCode} onChange={(e) => setF({ ...f, roleCode: e.target.value })}>
          {roles.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Temporary password" hint="At least 8 characters. Ask them to change it after first login.">
        <input className={inputCls} type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      </Field>
    </Modal>
  );
}

// ---- Audit --------------------------------------------------------------------------

function AuditTab() {
  const { data, error } = useLoad<any[]>('/admin/audit');
  if (error) return <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>;
  if (!data) return <Spinner />;
  return (
    <Card pad={false}>
      {data.length === 0 ? (
        <Empty>No price changes recorded yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="px-4 py-2">When</th>
                <th className="px-2 py-2">What</th>
                <th className="px-2 py-2">Field</th>
                <th className="px-2 py-2 text-right">From</th>
                <th className="px-2 py-2 text-right">To</th>
                <th className="px-2 py-2">By</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="border-b border-border/60">
                  <td className="px-4 py-2 whitespace-nowrap">{fmtDateTime(a.changed_at)}</td>
                  <td className="px-2 py-2">
                    <span className="capitalize text-muted-foreground">{a.entity}</span> {a.entity_label}
                  </td>
                  <td className="px-2 py-2">{a.field}</td>
                  <td className="px-2 py-2 text-right text-muted-foreground">{a.old_value ?? '—'}</td>
                  <td className="px-2 py-2 text-right font-semibold">{a.new_value ?? '—'}</td>
                  <td className="px-2 py-2">{a.changedByName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
