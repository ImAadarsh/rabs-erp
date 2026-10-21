'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';

export const LEGACY_STORAGE_MESSAGE = 'File unavailable (legacy storage)';

/** Objects in the old S3 bucket are permanently inaccessible (AllAccessDisabled). */
export function isLegacyStorageUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.endsWith('amazonaws.com');
  } catch {
    return false;
  }
}

export function MediaThumb({
  url,
  alt,
  className = 'h-12 w-12'
}: {
  url?: string | null;
  alt?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const legacy = isLegacyStorageUrl(url);

  if (!url || failed || legacy) {
    return (
      <div
        className={`${className} flex items-center justify-center rounded border bg-muted/40 text-muted-foreground`}
        title={legacy ? LEGACY_STORAGE_MESSAGE : 'Preview unavailable'}
      >
        <ImageOff className="h-4 w-4" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt || ''}
      className={`${className} rounded border object-cover`}
      onError={() => setFailed(true)}
    />
  );
}

export function MediaLink({
  url,
  children,
  className
}: {
  url?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  if (!url) return <span className="text-xs text-muted-foreground">No file</span>;
  if (isLegacyStorageUrl(url)) {
    return (
      <span className="text-xs text-amber-700" title="Re-upload this file to restore it">
        {LEGACY_STORAGE_MESSAGE}
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
