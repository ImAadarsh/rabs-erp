import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';

export default function Page() {
  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Module Page" />
        <main className="flex-1 p-6 flex items-center justify-center text-muted-foreground">
          Coming Soon
        </main>
      </div>
    </div>
  );
}
