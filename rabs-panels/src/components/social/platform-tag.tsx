export function PlatformTag({
  platform,
  extra
}: {
  platform?: string;
  extra?: string;
}) {
  const p = String(platform || '').toLowerCase();
  const label = p === 'instagram' ? 'Instagram' : p === 'facebook' ? 'Facebook' : platform || 'Unknown';
  const cls =
    p === 'instagram'
      ? 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-200'
      : p === 'facebook'
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
        : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
      {extra ? <span className="opacity-80">· {extra}</span> : null}
    </span>
  );
}
