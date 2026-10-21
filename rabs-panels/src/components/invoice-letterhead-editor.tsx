'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2 } from 'lucide-react';
import { CrmField, CrmModal, CrmModalActions, crmInputClass } from '@/components/crm/crm-modal';
import { FileUploadField } from '@/components/file-upload-field';
import { getInvoiceLetterhead, saveInvoiceLetterhead } from '@/lib/api';

type Form = {
  logoUrl: string;
  companyName: string;
  addressLines: string;
  phone: string;
  email: string;
  website: string;
  vatNumber: string;
  companyNumber: string;
  footerText: string;
  accentColor: string;
};

const DEFAULT_ACCENT = '#A31F24';

const empty: Form = {
  logoUrl: '',
  companyName: '',
  addressLines: '',
  phone: '',
  email: '',
  website: '',
  vatNumber: '',
  companyNumber: '',
  footerText: '',
  accentColor: '',
};

/**
 * Edits the organization's invoice letterhead. Empty fields fall back to the
 * organization profile (System → Settings), so only overrides need filling in.
 */
export function InvoiceLetterheadEditor({
  open,
  organizationId,
  onClose,
  onSaved,
}: {
  open: boolean;
  organizationId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(empty);
  const [profile, setProfile] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getInvoiceLetterhead(organizationId)
      .then((res) => {
        const s = res.data.settings;
        setProfile(res.data.profile || {});
        setForm({
          logoUrl: s?.logoUrl || '',
          companyName: s?.companyName || '',
          addressLines: (s?.addressLines || []).join('\n'),
          phone: s?.phone || '',
          email: s?.email || '',
          website: s?.website || '',
          vatNumber: s?.vatNumber || '',
          companyNumber: s?.companyNumber || '',
          footerText: s?.footerText || '',
          accentColor: s?.accentColor || '',
        });
      })
      .catch((e: any) => toast.error(e?.response?.data?.error?.message || 'Failed to load letterhead'))
      .finally(() => setLoading(false));
  }, [open, organizationId]);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.accentColor && !/^#[0-9a-fA-F]{6}$/.test(form.accentColor)) {
      toast.error('Accent colour must be a hex colour like #A31F24');
      return;
    }
    setSaving(true);
    try {
      await saveInvoiceLetterhead(
        {
          logoUrl: form.logoUrl || null,
          companyName: form.companyName.trim() || null,
          addressLines: form.addressLines.split('\n').map((l) => l.trim()).filter(Boolean),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          website: form.website.trim() || null,
          vatNumber: form.vatNumber.trim() || null,
          companyNumber: form.companyNumber.trim() || null,
          footerText: form.footerText.trim() || null,
          accentColor: form.accentColor || null,
        },
        organizationId
      );
      toast.success('Letterhead saved');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to save letterhead');
    } finally {
      setSaving(false);
    }
  };

  const text = (key: keyof Form, label: string, placeholder?: string | null) => (
    <CrmField label={label}>
      <input value={form[key]} onChange={set(key)} placeholder={placeholder || ''} autoComplete="off" className={crmInputClass} />
    </CrmField>
  );

  return (
    <CrmModal open={open} onClose={onClose} title="Edit invoice letterhead" icon={FileText} wide>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading letterhead…
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Applies to every invoice of this organization. Leave a field empty to use the organization profile value (shown greyed).
          </p>
          <CrmField label="Logo">
            <FileUploadField
              value={form.logoUrl ? [form.logoUrl] : []}
              onChange={(urls) => setForm((f) => ({ ...f, logoUrl: urls[0] || '' }))}
              folder="organizations"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              maxSizeInMB={2}
              label="Upload logo"
            />
          </CrmField>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('companyName', 'Company name', profile.legalName || profile.name)}
            {text('vatNumber', 'VAT number', profile.taxId)}
            {text('companyNumber', 'Company number', profile.registrationNumber)}
            {text('phone', 'Phone', profile.phone)}
            {text('email', 'Email', profile.email)}
            {text('website', 'Website', profile.website)}
          </div>
          <CrmField label="Address (one line per row)">
            <textarea
              rows={4}
              value={form.addressLines}
              onChange={set('addressLines')}
              placeholder={'Unit 3 Chepstow House\nHanley, Stoke-on-Trent\nST1 5AJ\nUnited Kingdom'}
              className={crmInputClass}
            />
          </CrmField>
          <CrmField label="Footer text">
            <textarea
              rows={3}
              value={form.footerText}
              onChange={set('footerText')}
              placeholder="e.g. Bank: Barclays · Sort code 00-00-00 · Account 12345678. Thank you for your business."
              className={crmInputClass}
            />
          </CrmField>
          <CrmField label="Accent colour">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.accentColor || DEFAULT_ACCENT}
                onChange={set('accentColor')}
                className="h-10 w-14 cursor-pointer rounded border border-border bg-background"
              />
              <input value={form.accentColor} onChange={set('accentColor')} placeholder={DEFAULT_ACCENT} className={`${crmInputClass} max-w-[140px] font-mono`} />
              {form.accentColor && (
                <button type="button" onClick={() => setForm((f) => ({ ...f, accentColor: '' }))} className="text-xs text-muted-foreground hover:underline">
                  Reset
                </button>
              )}
            </div>
          </CrmField>
          <CrmModalActions onCancel={onClose} submitLabel="Save letterhead" submitting={saving} />
        </form>
      )}
    </CrmModal>
  );
}
