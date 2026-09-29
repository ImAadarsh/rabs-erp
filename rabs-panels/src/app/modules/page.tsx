'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, clearSession } from '@/lib/auth';
import { ModuleCard } from '@/components/module-card';
import { Header } from '@/components/header';
import { modules } from '@/data/modules';
import { Search, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ModulesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const s = getSession();
    if (!s?.accessToken) router.replace('/login');
  }, [router]);

  const handleLogout = () => {
    clearSession();
    router.replace('/login');
  };

  const handleBack = () => {
    router.back();
  };

  const filteredModules = modules.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <Header title="Module Hub" />
      <main className="relative">
        {/* Subtle background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 py-8">
          {/* Header Section - Single Row */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              {/* Welcome Text */}
              <div className="flex-1">
                <motion.div 
                  initial={{ opacity: 0, y: -10 }} 
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4"
                >
                  <Sparkles size={16} /> Welcome to your ERP
                </motion.div>
                <h1 className="text-3xl font-bold tracking-tight">Modules</h1>
                <p className="text-muted-foreground mt-2 text-lg">
                  Select a module to manage your business operations
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground transition-colors font-medium text-sm"
                >
                  <Search size={16} />
                  <span>Back</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors font-medium text-sm"
                >
                  <Search size={16} />
                  <span>Logout</span>
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="max-w-md">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
                <input
                  type="text"
                  placeholder="Search modules..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
            </div>
          </div>

          {/* Module Grid */}
          {filteredModules.length > 0 ? (
            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: { staggerChildren: 0.1 }
                }
              }}
            >
              {filteredModules.map((m) => (
                <motion.div 
                  key={m.slug}
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    show: { opacity: 1, y: 0 }
                  }}
                >
                  <ModuleCard
                    href={`/${m.slug}/dashboard`}
                    title={m.name}
                    description={m.description}
                    Icon={m.icon}
                    featured={true}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-muted mb-4">
                <Search size={24} className="text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No modules found</h3>
              <p className="text-muted-foreground">Try a different search term</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
