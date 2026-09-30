'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  createMarketingEmailCampaign,
  deleteMarketingEmailCampaign,
  listMarketingEmailCampaignSends,
  listMarketingEmailCampaigns,
  listMarketingEmailConnectors,
  listSegments,
  sendMarketingEmailCampaign,
} from '@/lib/api';
import { crmApiError } from '@/lib/crm-utils';
import { emptyBuilderJson, renderEmailHtml } from '@/lib/email-builder';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircle,
  Mail,
  Plus,
  Send,
  Trash2,
  X,
  FlaskConical,
  ScrollText,
  PenLine,
  Plug,
} from 'lucide-react';
import { CrmModal, CrmField, CrmModalActions, crmInputClass, crmTextareaClass } from '@/components/crm/crm-modal';

type AudienceSource = 'crm_leads' | 'segment' | 'manual';

const emptyForm = {
  name: '',
  subject: '',
  htmlBody: '',
  source: 'crm_leads' as AudienceSource,
  segmentId: '',
  manualEmails: '',
  connectorId: '',
  fromName: '',
  replyTo: '',
  useBuilder: true,
};

function statusBadgeClass(status: string) {
  switch (status) {
    case 'sent':
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'sending':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'failed':
      return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    case 'scheduled':
      return 'bg-brand/10 text-brand border-brand/25';
    default:
      return 'bg-muted/40 text-muted-foreground border-border';
  }
}

function parseEmailList(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
}

function connectorLabel(c: any) {
  if (!c) return '—';
  const provider = String(c.provider || '').replace(/_/g, ' ');
  return `${c.name}${provider ? ` (${provider})` : ''}`;
}

