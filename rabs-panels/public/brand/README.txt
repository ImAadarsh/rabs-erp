Rabs Interiors brand assets.

- rabs-mark.svg          square monogram (favicon / PWA source)
- rabs-mark-192.png      PWA icon (rendered from rabs-mark.svg)
- rabs-mark-512.png      PWA icon
- rabs-mark-180.png      apple-touch-icon

The sidebar, header and login screens use a text wordmark (src/components/brand-wordmark.tsx).
To switch to a supplied logo: add the files here and set BRAND.logoOnDark / BRAND.logoOnLight
in src/lib/brand.ts. Regenerate PNGs with:
  rsvg-convert -w 512 -h 512 rabs-mark.svg -o rabs-mark-512.png
