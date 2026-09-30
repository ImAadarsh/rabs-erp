'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getB2bSettings, listPriceLists, updateB2bSettings } from '@/lib/api';
import { toast } from 'sonner';
import { DollarSign } from 'lucide-react';

export default function B2bPricingPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP']);
  const [lists, setLists] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const orgId = session?.user?.organizationId;

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [settings, priceLists] = await Promise.all([
          getB2bSettings(orgId!),
          listPriceLists({ organizationId: orgId })
        ]);
        setLists(priceLists.data || []);
        setSelected(settings.data?.defaultPriceList?.id || '');
      } catch {
        toast.error('Failed to load pricing');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, session?.accessToken, orgId]);

  const save = async () => {
    if (!orgId) return;
    try {
      await updateB2bSettings({
        organizationId: orgId,
        defaultPriceListId: selected || null
      });
      toast.success('Default wholesale price list saved');
    } catch {
      toast.error('Save failed');
    }
  };

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="B2B · Pricing" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-4 max-w-2xl">
          <div className="flex items-center gap-3">
            <DollarSign />
            <div>
              <h1 className="text-xl font-bold">Wholesale price list</h1>
              <p className="text-sm text-muted-foreground">
                The portal uses this list first, then customer-tier lists, then catalog selling price.
              </p>
            </div>
          </div>
          {loading ? <div className="text-muted-foreground">Loading...</div> : (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <label className="text-sm font-medium">Default price list</label>
              <select
                className="w-full border border-border rounded-lg px-3 py-2 bg-background"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">None (use selling price / tier lists)</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.type} · {l.code})</option>
                ))}
              </select>
              <div className="flex gap-3">
                <button onClick={save} className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold">Save</button>
                <Link href="/catalog/price-lists" className="text-sm underline self-center">Manage price lists</Link>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
