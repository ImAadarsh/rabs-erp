'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listCannedResponses, createCannedResponse, updateCannedResponse, deleteCannedResponse } from '@/lib/api';
import { RichDataTable } from '@/components/rich-data-table';
import { CrmModal, CrmField, CrmModalActions, crmInputClass, crmTextareaClass } from '@/components/crm/crm-modal';
import { crmApiError } from '@/lib/crm-utils';
import { useApiAccess } from '@/hooks/use-api-access';
import { MessageSquare, Plus, Pencil, Trash2, Send, Save } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';

const emptyForm = { title: '', shortcut: '', category: '', content: '', isActive: true };

export default function CannedResponsesPage() {
    const router = useRouter();
    const { can } = useApiAccess();
    const canCreate = can('POST', '/api/crm/canned-responses');
    const canUpdate = can('PATCH', '/api/crm/canned-responses/:id');
    const canDelete = can('DELETE', '/api/crm/canned-responses/:id');
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(emptyForm);

    useEffect(() => {
        const s = getSession();
        if (!s?.accessToken) {
            router.replace('/login');
            return;
        }

        async function loadData() {
            try {
                const { data } = await listCannedResponses();
                setItems(data);
            } catch (err) {
                toast.error(crmApiError(err, 'Failed to load canned responses'));
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [router]);

    function openCreate() {
        setEditing(null);
        setForm(emptyForm);
        setShowCreate(true);
    }

    function openEdit(row: any) {
        setEditing(row);
        setForm({
            title: row.title || '',
            shortcut: row.shortcut || '',
            category: row.category || '',
            content: row.content || '',
            isActive: row.isActive !== false,
        });
        setShowCreate(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const s = getSession();
        if (!s?.user?.organizationId) return;

        const payload = {
            title: form.title.trim(),
            shortcut: form.shortcut.trim().replace(/^\/+/, '') || null,
            category: form.category.trim() || null,
            content: form.content,
            isActive: form.isActive,
        };
        setSaving(true);
        try {
            if (editing) {
                const res = await updateCannedResponse(editing.id, payload);
                setItems(items.map(i => i.id === editing.id ? res.data : i));
                toast.success('Template updated');
            } else {
                const res = await createCannedResponse({
                    ...payload,
                    organizationId: s.user.organizationId
                });
                setItems([res.data, ...items]);
                toast.success('Template created');
            }
            setShowCreate(false);
            setEditing(null);
            setForm(emptyForm);
        } catch (err) {
            toast.error(crmApiError(err, 'Failed to save template'));
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this template?')) return;
        try {
            await deleteCannedResponse(id);
            setItems(items.filter(i => i.id !== id));
            toast.success('Template deleted');
        } catch (err) {
            toast.error(crmApiError(err, 'Failed to delete template'));
        }
    }

    const columns = useMemo<ColumnDef<any>[]>(() => [
        {
            accessorKey: 'title',
            header: 'Title',
            cell: (info) => canUpdate ? (
                <button type="button" onClick={() => openEdit(info.row.original)} className="font-medium text-left hover:text-brand">
                    {String(info.getValue() || '—')}
                </button>
            ) : (
                <span className="font-medium">{String(info.getValue() || '—')}</span>
            ),
        },
        {
            accessorKey: 'shortcut',
            header: 'Shortcut',
            cell: (info) => info.getValue()
                ? <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">/{String(info.getValue())}</code>
                : '—'
        },
        { accessorKey: 'category', header: 'Category', cell: (info) => String(info.getValue() || '—') },
        { accessorKey: 'usageCount', header: 'Usage' },
        {
            accessorKey: 'isActive',
            header: 'Status',
            cell: (info) => {
                const val = info.getValue() as boolean;
                return (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${val ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                        }`}>
                        {val ? 'Active' : 'Inactive'}
                    </span>
                );
            }
        },
        {
            id: 'actions',
            header: 'Actions',
            enableSorting: false,
            cell: (info) => (
                <div className="flex items-center gap-1">
                    {canUpdate && (
                    <button
                        type="button"
                        title="Edit"
                        onClick={() => openEdit(info.row.original)}
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand transition"
                    >
                        <Pencil size={16} />
                    </button>
                    )}
                    {canDelete && (
                    <button
                        type="button"
                        title="Delete"
                        onClick={() => handleDelete(info.row.original.id)}
                        className="p-2 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-600 transition"
                    >
                        <Trash2 size={16} />
                    </button>
                    )}
                </div>
            )
        }
    ], [items, canUpdate, canDelete]);

    return (
        <div className="min-h-screen app-surface">
            <Sidebar />
            <div className="flex flex-col min-w-0 lg:ml-[280px]">
                <Header
                    title="Canned Responses"
                    actions={canCreate ? [{ label: 'Create Template', onClick: openCreate, icon: <Plus size={18} /> }] : []}
                />

                <main className="p-6 md:p-8 space-y-5">
                    <p className="text-xs text-muted-foreground">
                        In a ticket reply, click a template chip or type its shortcut (e.g. <code className="font-mono">/done</code>) followed by a space to insert the content.
                    </p>
                    {!loading && items.length === 0 ? (
                        <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
                            <MessageSquare className="mx-auto mb-3 opacity-40" size={32} />
                            <p className="font-medium text-foreground">No templates yet</p>
                            <p className="text-sm mt-1">Create canned responses agents can insert into ticket replies.</p>
                            {canCreate && (
                            <button
                                type="button"
                                onClick={openCreate}
                                className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-brand hover:bg-brand-600 text-white shadow-sm"
                            >
                                <Plus size={16} /> Create Template
                            </button>
                            )}
                        </div>
                    ) : (
                        <RichDataTable
                            data={items}
                            columns={columns}
                            searchPlaceholder="Search templates..."
                        />
                    )}
                </main>
            </div>

            <CrmModal
                open={showCreate}
                onClose={() => setShowCreate(false)}
                title={editing ? 'Edit Template' : 'Create Template'}
                icon={editing ? Pencil : Plus}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <CrmField label="Title">
                        <input
                            required
                            value={form.title}
                            onChange={e => setForm({ ...form, title: e.target.value })}
                            className={crmInputClass}
                            placeholder="e.g., Return Policy Inquiry"
                        />
                    </CrmField>
                    <div className="grid grid-cols-2 gap-4">
                        <CrmField label="Shortcut" hint="Type /shortcut + space in a ticket reply">
                            <input
                                value={form.shortcut}
                                onChange={e => setForm({ ...form, shortcut: e.target.value })}
                                className={crmInputClass}
                                placeholder="e.g., return"
                                maxLength={50}
                            />
                        </CrmField>
                        <CrmField label="Category">
                            <input
                                value={form.category}
                                onChange={e => setForm({ ...form, category: e.target.value })}
                                className={crmInputClass}
                                placeholder="e.g., Logistics"
                            />
                        </CrmField>
                    </div>
                    <CrmField label="Content">
                        <textarea
                            required
                            value={form.content}
                            onChange={e => setForm({ ...form, content: e.target.value })}
                            className={`${crmTextareaClass} min-h-[150px]`}
                            placeholder="Write the response content..."
                        />
                    </CrmField>
                    <label className="flex items-center gap-2 text-sm text-foreground select-none">
                        <input
                            type="checkbox"
                            checked={form.isActive}
                            onChange={e => setForm({ ...form, isActive: e.target.checked })}
                            className="w-4 h-4"
                        />
                        Mark as active
                    </label>
                    <CrmModalActions
                        onCancel={() => setShowCreate(false)}
                        submitLabel={editing ? 'Update Template' : 'Save Template'}
                        submitting={saving}
                        submitIcon={editing ? <Save size={16} /> : <Send size={16} />}
                    />
                </form>
            </CrmModal>
        </div>
    );
}
