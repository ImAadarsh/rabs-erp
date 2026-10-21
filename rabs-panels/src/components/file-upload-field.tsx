'use client';

import React, { useRef, useState } from 'react';
import { Loader2, Paperclip, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { uploadFilesToStorage, type UploadedFile } from '@/lib/api';

type Props = {
  /** Current URL(s). Single mode uses value[0]. */
  value: string[];
  onChange: (urls: string[], files?: UploadedFile[]) => void;
  folder?: string;
  multiple?: boolean;
  accept?: string;
  maxSizeInMB?: number;
  label?: string;
  disabled?: boolean;
};

const isImage = (url: string) => /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url);

/** Uploads to API storage and hands back public URLs; replaces free-text "document URL" inputs. */
export function FileUploadField({
  value,
  onChange,
  folder = 'uploads',
  multiple = false,
  accept,
  maxSizeInMB = 20,
  label = 'Choose file',
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    const tooBig = files.find((f) => f.size > maxSizeInMB * 1024 * 1024);
    if (tooBig) {
      toast.error(`${tooBig.name} is larger than ${maxSizeInMB}MB`);
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadFilesToStorage(files, folder, maxSizeInMB);
      const urls = uploaded.map((u) => u.url);
      onChange(multiple ? [...value, ...urls] : urls.slice(0, 1), uploaded);
      toast.success(uploaded.length > 1 ? `${uploaded.length} files uploaded` : 'File uploaded');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e?.message || 'Upload failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (url: string) => onChange(value.filter((v) => v !== url));
  const shown = multiple ? value : value.slice(0, 1);

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple={multiple}
        accept={accept}
        onChange={(e) => pick(e.target.files)}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        className="btn btn-outline gap-2 w-full justify-center"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        {busy ? 'Uploading…' : multiple && shown.length ? 'Add more files' : shown.length ? 'Replace file' : label}
      </button>
      {shown.length > 0 && (
        <ul className="space-y-1">
          {shown.map((url) => (
            <li key={url} className="flex items-center gap-2 rounded-lg border border-border/60 px-2 py-1.5 text-xs">
              {isImage(url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="h-8 w-8 rounded object-cover" />
              ) : (
                <Paperclip className="h-4 w-4 text-muted-foreground" />
              )}
              <a href={url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">
                {decodeURIComponent(url.split('/').pop() || url)}
              </a>
              <a href={url} target="_blank" rel="noreferrer" aria-label="Open file" className="text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              {!disabled && (
                <button type="button" aria-label="Remove file" onClick={() => remove(url)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
