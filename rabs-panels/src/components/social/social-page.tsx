'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';

export type Crumb = { label: string; href?: string };

export function SocialPage({
  title,
  crumbs,
  backHref,
  children,
  loading,
  denied
}: {
  title: string;
  crumbs?: Crumb[];
  backHref?: string;
  children: React.ReactNode;
  loading?: boolean;
  denied?: boolean;
}) {
  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title={title} />
        <main className="flex-1 overflow-auto p-4 md:p-6 pb-24">
          {(backHref || (crumbs && crumbs.length > 0)) && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              {backHref && (
                <Link
                  href={backHref}
                  className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </Link>
              )}
              {crumbs && crumbs.length > 0 && (
                <nav className="flex flex-wrap items-center gap-1 text-muted-foreground">
                  {crumbs.map((c, i) => (
                    <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
                      {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
                      {c.href ? (
                        <Link href={c.href} className="hover:text-foreground">
                          {c.label}
                        </Link>
                      ) : (
                        <span className="text-foreground font-medium">{c.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
              )}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground animate-pulse">
              Loading…
            </div>
          ) : denied ? (
            <div className="text-center py-24">
              <h2 className="text-2xl font-bold mb-2 text-destructive">Access Denied</h2>
              <p className="text-muted-foreground">You do not have permission to view this page.</p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
