'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { GatewayManager } from '@/components/finance/gateway-manager';

export default function GatewaysPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const orgId = session?.user?.organizationId;

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
    }
  }, [hydrated, hasAccess, session?.accessToken, router]);

  if (!hydrated || !hasAccess) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Finance · Payment Gateways" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          {orgId ? <GatewayManager organizationId={orgId} variant="full" /> : null}
        </main>
      </div>
    </div>
  );
}
