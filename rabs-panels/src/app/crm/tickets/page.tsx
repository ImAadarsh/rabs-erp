'use client';
import { Suspense, useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listTickets, listCustomers, createTicket } from '@/lib/api';
import { RichDataTable } from '@/components/rich-data-table';
import { FilterBar, type FilterField } from '@/components/filter-bar';
import { Plus, Eye, Send, MessageSquare } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import Link from 'next/link';
import { crmApiError } from '@/lib/crm-utils';
import { CrmModal, CrmField, CrmModalActions, crmInputClass, crmTextareaClass } from '@/components/crm/crm-modal';
import { CrmCustomerSelect, customerOptionFromRecord } from '@/components/crm/crm-customer-select';

export default function TicketsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen app-surface" />}>
      <TicketsPageInner />
    </Suspense>
  );
}

function TicketsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(searchParams.get('new') === 'true');
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    subject: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    category: 'general' as any,
    channel: 'web_form' as any,
  });

  const customerOptions = useMemo(() => customers.map(customerOptionFromRecord), [customers]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [ticketsRes, customersRes] = await Promise.all([
        listTickets({
          status: filters.status || undefined,
          priority: filters.priority || undefined,
          category: filters.category || undefined,
        }),
        listCustomers(),
      ]);
      let rows = ticketsRes.data || [];
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        rows = rows.filter((t: any) =>
          [t.ticketNumber, t.subject, t.status, t.priority, t.customer?.firstName, t.customer?.lastName, t.customer?.email]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        );
      }
      setTickets(rows);
      setCustomers(customersRes.data || []);
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to load tickets'));
    } finally {
      setLoading(false);
    }
  }, [filters, search]);

  useEffect(() => {
    const s = getSession();
    if (!s?.accessToken) {
      router.replace('/login');
      return;
    }
    void loadData();
  }, [router, loadData]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const s = getSession();
    if (!s?.user?.organizationId) return;
    if (!form.customerId) {
      toast.error('Select a customer');
      return;
    }

    setSaving(true);
    try {
      const res = await createTicket({
        ...form,
        organizationId: s.user.organizationId,
      });
      setShowCreate(false);
      setForm({
        customerId: '',
        subject: '',
        description: '',
        priority: 'medium',
        category: 'general',
        channel: 'web_form',
      });
      toast.success('Ticket created successfully');
      router.push(`/crm/tickets/${res.data.id}`);
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to create ticket'));
    } finally {
      setSaving(false);
    }
  }

  const filterFields = useMemo<FilterField[]>(() => [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      primary: true,
      options: [
        { value: 'new', label: 'New' },
        { value: 'open', label: 'Open' },
        { value: 'pending_customer', label: 'Pending customer' },
        { value: 'pending_internal', label: 'Pending internal' },
        { value: 'resolved', label: 'Resolved' },
        { value: 'closed', label: 'Closed' },
      ],
    },
    {
      key: 'priority',
      label: 'Priority',
      type: 'select',
      primary: true,
      options: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'urgent', label: 'Urgent' },
      ],
    },
    {
      key: 'category',
      label: 'Category',
      type: 'select',
      options: [
        { value: 'general', label: 'General' },
        { value: 'order_inquiry', label: 'Order inquiry' },
        { value: 'return', label: 'Return' },
        { value: 'technical', label: 'Technical' },
        { value: 'billing', label: 'Billing' },
        { value: 'complaint', label: 'Complaint' },
      ],
    },
  ], []);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: 'ticketNumber',
      header: 'Ticket #',
      cell: (info) => (
        <Link href={`/crm/tickets/${info.row.original.id}`} className="font-bold text-brand hover:text-brand-600 transition">
          {info.getValue() as string}
        </Link>
      ),
    },
    { accessorKey: 'subject', header: 'Subject', cell: (i) => <span className="font-medium">{i.getValue() as string}</span> },
    {
      id: 'customer',
      header: 'Customer',
      accessorFn: (row) => (row.customer ? `${row.customer.firstName || ''} ${row.customer.lastName || ''}`.trim() || row.customer.email : 'Guest'),
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: (info) => {
        const val = info.getValue() as string;
        return (
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
            val === 'urgent' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-500 border-rose-500/20' :
            val === 'high' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-500 border-orange-500/20' :
            val === 'low' ? 'bg-muted text-muted-foreground border-border' :
            'bg-blue-500/10 text-blue-600 dark:text-blue-500 border-blue-500/20'
          }`}>{val}</span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info) => {
        const val = info.getValue() as string;
        return (
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
            val === 'open' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/20' :
            val === 'new' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-500 border-blue-500/20' :
            'bg-muted text-muted-foreground border-border'
          }`}>{val.replace(/_/g, ' ')}</span>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: (info) => new Date(info.getValue() as string).toLocaleDateString(),
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => (
        <Link
          href={`/crm/tickets/${info.row.original.id}`}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition group inline-flex"
        >
          <Eye size={16} className="group-hover:scale-110 transition-transform" />
        </Link>
      ),
    },
  ], []);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title="Support Tickets"
          actions={[{ label: 'Create Ticket', onClick: () => setShowCreate(true), icon: <Plus size={18} /> }]}
        />

        <main className="p-6 md:p-8 space-y-5">
          <FilterBar
            fields={filterFields}
            values={filters}
            onChange={setFilters}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search tickets…"
            stats={[{ label: 'Tickets', value: loading ? '…' : String(tickets.length) }]}
            loading={loading}
          />
          {!loading && tickets.length === 0 ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
              <MessageSquare className="mx-auto mb-3 opacity-40" size={32} />
              <p className="font-medium text-foreground">No tickets yet</p>
              <p className="text-sm mt-1">Open a support ticket to start the queue.</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-brand hover:bg-brand-600 text-white shadow-sm"
              >
                <Plus size={16} /> Create Ticket
              </button>
            </div>
          ) : (
            <RichDataTable data={tickets} columns={columns} hideSearch searchPlaceholder="Search tickets..." />
          )}
        </main>
      </div>

      <CrmModal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Ticket" icon={Plus}>
        <form onSubmit={handleCreate} className="space-y-4">
          <CrmField label="Customer">
            <CrmCustomerSelect
              required
              value={form.customerId}
              onChange={(customerId) => setForm({ ...form, customerId })}
              options={customerOptions}
              placeholder="Select customer"
            />
          </CrmField>

          <CrmField label="Subject">
            <input
              required
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className={crmInputClass}
              placeholder="e.g. Order #1234 delayed"
            />
          </CrmField>

          <div className="grid grid-cols-2 gap-4">
            <CrmField label="Priority">
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as any })}
                className={crmInputClass}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </CrmField>
            <CrmField label="Category">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as any })}
                className={crmInputClass}
              >
                <option value="general">General</option>
                <option value="order_inquiry">Order Inquiry</option>
                <option value="return">Return</option>
                <option value="technical">Technical</option>
                <option value="billing">Billing</option>
                <option value="complaint">Complaint</option>
              </select>
            </CrmField>
          </div>

          <CrmField label="Description">
            <textarea
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={crmTextareaClass}
              placeholder="Provide detailed information…"
            />
          </CrmField>

          <CrmModalActions
            onCancel={() => setShowCreate(false)}
            submitLabel="Create Ticket"
            submitting={saving}
            submitIcon={<Send size={16} />}
          />
        </form>
      </CrmModal>
    </div>
  );
}
