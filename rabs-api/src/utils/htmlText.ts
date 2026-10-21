/**
 * Plain-text helpers for channel fields that may carry HTML (e.g. WooCommerce
 * gateways that put an `<img>` logo in `payment_method_title`).
 */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' '
};

/** Strip tags to text; an `<img>` becomes its alt text. Returns null when nothing readable is left. */
export function htmlToText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .replace(/<img\b[^>]*?\balt\s*=\s*(["'])(.*?)\1[^>]*>/gi, ' $2 ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

/** First `<img src>` URL in an HTML fragment, if any. */
export function htmlImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/i.exec(String(value));
  return m?.[2]?.trim() || null;
}
