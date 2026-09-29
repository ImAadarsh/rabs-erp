'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  API_BASE,
  CRM_LEAD_INGEST_WEBHOOK_URL,
  createCrmIntegrationKey,
  deactivateCrmIntegrationKey,
  listCrmIntegrationKeys,
  regenerateCrmIntegrationKey,
} from '@/lib/api';
import { crmApiError } from '@/lib/crm-utils';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Key,
  Plug,
  Plus,
  RefreshCw,
  Ban,
} from 'lucide-react';
import { CrmModal, CrmField, CrmModalActions, crmInputClass } from '@/components/crm/crm-modal';

const SOURCES = [
  { value: 'salesforce', label: 'Salesforce' },
  { value: 'hubspot', label: 'HubSpot' },
  { value: 'zapier', label: 'Zapier' },
  { value: 'generic', label: 'Generic webhook' },
] as const;

type IntegrationKey = {
  id: string;
  name: string;
  keyPrefix?: string | null;
  source?: string;
  active?: boolean;
  lastUsedAt?: string | null;
  createdAt?: string;
  key?: string;
};

export default function CrmIntegrationsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN']);
  const [loading, setLoading] = useState(true);
  const [apiMissing, setApiMissing] = useState(false);
  const [items, setItems] = useState<IntegrationKey[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [generated, setGenerated] = useState<IntegrationKey | null>(null);
  const [showFullKey, setShowFullKey] = useState(false);
  const [copied, setCopied] = useState<'url' | 'key' | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', source: 'generic' as (typeof SOURCES)[number]['value'] });
  const [confirmRevoke, setConfirmRevoke] = useState<IntegrationKey | null>(null);

  const orgId = session?.user?.organizationId;
  const webhookUrl = CRM_LEAD_INGEST_WEBHOOK_URL || `${API_BASE}/api/integrations/leads`;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await listCrmIntegrationKeys({ organizationId: orgId });
      setItems(res.data || []);
      setApiMissing(false);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setApiMissing(true);
        setItems([]);
      } else {
        toast.error(crmApiError(err, 'Failed to load integration keys'));
      }
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  async function copyText(text: string, kind: 'url' | 'key') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toast.success(kind === 'url' ? 'Webhook URL copied' : 'API key copied');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Copy failed');
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await createCrmIntegrationKey({
        organizationId: orgId,
        name: form.name.trim(),
        source: form.source,
      });
      setGenerated(res.data);
      setShowCreate(false);
      setForm({ name: '', source: 'generic' });
      setShowFullKey(true);
      await load();
      toast.success('Integration key created — copy it now');
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to create key'));
    } finally {
      setSaving(false);
    }
  }

  async function onRegenerate(key: IntegrationKey) {
    setSaving(true);
    try {
      const res = await regenerateCrmIntegrationKey(key.id);
      setGenerated(res.data);
      setShowFullKey(true);
      await load();
      toast.success('New key issued — previous key revoked');
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to regenerate key'));
    } finally {
      setSaving(false);
    }
  }

  async function onRevoke() {
    if (!confirmRevoke) return;
    setSaving(true);
    try {
      await deactivateCrmIntegrationKey(confirmRevoke.id);
      setConfirmRevoke(null);
      await load();
      toast.success('Key revoked');
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to revoke key'));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<IntegrationKey>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Key size={15} className="text-brand" />
            <span className="font-semibold">{row.original.name}</span>
          </div>
        ),
      },
      {
        accessorKey: 'source',
        header: 'Source',
        cell: ({ row }) => (
          <span className="text-xs capitalize text-muted-foreground">
            {String(row.original.source || 'generic').replace(/_/g, ' ')}
          </span>
        ),
      },
      {
        accessorKey: 'keyPrefix',
        header: 'Prefix',
        cell: ({ row }) => (
          <code className="text-xs bg-muted px-2 py-1 rounded-lg">{row.original.keyPrefix || '—'}</code>
        ),
      },
      {
        accessorKey: 'active',
        header: 'Status',
        cell: ({ row }) =>
          row.original.active ? (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              Active
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border bg-muted/40 text-muted-foreground border-border">
              Revoked
            </span>
          ),
      },
      {
        accessorKey: 'lastUsedAt',
        header: 'Last used',
        cell: ({ row }) =>
          row.original.lastUsedAt
            ? new Date(row.original.lastUsedAt).toLocaleString()
            : '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const key = row.original;
          if (!key.active) return null;
          return (
            <div className="flex items-center gap-1 justify-end">
              <button
                type="button"
                title="Regenerate"
                disabled={saving}
                onClick={() => void onRegenerate(key)}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand"
              >
                <RefreshCw size={15} />
              </button>
              <button
                type="button"
                title="Revoke"
                onClick={() => setConfirmRevoke(key)}
                className="p-2 rounded-lg hover:bg-destructive/10 text-destructive"
              >
                <Ban size={15} />
              </button>
            </div>
          );
        },
      },
    ],
    [saving]
  );

  if (!hydrated || !hasAccess || !session?.accessToken) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title="CRM · Integrations"
          actions={[{ label: 'Create API Key', onClick: () => setShowCreate(true), icon: <Plus size={18} /> }]}
        />
        <main className="p-6 md:p-8 space-y-5">
          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Integrations API not ready</div>
                <div className="text-xs mt-0.5 opacity-80">
                  Waiting on <code className="font-mono">/api/crm/integration-keys</code>.
                </div>
              </div>
            </div>
          )}

          <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/25 shrink-0">
                <Plug size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold tracking-tight">Inbound lead webhook</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Salesforce Outbound Messages, Zapier, HubSpot, or any HTTP client can POST leads here.
                  Authenticate with header <code className="font-mono text-xs">X-Rabs-Api-Key</code> or{' '}
                  <code className="font-mono text-xs">Authorization: Bearer &lt;key&gt;</code>.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <code className="flex-1 text-xs sm:text-sm font-mono break-all rounded-xl border border-border/80 bg-muted/40 px-3.5 py-3">
                {webhookUrl}
              </code>
              <button
                type="button"
                onClick={() => void copyText(webhookUrl, 'url')}
                className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-brand hover:bg-brand-600 text-white text-sm font-medium shrink-0"
              >
                {copied === 'url' ? <Check size={16} /> : <Copy size={16} />}
                Copy URL
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Payload examples
            </h2>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Generic / Zapier</p>
                <pre className="text-[11px] leading-relaxed rounded-xl bg-muted/50 border border-border/60 p-3 overflow-x-auto">{`{
  "email": "buyer@shop.com",
  "name": "Aisha Khan",
  "company": "Khan Convenience",
  "phone": "+44…",
  "source": "zapier",
  "externalId": "zap_123"
}`}</pre>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Salesforce-ish</p>
                <pre className="text-[11px] leading-relaxed rounded-xl bg-muted/50 border border-border/60 p-3 overflow-x-auto">{`{
  "Email": "buyer@shop.com",
  "FirstName": "Aisha",
  "LastName": "Khan",
  "Company": "Khan Convenience",
  "Phone": "+44…",
  "LeadSource": "Web",
  "Id": "00Q…"
}`}</pre>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Upserts are idempotent on <code className="font-mono">(organization, source, externalId)</code> when
              an external id is present. New leads auto-sync into the Marketing segment “CRM Leads”.
            </p>
          </section>

          <div className="rounded-2xl border border-border/60 bg-card p-4">
            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading keys…</div>
            ) : items.length === 0 && !apiMissing ? (
              <div className="py-12 text-center text-muted-foreground">
                <Key className="mx-auto mb-3 opacity-40" size={32} />
                <p className="font-medium text-foreground">No integration keys yet</p>
                <p className="text-sm mt-1">Create a key for Salesforce, Zapier, or a generic webhook.</p>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-brand hover:bg-brand-600 text-white shadow-sm"
                >
                  <Plus size={16} /> Create API Key
                </button>
              </div>
            ) : (
              <RichDataTable columns={columns} data={items} searchPlaceholder="Search keys…" />
            )}
          </div>
        </main>
      </div>

      <CrmModal open={showCreate} onClose={() => setShowCreate(false)} title="Create integration key" icon={Plus}>
        <form onSubmit={onCreate} className="space-y-4">
          <CrmField label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={crmInputClass}
              placeholder="e.g. Salesforce production"
            />
          </CrmField>
          <CrmField label="Source" hint="Used as default lead source when the payload omits one.">
            <select
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value as typeof form.source })}
              className={crmInputClass}
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </CrmField>
          <CrmModalActions
            onCancel={() => setShowCreate(false)}
            submitLabel="Create Key"
            submitting={saving}
            submitIcon={<Key size={16} />}
          />
        </form>
      </CrmModal>

      <CrmModal
        open={!!generated}
        onClose={() => {
          setGenerated(null);
          setShowFullKey(false);
        }}
        title="Save this key now"
        icon={Key}
      >
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm">
          <p className="font-semibold text-destructive">Shown once</p>
          <p className="text-xs text-muted-foreground mt-1">
            Copy the full secret before closing. Only the prefix is stored for later reference.
          </p>
        </div>
        <CrmField label="API key">
          <div className="relative">
            <code className="block text-xs font-mono break-all rounded-xl border border-border/80 bg-muted/40 px-3.5 py-3 pr-20">
              {showFullKey ? generated?.key : `${generated?.keyPrefix || ''}…`}
            </code>
            <div className="absolute top-2 right-2 flex gap-1">
              <button
                type="button"
                onClick={() => setShowFullKey((v) => !v)}
                className="p-2 rounded-lg hover:bg-background"
                title={showFullKey ? 'Hide' : 'Show'}
              >
                {showFullKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              {generated?.key ? (
                <button
                  type="button"
                  onClick={() => void copyText(generated.key!, 'key')}
                  className="p-2 rounded-lg hover:bg-background"
                  title="Copy"
                >
                  {copied === 'key' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                </button>
              ) : null}
            </div>
          </div>
        </CrmField>
        <button
          type="button"
          onClick={() => {
            setGenerated(null);
            setShowFullKey(false);
          }}
          className="w-full h-11 rounded-xl bg-brand hover:bg-brand-600 text-white font-medium"
        >
          I&apos;ve saved the key
        </button>
      </CrmModal>

      <CrmModal
        open={!!confirmRevoke}
        onClose={() => setConfirmRevoke(null)}
        title="Revoke key"
        icon={Ban}
      >
        <p className="text-sm text-muted-foreground">
          Revoke <strong className="text-foreground">{confirmRevoke?.name}</strong>? External systems using this
          key will immediately lose access.
        </p>
        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setConfirmRevoke(null)}
            className="btn flex-1 h-11 rounded-xl bg-muted hover:bg-muted/80 text-foreground border-none shadow-none"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onRevoke()}
            className="btn flex-1 h-11 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground border-none"
          >
            {saving ? 'Revoking…' : 'Revoke'}
          </button>
        </div>
      </CrmModal>
    </div>
  );
}
