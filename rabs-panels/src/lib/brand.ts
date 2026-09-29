/**
 * White-label brand settings. Logo files live in /public/brand/; the text
 * wordmark is used when a logo path is null.
 */
export const BRAND = {
  name: 'ABS Interiors Ltd',
  shortName: 'ABS Interiors',
  wordmarkPrimary: 'ABS',
  wordmarkSecondary: 'INTERIORS LTD',
  tagline: 'Fully fitted kitchens, bathrooms, fitted wardrobes, extensions, attic conversions',
  location: 'Glenrothes, Scotland, UK',
  phone: '+44 7568314656',
  email: 'allan@absinteriors.co.uk',
  website: 'https://absinteriors.co.uk',
  /** Logo for dark backgrounds (sidebar, login hero) — white text variant. */
  logoOnDark: '/brand/abs-logo-on-dark.png' as string | null,
  /** Logo for light backgrounds (header, login card, print). */
  logoOnLight: '/brand/abs-logo.png' as string | null,
  /** Absolute logo URL for emails and other off-site renders. */
  logoAbsoluteUrl: 'https://rabsinteriors.app/brand/abs-logo.png',
  /** Square chevron mark used for favicon / PWA icons. */
  mark: '/brand/abs-mark.svg'
};

export const BRAND_CONTACT_LINE = [BRAND.location, BRAND.phone, BRAND.email, BRAND.website.replace(/^https?:\/\//, '')].join(' · ');
