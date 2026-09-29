/**
 * White-label brand settings. To use a supplied logo, drop the files into
 * /public/brand/ and set the paths below; the text wordmark is used when null.
 */
export const BRAND = {
  name: 'Rabs Interiors',
  wordmarkPrimary: 'RABS',
  wordmarkSecondary: 'INTERIORS',
  tagline: 'Considered interiors. Seamless operations.',
  /** Logo for dark backgrounds (sidebar, login hero). */
  logoOnDark: null as string | null,
  /** Logo for light backgrounds (header, login card). */
  logoOnLight: null as string | null,
  /** Square monogram used for PWA / touch icons. */
  mark: '/brand/rabs-mark.svg'
};
