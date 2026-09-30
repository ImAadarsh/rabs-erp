'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  createGateway,
  deleteGateway,
  listGateways,
  testGatewayConnection,
  updateGateway
} from '@/lib/api';
import { toast } from 'sonner';
import { Plus, RefreshCw, PlugZap } from 'lucide-react';

const PROVIDERS = [
  'worldpay',
  'stripe',
  'sumup',
  'square',
  'paypal',
  'open_banking',
  'manual',
  'other'
] as const;

const emptyForm = {
  name: '',
  provider: 'worldpay' as (typeof PROVIDERS)[number],
  mode: 'test' as 'test' | 'live',
  isActive: true,
  isDefault: false,
  username: '',
  password: '',
  apiKey: '',
  apiSecret: '',
  merchantEntity: 'default'
};

type GatewayManagerProps = {
  organizationId: string;
  /** Compact card list (dashboard) vs full management layout */
  variant?: 'full' | 'summary';
};

export function GatewayManager({ organizationId, variant = 'full' }: GatewayManagerProps) {
  const [gateways, setGateways] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const res = await listGateways(organizationId);
      setGateways(res.data || []);
    } catch {
      toast.error('Failed to load gateways');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const openEdit = (g: any) => {
    setEditingId(g.id);
    setForm({
      name: g.name || '',
      provider: g.provider,
      mode: g.mode || 'test',
      isActive: !!g.isActive,
      isDefault: !!g.isDefault,
      username: '',
      password: '',
      apiKey: '',
      apiSecret: '',
      merchantEntity: 'default'
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!organizationId) return;
    setSaving(true);
    try {
      const payload: any = {
        organizationId,
        name: form.name,
        provider: form.provider,
        mode: form.mode,
        isActive: form.isActive,
        isDefault: form.isDefault
      };
      if (form.provider === 'worldpay') {
        if (form.username) payload.username = form.username;
        if (form.password) payload.password = form.password;
        if (form.merchantEntity) payload.merchantEntity = form.merchantEntity;
      } else {
        if (form.apiKey) payload.apiKey = form.apiKey;
        if (form.apiSecret) payload.apiSecret = form.apiSecret;
      }

      if (editingId) {
        await updateGateway(editingId, payload);
        toast.success('Gateway updated');
      } else {
        if (form.provider === 'worldpay' && (!form.username || !form.password)) {
          toast.error('Worldpay username and API password are required');
          setSaving(false);
          return;
        }
        await createGateway(payload);
        toast.success('Gateway created');
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to save gateway');
    } finally {
      setSaving(false);
    }
  };

  const testConn = async (id: string) => {
    try {
      const res = await testGatewayConnection(id);
      if (res.data?.ok) toast.success(res.data.message || 'Connection OK');
      else toast.error(res.data?.message || 'Connection failed');
    } catch (e: any) {
      toast.error(
        e?.response?.data?.data?.message ||
          e?.response?.data?.error?.message ||
          'Connection test failed'
      );
    }
  };

  const formModal = showForm ? (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-xl">
        <h3 className="text-lg font-bold">{editingId ? 'Edit gateway' : 'Add gateway'}</h3>
        <div className="grid gap-3">
          <label className="text-xs font-medium">
            Name
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2 bg-background"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="text-xs font-medium">
            Provider
            <select
              className="mt-1 w-full border rounded-lg px-3 py-2 bg-background"
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value as any })}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            Mode
            <select
              className="mt-1 w-full border rounded-lg px-3 py-2 bg-background"
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value as any })}
            >
              <option value="test">test</option>
              <option value="live">live</option>
            </select>
          </label>
          {form.provider === 'worldpay' ? (
            <>
              <label className="text-xs font-medium">
                Worldpay username / merchant credential ID
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 bg-background"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder={editingId ? 'Leave blank to keep existing' : ''}
                  autoComplete="off"
                />
              </label>
              <label className="text-xs font-medium">
                Worldpay API password
                <input
                  type="password"
                  className="mt-1 w-full border rounded-lg px-3 py-2 bg-background"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editingId ? 'Leave blank to keep existing' : ''}
                  autoComplete="new-password"
                />
              </label>
              <label className="text-xs font-medium">
                Merchant entity
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 bg-background"
                  value={form.merchantEntity}
                  onChange={(e) => setForm({ ...form, merchantEntity: e.target.value })}
                />
              </label>
            </>
          ) : (
            <>
              <label className="text-xs font-medium">
                API key
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 bg-background"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  autoComplete="off"
                />
              </label>
              <label className="text-xs font-medium">
                API secret
                <input
                  type="password"
                  className="mt-1 w-full border rounded-lg px-3 py-2 bg-background"
                  value={form.apiSecret}
                  onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
                  autoComplete="new-password"
                />
              </label>
            </>
          )}
          <label className="text-xs flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />{' '}
            Active
          </label>
          <label className="text-xs flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />{' '}
            Default gateway
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="px-3 py-2 rounded-xl border text-sm" onClick={() => setShowForm(false)}>
            Cancel
          </button>
          <button
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm"
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (variant === 'summary') {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold flex items-center gap-2">
            <PlugZap size={18} /> Gateways
          </h2>
          <Link
            href="/finance/gateways"
            className="text-xs px-2 py-1 rounded-lg border hover:bg-muted"
          >
            Manage
          </Link>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-2">
            {gateways.length === 0 && (
              <p className="text-sm text-muted-foreground">No gateways configured yet.</p>
            )}
            {gateways.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border">
                <div>
                  <div className="font-medium">{g.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {String(g.provider || '').replace('_', ' ')} · {g.mode} ·{' '}
                    {g.isActive ? 'active' : 'inactive'}
                    {g.isDefault ? ' · default' : ''}
                    {g.credentialHint ? ` · ${g.credentialHint}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PlugZap className="text-primary" size={24} />
            Payment Gateways
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure Worldpay and other processors, enable/disable gateways, and run connection tests.
            Credentials are stored encrypted and never shown after save.
          </p>
        </div>
        <div className="flex gap-2 self-start md:self-auto">
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm hover:bg-muted"
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            <Plus size={16} /> Add gateway
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="space-y-2">
            {gateways.length === 0 && (
              <p className="text-sm text-muted-foreground">No gateways configured yet.</p>
            )}
            {gateways.map((g) => (
              <div
                key={g.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-border"
              >
                <div>
                  <div className="font-medium">{g.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {String(g.provider || '').replace('_', ' ')} · {g.mode} ·{' '}
                    {g.isActive ? 'active' : 'inactive'}
                    {g.isDefault ? ' · default' : ''}
                    {g.credentialHint ? ` · ${g.credentialHint}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="text-xs px-2 py-1 rounded-lg border" onClick={() => testConn(g.id)}>
                    Test
                  </button>
                  <button className="text-xs px-2 py-1 rounded-lg border" onClick={() => openEdit(g)}>
                    Edit
                  </button>
                  <button
                    className="text-xs px-2 py-1 rounded-lg border text-red-600"
                    onClick={async () => {
                      if (!confirm('Delete this gateway?')) return;
                      try {
                        await deleteGateway(g.id);
                        toast.success('Deleted');
                        load();
                      } catch {
                        toast.error('Delete failed');
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {formModal}
    </>
  );
}
