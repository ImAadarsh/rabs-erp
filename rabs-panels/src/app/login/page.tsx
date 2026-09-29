'use client';
import { BrandWordmark } from '@/components/brand-wordmark';
import { BRAND } from '@/lib/brand';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { login, getGoogleAuthUrl } from '@/lib/api';
import { setSession } from '@/lib/auth';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    // Check for error messages from OAuth callback
    const error = searchParams.get('error');
    const message = searchParams.get('message');
    const reason = searchParams.get('reason');
    if (error && message) {
      toast.error(message);
      // Clean up URL
      router.replace('/login');
      return;
    }
    if (reason === 'expired') {
      toast.message('Your session ended. Please sign in again.');
      router.replace('/login');
    }
  }, [searchParams, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login({ email, password });
      setSession(res.accessToken, res.refreshToken, res.user);
      router.replace('/modules');
    } catch (e: any) {
      const message =
        e?.response?.data?.error?.message ??
        e?.response?.data?.message ??
        e?.message ??
        'Login failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const { authUrl } = await getGoogleAuthUrl();
      window.location.href = authUrl;
    } catch (e: any) {
      const message =
        e?.response?.data?.error?.message ??
        e?.response?.data?.message ??
        e?.message ??
        'Google login failed';
      toast.error(message);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left hero pane */}
      <div className="hidden lg:flex relative items-center justify-center overflow-hidden">
        {/* Dark gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-zaam-black via-zaam-charcoal to-black" />
        {/* Gold radial glow */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full opacity-30"
          style={{ background: 'radial-gradient(closest-side, #A31F24, transparent)' }} />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-[520px] w-[520px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(closest-side, #D4AF37, transparent)' }} />
        <div className="relative z-10 text-center px-10">
          <div className="mx-auto mb-8 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BRAND.badge}
              alt={`${BRAND.name} — ${BRAND.tagline}`}
              className="h-72 w-72 rounded-full object-contain drop-shadow-[0_18px_40px_rgba(212,175,55,0.25)]"
            />
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-wide text-white">{BRAND.name}</h1>
          <div className="mx-auto my-4 h-px w-24 bg-gradient-to-r from-transparent via-accent-gold/80 to-transparent" />
          <p className="text-accent-gold/90 max-w-md mx-auto text-xs font-semibold uppercase tracking-[0.2em]">
            {BRAND.products.join(' · ')}
          </p>
          <p className="text-white/60 mt-3 text-sm">{BRAND.address}</p>
        </div>
        {/* Fine gold lines overlay */}
        <svg className="pointer-events-none absolute inset-0 opacity-15" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#D4AF37" />
              <stop offset="100%" stopColor="#E8A33D" />
            </linearGradient>
          </defs>
          {Array.from({ length: 20 }).map((_, i) => (
            <line key={i} x1={i * 80} y1="0" x2={i * 40} y2="1000" stroke="url(#g)" strokeWidth="0.5" />
          ))}
        </svg>
      </div>

      {/* Right auth card */}
      <div className="relative flex items-center justify-center p-6 lg:p-10 bg-[#0A0A0A0A]">
        <div className="w-full max-w-md backdrop-blur-md bg-white/85 dark:bg-white/90 border border-zaam-soft rounded-2xl shadow-card p-8 animate-scale-in">
          <div className="flex justify-center mb-6">
            <BrandWordmark tone="onLight" size="md" />
          </div>
          <h2 className="text-2xl font-semibold mb-2 text-zaam-black">Welcome back</h2>
          <p className="text-sm text-zaam-grey mb-6">Log in to manage your organization</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1">Email</label>
              <input
                className="input"
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Password</label>
              <input
                className="input"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="btn btn-primary w-full h-11 text-base" disabled={loading}>
              {loading ? 'Signing in...' : 'Login'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white/85 backdrop-blur-md px-2 text-muted-foreground rounded-full py-1">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-foreground"></div>
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}


