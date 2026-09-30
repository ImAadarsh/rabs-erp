'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RabsDashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/rabs');
  }, [router]);
  return null;
}
