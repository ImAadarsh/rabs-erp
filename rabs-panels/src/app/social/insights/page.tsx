'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { SocialPage } from '@/components/social/social-page';
import { PermissionLock } from '@/components/social/permission-lock';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getMetaConnectUrl, getMetaInsights, listSocialAccounts } from '@/lib/api';

export default function SocialInsightsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SOCIAL_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [preset, setPreset] = useState('last_28d');
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const organic = useMemo(
    () =>
      accounts.filter(
        (a) =>
          (a.platform === 'facebook' || a.platform === 'instagram') &&
          a.accountHandle !== 'ads' &&
          a.accountHandle !== '__meta_user__'
      ),
    [accounts]
  );

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    listSocialAccounts()
      .then((res) => {
        const accs = res.data || [];
        setAccounts(accs);
        const first = accs.find(
          (a: any) => a.platform === 'facebook' && a.accountHandle !== 'ads' && a.accountHandle !== '__meta_user__'
        );
        if (first) setAccountId(String(first.id));
      })
      .catch(() => toast.error('Failed to load accounts'))
      .finally(() => setLoading(false));
  }, [hydrated, hasAccess, router, session?.accessToken]);

  useEffect(() => {
    if (!accountId) return;
    setBusy(true);
    getMetaInsights({ accountId, preset })
      .then((res) => setData(res.data))
      .catch((e: any) => toast.error(e.response?.data?.error?.message || 'Insights failed'))
      .finally(() => setBusy(false));
  }, [accountId, preset]);

  return (
    <SocialPage
      title="Social · Insights"
      crumbs={[{ label: 'Social', href: '/social/dashboard' }, { label: 'Insights' }]}
      loading={!hydrated || loading}
      denied={!hasAccess}
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Insights</h1>
          <p className="text-sm text-muted-foreground">Real Graph time series. Empty charts mean Graph returned no points — they are never invented.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-10 rounded-md border px-3 bg-background">
            {organic.map((a) => (
              <option key={a.id} value={a.id}>
                {a.accountName} ({a.platform})
              </option>
            ))}
          </select>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className="h-10 rounded-md border px-3 bg-background">
            <option value="last_7d">Last 7 days</option>
            <option value="last_28d">Last 28 days</option>
            <option value="last_90d">Last 90 days</option>
          </select>
        </div>

        {data?.locked && (
          <PermissionLock
            title="Insights not granted"
            message={data.locked.message}
            missingPermission={data.locked.missingPermission}
            product={data.account?.platform === 'instagram' ? 'Instagram API' : 'Pages API'}
            onReconnect={async () => {
              const { data } = await getMetaConnectUrl('publish');
              if (data?.authUrl) window.location.href = data.authUrl;
            }}
            reconnectLabel="Enable publishing"
          />
        )}

        {data?.profile && (
          <div className="flex flex-wrap gap-4 text-sm rounded-xl border bg-card p-4">
            {Object.entries(data.profile)
              .filter(([k]) => k !== 'error')
              .map(([k, v]) => (
                <div key={k}>
                  <div className="text-muted-foreground text-xs uppercase">{k}</div>
                  <div className="font-medium">{String(v)}</div>
                </div>
              ))}
          </div>
        )}

        {busy && <p className="text-sm text-muted-foreground animate-pulse">Loading series…</p>}

        <div className="grid md:grid-cols-2 gap-4">
          {(data?.series || []).map((s: any) => (
            <div key={s.name} className="rounded-2xl border bg-card p-4">
              <h3 className="font-medium mb-2 text-sm">{s.name.replace(/_/g, ' ')}</h3>
              {s.points?.length ? (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={s.points.map((p: any) => ({ day: String(p.endTime || '').slice(0, 10), value: p.value }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="value" stroke="#E3070F" fill="#E3070F33" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{s.error || 'No points from Graph.'}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </SocialPage>
  );
}
