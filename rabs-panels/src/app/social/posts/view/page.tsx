'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { SocialPage } from '@/components/social/social-page';
import { PlatformTag } from '@/components/social/platform-tag';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getMetaFeedPost } from '@/lib/api';

function PostViewInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SOCIAL_MANAGER']);
  const accountId = search.get('accountId') || '';
  const postId = search.get('postId') || '';
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<any>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    if (!accountId || !postId) {
      setLoading(false);
      return;
    }
    getMetaFeedPost(accountId, postId)
      .then((res) => setPost(res.data))
      .catch((e: any) => toast.error(e.response?.data?.error?.message || 'Failed to load post'))
      .finally(() => setLoading(false));
  }, [hydrated, hasAccess, session?.accessToken, accountId, postId, router]);

  return (
    <SocialPage
      title="Social · Post"
      backHref="/social/posts"
      crumbs={[
        { label: 'Social', href: '/social/dashboard' },
        { label: 'Posts', href: '/social/posts' },
        { label: 'Detail' }
      ]}
      loading={!hydrated || loading}
      denied={!hasAccess}
    >
      {!post ? (
        <p className="text-muted-foreground">Post not found.</p>
      ) : (
        <div className="max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <PlatformTag platform={post.platform} extra={post.mediaType} />
            <span className="text-sm text-muted-foreground">{post.accountName}</span>
          </div>
          {post.mediaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.thumbnailUrl || post.mediaUrl} alt="" className="max-h-96 rounded-xl border object-contain bg-muted" />
          )}
          <p className="whitespace-pre-wrap">{post.message || '(no caption)'}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted-foreground">Created</dt><dd>{post.createdTime ? new Date(post.createdTime).toLocaleString() : '—'}</dd></div>
            <div><dt className="text-muted-foreground">Likes</dt><dd>{post.likes ?? '—'}</dd></div>
            <div><dt className="text-muted-foreground">Comments</dt><dd>{post.comments ?? '—'}</dd></div>
            <div><dt className="text-muted-foreground">Shares</dt><dd>{post.shares ?? '—'}</dd></div>
          </dl>
          {post.insights && (
            <div className="rounded-xl border p-4 text-sm">
              <h3 className="font-medium mb-2">Post insights</h3>
              <ul className="grid grid-cols-2 gap-2">
                {Object.entries(post.insights).map(([k, v]) => (
                  <li key={k}><span className="text-muted-foreground">{k}:</span> {String(v)}</li>
                ))}
              </ul>
            </div>
          )}
          {post.graphError && <p className="text-xs text-muted-foreground">Insights: {post.graphError}</p>}
          {post.permalink && (
            <a href={post.permalink} target="_blank" rel="noreferrer" className="text-primary text-sm">
              Open on {post.platform === 'instagram' ? 'Instagram' : 'Facebook'}
            </a>
          )}
        </div>
      )}
    </SocialPage>
  );
}

export default function SocialPostViewPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <PostViewInner />
    </Suspense>
  );
}
