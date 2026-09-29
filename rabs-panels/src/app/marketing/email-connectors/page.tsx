'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  createMarketingEmailConnector,
  deleteMarketingEmailConnector,
  listMarketingEmailConnectors,
  setDefaultMarketingEmailConnector,
  testMarketingEmailConnector,
  type MarketingEmailProvider,
} from '@/lib/api';
import { crmApiError } from '@/lib/crm-utils';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Plug,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { CrmModal, CrmField, CrmModalActions, crmInputClass } from '@/components/crm/crm-modal';

const PROVIDERS: {
  value: MarketingEmailProvider;
  label: string;
  hint: string;
  stub?: boolean;
}[] = [
  { value: 'sendgrid', label: 'SendGrid', hint: 'API key + verified sender (best for mass campaigns)' },
  { value: 'gmail_smtp', label: 'Gmail SMTP', hint: 'App password over smtp.gmail.com:587' },
  { value: 'brevo', label: 'Brevo', hint: 'Stub until fully wired — API key still accepted', stub: true },
  { value: 'ses', label: 'Amazon SES', hint: 'Stub until fully wired — access keys still accepted', stub: true },
  { value: 'mailchimp', label: 'Mailchimp', hint: 'Stub until fully wired — API key still accepted', stub: true },
];

type CredForm = {
  useEnv: boolean;
  apiKey: string;
  smtpUser: string;
  smtpPass: string;
  smtpHost: string;
  smtpPort: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  fromEmail: string;
  fromName: string;
};

const emptyCreds = (): CredForm => ({
  useEnv: false,
  apiKey: '',
  smtpUser: '',
  smtpPass: '',
  smtpHost: 'smtp.gmail.com',
  smtpPort: '587',
  accessKeyId: '',
  secretAccessKey: '',
  region: 'eu-west-1',
  fromEmail: '',
  fromName: '',
});

function buildCredentials(provider: MarketingEmailProvider, c: CredForm): Record<string, unknown> {
  const fromEmail = c.fromEmail.trim();
  const fromName = c.fromName.trim();
  const fromBits = {
    ...(fromEmail ? { fromEmail } : {}),
    ...(fromName ? { fromName } : {}),
  };

  if (c.useEnv) {
    if (provider === 'gmail_smtp') {
      return {
        useEnv: true,
        ...(fromEmail ? { from: fromEmail } : {}),
        ...(fromName ? { fromName } : {}),
      };
    }
    return { useEnv: true, ...fromBits };
  }

  if (provider === 'sendgrid' || provider === 'brevo' || provider === 'mailchimp') {
    return { apiKey: c.apiKey.trim(), ...fromBits };
  }
  if (provider === 'gmail_smtp') {
    // API: { host, port, user, pass, from } — see MARKETING_EMAIL_PROVIDERS.md
    return {
      host: c.smtpHost.trim() || 'smtp.gmail.com',
      port: Number(c.smtpPort.trim() || '587'),
      user: c.smtpUser.trim(),
      pass: c.smtpPass.trim(),
      ...(fromEmail ? { from: fromEmail } : {}),
      ...(fromName ? { fromName } : {}),
    };
  }
  // ses
  return {
    accessKeyId: c.accessKeyId.trim(),
    secretAccessKey: c.secretAccessKey.trim(),
    region: c.region.trim() || 'eu-west-1',
    ...fromBits,
  };
}

function providerLabel(p: string) {
  return PROVIDERS.find((x) => x.value === p)?.label || p.replace(/_/g, ' ');
}

