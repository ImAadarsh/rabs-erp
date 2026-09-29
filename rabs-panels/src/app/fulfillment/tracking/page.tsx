'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { trackDhlShipment } from '@/lib/api';
import { toast } from 'sonner';
import { MapPin, Search } from 'lucide-react';

export default function FulfillmentTrackingPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE', 'WAREHOUSE_MANAGER']);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) router.replace('/login');
  }, [hydrated, hasAccess, session?.accessToken, router]);

  async function onTrack(e: React.FormEvent) {
    e.preventDefault();
    if (!trackingNumber.trim()) {
      toast.error('Enter a DHL tracking number');
      return;
    }
    setBusy(true);
    try {
      const res = await trackDhlShipment({ trackingNumber: trackingNumber.trim() });
      setResult(res.data);
      toast.success(res.data?.carrierStatus || 'Tracking loaded');
    } catch (err: any) {
      setResult(null);
      toast.error(err?.response?.data?.error?.message || 'Tracking failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Fulfillment · Tracking" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-4 max-w-3xl">
          <div className="flex items-center gap-3">
            <MapPin />
            <div>
              <h1 className="text-xl font-bold">Track DHL shipment</h1>
              <p className="text-sm text-muted-foreground">Look up a DHL Express tracking number via MyDHL API.</p>
            </div>
          </div>

          <form onSubmit={onTrack} className="flex flex-wrap gap-2">
            <input
              className="flex-1 min-w-[220px] rounded-lg border px-3 py-2 text-sm"
              placeholder="DHL tracking number"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              {busy ? 'Tracking…' : 'Track'}
            </button>
          </form>

          {result && (
            <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground">Tracking</div>
                <div className="font-semibold">{result.trackingNumber}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Status</div>
                <div className="font-semibold">{result.carrierStatus || '—'}</div>
              </div>
              {result.trackingUrl && (
                <a className="underline" href={result.trackingUrl} target="_blank" rel="noreferrer">
                  Open on DHL.com
                </a>
              )}
              {Array.isArray(result.events) && result.events.length > 0 && (
                <ul className="space-y-2 border-t pt-3">
                  {result.events.slice(0, 20).map((ev: any, i: number) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">
                        {ev.description || ev.status || ev.typeCode || 'Event'}
                      </span>
                      {(ev.date || ev.timestamp) && (
                        <span className="text-muted-foreground"> · {ev.date || ev.timestamp}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
