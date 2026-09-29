'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { SocialPage } from '@/components/social/social-page';
import { PlatformTag } from '@/components/social/platform-tag';
import { PermissionLock } from '@/components/social/permission-lock';
import { FilterBar } from '@/components/filter-bar';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getMetaConnectUrl, getMetaThread, listMetaInbox, listSocialAccounts, replySocialMessageViaMeta } from '@/lib/api';

export default function SocialMessagesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SOCIAL_MANAGER', 'CS_AGENT']);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [igLocked, setIgLocked] = useState<any>(null);
  const [filters, setFilters] = useState<Record<string, string>>({ platform: '', accountId: '' });
  const [q, setQ] = useState('');
  const [active, setActive] = useState<any>(null);
  const [thread, setThread] = useState<any[] | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = async () => {
    const [inbox, acc] = await Promise.all([
      listMetaInbox({
        platform: filters.platform || undefined,
        accountId: filters.accountId || undefined
      }),
      listSocialAccounts()
    ]);
    setConversations(inbox.data || []);
    setIgLocked(inbox.igLocked || null);
    setAccounts(acc.data || []);
  };

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    load()
      .catch((e: any) => toast.error(e.response?.data?.error?.message || 'Failed to load inbox'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, hasAccess, session?.accessToken, filters.platform, filters.accountId]);

  const organic = accounts.filter(
    (a) =>
      (a.platform === 'facebook' || a.platform === 'instagram') &&
      a.accountHandle !== 'ads' &&
      a.accountHandle !== '__meta_user__'
  );

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      if (q) {
        const blob = `${c.accountName} ${c.snippet || ''} ${(c.participants || []).map((p: any) => p.name).join(' ')}`.toLowerCase();
        if (!blob.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [conversations, q]);

  const openThread = async (c: any) => {
    setActive(c);
    setThread(null);
    try {
      const { data } = await getMetaThread(c.id, c.socialAccountId);
      setThread(data.messages || []);
      setActive({ ...c, ...data.conversation });
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || 'Failed to load thread');
    }
  };

  const send = async () => {
    if (!active || !reply.trim()) return;
    const other = (active.participants || []).find((p: any) => p.id && p.id !== String(accounts.find((a) => a.id === active.socialAccountId)?.accountId));
    const recipientId = other?.id;
    if (!recipientId) {
      toast.error('No recipient PSID on this thread');
      return;
    }
    setSending(true);
    try {
      await replySocialMessageViaMeta({
        socialAccountId: active.socialAccountId,
        recipientId,
        messageText: reply.trim()
      });
      toast.success('Reply sent');
      setReply('');
      await openThread(active);
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || 'Reply failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <SocialPage
      title="Social · Inbox"
      crumbs={[{ label: 'Social', href: '/social/dashboard' }, { label: 'Inbox' }]}
      loading={!hydrated || loading}
      denied={!hasAccess}
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Inbox</h1>
          <p className="text-sm text-muted-foreground">Facebook Page conversations from Graph. Tags come from Messenger (inbox, source, unread).</p>
        </div>

        {igLocked && (
          <PermissionLock
            title="Instagram DMs not granted"
            message={igLocked.message}
            missingPermission={igLocked.missingPermission}
            product="Instagram API"
            onReconnect={async () => {
              const { data } = await getMetaConnectUrl('publish');
              if (data?.authUrl) window.location.href = data.authUrl;
            }}
            reconnectLabel="Enable publishing"
          />
        )}

        <FilterBar
          searchValue={q}
          onSearchChange={setQ}
          searchPlaceholder="Search name or snippet…"
          values={filters}
          onChange={setFilters}
          fields={[
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
              key: 'accountId',
              label: 'Account',
              type: 'select',
              primary: true,
              options: organic.map((a) => ({ value: String(a.id), label: a.accountName }))
            }
          ]}
          stats={[{ label: 'Threads', value: String(filtered.length) }]}
        />

        <div className="grid lg:grid-cols-[minmax(280px,380px)_1fr] gap-4 min-h-[520px]">
          <div className="rounded-2xl border bg-card overflow-hidden flex flex-col">
            <div className="p-3 border-b text-sm font-medium">Conversations</div>
            <div className="flex-1 overflow-auto">
              {filtered.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No conversations for this filter.</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openThread(c)}
                    className={`w-full text-left p-3 border-b hover:bg-muted/40 ${active?.id === c.id ? 'bg-muted/60' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <PlatformTag platform={c.platform} extra={c.folder} />
                      {(c.unreadCount || 0) > 0 && (
                        <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{c.unreadCount}</span>
                      )}
                    </div>
                    <div className="text-sm font-medium truncate">
                      {(c.participants || []).map((p: any) => p.name).filter(Boolean).join(', ') || 'Unknown'}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{c.snippet || c.accountName}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(c.tags || []).slice(0, 4).map((t: string) => (
                        <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-card flex flex-col min-h-[520px]">
            {!active ? (
              <div className="m-auto text-sm text-muted-foreground">Select a conversation</div>
            ) : (
              <>
                <div className="p-3 border-b">
                  <div className="font-medium">
                    {(active.participants || []).map((p: any) => p.name).filter(Boolean).join(', ')}
                  </div>
                  <div className="text-xs text-muted-foreground">{active.accountName}</div>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-3">
                  {(thread || []).slice().reverse().map((m) => (
                    <div key={m.id} className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.direction === 'outbound' ? 'ml-auto bg-primary/15' : 'bg-muted'}`}>
                      <div className="text-[11px] text-muted-foreground mb-0.5">{m.from?.name}</div>
                      <div>{m.text || '(media / empty)'}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(m.tags || []).map((t: string) => (
                          <span key={t} className="text-[10px] text-muted-foreground">{t}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t flex gap-2">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    className="h-10 flex-1 rounded-md border px-3 bg-background"
                    placeholder="Reply…"
                  />
                  <button onClick={send} disabled={sending} className="rounded-md bg-primary px-4 text-sm text-primary-foreground">
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </SocialPage>
  );
}
