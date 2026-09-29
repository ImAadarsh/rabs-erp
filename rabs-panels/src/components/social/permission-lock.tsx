'use client';

import { Facebook, ShieldAlert } from 'lucide-react';

export function PermissionLock({
  title,
  message,
  missingPermission,
  product,
  onReconnect,
  reconnectLabel = 'Reconnect Meta'
}: {
  title: string;
  message: string;
  missingPermission?: string;
  product?: string;
  onReconnect?: () => void;
  reconnectLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 md:p-8">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-2">
          <h3 className="font-semibold text-lg">{title}</h3>
          <p className="text-sm text-muted-foreground">{message}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {missingPermission && (
              <span className="rounded-full bg-muted px-2.5 py-1 font-mono">{missingPermission}</span>
            )}
            {product && (
              <span className="rounded-full bg-muted px-2.5 py-1">Meta product: {product}</span>
            )}
          </div>
          {onReconnect && (
            <button
              onClick={onReconnect}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#1877F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#166FE5]"
            >
              <Facebook className="h-4 w-4" />
              {reconnectLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
