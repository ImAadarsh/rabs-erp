'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { FilterBar } from '@/components/filter-bar';
import { SocialPage } from '@/components/social/social-page';
import { PlatformTag } from '@/components/social/platform-tag';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listMetaFeed, listSocialAccounts, listSocialPosts } from '@/lib/api';
import { Film, Image as ImageIcon, RefreshCw } from 'lucide-react';

function isOrganic(a: any) {
  return (
    (a.platform === 'facebook' || a.platform === 'instagram') &&
    a.accountHandle !== 'ads' &&
    a.accountHandle !== '__meta_user__' &&
    !String(a.accountId || '').startsWith('act_')
  );
}

export default function SocialPostsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SOCIAL_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [live, setLive] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [paging, setPaging] = useState<{ after?: string }>({});
  const [tab, setTab] = useState<'live' | 'reels' | 'drafts'>('live');
  const [filters, setFilters] = useState<Record<string, string>>({
    accountId: '',
    platform: '',
    mediaType: '',
    since: '',
    until: ''
  });
  const [q, setQ] = useState('');

  const organic = useMemo(() => accounts.filter(isOrganic), [accounts]);

  const loadAccounts = async () => {
    const acc = await listSocialAccounts();
    setAccounts(acc.data || []);
    return acc.data || [];
  };

  const loadLive = async (accountId: string, mediaType?: string, after?: string) => {
    if (!accountId) {
      setLive([]);
      return;
    }
    const res = await listMetaFeed({
      accountId,
      mediaType: mediaType || undefined,
      after,
      since: filters.since || undefined,
      until: filters.until || undefined,
      limit: 25
    });
    setLive(after ? [...live, ...(res.data || [])] : res.data || []);
    setPaging(res.paging || {});
  };

  const loadDrafts = async () => {
    const res = await listSocialPosts();
    setDrafts((res.data || []).filter((p: any) => p.status !== 'deleted'));
  };

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const accs = await loadAccounts();
        const preferred =
          filters.accountId ||
          accs.find((a: any) => String(a.accountHandle || '').toLowerCase().includes('rabs'))?.id ||
          accs.find(isOrganic)?.id ||
          '';
        if (!filters.accountId && preferred) setFilters((f) => ({ ...f, accountId: preferred }));
        await Promise.all([
          preferred ? loadLive(preferred, tab === 'reels' ? 'reel' : filters.mediaType) : Promise.resolve(),
          loadDrafts()
        ]);
      } catch (e: any) {
        toast.error(e.response?.data?.error?.message || 'Failed to load posts');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, hasAccess, session?.accessToken]);

  useEffect(() => {
    if (loading) return;
    if (tab === 'drafts') return;
    const accountId = filters.accountId;
    if (!accountId) return;
    loadLive(accountId, tab === 'reels' ? 'reel' : filters.mediaType).catch((e: any) =>
      toast.error(e.response?.data?.error?.message || 'Feed failed')
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.accountId, filters.mediaType, filters.since, filters.until, tab]);

  const filteredLive = live.filter((p) => {
    if (filters.platform && p.platform !== filters.platform) return false;
    if (q && !String(p.message || '').toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const filteredDrafts = drafts.filter((p) => {
    if (filters.accountId && String(p.socialAccountId) !== String(filters.accountId)) return false;
    if (filters.platform && p.socialAccount?.platform !== filters.platform) return false;
    if (q && !String(p.content || '').toLowerCase().includes(q.toLowerCase())) return false;
    if (tab === 'reels' && p.postType !== 'reel') return false;
    return true;
  });

  return (
    <SocialPage
      title="Social · Posts"
      crumbs={[{ label: 'Social', href: '/social/dashboard' }, { label: 'Posts' }]}
      loading={!hydrated || loading}
      denied={!hasAccess}
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Posts</h1>
            <p className="text-sm text-muted-foreground">Live Graph history — not just ERP drafts</p>
          </div>
          <Link
            href="/social/compose"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            New post
          </Link>
        </div>

        <div className="flex gap-2">
          {(['live', 'reels', 'drafts'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                tab === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {t === 'live' ? 'Live feed' : t === 'reels' ? 'Shorts / Reels' : 'ERP drafts'}
            </button>
          ))}
        </div>

        <FilterBar
          searchValue={q}
          onSearchChange={setQ}
          searchPlaceholder="Search captions…"
          values={filters}
          onChange={setFilters}
          fields={[
            {
              key: 'accountId',
              label: 'Account',
              type: 'select',
              primary: true,
              options: organic.map((a) => ({
                value: String(a.id),
                label: `${a.accountName} (${a.platform})`
              }))
            },
            {
              key: 'platform',
              label: 'Platform',
              type: 'select',
              primary: true,
              options: [
                { value: 'facebook', label: 'Facebook' },
                { value: 'instagram', label: 'Instagram' }
              ]
            },
            {
              key: 'mediaType',
              label: 'Media',
              type: 'select',
              options: [
                { value: 'image', label: 'Image' },
                { value: 'video', label: 'Video' },
                { value: 'reel', label: 'Reel / Short' },
                { value: 'carousel', label: 'Carousel' },
                { value: 'text', label: 'Text' }
              ]
            },
            { key: 'since', label: 'From', type: 'date' },
            { key: 'until', label: 'To', type: 'date' }
          ]}
          actions={
            <button
              onClick={() => filters.accountId && loadLive(filters.accountId, tab === 'reels' ? 'reel' : filters.mediaType)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          }
          stats={[{ label: 'Shown', value: String(tab === 'drafts' ? filteredDrafts.length : filteredLive.length) }]}
        />

        {tab !== 'drafts' ? (
          <div className="grid gap-3">
            {filteredLive.length === 0 ? (
              <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
                {tab === 'reels' ? 'No reels/shorts on this account yet.' : 'No posts returned from Graph for these filters.'}
              </div>
            ) : (
              filteredLive.map((p) => (
                <Link
                  key={p.id}
                  href={`/social/posts/view?accountId=${p.socialAccountId}&postId=${encodeURIComponent(p.id)}`}
                  className="flex gap-4 rounded-xl border bg-card p-4 hover:border-primary/40"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
                    {p.thumbnailUrl || p.mediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnailUrl || p.mediaUrl} alt="" className="h-full w-full object-cover" />
                    ) : p.mediaType === 'reel' ? (
                      <Film className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <PlatformTag platform={p.platform} extra={p.mediaType} />
                      <span className="text-xs text-muted-foreground">{p.accountName}</span>
                      <span className="text-xs text-muted-foreground">{p.createdTime ? new Date(p.createdTime).toLocaleString() : ''}</span>
                    </div>
                    <p className="text-sm line-clamp-2">{p.message || '(no caption)'}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p.likes != null ? `♥ ${p.likes}` : ''} {p.comments != null ? `· 💬 ${p.comments}` : ''}
                    </p>
                  </div>
                </Link>
              ))
            )}
            {paging.after && (
              <button
                className="rounded-md border px-4 py-2 text-sm"
                onClick={() => loadLive(filters.accountId, tab === 'reels' ? 'reel' : filters.mediaType, paging.after)}
              >
                Load more
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredDrafts.length === 0 ? (
              <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No ERP drafts.</div>
            ) : (
              filteredDrafts.map((p) => (
                <div key={p.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap gap-2 mb-1">
                    <PlatformTag platform={p.socialAccount?.platform} extra={p.postType} />
                    <span className="text-xs rounded-full bg-muted px-2 py-0.5">{p.status}</span>
                    <span className="text-xs text-muted-foreground">{p.socialAccount?.accountName}</span>
                  </div>
                  <p className="text-sm">{p.content}</p>
                  {p.failureReason && <p className="text-xs text-destructive mt-2">{p.failureReason}</p>}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </SocialPage>
  );
}
