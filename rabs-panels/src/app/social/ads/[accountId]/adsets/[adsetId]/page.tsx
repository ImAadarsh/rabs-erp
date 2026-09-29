'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { SocialPage } from '@/components/social/social-page';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listMetaAdsInSet } from '@/lib/api';

export default function AdsInSetPage() {
  const params = useParams<{ accountId: string; adsetId: string }>();
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
    listMetaAdsInSet(params.accountId, params.adsetId)
      .then((res) => setRows(res.data || []))
      .catch((e: any) => toast.error(e.response?.data?.error?.message || 'Failed to load ads'))
      .finally(() => setLoading(false));
  }, [hydrated, hasAccess, session?.accessToken, params.accountId, params.adsetId, router]);

  return (
    <SocialPage
      title="Social · Ads"
      backHref="/social/ads"
      crumbs={[
        { label: 'Social', href: '/social/dashboard' },
        { label: 'Ads', href: '/social/ads' },
        { label: 'Ads in set' }
      ]}
      loading={!hydrated || loading}
      denied={!hasAccess}
    >
      <h1 className="text-2xl font-bold mb-4">Ads</h1>
      <div className="overflow-x-auto bg-card border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Status</th>
              <th className="p-3">Spend</th>
              <th className="p-3">Impressions</th>
              <th className="p-3">Clicks</th>
              <th className="p-3">CTR</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">No ads in this ad set.</td>
              </tr>
            ) : (
              rows.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-3 font-medium">{a.name}</td>
                  <td className="p-3">{a.status}</td>
                  <td className="p-3">{a.insights?.spend ?? '—'}</td>
                  <td className="p-3">{a.insights?.impressions ?? '—'}</td>
                  <td className="p-3">{a.insights?.clicks ?? '—'}</td>
                  <td className="p-3">{a.insights?.ctr ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SocialPage>
  );
}
