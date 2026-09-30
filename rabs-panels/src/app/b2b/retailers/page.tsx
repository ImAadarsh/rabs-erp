'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { createB2bRetailer, listB2bRetailers, updateB2bRetailer } from '@/lib/api';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Store, X } from 'lucide-react';

export default function B2bRetailersPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    email: '', password: '', companyName: '', firstName: '', lastName: '', phone: '',
    creditLimit: '5000', paymentTerms: '30 Days Net', tier: 'gold' as const
  });
  const orgId = session?.user?.organizationId;

  const load = async () => {
    if (!orgId) return;
    const res = await listB2bRetailers({ organizationId: orgId });
    setItems(res.data || []);
  };

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    load().catch(() => toast.error('Failed to load retailers')).finally(() => setLoading(false));
  }, [hydrated, hasAccess, session?.accessToken, orgId]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { accessorFn: (r) => r.customer?.companyName || r.customer?.customerNumber, header: 'Company' },
    { accessorKey: 'email', header: 'Login email' },
    { accessorFn: (r) => r.customer?.tier, header: 'Tier' },
    {
      accessorFn: (r) => r.customer?.creditLimit,
      header: 'Credit limit',
      cell: ({ row }) => `£${Number(row.original.customer?.creditLimit || 0).toLocaleString()}`
    },
    {
      accessorFn: (r) => r.customer?.creditUsed,
      header: 'Used',
      cell: ({ row }) => `£${Number(row.original.customer?.creditUsed || 0).toLocaleString()}`
    },
    { accessorKey: 'status', header: 'Status' },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border"
          onClick={async () => {
            const next = row.original.status === 'disabled' ? 'active' : 'disabled';
            await updateB2bRetailer(row.original.id, { status: next });
            toast.success(next === 'disabled' ? 'Login disabled' : 'Login enabled');
            await load();
          }}
        >
          {row.original.status === 'disabled' ? 'Enable' : 'Disable'}
        </button>
      )
    }
  ], []);

  const create = async () => {
    if (!orgId) return;
    try {
      await createB2bRetailer({
        organizationId: orgId,
        email: form.email,
        password: form.password,
        companyName: form.companyName,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        creditLimit: Number(form.creditLimit) || 0,
        paymentTerms: form.paymentTerms,
        tier: form.tier
      });
      toast.success('Retailer created');
      setShowCreate(false);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Create failed');
    }
  };

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="B2B · Retailers" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Store />
              <div>
                <h1 className="text-xl font-bold">Wholesale retailers</h1>
                <p className="text-sm text-muted-foreground">Portal logins linked to wholesale customers and trade credit.</p>
              </div>
            </div>
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold">
              <Plus size={16} /> New retailer
            </button>
          </div>
          {loading ? <div className="text-muted-foreground">Loading...</div> : (
            <RichDataTable data={items} columns={columns} searchPlaceholder="Search retailers..." />
          )}
        </main>
      </div>
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold">Create retailer login</h2>
              <button onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>
            {['email', 'password', 'companyName', 'firstName', 'lastName', 'phone', 'creditLimit', 'paymentTerms'].map((key) => (
              <input
                key={key}
                type={key === 'password' ? 'password' : 'text'}
                placeholder={key}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background"
                value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            ))}
            <button onClick={create} className="w-full bg-primary text-primary-foreground py-2 rounded-xl font-semibold">Create</button>
          </div>
        </div>
      )}
    </div>
  );
}