export default function MarketingEmailConnectorsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'MARKETING']);
  const [loading, setLoading] = useState(true);
  const [apiMissing, setApiMissing] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<MarketingEmailProvider>('sendgrid');
  const [creds, setCreds] = useState<CredForm>(emptyCreds());
  const [isDefault, setIsDefault] = useState(false);
  const [confirmDel, setConfirmDel] = useState<any>(null);
  const [testFor, setTestFor] = useState<any>(null);

  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await listMarketingEmailConnectors({ organizationId: orgId });
      setItems(res.data || []);
      setApiMissing(false);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setApiMissing(true);
        setItems([]);
      } else {
        toast.error(crmApiError(err, 'Failed to load email connectors'));
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

  function openCreate() {
    setName('');
    setProvider('sendgrid');
    setCreds(emptyCreds());
    setIsDefault(items.length === 0);
    setShowCreate(true);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    const credentials = buildCredentials(provider, creds);
    if (!creds.useEnv) {
      if (provider === 'sendgrid' || provider === 'brevo' || provider === 'mailchimp') {
        if (!credentials.apiKey) {
          toast.error('API key is required');
          return;
        }
      }
      if (provider === 'gmail_smtp' && (!credentials.user || !credentials.pass)) {
        toast.error('SMTP user and app password are required');
        return;
      }
      if (provider === 'ses' && (!credentials.accessKeyId || !credentials.secretAccessKey)) {
        toast.error('SES access key and secret are required');
        return;
      }
    }
    setSaving(true);
    try {
      await createMarketingEmailConnector({
        organizationId: orgId,
        name: name.trim(),
        provider,
        credentials,
        isDefault,
        status: 'active',
      });
      setShowCreate(false);
      toast.success('Connector created');
      await load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to create connector'));
    } finally {
      setSaving(false);
    }
  }

  async function onSetDefault(row: any) {
    setSaving(true);
    try {
      await setDefaultMarketingEmailConnector(row.id);
      toast.success(`“${row.name}” is now the default`);
      await load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to set default'));
    } finally {
      setSaving(false);
    }
  }

  async function onTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testFor) return;
    setSaving(true);
    try {
      const res = await testMarketingEmailConnector(testFor.id);
      const ok = res.data?.ok !== false;
      if (ok) {
        toast.success(res.data?.message || 'Connection OK');
        setTestFor(null);
        await load();
      } else {
        toast.error(res.data?.message || 'Connection failed');
      }
    } catch (err) {
      toast.error(crmApiError(err, 'Test connection failed'));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    setSaving(true);
    try {
      await deleteMarketingEmailConnector(confirmDel.id);
      setConfirmDel(null);
      toast.success('Connector deleted');
      await load();
    } catch (err) {
      toast.error(crmApiError(err, 'Delete failed'));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Connector',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Plug size={15} className="text-brand" />
            <div>
              <div className="font-semibold flex items-center gap-1.5">
                {row.original.name}
                {(row.original.isDefault || row.original.is_default) && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                    <Star size={10} fill="currentColor" /> Default
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {row.original.keyHint || '—'}
              </div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'provider',
        header: 'Provider',
        cell: ({ row }) => (
          <span className="text-xs font-medium">{providerLabel(String(row.original.provider || ''))}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const s = String(row.original.status || 'active');
          const ok = s === 'active' || s === 'verified';
          return (
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                ok
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                  : 'bg-muted/40 text-muted-foreground border-border'
              }`}
            >
              {s}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const c = row.original;
          const isDef = c.isDefault || c.is_default;
          return (
            <div className="flex items-center gap-1 justify-end">
              <button
                type="button"
                title="Test connection"
                disabled={saving}
                onClick={() => {
                  setTestFor(c);
                }}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand"
              >
                <FlaskConical size={15} />
              </button>
              {!isDef && (
                <button
                  type="button"
                  title="Set default"
                  disabled={saving}
                  onClick={() => void onSetDefault(c)}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand"
                >
                  <Star size={15} />
                </button>
              )}
              <button
                type="button"
                title="Delete"
                onClick={() => setConfirmDel(c)}
                className="p-2 rounded-lg hover:bg-destructive/10 text-destructive"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        },
      },
    ],
    [saving]
  );

  if (!hydrated || !hasAccess || !session?.accessToken) return null;

  const providerMeta = PROVIDERS.find((p) => p.value === provider);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title="Marketing · Email Connectors"
          actions={[
            {
              label: 'Create Connector',
              onClick: openCreate,
              icon: <Plus size={18} />,
            },
          ]}
        />
        <main className="p-6 md:p-8 space-y-5">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Connect SendGrid, Gmail SMTP, Brevo, or Amazon SES. Campaigns send through the selected
            connector (or your org default).
          </p>

          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Email connectors API not ready</div>
                <div className="text-xs mt-0.5 opacity-80">
                  Waiting on <code className="font-mono">/api/marketing/email-connectors</code>.
                </div>
              </div>
            </div>
          )}

          {!loading && items.length === 0 && !apiMissing ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground space-y-4">
              <Plug className="mx-auto opacity-40" size={32} />
              <div>
                <p className="font-medium text-foreground">No email connectors yet</p>
                <p className="text-sm mt-1 max-w-md mx-auto">
                  Add SendGrid for mass campaigns, or Gmail SMTP for lighter outreach.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 mx-auto"
              >
                <Plus size={18} />
                Create Connector
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
              ) : (
                <RichDataTable columns={columns} data={items} searchPlaceholder="Search connectors…" />
              )}
            </div>
          )}
        </main>
      </div>

      <CrmModal open={showCreate} onClose={() => setShowCreate(false)} title="Create Connector" icon={Plus} wide>
        <form onSubmit={onCreate} className="space-y-4">
          <CrmField label="Name">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={crmInputClass}
              placeholder="Production SendGrid"
            />
          </CrmField>
          <CrmField label="Provider" hint={providerMeta?.hint}>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as MarketingEmailProvider)}
              className={crmInputClass}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                  {p.stub ? ' (stub)' : ''}
                </option>
              ))}
            </select>
          </CrmField>

          {providerMeta?.stub && (
            <p className="text-xs rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-700 dark:text-amber-400">
              This provider adapter is a stub on the API — test/send may return “not configured” until fully wired.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={creds.useEnv}
              onChange={(e) => setCreds({ ...creds, useEnv: e.target.checked })}
              className="rounded border-border"
            />
            Use server env keys (no secret stored in DB)
          </label>
          {creds.useEnv && (
            <p className="text-xs text-muted-foreground -mt-2">
              Requires the matching env on the API host (e.g. <code className="font-mono">SENDGRID_API_KEY</code> /{' '}
              <code className="font-mono">SMTP_*</code>).
            </p>
          )}

          {!creds.useEnv && (provider === 'sendgrid' || provider === 'brevo' || provider === 'mailchimp') && (
            <CrmField label="API key">
              <input
                required
                type="password"
                autoComplete="off"
                value={creds.apiKey}
                onChange={(e) => setCreds({ ...creds, apiKey: e.target.value })}
                className={crmInputClass}
                placeholder={
                  provider === 'sendgrid' ? 'SG.…' : provider === 'brevo' ? 'xkeysib-…' : 'mailchimp key'
                }
              />
            </CrmField>
          )}

          {!creds.useEnv && provider === 'gmail_smtp' && (
            <>
              <CrmField label="SMTP user (Gmail address)">
                <input
                  required
                  type="email"
                  value={creds.smtpUser}
                  onChange={(e) => setCreds({ ...creds, smtpUser: e.target.value })}
                  className={crmInputClass}
                />
              </CrmField>
              <CrmField label="App password" hint="Google Account → App passwords">
                <input
                  required
                  type="password"
                  autoComplete="off"
                  value={creds.smtpPass}
                  onChange={(e) => setCreds({ ...creds, smtpPass: e.target.value })}
                  className={crmInputClass}
                />
              </CrmField>
              <div className="grid grid-cols-2 gap-3">
                <CrmField label="Host">
                  <input
                    value={creds.smtpHost}
                    onChange={(e) => setCreds({ ...creds, smtpHost: e.target.value })}
                    className={crmInputClass}
                  />
                </CrmField>
                <CrmField label="Port">
                  <input
                    value={creds.smtpPort}
                    onChange={(e) => setCreds({ ...creds, smtpPort: e.target.value })}
                    className={crmInputClass}
                  />
                </CrmField>
              </div>
            </>
          )}

          {!creds.useEnv && provider === 'ses' && (
            <>
              <CrmField label="Access key ID">
                <input
                  required
                  value={creds.accessKeyId}
                  onChange={(e) => setCreds({ ...creds, accessKeyId: e.target.value })}
                  className={crmInputClass}
                />
              </CrmField>
              <CrmField label="Secret access key">
                <input
                  required
                  type="password"
                  autoComplete="off"
                  value={creds.secretAccessKey}
                  onChange={(e) => setCreds({ ...creds, secretAccessKey: e.target.value })}
                  className={crmInputClass}
                />
              </CrmField>
              <CrmField label="Region">
                <input
                  value={creds.region}
                  onChange={(e) => setCreds({ ...creds, region: e.target.value })}
                  className={crmInputClass}
                  placeholder="eu-west-1"
                />
              </CrmField>
            </>
          )}

          <CrmField label="From email" hint="Must be verified with the provider">
            <input
              type="email"
              value={creds.fromEmail}
              onChange={(e) => setCreds({ ...creds, fromEmail: e.target.value })}
              className={crmInputClass}
              placeholder="marketing@yourdomain.com"
            />
          </CrmField>
          <CrmField label="From name">
            <input
              value={creds.fromName}
              onChange={(e) => setCreds({ ...creds, fromName: e.target.value })}
              className={crmInputClass}
              placeholder="Rabs Interiors Marketing"
            />
          </CrmField>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-border"
            />
            Set as default connector for this org
          </label>

          <CrmModalActions
            onCancel={() => setShowCreate(false)}
            submitLabel="Create connector"
            submitting={saving}
            submitIcon={<Plug size={16} />}
          />
        </form>
      </CrmModal>

      <CrmModal open={!!testFor} onClose={() => setTestFor(null)} title="Test connection" icon={FlaskConical}>
        <form onSubmit={onTest} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Verifies credentials with {providerLabel(String(testFor?.provider || ''))} without exposing
            secrets.
          </p>
          {testFor?.lastTestMessage && (
            <p className="text-xs rounded-lg bg-muted/50 px-3 py-2 text-muted-foreground">
              Last test: {testFor.lastTestOk ? 'OK' : 'Failed'} — {testFor.lastTestMessage}
            </p>
          )}
          <CrmModalActions
            onCancel={() => setTestFor(null)}
            submitLabel="Test connection"
            submitting={saving}
            submitIcon={<CheckCircle2 size={16} />}
          />
        </form>
      </CrmModal>

      <CrmModal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete connector" icon={Trash2}>
        <p className="text-sm text-muted-foreground">
          Delete <strong className="text-foreground">{confirmDel?.name}</strong>? Campaigns using this
          connector will fall back to the org default if available.
        </p>
        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setConfirmDel(null)}
            className="btn flex-1 h-11 rounded-xl bg-muted hover:bg-muted/80 text-foreground border-none shadow-none"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onDelete()}
            className="btn flex-1 h-11 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground border-none"
          >
            {saving ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </CrmModal>
    </div>
  );
}
