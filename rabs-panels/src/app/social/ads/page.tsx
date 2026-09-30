'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { SocialPage } from '@/components/social/social-page';
import { PermissionLock } from '@/components/social/permission-lock';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getMetaConnectUrl, listMetaAdAccounts, listMetaAdCampaigns } from '@/lib/api';

export default function SocialAdsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SOCIAL_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [permission, setPermission] = useState<any>(null);
  const [selectedId, setSelectedId] = useState('');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  const connectAds = async () => {
    try {
      const { data } = await getMetaConnectUrl('ads');
      if (data?.authUrl) window.location.href = data.authUrl;
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || 'Connect failed');
    }
  };

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const res = await listMetaAdAccounts();
        setAccounts(res.data || []);
        setPermission(res.permission);
        if (res.data?.[0]?.id) setSelectedId(res.data[0].id);
      } catch (e: any) {
        toast.error(e.response?.data?.error?.message || 'Failed to load ad accounts');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken]);

  useEffect(() => {
    if (!selectedId) {
      setCampaigns([]);
      return;
    }
    (async () => {
      setLoadingCampaigns(true);
      setCampaignError(null);
      try {
        const { data } = await listMetaAdCampaigns(selectedId);
        setCampaigns(data || []);
      } catch (e: any) {
        setCampaignError(e.response?.data?.error?.message || 'Failed to load campaigns');
        setCampaigns([]);
      } finally {
        setLoadingCampaigns(false);
      }
    })();
  }, [selectedId]);

  const locked = permission && permission.granted === false;

  return (
    <SocialPage
      title="Social · Ads"
      crumbs={[{ label: 'Social', href: '/social/dashboard' }, { label: 'Ads' }]}
      loading={!hydrated || loading}
      denied={!hasAccess}
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Meta Ads</h1>
          <p className="text-sm text-muted-foreground">Ad accounts, campaigns, and last-30-day insights when Marketing API is granted.</p>
        </div>

        {locked || accounts.length === 0 ? (
          <PermissionLock
            title="Ads permissions not granted"
            message={
              permission?.message ||
              'No ad accounts are attached. Page tokens cannot list /me/adaccounts. Enable Marketing API on the Meta app, then reconnect with ads_read.'
            }
            missingPermission={permission?.missingPermission || 'ads_read'}
            product="Marketing API"
            onReconnect={connectAds}
            reconnectLabel="Reconnect with ads_read"
          />
        ) : (
          <>
            <div className="max-w-md">
              <label className="text-sm font-medium">Ad account</label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-1 w-full h-10 px-3 rounded-md border bg-background"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountName} ({a.accountId})
                  </option>
                ))}
              </select>
            </div>

            {campaignError && (
              <PermissionLock title="Campaigns unavailable" message={campaignError} missingPermission="ads_read" onReconnect={connectAds} />
            )}

            {loadingCampaigns ? (
              <div className="text-muted-foreground animate-pulse">Loading campaigns…</div>
            ) : (
              <div className="overflow-x-auto bg-card border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="p-3 font-medium">Campaign</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Objective</th>
                      <th className="p-3 font-medium">Impressions</th>
                      <th className="p-3 font-medium">Reach</th>
                      <th className="p-3 font-medium">Clicks</th>
                      <th className="p-3 font-medium">Spend</th>
                      <th className="p-3 font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-muted-foreground">
                          No campaigns in this ad account (empty is valid — this is not a permission error).
                        </td>
                      </tr>
                    ) : (
                      campaigns.map((c) => (
                        <tr key={c.id} className="border-t">
                          <td className="p-3 font-medium">
                            <Link className="text-primary hover:underline" href={`/social/ads/${selectedId}/campaigns/${c.id}`}>
                              {c.name}
                            </Link>
                          </td>
                          <td className="p-3">{c.status}</td>
                          <td className="p-3">{c.objective || '—'}</td>
                          <td className="p-3">{c.insights?.impressions ?? '—'}</td>
                          <td className="p-3">{c.insights?.reach ?? '—'}</td>
                          <td className="p-3">{c.insights?.clicks ?? '—'}</td>
                          <td className="p-3">{c.insights?.spend ?? '—'}</td>
                          <td className="p-3">{c.insights?.ctr ?? '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </SocialPage>
  );
}
