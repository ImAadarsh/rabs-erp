'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  getMarketingEmailCampaign,
  updateMarketingEmailCampaign,
} from '@/lib/api';
import { crmApiError } from '@/lib/crm-utils';
import {
  EmailBuilderJson,
  emptyBuilderJson,
  parseBuilderJson,
  renderEmailHtml,
} from '@/lib/email-builder';
import { EmailBuilderEditor, EmailBuilderToolbarHint } from '@/components/marketing/email-builder';
import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';
import { crmInputClass } from '@/components/crm/crm-modal';

export default function MarketingEmailCampaignBuilderPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || '');
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'MARKETING']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [campaign, setCampaign] = useState<any>(null);
  const [subject, setSubject] = useState('');
  const [builder, setBuilder] = useState<EmailBuilderJson>(emptyBuilderJson());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getMarketingEmailCampaign(id);
      const c = res.data;
      setCampaign(c);
      setSubject(c.subject || '');
      const raw = c.builderJson ?? c.builder_json;
      if (raw) {
        setBuilder(parseBuilderJson(raw));
      } else if (c.htmlBody || c.html_body) {
        // Seed a single paragraph from existing HTML/text so we don't wipe content
        const plain = String(c.htmlBody || c.html_body || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const seeded = emptyBuilderJson();
        const para = seeded.blocks.find((b) => b.type === 'paragraph');
        if (para && plain) para.text = plain.slice(0, 4000);
        setBuilder(seeded);
      } else {
        setBuilder(emptyBuilderJson());
      }
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to load campaign'));
      router.replace('/marketing/email-campaigns');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  async function onSave() {
    if (!id) return;
    setSaving(true);
    try {
      const htmlBody = renderEmailHtml(builder, { previewTitle: subject || campaign?.name });
      await updateMarketingEmailCampaign(id, {
        subject: subject.trim() || campaign?.subject,
        builderJson: builder,
        htmlBody,
      });
      toast.success('Builder saved');
      await load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to save builder'));
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated || !hasAccess || !session?.accessToken) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title={
            campaign
              ? `Builder · ${campaign.name}`
              : 'Marketing · Email Builder'
          }
          actions={[
            {
              label: 'Back',
              onClick: () => router.push('/marketing/email-campaigns'),
              icon: <ArrowLeft size={16} />,
              variant: 'secondary',
            },
            {
              label: saving ? 'Saving…' : 'Save',
              onClick: () => void onSave(),
              icon: <Save size={16} />,
            },
          ]}
        />
        <main className="p-6 md:p-8 space-y-5">
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading builder…</div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
                <div className="space-y-1 flex-1 max-w-xl">
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Subject line
                  </label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className={crmInputClass}
                    placeholder="Email subject"
                  />
                </div>
                <EmailBuilderToolbarHint />
              </div>
              <EmailBuilderEditor
                value={builder}
                onChange={setBuilder}
                previewTitle={subject || campaign?.name}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
