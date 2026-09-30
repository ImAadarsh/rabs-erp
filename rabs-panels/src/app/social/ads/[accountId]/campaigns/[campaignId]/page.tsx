'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { SocialPage } from '@/components/social/social-page';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listMetaAdSets } from '@/lib/api';

export default function AdSetsPage() {
  const params = useParams<{ accountId: string; campaignId: string }>();
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SOCIAL_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    listMetaAdSets(params.accountId, params.campaignId)
      .then((res) => setRows(res.data || []))
      .catch((e: any) => toast.error(e.response?.data?.error?.message || 'Failed to load ad sets'))
      .finally(() => setLoading(false));
  }, [hydrated, hasAccess, session?.accessToken, params.accountId, params.campaignId, router]);

  return (
    <SocialPage
      title="Social · Ad sets"
      backHref="/social/ads"
      crumbs={[
        { label: 'Social', href: '/social/dashboard' },
        { label: 'Ads', href: '/social/ads' },
        { label: 'Ad sets' }
      ]}
      loading={!hydrated || loading}
      denied={!hasAccess}
    >
      <h1 className="text-2xl font-bold mb-4">Ad sets</h1>
      <div className="overflow-x-auto bg-card border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Status</th>
              <th className="p-3">Goal</th>
              <th className="p-3">Spend</th>
              <th className="p-3">Impressions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">No ad sets in this campaign.</td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-3">
                    <Link className="text-primary hover:underline" href={`/social/ads/${params.accountId}/adsets/${s.id}`}>
                      {s.name}
                    </Link>
                  </td>
                  <td className="p-3">{s.status}</td>
                  <td className="p-3">{s.optimizationGoal || '—'}</td>
                  <td className="p-3">{s.insights?.spend ?? '—'}</td>
                  <td className="p-3">{s.insights?.impressions ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SocialPage>
  );
}
