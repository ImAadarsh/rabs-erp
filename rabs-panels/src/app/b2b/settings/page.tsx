'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getB2bSettings, listWarehouses, updateB2bSettings } from '@/lib/api';
import { toast } from 'sonner';
import { Settings } from 'lucide-react';

export default function B2bSettingsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP']);
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [form, setForm] = useState({
    enabled: true,
    publishMode: 'all_active' as 'all_active' | 'mapped_only',
    defaultWarehouseId: '',
    assignedRepName: '',
    assignedRepPhone: '',
    assignedRepEmail: ''
  });
  const orgId = session?.user?.organizationId;

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [settings, wh] = await Promise.all([
          getB2bSettings(orgId!),
          listWarehouses()
        ]);
        const s = settings.data;
        setForm({
          enabled: s?.enabled !== false,
          publishMode: s?.publishMode || 'all_active',
          defaultWarehouseId: s?.defaultWarehouse?.id || '',
          assignedRepName: s?.assignedRepName || '',
          assignedRepPhone: s?.assignedRepPhone || '',
          assignedRepEmail: s?.assignedRepEmail || ''
        });
        setWarehouses(wh.data || []);
      } catch {
        toast.error('Failed to load settings');
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
        enabled: form.enabled,
        publishMode: form.publishMode,
        defaultWarehouseId: form.defaultWarehouseId || null,
        assignedRepName: form.assignedRepName || null,
        assignedRepPhone: form.assignedRepPhone || null,
        assignedRepEmail: form.assignedRepEmail || null
      });
      toast.success('B2B settings saved');
    } catch {
      toast.error('Save failed');
    }
  };

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="B2B · Settings" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-4 max-w-2xl">
          <div className="flex items-center gap-3">
            <Settings />
            <div>
              <h1 className="text-xl font-bold">Portal settings</h1>
              <p className="text-sm text-muted-foreground">Control visibility, stock warehouse and the assigned trade desk.</p>
            </div>
          </div>
          {loading ? <div className="text-muted-foreground">Loading...</div> : (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                Portal enabled
              </label>
              <div>
                <label className="text-sm font-medium">Publish mode</label>
                <select
                  className="w-full mt-1 border border-border rounded-lg px-3 py-2 bg-background"
                  value={form.publishMode}
                  onChange={(e) => setForm({ ...form, publishMode: e.target.value as 'all_active' | 'mapped_only' })}
                >
                  <option value="all_active">All active ERP products</option>
                  <option value="mapped_only">Only products published in this module</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Stock warehouse</label>
                <select
                  className="w-full mt-1 border border-border rounded-lg px-3 py-2 bg-background"
                  value={form.defaultWarehouseId}
                  onChange={(e) => setForm({ ...form, defaultWarehouseId: e.target.value })}
                >
                  <option value="">All warehouses</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
                </select>
              </div>
              <input className="w-full border border-border rounded-lg px-3 py-2 bg-background" placeholder="Assigned rep name" value={form.assignedRepName} onChange={(e) => setForm({ ...form, assignedRepName: e.target.value })} />
              <input className="w-full border border-border rounded-lg px-3 py-2 bg-background" placeholder="Assigned rep phone" value={form.assignedRepPhone} onChange={(e) => setForm({ ...form, assignedRepPhone: e.target.value })} />
              <input className="w-full border border-border rounded-lg px-3 py-2 bg-background" placeholder="Assigned rep email" value={form.assignedRepEmail} onChange={(e) => setForm({ ...form, assignedRepEmail: e.target.value })} />
              <button onClick={save} className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold">Save settings</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
