'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listB2bCreditRequests, reviewB2bCreditRequest, listB2bReferrals, updateB2bReferral } from '@/lib/api';
import { toast } from 'sonner';
import { Share2 } from 'lucide-react';

export default function B2bCreditReferralsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP']);
  const [credits, setCredits] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const orgId = session?.user?.organizationId;

  const load = async () => {
    if (!orgId) return;
    try {
      const [c, r] = await Promise.all([
        listB2bCreditRequests({ organizationId: orgId }),
        listB2bReferrals({ organizationId: orgId })
      ]);
      setCredits(c.data || []);
      setReferrals(r.data || []);
    } catch {
      toast.error('Failed to load credit/referral data');
    }
  };

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    load();
  }, [hydrated, hasAccess, session?.accessToken, orgId]);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="B2B · Credit & Referrals" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-8">
          <Link
            href="/marketing/affiliates?channel=b2b"
            className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors"
          >
            <Share2 className="mt-0.5 shrink-0" size={18} />
            <div>
              <div className="font-semibold text-sm">Affiliates & B2B attribution</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Partner tracking links, clicks, and wholesale-portal conversions live under Marketing → Affiliates.
              </p>
            </div>
          </Link>
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Credit increase requests</h2>
            <RichDataTable
              data={credits}
              columns={[
                { accessorFn: (r: any) => r.customer?.companyName || r.customer?.email, header: 'Retailer' },
                { accessorKey: 'currentLimit', header: 'Current' },
                { accessorKey: 'requestedLimit', header: 'Requested' },
                { accessorKey: 'status', header: 'Status' },
                {
                  header: 'Actions',
                  cell: ({ row }: any) =>
                    row.original.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          className="text-xs px-2 py-1 border rounded"
                          onClick={async () => {
                            await reviewB2bCreditRequest(row.original.id, { organizationId: orgId, status: 'approved' });
                            toast.success('Approved');
                            load();
                          }}
                        >
                          Approve
                        </button>
                        <button
                          className="text-xs px-2 py-1 border rounded"
                          onClick={async () => {
                            await reviewB2bCreditRequest(row.original.id, { organizationId: orgId, status: 'rejected' });
                            toast.success('Rejected');
                            load();
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    ) : null
                }
              ] as any}
              searchPlaceholder="Search credit requests..."
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Referrals</h2>
            <RichDataTable
              data={referrals}
              columns={[
                { accessorKey: 'code', header: 'Code' },
                { accessorFn: (r: any) => r.referrerCustomer?.companyName || r.referrerCustomer?.email, header: 'Referrer' },
                { accessorKey: 'referredEmail', header: 'Referred email' },
                { accessorKey: 'status', header: 'Status' },
                { accessorKey: 'rewardAmount', header: 'Reward' },
                {
                  header: 'Actions',
                  cell: ({ row }: any) => (
                    <button
                      className="text-xs px-2 py-1 border rounded"
                      onClick={async () => {
                        await updateB2bReferral(row.original.id, { organizationId: orgId, status: 'rewarded' });
                        toast.success('Marked rewarded');
                        load();
                      }}
                    >
                      Mark rewarded
                    </button>
                  )
                }
              ] as any}
              searchPlaceholder="Search referrals..."
            />
          </section>
        </main>
      </div>
    </div>
  );
}
