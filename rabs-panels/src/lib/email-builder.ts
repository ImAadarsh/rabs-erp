/** Block-based email builder — MVP (not a full Unlayer clone). */
import { BRAND, BRAND_CONTACT_LINE } from '@/lib/brand';

export type EmailBlockType =
  | 'logo'
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'button'
  | 'divider'
  | 'footer';

export type EmailBlock = {
  id: string;
  type: EmailBlockType;
  logoUrl?: string;
  companyName?: string;
  text?: string;
  level?: 1 | 2 | 3;
  imageUrl?: string;
  alt?: string;
  href?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  align?: 'left' | 'center' | 'right';
  color?: string;
};

export type EmailBuilderJson = {
  version: 1;
  blocks: EmailBlock[];
};

export const BLOCK_LABELS: Record<EmailBlockType, string> = {
  logo: 'Logo / header',
  heading: 'Heading',
  paragraph: 'Paragraph',
  image: 'Image',
  button: 'Button CTA',
  divider: 'Divider',
  footer: 'Footer',
};

export function newBlockId() {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultBlock(type: EmailBlockType): EmailBlock {
  const id = newBlockId();
  switch (type) {
    case 'logo':
      return { id, type, companyName: BRAND.name, logoUrl: BRAND.logoAbsoluteUrl, align: 'center' };
    case 'heading':
      return { id, type, text: 'Your headline', level: 1, align: 'left' };
    case 'paragraph':
      return {
        id,
        type,
        text: 'Write your message here. Keep it short and clear.',
        align: 'left',
      };
    case 'image':
      return { id, type, imageUrl: '', alt: 'Image', align: 'center' };
    case 'button':
      return {
        id,
        type,
        buttonLabel: 'Get started',
        buttonUrl: 'https://',
        align: 'center',
        color: '#A31F24',
      };
    case 'divider':
      return { id, type };
    case 'footer':
      return {
        id,
        type,
        text: `${BRAND.name}\n${BRAND_CONTACT_LINE}\n\nYou received this email from our marketing list. Reply to unsubscribe requests as needed.`,
        align: 'center',
      };
    default:
      return { id, type: 'paragraph', text: '' };
  }
}

export function emptyBuilderJson(): EmailBuilderJson {
  return {
    version: 1,
    blocks: [
      createDefaultBlock('logo'),
      createDefaultBlock('heading'),
      createDefaultBlock('paragraph'),
      createDefaultBlock('button'),
      createDefaultBlock('footer'),
    ],
  };
}

export function parseBuilderJson(raw: unknown): EmailBuilderJson {
  if (!raw) return emptyBuilderJson();
  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return emptyBuilderJson();
    }
  }
  if (obj && Array.isArray(obj.blocks)) {
    return { version: 1, blocks: obj.blocks as EmailBlock[] };
  }
  return emptyBuilderJson();
}

function esc(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(s: string) {
  return esc(s).replace(/\n/g, '<br/>');
}

function alignCss(a?: string) {
  if (a === 'center' || a === 'right') return a;
  return 'left';
}

export function renderBlockHtml(block: EmailBlock): string {
  const align = alignCss(block.align);
  switch (block.type) {
    case 'logo': {
      const img = block.logoUrl?.trim()
        ? `<img src="${esc(block.logoUrl)}" alt="${esc(block.companyName || 'Logo')}" style="max-height:56px;max-width:220px;display:inline-block;" />`
        : `<span style="font-size:20px;font-weight:700;color:#111;">${esc(block.companyName || 'Your company')}</span>`;
      return `<tr><td align="${align}" style="padding:24px 32px 8px;">${img}</td></tr>`;
    }
    case 'heading': {
      const tag = block.level === 2 ? 'h2' : block.level === 3 ? 'h3' : 'h1';
      const size = block.level === 2 ? '22px' : block.level === 3 ? '18px' : '28px';
      return `<tr><td align="${align}" style="padding:8px 32px;"><${tag} style="margin:0;font-size:${size};line-height:1.3;color:#111;font-family:Georgia,serif;">${nl2br(block.text || '')}</${tag}></td></tr>`;
    }
    case 'paragraph':
      return `<tr><td align="${align}" style="padding:8px 32px;font-size:15px;line-height:1.6;color:#333;font-family:Arial,Helvetica,sans-serif;">${nl2br(block.text || '')}</td></tr>`;
    case 'image': {
      if (!block.imageUrl?.trim()) {
        return `<tr><td align="${align}" style="padding:12px 32px;color:#999;font-size:13px;">[Image URL]</td></tr>`;
      }
      const img = `<img src="${esc(block.imageUrl)}" alt="${esc(block.alt || '')}" style="max-width:100%;height:auto;border-radius:4px;display:inline-block;" />`;
      const wrapped = block.href
        ? `<a href="${esc(block.href)}" target="_blank" rel="noopener">${img}</a>`
        : img;
      return `<tr><td align="${align}" style="padding:12px 32px;">${wrapped}</td></tr>`;
    }
    case 'button': {
      const bg = block.color || '#A31F24';
      const label = esc(block.buttonLabel || 'Click here');
      const url = esc(block.buttonUrl || '#');
      return `<tr><td align="${align}" style="padding:16px 32px;"><a href="${url}" target="_blank" rel="noopener" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;">${label}</a></td></tr>`;
    }
    case 'divider':
      return `<tr><td style="padding:12px 32px;"><hr style="border:none;border-top:1px solid #e5e5e5;margin:0;" /></td></tr>`;
    case 'footer':
      return `<tr><td align="${align}" style="padding:24px 32px 32px;font-size:12px;line-height:1.5;color:#888;font-family:Arial,Helvetica,sans-serif;">${nl2br(block.text || '')}</td></tr>`;
    default:
      return '';
  }
}

export function renderEmailHtml(builder: EmailBuilderJson, opts?: { previewTitle?: string }): string {
  const rows = (builder.blocks || []).map(renderBlockHtml).join('\n');
  const title = esc(opts?.previewTitle || 'Email');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
${rows}
</table>
</td></tr>
</table>
</body></html>`;
}
