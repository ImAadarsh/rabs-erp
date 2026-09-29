import clsx from 'clsx';
import { BRAND } from '@/lib/brand';

type Props = {
  /** `onDark` for dark surfaces (sidebar, hero), `onLight` for light surfaces. */
  tone?: 'onDark' | 'onLight';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const SIZES = {
  sm: { mark: 'h-7 w-7 text-[15px]', primary: 'text-[13px]', secondary: 'text-[8px]', img: 'h-7' },
  md: { mark: 'h-9 w-9 text-lg', primary: 'text-base', secondary: 'text-[9px]', img: 'h-9' },
  lg: { mark: 'h-14 w-14 text-3xl', primary: 'text-3xl', secondary: 'text-sm', img: 'h-16' }
} as const;

export function BrandWordmark({ tone = 'onLight', size = 'md', className }: Props) {
  const s = SIZES[size];
  const logo = tone === 'onDark' ? BRAND.logoOnDark : BRAND.logoOnLight;

  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt={BRAND.name} className={clsx(s.img, 'w-auto object-contain', className)} />;
  }

  const onDark = tone === 'onDark';
  return (
    <span className={clsx('inline-flex items-center gap-2.5 select-none', className)} aria-label={BRAND.name}>
      <span
        aria-hidden
        className={clsx(
          s.mark,
          'grid place-items-center rounded-md border font-serif font-semibold leading-none',
          onDark ? 'border-brand-400/60 text-brand-300 bg-white/[0.03]' : 'border-brand-500/50 text-brand-600 bg-brand-50'
        )}
      >
        R
      </span>
      <span className="flex flex-col leading-none text-left">
        <span
          className={clsx(
            s.primary,
            'font-heading font-semibold tracking-[0.32em]',
            onDark ? 'text-white' : 'text-zaam-black'
          )}
        >
          {BRAND.wordmarkPrimary}
        </span>
        <span
          className={clsx(
            s.secondary,
            'mt-1 font-medium tracking-[0.46em]',
            onDark ? 'text-brand-300' : 'text-brand-600'
          )}
        >
          {BRAND.wordmarkSecondary}
        </span>
      </span>
    </span>
  );
}
