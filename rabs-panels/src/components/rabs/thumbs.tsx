/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Image as ImageIcon } from 'lucide-react';

export function Thumbs({ photos }: { photos: any[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto mt-2">
      {photos.map((p) =>
        String(p.mimeType || '').startsWith('image/') ? (
          <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption || p.kind} className="h-16 w-16 rounded-lg object-cover border border-border" loading="lazy" />
            {p.kind === 'before' || p.kind === 'after' ? <div className="text-[10px] text-center text-muted-foreground capitalize">{p.kind}</div> : null}
          </a>
        ) : (
          <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="shrink-0 h-16 w-16 rounded-lg border border-border flex items-center justify-center text-muted-foreground">
            <ImageIcon size={18} />
          </a>
        )
      )}
    </div>
  );
}