export default function MarketingEmailCampaignsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'MARKETING']);
  const [loading, setLoading] = useState(true);
  const [apiMissing, setApiMissing] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);
  const [smtpHint, setSmtpHint] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [connectors, setConnectors] = useState<any[]>([]);
  const [connectorsApiMissing, setConnectorsApiMissing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [manualEmailsById, setManualEmailsById] = useState<Record<string, string[]>>({});
  const [sendsFor, setSendsFor] = useState<any>(null);
  const [sends, setSends] = useState<any[]>([]);
  const [testFor, setTestFor] = useState<any>(null);
  const [testEmail, setTestEmail] = useState('');
  const [manualSendFor, setManualSendFor] = useState<any>(null);
  const [manualSendEmails, setManualSendEmails] = useState('');
  const [confirmDel, setConfirmDel] = useState<any>(null);

  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [campRes, segRes, connRes] = await Promise.all([
        listMarketingEmailCampaigns({ organizationId: orgId }),
        listSegments().catch(() => ({ data: [] as any[] })),
        listMarketingEmailConnectors({ organizationId: orgId }).catch((err: any) => {
          if (err?.response?.status === 404) return { data: null as any };
          return { data: [] as any[] };
        }),
      ]);
      setItems(campRes.data || []);
      setSmtpConfigured(campRes.meta?.smtpConfigured ?? null);
      setSmtpHint(null);
      setSegments(segRes.data || []);
      if (connRes.data === null) {
        setConnectors([]);
        setConnectorsApiMissing(true);
      } else {
        setConnectors(connRes.data || []);
        setConnectorsApiMissing(false);
      }
      setApiMissing(false);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setApiMissing(true);
        setItems([]);
      } else {
        toast.error(crmApiError(err, 'Failed to load email campaigns'));
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

  const defaultConnectorId = useMemo(() => {
    const d = connectors.find((c) => c.isDefault || c.is_default);
    return d?.id ? String(d.id) : connectors[0]?.id ? String(connectors[0].id) : '';
  }, [connectors]);

  function openCreate() {
    setForm({
      ...emptyForm,
      connectorId: defaultConnectorId,
      useBuilder: true,
    });
    setShowCreate(true);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (form.source === 'segment' && !form.segmentId) {
      toast.error('Choose a segment');
      return;
    }
    if (form.source === 'manual' && parseEmailList(form.manualEmails).length === 0) {
      toast.error('Add at least one email for a manual audience');
      return;
    }
    if (!form.useBuilder && !form.htmlBody.trim()) {
      toast.error('Add HTML body or use the builder');
      return;
    }
    setSaving(true);
    try {
      const builder = emptyBuilderJson();
      const htmlBody = form.useBuilder
        ? renderEmailHtml(builder, { previewTitle: form.subject.trim() })
        : form.htmlBody;
      const res = await createMarketingEmailCampaign({
        organizationId: orgId,
        name: form.name.trim(),
        subject: form.subject.trim(),
        htmlBody,
        builderJson: form.useBuilder ? builder : null,
        connectorId: form.connectorId || null,
        fromName: form.fromName.trim() || null,
        replyTo: form.replyTo.trim() || null,
        source: form.source,
        audienceType: form.source,
        segmentId: form.source === 'segment' ? form.segmentId : null,
      });
      const newId = res.data?.id;
      if (form.source === 'manual' && newId) {
        setManualEmailsById((prev) => ({
          ...prev,
          [String(newId)]: parseEmailList(form.manualEmails),
        }));
      }
      setShowCreate(false);
      setForm(emptyForm);
      toast.success('Campaign created');
      await load();
      if (form.useBuilder && newId) {
        router.push(`/marketing/email-campaigns/${newId}/builder`);
      }
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to create campaign'));
    } finally {
      setSaving(false);
    }
  }

  async function doSend(campaign: any, emails?: string[], full?: boolean) {
    setSaving(true);
    setSmtpHint(null);
    try {
      const payloadEmails =
        emails ||
        (campaign.source === 'manual' ? manualEmailsById[String(campaign.id)] : undefined);
      if (campaign.source === 'manual' && (!payloadEmails || payloadEmails.length === 0)) {
        setManualSendFor(campaign);
        setManualSendEmails('');
        setSaving(false);
        return;
      }
      const res = await sendMarketingEmailCampaign(campaign.id, {
        emails: payloadEmails,
        full,
      });
      const d = res.data;
      toast.success(`Sent ${d.sent || 0} · failed ${d.failed || 0} · queued ${d.queued || 0}`);
      await load();
    } catch (err: any) {
      const msg = crmApiError(err, 'Send failed');
      if (err?.response?.status === 503 || /smtp|connector|sendgrid/i.test(msg)) {
        setSmtpConfigured(false);
        setSmtpHint(msg);
      }
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function onSendTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testFor || !testEmail.trim().includes('@')) {
      toast.error('Enter a valid test address');
      return;
    }
    setSaving(true);
    setSmtpHint(null);
    try {
      const res = await sendMarketingEmailCampaign(testFor.id, {
        emails: [testEmail.trim().toLowerCase()],
      });
      const d = res.data;
      if ((d.queued || 0) === 0) {
        toast.error(
          testFor.source === 'manual'
            ? 'No recipients queued'
            : 'Test address not in this campaign audience. Use a CRM lead/segment email, or create a manual campaign.'
        );
      } else {
        toast.success(`Test: sent ${d.sent || 0}, failed ${d.failed || 0}`);
      }
      setTestFor(null);
      setTestEmail('');
      await load();
    } catch (err: any) {
      const msg = crmApiError(err, 'Test send failed');
      if (err?.response?.status === 503 || /smtp|connector|sendgrid/i.test(msg)) {
        setSmtpConfigured(false);
        setSmtpHint(msg);
      }
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function openSends(campaign: any) {
    setSendsFor(campaign);
    try {
      const res = await listMarketingEmailCampaignSends(campaign.id);
      setSends(res.data || []);
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to load send log'));
      setSends([]);
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    setSaving(true);
    try {
      await deleteMarketingEmailCampaign(confirmDel.id);
      setConfirmDel(null);
      toast.success('Campaign deleted');
      await load();
    } catch (err) {
      toast.error(crmApiError(err, 'Delete failed'));
    } finally {
      setSaving(false);
    }
  }

  const connectorById = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of connectors) m.set(String(c.id), c);
    return m;
  }, [connectors]);

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Campaign',
        cell: ({ row }) => <span className="font-semibold">{row.original.name}</span>,
      },
      {
        accessorKey: 'subject',
        header: 'Subject',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground line-clamp-1">{row.original.subject}</span>
        ),
      },
      {
        id: 'connector',
        header: 'Connector',
        cell: ({ row }) => {
          const cid = row.original.connectorId ?? row.original.connector_id;
          const c = cid ? connectorById.get(String(cid)) : null;
          return (
            <span className="text-xs text-muted-foreground">
              {c ? connectorLabel(c) : cid ? `#${cid}` : 'Default'}
            </span>
          );
        },
      },
      {
        accessorKey: 'source',
        header: 'Audience',
        cell: ({ row }) => {
          const s = row.original.source || 'crm_leads';
          const label =
            s === 'crm_leads' ? 'CRM leads' : s === 'segment' ? 'Segment' : 'Manual';
          return <span className="text-xs capitalize">{label}</span>;
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${statusBadgeClass(String(row.original.status || ''))}`}
          >
            {row.original.status}
          </span>
        ),
      },
      {
        id: 'stats',
        header: 'Sends',
        cell: ({ row }) => {
          const st = row.original.stats || {};
          return (
            <span className="text-xs text-muted-foreground">
              {st.sent || 0} ok · {st.failed || 0} fail
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex items-center gap-1 justify-end">
              <button
                type="button"
                title="Open builder"
                onClick={() => router.push(`/marketing/email-campaigns/${c.id}/builder`)}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand"
              >
                <PenLine size={15} />
              </button>
              <button
                type="button"
                title="Send"
                disabled={saving || c.status === 'sending'}
                onClick={() => void doSend(c)}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand"
              >
                <Send size={15} />
              </button>
              <button
                type="button"
                title="Send test"
                disabled={saving || c.status === 'sending'}
                onClick={() => {
                  setTestFor(c);
                  setTestEmail('');
                }}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand"
              >
                <FlaskConical size={15} />
              </button>
              <button
                type="button"
                title="Send log"
                onClick={() => void openSends(c)}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <ScrollText size={15} />
              </button>
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
    [saving, manualEmailsById, connectorById, router]
  );

  if (!hydrated || !hasAccess || !session?.accessToken) return null;

  const noConnectors = !connectorsApiMissing && connectors.length === 0;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title="Marketing · Email Campaigns"
          actions={[
            {
              label: 'Create Campaign',
              onClick: openCreate,
              icon: <Plus size={18} />,
            },
          ]}
        />
        <main className="p-6 md:p-8 space-y-5">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Mass-email CRM leads or a marketing segment via your email connector (SendGrid, Gmail
            SMTP, and more). Design with the block builder, then send.
          </p>

          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Email campaigns API not ready</div>
                <div className="text-xs mt-0.5 opacity-80">
                  Waiting on <code className="font-mono">/api/marketing/email-campaigns</code>.
                </div>
              </div>
            </div>
          )}

          {noConnectors && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <Plug size={18} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="font-semibold">No email connector configured</div>
                <div className="text-xs mt-0.5 opacity-90">
                  Add SendGrid or Gmail SMTP under Email Connectors before sending mass campaigns.
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/marketing/email-connectors')}
                  className="mt-2 text-xs font-semibold underline underline-offset-2"
                >
                  Open Email Connectors
                </button>
              </div>
            </div>
          )}

          {smtpConfigured === false && !noConnectors && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-rose-700 dark:text-rose-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Email delivery not ready</div>
                <div className="text-xs mt-0.5 opacity-90">
                  {smtpHint ||
                    'Check your connector credentials (Test connection) or server SMTP fallback.'}
                </div>
              </div>
            </div>
          )}

          {!loading && items.length === 0 && !apiMissing ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground space-y-4">
              <Mail className="mx-auto opacity-40" size={32} />
              <div>
                <p className="font-medium text-foreground">No email campaigns yet</p>
                <p className="text-sm mt-1 max-w-md mx-auto">
                  Create a campaign, pick a connector and audience, then open the builder.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 mx-auto"
              >
                <Plus size={18} />
                Create Campaign
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
              ) : (
                <RichDataTable columns={columns} data={items} searchPlaceholder="Search campaigns…" />
              )}
            </div>
          )}
        </main>
      </div>

      <CrmModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Campaign"
        icon={Plus}
        wide
      >
        <form onSubmit={onCreate} className="space-y-4">
          <CrmField label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={crmInputClass}
              placeholder="Spring outreach"
            />
          </CrmField>
          <CrmField label="Subject">
            <input
              required
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className={crmInputClass}
              placeholder="Quick intro from RABS"
            />
          </CrmField>

          <CrmField
            label="Email connector"
            hint={
              connectorsApiMissing
                ? 'Connectors API not ready — sends may use server SMTP fallback'
                : undefined
            }
          >
            <select
              value={form.connectorId}
              onChange={(e) => setForm({ ...form, connectorId: e.target.value })}
              className={crmInputClass}
            >
              <option value="">Org default / SMTP fallback</option>
              {connectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {connectorLabel(c)}
                  {c.isDefault || c.is_default ? ' · default' : ''}
                </option>
              ))}
            </select>
          </CrmField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CrmField label="From name (optional)">
              <input
                value={form.fromName}
                onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                className={crmInputClass}
                placeholder="RABS Marketing"
              />
            </CrmField>
            <CrmField label="Reply-to (optional)">
              <input
                type="email"
                value={form.replyTo}
                onChange={(e) => setForm({ ...form, replyTo: e.target.value })}
                className={crmInputClass}
                placeholder="hello@…"
              />
            </CrmField>
          </div>

          <CrmField label="Content">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, useBuilder: true })}
                className={`flex-1 h-10 rounded-xl text-sm font-medium border transition ${
                  form.useBuilder
                    ? 'bg-brand/15 border-brand/40 text-foreground'
                    : 'bg-background border-border text-muted-foreground'
                }`}
              >
                Open builder after create
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, useBuilder: false })}
                className={`flex-1 h-10 rounded-xl text-sm font-medium border transition ${
                  !form.useBuilder
                    ? 'bg-brand/15 border-brand/40 text-foreground'
                    : 'bg-background border-border text-muted-foreground'
                }`}
              >
                Paste HTML
              </button>
            </div>
          </CrmField>

          {!form.useBuilder && (
            <CrmField label="Body (HTML or plain text)">
              <textarea
                required={!form.useBuilder}
                value={form.htmlBody}
                onChange={(e) => setForm({ ...form, htmlBody: e.target.value })}
                className={`${crmTextareaClass} min-h-[160px]`}
                placeholder="<p>Hi …</p>"
              />
            </CrmField>
          )}

          <CrmField label="Audience">
            <select
              value={form.source}
              onChange={(e) =>
                setForm({ ...form, source: e.target.value as AudienceSource, segmentId: '' })
              }
              className={crmInputClass}
            >
              <option value="crm_leads">All open CRM leads (with email)</option>
              <option value="segment">Marketing segment</option>
              <option value="manual">Manual email list</option>
            </select>
          </CrmField>
          {form.source === 'segment' && (
            <CrmField label="Segment">
              <select
                required
                value={form.segmentId}
                onChange={(e) => setForm({ ...form, segmentId: e.target.value })}
                className={crmInputClass}
              >
                <option value="">Select segment</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.segmentName}
                  </option>
                ))}
              </select>
            </CrmField>
          )}
          {form.source === 'manual' && (
            <CrmField label="Emails" hint="Comma or newline separated. Stored in this session for Send.">
              <textarea
                required
                value={form.manualEmails}
                onChange={(e) => setForm({ ...form, manualEmails: e.target.value })}
                className={crmTextareaClass}
                placeholder="a@example.com&#10;b@example.com"
              />
            </CrmField>
          )}
          <CrmModalActions
            onCancel={() => setShowCreate(false)}
            submitLabel={form.useBuilder ? 'Create & open builder' : 'Create campaign'}
            submitting={saving}
            submitIcon={<Mail size={16} />}
          />
        </form>
      </CrmModal>

      <CrmModal open={!!testFor} onClose={() => setTestFor(null)} title="Send test email" icon={FlaskConical}>
        <form onSubmit={onSendTest} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Sends via the campaign connector. For CRM/segment campaigns the address must already be
            in the audience; manual campaigns accept any address.
          </p>
          <CrmField label="Test address">
            <input
              required
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className={crmInputClass}
              placeholder="you@rabsinteriors.app"
            />
          </CrmField>
          <CrmModalActions
            onCancel={() => setTestFor(null)}
            submitLabel="Send test"
            submitting={saving}
            submitIcon={<Send size={16} />}
          />
        </form>
      </CrmModal>

      <CrmModal
        open={!!manualSendFor}
        onClose={() => setManualSendFor(null)}
        title="Manual recipients"
        icon={Send}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const emails = parseEmailList(manualSendEmails);
            if (!emails.length) {
              toast.error('Add at least one email');
              return;
            }
            const c = manualSendFor;
            setManualEmailsById((prev) => ({ ...prev, [String(c.id)]: emails }));
            setManualSendFor(null);
            void doSend(c, emails);
          }}
          className="space-y-4"
        >
          <CrmField label="Emails">
            <textarea
              required
              value={manualSendEmails}
              onChange={(e) => setManualSendEmails(e.target.value)}
              className={crmTextareaClass}
              placeholder="a@example.com&#10;b@example.com"
            />
          </CrmField>
          <CrmModalActions
            onCancel={() => setManualSendFor(null)}
            submitLabel="Send"
            submitting={saving}
            submitIcon={<Send size={16} />}
          />
        </form>
      </CrmModal>

      {sendsFor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto rounded-2xl border border-border/60 bg-card shadow-2xl">
            <div className="sticky top-0 z-10 px-6 py-4 border-b border-border/60 flex items-center justify-between bg-muted/40">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <ScrollText size={18} className="text-brand" />
                Send log · {sendsFor.name}
              </h2>
              <button
                type="button"
                onClick={() => setSendsFor(null)}
                className="p-2 rounded-full text-muted-foreground hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              {sends.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sends recorded yet.</p>
              ) : (
                <ul className="space-y-2 max-h-80 overflow-auto text-sm">
                  {sends.map((s) => (
                    <li key={s.id} className="border-b border-border/50 pb-2">
                      <div className="font-medium">{s.email}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className={statusBadgeClass(s.status).includes('emerald') ? 'text-emerald-600' : ''}>
                          {s.status}
                        </span>
                        {s.sentAt ? ` · ${new Date(s.sentAt).toLocaleString()}` : ''}
                        {s.error ? ` · ${s.error}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <CrmModal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete campaign" icon={Trash2}>
        <p className="text-sm text-muted-foreground">
          Delete <strong className="text-foreground">{confirmDel?.name}</strong>? Send history for this campaign
          will be removed.
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
