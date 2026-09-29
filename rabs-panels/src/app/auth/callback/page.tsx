'use client';
import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setSession } from '@/lib/auth';
import { toast } from 'sonner';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const userId = searchParams.get('userId');
    const email = searchParams.get('email');

    if (accessToken && refreshToken && userId && email) {
      // Extract user info from token or use provided data
      const user = {
        id: userId,
        email,
        organizationId: '', // Will be set from token
        roles: [] as string[]
      };

      try {
        // Decode token to get user info (basic decode, not verification)
        const tokenParts = accessToken.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]));
          user.organizationId = payload.orgId || '';
          user.roles = payload.roles || [];
        }
      } catch (e) {
        console.error('Error decoding token:', e);
      }

      setSession(accessToken, refreshToken, user);
      toast.success('Successfully signed in with Google');
      router.replace('/modules');
    } else {
      toast.error('Authentication failed');
      router.replace('/login');
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}

