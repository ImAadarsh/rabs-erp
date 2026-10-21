'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listApiKeys, createApiKey, deleteApiKey, listOrganizations } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Key, Plus, X, Copy, Trash2, Eye, EyeOff, Check } from 'lucide-react';

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string | null;
  scopes: string[] | null;
  organization?: {
    id: string;
    name: string;
  } | null;
  createdBy?: {
    id: string;
    email: string;
  } | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
};

const DEFAULT_SCOPES = [
  'read:users',
  'write:users',
  'read:orders',
  'write:orders',
  'read:inventory',
  'write:inventory',
  'read:products',
  'write:products',
  'read:finance',
  'write:finance',
  'read:crm',
  'write:crm',
  'read:hr',
  'write:hr',
  'read:marketing',
  'write:marketing',
  'read:analytics',
  'read:b2b',
  'write:b2b',
  'read:fulfillment',
  'write:fulfillment',
  'read:pos',
  'admin:all'
];

function ScopesInput({
  value,
  onChange,
  knownScopes,
}: {
  value: string[];
  onChange: (scopes: string[]) => void;
  knownScopes: string[];
}) {
  const [draft, setDraft] = useState('');
  const options = Array.from(new Set([...knownScopes, ...value]));

  function toggle(scope: string) {
    onChange(value.includes(scope) ? value.filter((s) => s !== scope) : [...value, scope]);
  }

  function addDraft() {
    const parts = draft.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    onChange(Array.from(new Set([...value, ...parts])));
    setDraft('');
  }

  return (
    <div className="space-y-2">
      <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3 bg-muted/30">
        {options.map((scope) => (
          <label key={scope} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value.includes(scope)}
              onChange={() => toggle(scope)}
              className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
            />
            <span className="text-sm text-foreground">{scope}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addDraft();
            }
          }}
          placeholder="Add custom scope, e.g. read:crm"
          className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="button"
          onClick={addDraft}
          className="px-3 py-2 border border-border rounded-lg hover:bg-muted transition-colors text-sm flex items-center gap-1"
        >
          <Plus size={14} /> Add
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((scope) => (
            <span key={scope} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded">
              {scope}
              <button type="button" onClick={() => toggle(scope)} className="hover:text-destructive" aria-label={`Remove ${scope}`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type GeneratedKey = {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
};

export default function ApiKeysPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['SUPER_ADMIN']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ApiKey[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<GeneratedKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: '',
    organizationId: '',
    scopes: [] as string[]
  });
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [confirmDel, setConfirmDel] = useState<ApiKey | null>(null);
  const [showFullKey, setShowFullKey] = useState(false);

  const availableScopes = [
    'read:users',
    'write:users',
    'read:orders',
    'write:orders',
    'read:inventory',
    'write:inventory',
    'read:products',
    'write:products',
    'read:finance',
    'write:finance',
    'admin:all'
  ];

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    loadData();
  }, [hydrated, hasAccess, router, session?.accessToken]);

  async function loadData() {
    try {
      setLoading(true);
      const [keysRes, orgsRes] = await Promise.all([
        listApiKeys(),
        listOrganizations()
      ]);
      setItems(keysRes.data || []);
      setOrganizations(orgsRes.data || []);
      
      // Set default organization from session if available
      if (session?.user?.organizationId && !form.organizationId) {
        setForm(prev => ({ ...prev, organizationId: session.user.organizationId }));
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }

  async function onCreate() {
    if (!form.name.trim() || !form.organizationId) {
      toast.error('Please provide a name and organization');
      return;
    }
    
    try {
      const res = await createApiKey({
        organizationId: form.organizationId,
        name: form.name.trim(),
        scopes: form.scopes.length > 0 ? form.scopes : undefined
      });
      
      setGeneratedKey(res.data);
      setShowCreate(false);
      setForm({ name: '', organizationId: form.organizationId, scopes: [] });
      
      // Reload the list
      await loadData();
      
      toast.success('API key created successfully');
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || 'Failed to create API key');
    }
  }

  async function onDelete(key: ApiKey) {
    try {
      await deleteApiKey(key.id);
      setConfirmDel(null);
      await loadData();
      toast.success('API key deleted successfully');
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || 'Failed to delete API key');
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  }

  function toggleScope(scope: string) {
    setForm(prev => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter(s => s !== scope)
        : [...prev.scopes, scope]
    }));
  }

  const columns: ColumnDef<ApiKey>[] = useMemo(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Key size={16} className="text-muted-foreground" />
          <span className="font-medium">{row.original.name}</span>
        </div>
      )
    },
    {
      accessorKey: 'keyPrefix',
      header: 'Key Prefix',
      cell: ({ row }) => (
        <code className="text-xs bg-muted px-2 py-1 rounded">
          {row.original.keyPrefix || 'N/A'}
        </code>
      )
    },
    {
      accessorKey: 'organization',
      header: 'Organization',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.organization?.name || 'N/A'}
        </span>
      )
    },
    {
      accessorKey: 'scopes',
      header: 'Scopes',
      cell: ({ row }) => {
        const scopes = row.original.scopes;
        if (!scopes || (Array.isArray(scopes) && scopes.length === 0)) {
          return <span className="text-xs text-muted-foreground">No scopes</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {(Array.isArray(scopes) ? scopes : []).slice(0, 3).map((scope: string) => (
              <span key={scope} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                {scope}
              </span>
            ))}
            {Array.isArray(scopes) && scopes.length > 3 && (
              <span className="text-xs text-muted-foreground">+{scopes.length - 3} more</span>
            )}
          </div>
        );
      }
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => {
        const date = row.original.createdAt;
        if (!date) return <span className="text-sm text-muted-foreground">N/A</span>;
        try {
          const dateObj = new Date(date);
          const now = new Date();
          const diffMs = now.getTime() - dateObj.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMs / 3600000);
          const diffDays = Math.floor(diffMs / 86400000);
          
          let timeAgo = '';
          if (diffMins < 1) timeAgo = 'just now';
          else if (diffMins < 60) timeAgo = `${diffMins}m ago`;
          else if (diffHours < 24) timeAgo = `${diffHours}h ago`;
          else if (diffDays < 7) timeAgo = `${diffDays}d ago`;
          else timeAgo = dateObj.toLocaleDateString();
          
          return (
            <span className="text-sm text-muted-foreground">
              {timeAgo}
            </span>
          );
        } catch {
          return <span className="text-sm text-muted-foreground">N/A</span>;
        }
      }
    },
    {
      accessorKey: 'lastUsedAt',
      header: 'Last used',
      cell: ({ row }) => {
        const used = row.original.lastUsedAt;
        return (
          <span className="text-sm text-muted-foreground">
            {used ? new Date(used).toLocaleString('en-GB') : 'Never'}
          </span>
        );
      }
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirmDel(row.original)}
            className="p-2 hover:bg-destructive/10 text-destructive rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ], []);

  if (!hydrated || !hasAccess || !session?.accessToken) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col lg:ml-[280px]">
        <Header title="IAM · API Keys" />
        <main className="p-4 md:p-6 space-y-6">
          {/* Header Actions */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">API Keys</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage API keys for programmatic access to your platform
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
                Send the key as <code className="font-mono">Authorization: Bearer zk_…</code> or <code className="font-mono">X-Api-Key: zk_…</code>.
                Scopes are <code className="font-mono">read:&lt;module&gt;</code> / <code className="font-mono">write:&lt;module&gt;</code> (write includes read;
                modules: orders, inventory, products, finance, crm, hr, marketing, analytics, b2b, fulfillment, pos, users) or <code className="font-mono">admin:all</code>.
                A key acts for the organisation it belongs to; requests outside its scopes get 403.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
            >
              <Plus size={18} />
              Create API Key
            </button>
          </div>

          {/* API Keys Table */}
          <div className="rounded-2xl border border-border bg-card p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-sm text-muted-foreground">Loading API keys...</div>
              </div>
            ) : (
              <RichDataTable
                columns={columns}
                data={items}
                searchPlaceholder="Search API keys..."
              />
            )}
          </div>

          {/* Create Modal */}
          {showCreate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-card rounded-2xl border border-border shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-border">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-foreground">Create API Key</h2>
                    <button
                      onClick={() => setShowCreate(false)}
                      className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Production API Key"
                      className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Organization <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={form.organizationId}
                      onChange={(e) => setForm(prev => ({ ...prev, organizationId: e.target.value }))}
                      className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Select organization</option>
                      {organizations.map(org => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Scopes (Optional)
                    </label>
                    <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3 bg-muted/30">
                      {availableScopes.map(scope => (
                        <label key={scope} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.scopes.includes(scope)}
                            onChange={() => toggleScope(scope)}
                            className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                          />
                          <span className="text-sm text-foreground">{scope}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Select the permissions this API key will have. Leave empty for no scopes.
                    </p>
                  </div>
                </div>
                <div className="p-6 border-t border-border flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onCreate}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
                  >
                    Create Key
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Generated Key Modal */}
          {generatedKey && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-card rounded-2xl border border-border shadow-xl max-w-lg w-full mx-4">
                <div className="p-6 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">API Key Created</h2>
                      <p className="text-sm text-muted-foreground mt-1">{generatedKey.name}</p>
                    </div>
                    <button
                      onClick={() => {
                        setGeneratedKey(null);
                        setShowFullKey(false);
                      }}
                      className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Key size={16} className="text-destructive" />
                      <span className="text-sm font-medium text-destructive">
                        ⚠️ Important: Save this key now
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      You won't be able to see this key again once you close this dialog. Copy it to a secure location.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Your API Key
                    </label>
                    <div className="relative">
                      <div className="flex items-center gap-2 p-4 bg-muted rounded-lg border border-border">
                        <code className="flex-1 text-sm font-mono break-all">
                          {showFullKey ? generatedKey.key : `${generatedKey.keyPrefix}...`}
                        </code>
                        <button
                          onClick={() => setShowFullKey(!showFullKey)}
                          className="p-2 hover:bg-background rounded transition-colors"
                          title={showFullKey ? 'Hide key' : 'Show key'}
                        >
                          {showFullKey ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                      <button
                        onClick={() => copyToClipboard(generatedKey.key)}
                        className="absolute top-2 right-14 p-2 hover:bg-background rounded transition-colors"
                        title="Copy key"
                      >
                        {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Key Prefix:</span>
                      <code className="text-xs font-mono">{generatedKey.keyPrefix}</code>
                    </div>
                  </div>
                </div>
                <div className="p-6 border-t border-border flex items-center justify-end">
                  <button
                    onClick={() => {
                      setGeneratedKey(null);
                      setShowFullKey(false);
                    }}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
                  >
                    I've saved the key
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {confirmDel && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-card rounded-2xl border border-border shadow-xl max-w-md w-full mx-4">
                <div className="p-6 border-b border-border">
                  <h2 className="text-xl font-semibold text-foreground">Delete API Key</h2>
                </div>
                <div className="p-6">
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to delete the API key <strong className="text-foreground">{confirmDel.name}</strong>?
                    This action cannot be undone and will immediately revoke access for any applications using this key.
                  </p>
                </div>
                <div className="p-6 border-t border-border flex items-center justify-end gap-3">
                  <button
                    onClick={() => setConfirmDel(null)}
                    className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onDelete(confirmDel)}
                    className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
