/**
 * White-label brand settings. Logo files live in /public/brand/; the text
 * wordmark is used when a logo path is null.
 */
export const BRAND = {
  name: 'RABS Carpets & Furniture',
  shortName: 'RABS',
  wordmarkPrimary: 'RABS',
  wordmarkSecondary: 'CARPETS & FURNITURE',
  tagline: 'Turning Houses Into Homes',
  address: '194 Waterloo Road, Stoke-on-Trent, ST6 3HF, UK',
  phone: '07774 596 596',
  email: '',
  website: '',
  products: ['Carpet', 'Laminate', 'LVT', 'Flooring', 'Vinyl', 'Beds', 'Sofas', 'Furniture'],
  /** Horizontal logo (horse + wordmark + tagline) for login card, print and email. */
  logo: '/brand/rabs-logo.png' as string | null,
  /** Tight horse + wordmark crop for small slots (sidebar, mobile header). */
  logoCompact: '/brand/rabs-logo-compact.png' as string | null,
  /** Round badge used for the login hero and app icons. */
  badge: '/brand/rabs-badge.png',
  banner: '/brand/rabs-banner.jpg',
  /** Absolute logo URL for emails and other off-site renders. */
  logoAbsoluteUrl: 'https://rabsinteriors.app/brand/rabs-logo.png'
};

export const BRAND_CONTACT_LINE = [BRAND.address, BRAND.phone, BRAND.email, BRAND.website.replace(/^https?:\/\//, '')]
  .filter(Boolean)
  .join(' · ');
