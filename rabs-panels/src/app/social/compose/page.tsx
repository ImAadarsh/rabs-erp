'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { SocialPage } from '@/components/social/social-page';
import { PermissionLock } from '@/components/social/permission-lock';
import { PlatformTag } from '@/components/social/platform-tag';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getMetaConnectUrl, listSocialAccounts, publishSocialNow } from '@/lib/api';

function isOrganic(a: any) {
  return (
    (a.platform === 'facebook' || a.platform === 'instagram') &&
    a.accountHandle !== 'ads' &&
    a.accountHandle !== '__meta_user__' &&
    !String(a.accountId || '').startsWith('act_') &&
    a.isActive !== false
  );
}

type PickedFile = { file: File; preview: string };

export default function SocialComposePage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SOCIAL_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [postType, setPostType] = useState('image');
  const [linkUrl, setLinkUrl] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const organic = useMemo(() => accounts.filter(isOrganic), [accounts]);

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
        const ig = accs.find((a: any) => a.platform === 'instagram' && isOrganic(a));
        const fb = accs.find((a: any) => a.platform === 'facebook' && isOrganic(a));
        setSelected([ig?.id, fb?.id].filter(Boolean).map(String));
      })
      .catch(() => toast.error('Failed to load accounts'))
      .finally(() => setLoading(false));
  }, [hydrated, hasAccess, router, session?.accessToken]);

  useEffect(() => {
    return () => {
      picked.forEach((p) => URL.revokeObjectURL(p.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next: PickedFile[] = [];
    for (const file of Array.from(list)) {
      if (!/^(image|video)\//.test(file.type) && !/\.(jpe?g|png|gif|webp|mp4|mov)$/i.test(file.name)) {
        toast.error(`${file.name} is not a supported image or video`);
        continue;
      }
      next.push({ file, preview: URL.createObjectURL(file) });
    }
    setPicked((prev) => {
      const merged = [...prev, ...next].slice(0, 10);
      const hasVideo = merged.some((p) => p.file.type.startsWith('video/') || /\.(mp4|mov)$/i.test(p.file.name));
      if (merged.length > 1) setPostType('carousel');
      else if (hasVideo) setPostType('video');
      else if (merged.length === 1) setPostType('image');
      return merged;
    });
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setPicked((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.preview);
      if (copy.length === 0) setPostType('text');
      else if (copy.length > 1) setPostType('carousel');
      else if (copy[0].file.type.startsWith('video/')) setPostType('video');
      else setPostType('image');
      return copy;
    });
  };

  const publish = async () => {
    if (!selected.length) {
      toast.error('Select at least one destination');
      return;
    }
    if (!content.trim() && picked.length === 0) {
      toast.error('Add a caption or attach an image/video');
      return;
    }
    const igSelected = organic.filter((a) => selected.includes(String(a.id)) && a.platform === 'instagram');
    if (igSelected.length && picked.length === 0) {
      toast.error('Instagram requires an image or video');
      return;
    }
    const link = linkUrl.trim();
    if (link && !/^https:\/\//i.test(link)) {
      toast.error('Facebook link must be a full https:// URL, or leave it blank');
      return;
    }
    setSubmitting(true);
    setResults(null);
    try {
      const { data } = await publishSocialNow({
        accountIds: selected,
        content,
        postType,
        files: picked.map((p) => p.file),
        linkUrl: link || undefined,
        hashtags: hashtags || undefined
      });
      setResults(data || []);
      const ok = (data || []).filter((r: any) => r.ok);
      const fail = (data || []).filter((r: any) => !r.ok);
      if (ok.length) toast.success(`Published to ${ok.length} destination(s)`);
      if (fail.length) toast.error(`${fail.length} destination(s) failed — see Graph errors below`);
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || 'Publish failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SocialPage
      title="Social · Composer"
      crumbs={[{ label: 'Social', href: '/social/dashboard' }, { label: 'Composer' }]}
      backHref="/social/posts"
      loading={!hydrated || loading}
      denied={!hasAccess}
    >
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Composer</h1>
          <p className="text-sm text-muted-foreground">
            Upload an image or video, then publish to connected Pages and Instagram. Files are stored on S3 and sent to Meta as a public HTTPS URL. Graph errors are shown as-is.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <h3 className="font-medium">Destinations</h3>
          {organic.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Page/IG accounts. Connect Meta first.</p>
          ) : (
            <div className="grid gap-2">
              {organic.map((a) => (
                <label key={a.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <input type="checkbox" checked={selected.includes(String(a.id))} onChange={() => toggle(String(a.id))} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{a.accountName}</span>
                      <PlatformTag platform={a.platform} extra={a.accountHandle} />
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-4 space-y-4">
          <label className="text-sm block">
            <span className="block mb-1 text-muted-foreground">Image or video</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov"
              multiple
              onChange={(e) => addFiles(e.target.files)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              JPEG, PNG, GIF, WebP, MP4, or MOV. Up to 10 files (carousel). Instagram cannot publish text-only.
            </span>
          </label>

          {picked.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {picked.map((p, i) => (
                <div key={p.preview} className="relative overflow-hidden rounded-lg border bg-muted">
                  {p.file.type.startsWith('video/') ? (
                    <video src={p.preview} className="h-36 w-full object-cover" controls muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.preview} alt={p.file.name} className="h-36 w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="absolute right-1 top-1 rounded bg-black/70 px-2 py-0.5 text-xs text-white"
                  >
                    Remove
                  </button>
                  <div className="truncate px-2 py-1 text-[11px] text-muted-foreground">{p.file.name}</div>
                </div>
              ))}
            </div>
          )}

          <label className="text-sm block">
            <span className="block mb-1 text-muted-foreground">Caption (optional)</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-32 w-full rounded-md border p-3 bg-background"
              placeholder="Write a caption…"
            />
          </label>
          <label className="text-sm block">
            <span className="block mb-1 text-muted-foreground">Hashtags</span>
            <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} className="h-10 w-full rounded-md border px-3 bg-background" />
          </label>
          <label className="text-sm block">
            <span className="block mb-1 text-muted-foreground">Optional Facebook link (https:// only)</span>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="h-10 w-full rounded-md border px-3 bg-background"
              placeholder="Leave blank unless attaching a webpage"
            />
          </label>
          <button
            onClick={publish}
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {submitting ? 'Uploading & publishing…' : 'Publish now'}
          </button>
        </div>

        {results && (
          <div className="space-y-3">
            {results.map((r) =>
              r.ok ? (
                <div key={r.accountId} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
                  Published to {r.accountName} ({r.platform}) — id {r.post?.platformPostId || r.post?.id}
                  {r.post?.platformPostUrl && (
                    <a className="block text-primary mt-1" href={r.post.platformPostUrl} target="_blank" rel="noreferrer">
                      Open on Meta
                    </a>
                  )}
                </div>
              ) : (
                <PermissionLock
                  key={r.accountId}
                  title={`Not published · ${r.accountName || r.accountId}`}
                  message={r.error || 'Graph denied this publish.'}
                  missingPermission={r.missingPermission}
                  product={r.missingPermission === 'instagram_content_publish' ? 'Instagram API' : 'Pages API'}
                  onReconnect={async () => {
                    const { data } = await getMetaConnectUrl('publish');
                    if (data?.authUrl) window.location.href = data.authUrl;
                  }}
                  reconnectLabel="Enable publishing"
                />
              )
            )}
          </div>
        )}
      </div>
    </SocialPage>
  );
}
