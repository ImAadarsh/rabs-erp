'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listAuditLogs } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';

type AuditLog = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  user?: { id: string; email: string; firstName?: string; lastName?: string };
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  changes: any;
  metadata: any;
  createdAt: string | Date;
  // Also support snake_case for backward compatibility
  entity_type?: string | null;
  entity_id?: string | null;
  user_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
  created_at?: string | Date;
  [key: string]: any;
};

export default function AuditLogsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AuditLog[]>([]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const res = await listAuditLogs(50);
        setItems(res.data);
      } catch {
        toast.error('Failed to load audit logs');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken]);

  const columns = useMemo<ColumnDef<AuditLog>[]>(() => [
    {
      id: 'timestamp',
      header: 'Timestamp',
      accessorFn: (row) => row.createdAt || row.created_at,
      cell: (info) => {
        const dateValue = info.getValue();
        if (!dateValue) return <span className="text-muted-foreground italic">—</span>;
        const date = new Date(dateValue as string | Date);
        if (isNaN(date.getTime())) return <span className="text-muted-foreground italic">Invalid Date</span>;
        return <span className="text-muted-foreground text-xs font-mono">{date.toLocaleString()}</span>;
      },
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: (info) => {
        const action = info.getValue() as string;
        const colors: Record<string, string> = {
          'create': 'bg-green-100 text-green-700 border-green-200',
          'read': 'bg-blue-100 text-blue-700 border-blue-200',
          'update': 'bg-yellow-100 text-yellow-700 border-yellow-200',
          'delete': 'bg-red-100 text-red-700 border-red-200',
          'auth.login': 'bg-purple-100 text-purple-700 border-purple-200',
          'auth.google': 'bg-indigo-100 text-indigo-700 border-indigo-200',
        };
        const colorClass = Object.keys(colors).find(k => action.includes(k)) 
          ? colors[Object.keys(colors).find(k => action.includes(k))!]
          : 'bg-gray-100 text-gray-700 border-gray-200';
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${colorClass}`}>
            {action}
          </span>
        );
      },
    },
    {
      id: 'entity',
      header: 'Entity',
      accessorFn: (row) => {
        const entityType = row.entityType || row.entity_type;
        const entityId = row.entityId || row.entity_id;
        return entityType ? `${entityType}${entityId ? `#${entityId}` : ''}` : null;
      },
      cell: (info) => {
        const value = info.getValue();
        return value ? (
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{value as string}</span>
        ) : (
          <span className="text-muted-foreground italic">—</span>
        );
      },
    },
    {
      id: 'user',
      header: 'User',
      accessorFn: (row) => row.user ? `${row.user.firstName || ''} ${row.user.lastName || ''}`.trim() || row.user.email : 'System',
      cell: (info) => {
        const row = info.row.original;
        if (row.user) {
          const name = `${row.user.firstName || ''} ${row.user.lastName || ''}`.trim();
          return (
            <div className="flex flex-col">
              <span className="font-medium text-sm">{name || row.user.email}</span>
              <span className="text-xs text-muted-foreground">{row.user.email}</span>
            </div>
          );
        }
        return <span className="text-muted-foreground italic">System</span>;
      },
    },
    {
      id: 'ip_address',
      header: 'IP Address',
      accessorFn: (row) => row.ipAddress || row.ip_address,
      cell: (info) => {
        const ip = info.getValue() as string;
        return ip ? <span className="font-mono text-xs text-muted-foreground">{ip}</span> : <span className="text-muted-foreground italic">—</span>;
      },
    },
    {
      accessorKey: 'metadata',
      header: 'Details',
      cell: (info) => {
        const metadata = info.getValue() as any;
        if (!metadata) return <span className="text-muted-foreground italic">—</span>;
        const method = metadata.method;
        const path = metadata.path;
        const statusCode = metadata.statusCode;
        return (
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs">
              <span className={`px-1.5 py-0.5 rounded ${method === 'GET' ? 'bg-blue-100 text-blue-700' : method === 'POST' ? 'bg-green-100 text-green-700' : method === 'PATCH' ? 'bg-yellow-100 text-yellow-700' : method === 'DELETE' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                {method}
              </span>
              <span className="ml-1 text-muted-foreground">{path}</span>
            </span>
            {statusCode && (
              <span className={`text-xs ${statusCode >= 400 ? 'text-red-600' : statusCode >= 300 ? 'text-yellow-600' : 'text-green-600'}`}>
                Status: {statusCode}
              </span>
            )}
          </div>
        );
      },
    },
  ], []);

  if (!hydrated || !hasAccess || !session?.accessToken) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="IAM · Audit Logs" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Audit Logs</h2>
              <p className="text-muted-foreground">View system activity and security events.</p>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center rounded-2xl border border-border bg-card/50 animate-pulse">
              Loading logs...
            </div>
          ) : (
            <RichDataTable
              columns={columns}
              data={items}
              searchPlaceholder="Search logs..."
            />
          )}
        </main>
      </div>
    </div>
  );
}
