'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import {
  getCrmAccount, getCrmAccountTimeline, addCrmAccountNote, createCrmActivity,
  createCrmContact, updateCrmContact, deleteCrmContact
} from '@/lib/api';
import { crmApiError, displayName, formatMoney } from '@/lib/crm-utils';
import { toast } from 'sonner';
import {
  ArrowLeft, Building2, MessageSquare, Columns3, PhoneCall,
  StickyNote, ShoppingCart, Plus, ExternalLink, Send, History, Users, Trash2, Pencil
} from 'lucide-react';
import { CrmModal, CrmField, CrmModalActions, crmInputClass, crmTextareaClass } from '@/components/crm/crm-modal';

type Tab = 'overview' | 'timeline' | 'contacts' | 'tickets' | 'deals' | 'activities' | 'notes' | 'orders';

const emptyContact = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  title: '',
  isPrimary: false,
  notes: '',
};

export default function CrmAccount360Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [payload, setPayload] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityForm, setActivityForm] = useState({ type: 'task' as 'task' | 'call' | 'meeting' | 'note', subject: '', body: '', dueAt: '' });
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [contactForm, setContactForm] = useState(emptyContact);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [res, tl] = await Promise.all([
        getCrmAccount(id, { orderLimit: 20 }),
        getCrmAccountTimeline(id, { limit: 80 }).catch(() => ({ data: [] })),
      ]);
      setPayload(res.data);
      setTimeline(tl.data || []);
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to load account'));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, session?.accessToken, router, load]);

  async function saveNote(e: React.FormEvent) {
    e.preventDefault();
    try {
      await addCrmAccountNote(id, { note: noteText, noteType: 'follow_up' });
      toast.success('Note added');
      setNoteOpen(false);
      setNoteText('');
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to add note'));
    }
  }

  async function saveActivity(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createCrmActivity({
        type: activityForm.type,
        subject: activityForm.subject,
        body: activityForm.body || undefined,
        dueAt: activityForm.dueAt || undefined,
        customerId: id,
        ownerUserId: session?.user?.id,
        organizationId: session?.user?.organizationId,
      });
      toast.success('Activity created');
      setActivityOpen(false);
      setActivityForm({ type: 'task', subject: '', body: '', dueAt: '' });
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to create activity'));
    }
  }

  function openContact(c?: any) {
    if (c) {
      setEditingContact(c);
      setContactForm({
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        email: c.email || '',
        phone: c.phone || '',
        title: c.title || '',
        isPrimary: !!c.isPrimary,
        notes: c.notes || '',
      });
    } else {
      setEditingContact(null);
      setContactForm(emptyContact);
    }
    setContactOpen(true);
  }

  async function saveContact(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payloadContact = {
        firstName: contactForm.firstName,
        lastName: contactForm.lastName || null,
        email: contactForm.email || null,
        phone: contactForm.phone || null,
        title: contactForm.title || null,
        isPrimary: contactForm.isPrimary,
        notes: contactForm.notes || null,
      };
      if (editingContact) {
        await updateCrmContact(editingContact.id, payloadContact);
        toast.success('Contact updated');
      } else {
        await createCrmContact({
          organizationId: session?.user?.organizationId,
          customerId: id,
          ...payloadContact,
        });
        toast.success('Contact created');
      }
      setContactOpen(false);
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to save contact'));
    } finally {
      setSaving(false);
    }
  }

  async function removeContact(c: any) {
    if (!confirm(`Delete contact ${c.firstName}?`)) return;
    try {
      await deleteCrmContact(c.id);
      toast.success('Contact deleted');
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to delete contact'));
    }
  }

  const customer = payload?.customer;
  const title = displayName(customer) || `Customer #${id}`;
  const tickets = payload?.openTickets || [];
  const deals = payload?.deals || [];
  const activities = payload?.activities || [];
  const notes = payload?.notes || [];
  const orders = payload?.recentOrders || [];
  const contacts = payload?.contacts || [];
  const addresses = payload?.addresses || [];

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'timeline', label: 'Timeline', count: timeline.length },
    { id: 'contacts', label: 'Contacts', count: contacts.length },
    { id: 'tickets', label: 'Tickets', count: tickets.length },
    { id: 'deals', label: 'Deals', count: deals.length },
    { id: 'activities', label: 'Activities', count: activities.length },
    { id: 'notes', label: 'Notes', count: notes.length },
    { id: 'orders', label: 'Orders', count: orders.length },
  ];

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title={loading ? 'Account…' : title}
          actions={
            !loading && customer
              ? [
                  { label: 'Add Contact', onClick: () => openContact(), icon: <Users size={16} />, variant: 'secondary' },
                  { label: 'Add Note', onClick: () => setNoteOpen(true), icon: <StickyNote size={16} />, variant: 'secondary' },
                  { label: 'Add Activity', onClick: () => setActivityOpen(true), icon: <PhoneCall size={16} /> },
                ]
              : undefined
          }
        />
        <main className="p-6 md:p-8 space-y-6">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/crm/accounts" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <ArrowLeft size={16} /> Accounts
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-medium">{title}</span>
          </div>

          {loading ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground italic">Loading account…</div>
          ) : !payload || !customer ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center">
              <Building2 className="mx-auto mb-3 opacity-40" size={32} />
              <p className="font-medium">Account not found</p>
              <Link href="/crm/accounts" className="text-sm text-brand hover:underline mt-2 inline-block">Back to accounts</Link>
            </div>
          ) : (
            <>
              <div className="glass-panel rounded-2xl border border-border/50 p-6 flex flex-wrap gap-6 justify-between">
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                    <Building2 className="text-brand" size={22} />
                    {title}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {[customer.email, customer.phone, customer.companyName].filter(Boolean).join(' · ') || 'No contact details'}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    ERP customer #{id}{' '}
                    <Link href="/orders/customers" className="inline-flex items-center gap-1 text-brand hover:underline">
                      Open in Orders <ExternalLink size={12} />
                    </Link>
                    {payload.portalRetailer && (
                      <span className="ml-2 text-emerald-600">· B2B portal {payload.portalRetailer.status}</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => openContact()} className="btn bg-muted gap-2 text-sm">
                    <Users size={16} /> Add contact
                  </button>
                  <button type="button" onClick={() => setActivityOpen(true)} className="btn bg-muted gap-2 text-sm">
                    <PhoneCall size={16} /> Log activity
                  </button>
                  <button type="button" onClick={() => setNoteOpen(true)} className="btn bg-muted gap-2 text-sm">
                    <StickyNote size={16} /> Add note
                  </button>
                  <button type="button" onClick={() => router.push('/crm/tickets?new=true')} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl text-sm font-medium bg-brand hover:bg-brand-600 text-white shadow-sm">
                    <Plus size={16} /> Create Ticket
                  </button>
                </div>
              </div>

              <div className="flex gap-1 overflow-x-auto border-b border-border/60 pb-px">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                      tab === t.id ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t.label}
                    {t.count != null && t.count > 0 && (
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted">{t.count}</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="glass-panel rounded-2xl border border-border/50 p-6">
                {tab === 'overview' && (
                  <div className="grid gap-6 md:grid-cols-3">
                    <OverviewStat icon={MessageSquare} label="Open tickets" value={tickets.length} />
                    <OverviewStat icon={Columns3} label="Deals" value={deals.length} />
                    <OverviewStat icon={ShoppingCart} label="Recent orders" value={orders.length} />
                    {(payload.tags || []).length > 0 && (
                      <div className="md:col-span-3 flex flex-wrap gap-2">
                        {payload.tags.map((t: any) => (
                          <span key={t.id} className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-border" style={{ borderColor: t.color || undefined }}>
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {timeline.length > 0 && (
                      <div className="md:col-span-3 border-t border-border/50 pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold flex items-center gap-2"><History size={16} /> Recent interactions</h3>
                          <button type="button" className="text-xs text-brand hover:underline" onClick={() => setTab('timeline')}>Full timeline</button>
                        </div>
                        <ul className="space-y-2">
                          {timeline.slice(0, 5).map((item) => (
                            <li key={item.id} className="text-sm flex gap-3">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground w-24 shrink-0 pt-0.5">{item.type.replace('_', ' ')}</span>
                              <div className="min-w-0">
                                <div className="font-medium truncate">{item.title}</div>
                                <div className="text-xs text-muted-foreground">{item.at ? new Date(item.at).toLocaleString() : ''}</div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {tab === 'timeline' && (
                  <ul className="relative space-y-0">
                    {!timeline.length && <p className="text-sm text-muted-foreground italic text-center py-8">No interaction history yet.</p>}
                    {timeline.map((item, idx) => (
                      <li key={item.id} className="relative pl-6 pb-5 last:pb-0">
                        {idx < timeline.length - 1 && (
                          <span className="absolute left-[7px] top-3 bottom-0 w-px bg-border/60" />
                        )}
                        <span className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-brand bg-background" />
                        <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-0.5">
                          {String(item.type).replace(/_/g, ' ')} · {item.at ? new Date(item.at).toLocaleString() : ''}
                        </div>
                        <div className="font-medium text-sm">{item.title}</div>
                        {item.body && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-4">{item.body}</p>}
                      </li>
                    ))}
                  </ul>
                )}

                {tab === 'contacts' && (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <button type="button" onClick={() => openContact()} className="btn btn-primary gap-2 text-sm">
                        <Plus size={16} /> Contact
                      </button>
                    </div>
                    {!contacts.length && (
                      <div className="text-center py-8 space-y-3">
                        <p className="text-sm text-muted-foreground italic">
                          No contacts yet. Add buyers and people on this account.
                        </p>
                        <button
                          type="button"
                          onClick={() => openContact()}
                          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl text-sm font-medium bg-brand hover:bg-brand-600 text-white shadow-sm"
                        >
                          <Plus size={16} /> Add Contact
                        </button>
                      </div>
                    )}
                    <ul className="divide-y divide-border/50">
                      {contacts.map((c: any) => (
                        <li key={c.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">
                              {[c.firstName, c.lastName].filter(Boolean).join(' ')}
                              {c.isPrimary && (
                                <span className="ml-2 text-[10px] uppercase font-bold text-brand">Primary</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {[c.title, c.email, c.phone].filter(Boolean).join(' · ') || '—'}
                            </div>
                            {c.notes && <div className="text-xs text-muted-foreground mt-1">{c.notes}</div>}
                          </div>
                          <div className="flex gap-1">
                            <button type="button" className="p-2 rounded-lg hover:bg-muted" onClick={() => openContact(c)}><Pencil size={14} /></button>
                            <button type="button" className="p-2 rounded-lg hover:bg-muted text-rose-500" onClick={() => void removeContact(c)}><Trash2 size={14} /></button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {addresses.length > 0 && (
                      <div className="border-t border-border/50 pt-4 mt-2">
                        <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Addresses</div>
                        {addresses.map((a: any) => (
                          <div key={a.id} className="text-xs text-muted-foreground">
                            {[a.addressLine1, a.city, a.postalCode, a.countryCode].filter(Boolean).join(', ')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === 'tickets' && (
                  <EntityList empty="No open tickets." items={tickets} render={(t: any) => (
                    <Link href={`/crm/tickets/${t.id}`} className="block hover:text-brand">
                      <div className="font-medium font-mono text-xs">{t.ticketNumber}</div>
                      <div className="text-sm">{t.subject}</div>
                    </Link>
                  )} />
                )}

                {tab === 'deals' && (
                  <EntityList empty="No deals." items={deals} render={(d: any) => (
                    <Link href={`/crm/deals/${d.id}`} className="block hover:text-brand">
                      <div className="font-medium">{d.name}</div>
                      <div className="text-xs text-muted-foreground">{formatMoney(d.amount, d.currency)} · {d.status}</div>
                    </Link>
                  )} />
                )}

                {tab === 'activities' && (
                  <EntityList empty="No activities." items={activities} render={(a: any) => (
                    <>
                      <div className="font-medium"><span className="uppercase text-[10px] font-bold text-muted-foreground mr-2">{a.type}</span>{a.subject}</div>
                      <div className="text-xs text-muted-foreground">{a.dueAt ? new Date(a.dueAt).toLocaleString() : '—'}{a.completedAt ? ' · done' : ''}</div>
                    </>
                  )} />
                )}

                {tab === 'notes' && (
                  <EntityList empty="No notes." items={notes} render={(n: any) => (
                    <>
                      <div className="text-sm whitespace-pre-wrap">{n.note}</div>
                      <div className="text-xs text-muted-foreground mt-1">{n.noteType} · {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</div>
                    </>
                  )} />
                )}

                {tab === 'orders' && (
                  <EntityList empty="No recent orders." items={orders} render={(o: any) => (
                    <Link href={`/orders/orders/${o.id}`} className="block hover:text-brand">
                      <div className="font-medium font-mono text-xs">{o.orderNumber}</div>
                      <div className="text-sm">{formatMoney(o.total, o.currency)} · {o.status}</div>
                    </Link>
                  )} />
                )}
              </div>
            </>
          )}
        </main>
      </div>

      <CrmModal open={noteOpen} onClose={() => setNoteOpen(false)} title="Add note" icon={StickyNote}>
        <form onSubmit={saveNote} className="space-y-4">
          <CrmField label="Note">
            <textarea
              required
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className={crmTextareaClass}
              placeholder="Follow-up notes…"
            />
          </CrmField>
          <CrmModalActions
            onCancel={() => setNoteOpen(false)}
            submitLabel="Save Note"
            submitIcon={<Send size={16} />}
          />
        </form>
      </CrmModal>

      <CrmModal open={activityOpen} onClose={() => setActivityOpen(false)} title="Log activity" icon={PhoneCall}>
        <form onSubmit={saveActivity} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <CrmField label="Type">
              <select value={activityForm.type} onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value as any })} className={crmInputClass}>
                <option value="task">Task</option>
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
                <option value="note">Note</option>
              </select>
            </CrmField>
            <CrmField label="Due">
              <input type="datetime-local" value={activityForm.dueAt} onChange={(e) => setActivityForm({ ...activityForm, dueAt: e.target.value })} className={crmInputClass} />
            </CrmField>
          </div>
          <CrmField label="Subject">
            <input
              required
              value={activityForm.subject}
              onChange={(e) => setActivityForm({ ...activityForm, subject: e.target.value })}
              className={crmInputClass}
              placeholder="e.g. Delivery follow-up"
            />
          </CrmField>
          <CrmField label="Details">
            <textarea
              value={activityForm.body}
              onChange={(e) => setActivityForm({ ...activityForm, body: e.target.value })}
              className={crmTextareaClass}
              placeholder="Details…"
            />
          </CrmField>
          <CrmModalActions
            onCancel={() => setActivityOpen(false)}
            submitLabel="Create Activity"
            submitIcon={<Send size={16} />}
          />
        </form>
      </CrmModal>

      <CrmModal open={contactOpen} onClose={() => setContactOpen(false)} title={editingContact ? 'Edit contact' : 'New contact'} icon={Users}>
        <form onSubmit={saveContact} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <CrmField label="First name">
              <input required value={contactForm.firstName} onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })} className={crmInputClass} />
            </CrmField>
            <CrmField label="Last name">
              <input value={contactForm.lastName} onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })} className={crmInputClass} />
            </CrmField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <CrmField label="Email">
              <input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} className={crmInputClass} />
            </CrmField>
            <CrmField label="Phone">
              <input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} className={crmInputClass} />
            </CrmField>
          </div>
          <CrmField label="Title">
            <input value={contactForm.title} onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })} className={crmInputClass} placeholder="Buyer, Ops…" />
          </CrmField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={contactForm.isPrimary} onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })} />
            Primary contact
          </label>
          <CrmField label="Notes">
            <textarea value={contactForm.notes} onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })} className={crmTextareaClass} />
          </CrmField>
          <CrmModalActions
            onCancel={() => setContactOpen(false)}
            submitLabel={editingContact ? 'Save' : 'Create'}
            submitting={saving}
            submitIcon={<Send size={16} />}
          />
        </form>
      </CrmModal>
    </div>
  );
}

function OverviewStat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4 flex items-center gap-3">
      <div className="p-2 rounded-lg bg-brand/10 text-brand"><Icon size={18} /></div>
      <div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function EntityList({ items, empty, render }: { items: any[]; empty: string; render: (item: any) => React.ReactNode }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground italic text-center py-8">{empty}</p>;
  return (
    <ul className="divide-y divide-border/50">
      {items.map((item) => <li key={item.id} className="py-3">{render(item)}</li>)}
    </ul>
  );
}
