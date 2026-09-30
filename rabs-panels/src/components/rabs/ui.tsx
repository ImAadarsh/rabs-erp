'use client';

import { Loader2, X, Check } from 'lucide-react';
import { useEffect, type ReactNode, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

export const inputCls =
  'w-full h-12 rounded-xl border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand disabled:opacity-60';
export const textareaCls =
  'w-full min-h-[88px] rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
};

export function Btn({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none',
        size === 'sm' && 'h-9 px-3 text-sm',
        size === 'md' && 'h-11 px-4 text-sm',
        size === 'lg' && 'h-14 px-6 text-base',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand-600 shadow-sm shadow-brand/30',
        variant === 'success' && 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
        variant === 'secondary' && 'border border-border bg-background hover:bg-muted text-foreground',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        variant === 'ghost' && 'hover:bg-muted text-foreground',
        className
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/** The one big "what happens next" button used on every workflow screen. */
export function NextActionButton({ label, onClick, loading, sub }: { label: string; onClick: () => void; loading?: boolean; sub?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full rounded-2xl bg-brand text-white shadow-lg shadow-brand/30 hover:bg-brand-600 active:scale-[0.99] transition px-6 py-5 text-left disabled:opacity-60"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/75 font-medium">Next step</div>
          <div className="text-xl md:text-2xl font-extrabold tracking-tight">NEXT: {label}</div>
          {sub && <div className="text-sm text-white/85 mt-0.5">{sub}</div>}
        </div>
        <div className="h-12 w-12 shrink-0 rounded-full bg-white/20 flex items-center justify-center text-2xl">
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : '→'}
        </div>
      </div>
    </button>
  );
}

export function StatusBadge({ label, color, textColor, size = 'md' }: { label: string; color: string; textColor?: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={clsx('inline-flex items-center rounded-full font-semibold whitespace-nowrap', size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs')}
      style={{ backgroundColor: color, color: textColor || '#fff' }}
    >
      {label}
    </span>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx('rounded-2xl border border-border bg-card shadow-sm', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={clsx(pad && 'px-4 pb-4', !title && !actions && pad && 'pt-4')}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="block text-sm font-semibold text-foreground mb-1.5">{label}</span>
      {children}
      {error ? <span className="block text-xs text-red-600 mt-1">{error}</span> : hint ? <span className="block text-xs text-muted-foreground mt-1">{hint}</span> : null}
    </label>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-muted-foreground text-center py-8">{children}</div>;
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={clsx('relative w-full bg-card rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col', wide ? 'md:max-w-3xl' : 'md:max-w-lg')}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="p-2 -mr-2 rounded-lg hover:bg-muted" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-border flex flex-wrap gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export function ProgressBar({ steps, index, closed }: { steps: Array<{ key: string; label: string }>; index: number; closed?: boolean }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <ol className="flex items-start min-w-[640px]">
        {steps.map((s, i) => {
          const done = i < index || (closed && i === index);
          const current = i === index && !closed;
          return (
            <li key={s.key} className="flex-1 flex flex-col items-center relative">
              {i > 0 && <span className={clsx('absolute top-3.5 right-1/2 w-full h-1 -z-0', i <= index ? 'bg-brand' : 'bg-border')} />}
              <span
                className={clsx(
                  'relative z-10 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2',
                  done && 'bg-brand border-brand text-white',
                  current && 'bg-background border-brand text-brand ring-4 ring-brand/20',
                  !done && !current && 'bg-background border-border text-muted-foreground'
                )}
              >
                {done ? <Check size={16} /> : i + 1}
              </span>
              <span className={clsx('mt-1.5 text-[10px] tracking-tight text-center leading-tight px-0.5', current ? 'font-bold text-foreground' : 'text-muted-foreground')}>{s.label.replace('/', '/\u200b')}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ key: T; label: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={clsx('px-3.5 h-9 rounded-lg text-sm font-semibold whitespace-nowrap transition', value === t.key ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className={clsx('flex items-center justify-between gap-3 py-1.5', strong && 'font-bold text-base')}>
      <span className={clsx(!strong && 'text-muted-foreground')}>{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={clsx('flex items-center gap-3 w-full text-left rounded-xl border px-3 py-3 transition', checked ? 'border-brand bg-brand/5' : 'border-border bg-background')}
    >
      <span className={clsx('h-6 w-6 shrink-0 rounded-md border-2 flex items-center justify-center', checked ? 'bg-brand border-brand text-white' : 'border-border')}>
        {checked && <Check size={16} />}
      </span>
      <span className="flex-1 text-sm">{label}</span>
    </button>
  );
}
