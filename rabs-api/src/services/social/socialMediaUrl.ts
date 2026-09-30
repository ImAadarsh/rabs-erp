const PRIVATE_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

/** True only for a full public https:// URL Meta's crawler can fetch. */
export function isPublicHttpsUrl(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (PRIVATE_HOSTS.has(host)) return false;
    if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return false;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.)/.test(host)) return false;
    return Boolean(host);
  } catch {
    return false;
  }
}

export async function probePublicUrl(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (head.ok) return { ok: true, status: head.status };
    if (head.status === 403 || head.status === 405 || head.status === 400 || head.status === 501) {
      const get = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        redirect: 'follow'
      });
      return { ok: get.ok || get.status === 206, status: get.status };
    }
    return { ok: false, status: head.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
