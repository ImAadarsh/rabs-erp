'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listCannedResponses } from '@/lib/api';
import { RichDataTable } from '@/components/rich-data-table';
import { MessageSquare, Plus, Pencil, Trash2, X, Send, Save } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { createCannedResponse, updateCannedResponse, deleteCannedResponse } from '@/lib/api';
import { toast } from 'sonner';

export default function CannedResponsesPage() {
    const router = useRouter();
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [form, setForm] = useState({
        title: '',
        shortcut: '',
        category: '',
        content: '',
        isActive: true
    });

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
                console.error('Failed to load canned responses', err);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [router]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const s = getSession();
        if (!s?.user?.organizationId) return;

        try {
            if (editing) {
                const res = await updateCannedResponse(editing.id, form);
                setItems(items.map(i => i.id === editing.id ? res.data : i));
                toast.success('Template updated');
            } else {
                const res = await createCannedResponse({
                    ...form,
                    organizationId: s.user.organizationId
                });
                setItems([res.data, ...items]);
                toast.success('Template created');
            }
            setShowCreate(false);
            setEditing(null);
            setForm({ title: '', shortcut: '', category: '', content: '', isActive: true });
        } catch (err) {
            toast.error('Failed to save template');
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this template?')) return;
        try {
            await deleteCannedResponse(id);
            setItems(items.filter(i => i.id !== id));
            toast.success('Template deleted');
        } catch (err) {
            toast.error('Failed to delete template');
        }
    }

    const columns = useMemo<ColumnDef<any>[]>(() => [
        { accessorKey: 'title', header: 'Title' },
        {
            accessorKey: 'shortcut',
            header: 'Shortcut',
            cell: (info) => info.getValue() ? `/${info.getValue()}` : '-'
        },
        { accessorKey: 'category', header: 'Category' },
        { accessorKey: 'usageCount', header: 'Usage' },
        {
            accessorKey: 'isActive',
            header: 'Status',
            cell: (info) => {
                const val = info.getValue() as boolean;
                return (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${val ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                        }`}>
                        {val ? 'Active' : 'Inactive'}
                    </span>
                );
            }
        },
        {
            id: 'actions',
            header: '',
            cell: (info) => (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            setEditing(info.row.original);
                            setForm({
                                title: info.row.original.title,
                                shortcut: info.row.original.shortcut || '',
                                category: info.row.original.category || '',
                                content: info.row.original.content,
                                isActive: info.row.original.isActive
                            });
                            setShowCreate(true);
                        }}
                        className="p-2 rounded-lg hover:bg-white/5 text-white/20 hover:text-white transition"
                    >
                        <Pencil size={16} />
                    </button>
                    <button
                        onClick={() => handleDelete(info.row.original.id)}
                        className="p-2 rounded-lg hover:bg-rose-500/10 text-white/20 hover:text-rose-500 transition"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            )
        }
    ], [items]);

    return (
        <div className="min-h-screen app-surface">
            <Sidebar />
            <div className="flex flex-col min-w-0 lg:ml-[280px]">
                <Header
                    title="Canned Responses"
                    actions={[
                        {
                            label: 'Create Template', onClick: () => {
                                setEditing(null);
                                setForm({ title: '', shortcut: '', category: '', content: '', isActive: true });
                                setShowCreate(true);
                            }, icon: <Plus size={18} />
                        }
                    ]}
                />

                <main className="p-6 md:p-8 space-y-5">
                    {!loading && items.length === 0 ? (
                        <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
                            <MessageSquare className="mx-auto mb-3 opacity-40" size={32} />
                            <p className="font-medium text-foreground">No templates yet</p>
                            <p className="text-sm mt-1">Create canned responses agents can insert into ticket replies.</p>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditing(null);
                                    setForm({ title: '', shortcut: '', category: '', content: '', isActive: true });
                                    setShowCreate(true);
                                }}
                                className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-brand hover:bg-brand-600 text-white shadow-sm"
                            >
                                <Plus size={16} /> Create Template
                            </button>
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

            {/* Create/Edit Modal */}
            {showCreate && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="glass-card w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                {editing ? <Pencil className="text-zaam-400" /> : <Plus className="text-zaam-400" />}
                                {editing ? 'Edit Template' : 'Create Template'}
                            </h2>
                            <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-white/5 rounded-full transition text-white/40 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Title</label>
                                <input
                                    required
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                    className="input bg-black/40 border-white/10"
                                    placeholder="e.g., Return Policy Inquiry"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Shortcut</label>
                                    <input
                                        value={form.shortcut}
                                        onChange={e => setForm({ ...form, shortcut: e.target.value })}
                                        className="input bg-black/40 border-white/10"
                                        placeholder="e.g., return"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Category</label>
                                    <input
                                        value={form.category}
                                        onChange={e => setForm({ ...form, category: e.target.value })}
                                        className="input bg-black/40 border-white/10"
                                        placeholder="e.g., Logistics"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Content</label>
                                <textarea
                                    required
                                    value={form.content}
                                    onChange={e => setForm({ ...form, content: e.target.value })}
                                    className="input bg-black/40 border-white/10 min-h-[150px] resize-none"
                                    placeholder="Write the response content..."
                                />
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    checked={form.isActive}
                                    onChange={e => setForm({ ...form, isActive: e.target.checked })}
                                    className="w-4 h-4 rounded border-white/10 bg-black/40 text-zaam-500 focus:ring-zaam-500/20"
                                />
                                <label htmlFor="isActive" className="text-sm text-white/60 select-none">Mark as active</label>
                            </div>

                            <div className="pt-4 flex items-center gap-3">
                                <button type="button" onClick={() => setShowCreate(false)} className="btn flex-1 bg-white/5 hover:bg-white/10 border-none transition">Cancel</button>
                                <button type="submit" className="btn btn-primary flex-1 gap-2">
                                    {editing ? <Save size={18} /> : <Send size={18} />}
                                    <span>{editing ? 'Update Template' : 'Save Template'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
