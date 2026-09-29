'use client';

import type { ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';

export function AccModal({
  open,
  onClose,
  title,
  icon: Icon,
  children,
  wide,
  xwide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  wide?: boolean;
  xwide?: boolean;
}) {
  if (!open) return null;
  const max = xwide ? 'max-w-3xl' : wide ? 'max-w-xl' : 'max-w-lg';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
      <div
        className={`w-full ${max} overflow-hidden max-h-[90vh] overflow-y-auto rounded-2xl border border-border/60 bg-card shadow-2xl`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sticky top-0 z-10 px-6 py-4 border-b border-border/60 flex items-center justify-between bg-muted/40 backdrop-blur-sm">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2.5 tracking-tight">
            {Icon ? (
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/25">
                <Icon size={18} />
              </span>
            ) : null}
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function AccField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.14em]">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export const accInputClass =
  'flex h-11 w-full rounded-xl border border-border/80 bg-background px-3.5 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:border-brand/50 disabled:cursor-not-allowed disabled:opacity-50 transition';

export const accTextareaClass = `${accInputClass} min-h-[88px] h-auto py-3 resize-none`;

export function AccModalActions({
  onCancel,
  submitLabel,
  submitting,
}: {
  onCancel: () => void;
  submitLabel: string;
  submitting?: boolean;
}) {
  return (
    <div className="pt-2 flex items-center gap-3">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 h-11 rounded-xl bg-muted hover:bg-muted/80 text-foreground border-none"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        className="flex-1 h-11 rounded-xl bg-brand hover:bg-brand-600 text-white shadow-lg shadow-brand/25 border-none font-semibold disabled:opacity-60"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}

export function AccCreateButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition"
    >
      {label}
    </button>
  );
}

export function MtdBanner({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
      <span className="font-semibold">HMRC / MTD:</span>{' '}
      {children ||
        'Support & structured export only. Live RTI/MTD submission requires HMRC credentials and is not claimed as submitted here.'}
    </div>
  );
}
