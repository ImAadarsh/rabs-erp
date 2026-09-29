'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { getTicket, addTicketMessage, assignTicket, listCannedResponses } from '@/lib/api';
import { toast } from 'sonner';
import {
    MessageSquare,
    User,
    Clock,
    Tag,
    AlertCircle,
    Send,
    UserPlus,
    ChevronRight,
    Reply,
    StickyNote,
    History
} from 'lucide-react';
import { getSession } from '@/lib/auth';

export default function TicketDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [isInternal, setIsInternal] = useState(false);
    const [cannedResponses, setCannedResponses] = useState<any[]>([]);
    const [showReplyForm, setShowReplyForm] = useState(true);

    useEffect(() => {
        const s = getSession();
        if (!s?.accessToken) {
            router.replace('/login');
            return;
        }

        async function loadData() {
            try {
                const [ticketRes, responsesRes] = await Promise.all([
                    getTicket(id as string),
                    listCannedResponses()
                ]);
                setTicket(ticketRes.data);
                setCannedResponses(responsesRes.data);
            } catch (err) {
                console.error('Failed to load ticket details', err);
                toast.error('Failed to load ticket details');
            } finally {
                setLoading(false);
            }
        }

        if (id) loadData();
    }, [id, router]);

    async function handleSendMessage(e: React.FormEvent) {
        e.preventDefault();
        if (!message.trim()) return;

        try {
            const res = await addTicketMessage(id as string, {
                senderType: 'agent',
                message: message.trim(),
                isInternal
            });

            // Update ticket locally with new message
            setTicket((prev: any) => ({
                ...prev,
                messages: [...(prev.messages || []), res.data]
            }));

            setMessage('');
            toast.success(isInternal ? 'Internal note added' : 'Reply sent');
        } catch (err) {
            toast.error('Failed to send message');
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen app-surface flex items-center justify-center">
                <div className="animate-pulse text-zaam-400 font-medium tracking-widest uppercase">Loading Ticket...</div>
            </div>
        );
    }

    if (!ticket) {
        return (
            <div className="min-h-screen app-surface flex flex-col items-center justify-center gap-4">
                <div className="text-muted-foreground"><AlertCircle size={48} /></div>
                <div className="text-xl font-bold text-foreground">Ticket Not Found</div>
                <button onClick={() => router.back()} className="btn btn-primary">Go Back</button>
            </div>
        );
    }

    const priorityStyles: Record<string, string> = {
        urgent: 'bg-rose-500/10 text-rose-600 dark:text-rose-500 border-rose-500/20',
        high: 'bg-orange-500/10 text-orange-600 dark:text-orange-500 border-orange-500/20',
        medium: 'bg-blue-500/10 text-blue-600 dark:text-blue-500 border-blue-500/20',
        low: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
    };

    const statusStyles: Record<string, string> = {
        new: 'bg-blue-500/10 text-blue-600 dark:text-blue-500 border-blue-500/20',
        open: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/20',
        pending_customer: 'bg-purple-500/10 text-purple-600 dark:text-purple-500 border-purple-500/20',
        resolved: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
    };

    return (
        <div className="min-h-screen app-surface">
            <Sidebar />
            <div className="flex flex-col min-w-0 lg:ml-[280px]">
                <Header
                    title={`Ticket #${ticket.ticketNumber} - ${ticket.subject}`}
                    actions={[
                        { label: 'Assign', onClick: () => { }, icon: <UserPlus size={18} /> }
                    ]}
                />

                <main className="p-4 md:p-8 grid grid-cols-1 xl:grid-cols-3 gap-8">
                    {/* Main Content: Messages */}
                    <div className="xl:col-span-2 space-y-6">
                        {/* Thread Container */}
                        <div className="glass-card flex flex-col h-[calc(100vh-320px)] min-h-[500px]">
                            <div className="p-4 border-b border-border flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                        <History size={16} />
                                    </div>
                                    <span className="font-semibold text-foreground">Conversation History</span>
                                </div>
                            </div>

                            {/* Message List */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
                                {/* Original Description */}
                                <div className="flex gap-4">
                                    <div className="h-10 w-10 shrink-0 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground">
                                        <User size={20} />
                                    </div>
                                    <div className="space-y-1 max-w-[85%]">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-foreground">{ticket.customer?.firstName || 'Customer'}</span>
                                            <span className="text-xs text-muted-foreground">{new Date(ticket.createdAt).toLocaleString()}</span>
                                        </div>
                                        <div className="bg-muted bg-opacity-50 border border-border p-4 rounded-2xl rounded-tl-none text-foreground leading-relaxed">
                                            {ticket.description || 'No description provided.'}
                                        </div>
                                    </div>
                                </div>

                                {/* Messages */}
                                {ticket.messages?.map((msg: any) => (
                                    <div key={msg.id} className={`flex gap-4 ${msg.senderType === 'agent' ? 'flex-row-reverse' : ''}`}>
                                        <div className={`h-10 w-10 shrink-0 rounded-full border border-border flex items-center justify-center ${msg.senderType === 'agent' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                                            }`}>
                                            {msg.senderType === 'agent' ? <User size={20} /> : <User size={20} />}
                                        </div>
                                        <div className={`space-y-1 max-w-[85%] ${msg.senderType === 'agent' ? 'items-end' : ''}`}>
                                            <div className={`flex items-center gap-2 ${msg.senderType === 'agent' ? 'flex-row-reverse' : ''}`}>
                                                <span className="font-bold text-foreground">{msg.senderName || (msg.senderType === 'agent' ? 'Agent' : 'Customer')}</span>
                                                <span className="text-xs text-muted-foreground">{new Date(msg.createdAt).toLocaleString()}</span>
                                                {msg.isInternal && (
                                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-500 text-[10px] font-bold uppercase tracking-wider">
                                                        <StickyNote size={10} /> Internal Note
                                                    </span>
                                                )}
                                            </div>
                                            <div className={`p-4 rounded-2xl leading-relaxed ${msg.isInternal
                                                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.05)]'
                                                : msg.senderType === 'agent'
                                                    ? 'bg-primary/10 border border-primary/20 text-foreground rounded-tr-none'
                                                    : 'bg-muted/50 border border-border text-foreground rounded-tl-none'
                                                }`}>
                                                {msg.message}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Reply Form */}
                            <div className="p-4 bg-muted/30 border-t border-border">
                                <form onSubmit={handleSendMessage} className="space-y-4">
                                    <div className="relative group">
                                        <textarea
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            placeholder={isInternal ? "Write internal note (only visible to team)..." : "Type your reply..."}
                                            className={`w-full bg-background border p-4 rounded-2xl focus:outline-none focus:ring-2 transition-all min-h-[120px] resize-none ${isInternal
                                                ? 'border-amber-500/20 focus:ring-amber-500/20 text-amber-900 dark:text-amber-100 placeholder:text-amber-500/40'
                                                : 'border-border focus:ring-primary/20 text-foreground placeholder:text-muted-foreground'
                                                }`}
                                        />
                                        <div className="absolute top-4 right-4 flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setIsInternal(!isInternal)}
                                                className={`p-2 rounded-xl transition-all ${isInternal ? 'bg-amber-500/20 text-amber-600 dark:text-amber-500' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                                    }`}
                                                title="Toggle Internal Note"
                                            >
                                                <StickyNote size={20} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                                            {cannedResponses.slice(0, 3).map(res => (
                                                <button
                                                    key={res.id}
                                                    type="button"
                                                    onClick={() => setMessage(res.content)}
                                                    className="px-3 py-1.5 rounded-lg bg-muted border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 transition whitespace-nowrap"
                                                >
                                                    {res.title}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={!message.trim()}
                                            className={`btn gap-2 h-11 px-6 ${isInternal ? 'bg-amber-600 hover:bg-amber-500 text-white border-none' : 'btn-primary'
                                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                                        >
                                            <span>{isInternal ? 'Add Note' : 'Send Reply'}</span>
                                            <Send size={18} />
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar: Metadata */}
                    <div className="space-y-6">
                        <div className="glass-card p-6 space-y-6">
                            <h3 className="text-sm font-bold text-primary uppercase tracking-widest">Details</h3>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Status</span>
                                    <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${statusStyles[ticket.status] || 'bg-muted text-muted-foreground border-border'}`}>
                                        {ticket.status}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Priority</span>
                                    <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${priorityStyles[ticket.priority] || 'bg-muted text-muted-foreground border-border'}`}>
                                        {ticket.priority}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Category</span>
                                    <span className="text-sm font-medium text-foreground capitalize">{ticket.category?.replace('_', ' ') || 'Uncategorized'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Channel</span>
                                    <span className="text-sm font-medium text-foreground capitalize">{ticket.channel}</span>
                                </div>
                            </div>

                            <div className="h-px bg-border" />

                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                                        <User size={20} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-foreground">{ticket.customer?.firstName} {ticket.customer?.lastName}</span>
                                        <span className="text-xs text-muted-foreground">Customer</span>
                                    </div>
                                </div>
                                {ticket.order && (
                                    <div className="p-3 rounded-xl bg-muted/50 border border-border flex items-center justify-between group cursor-pointer hover:bg-muted transition">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-bold text-muted-foreground">Related Order</span>
                                            <span className="text-sm font-medium text-foreground">#{ticket.order.orderNumber}</span>
                                        </div>
                                        <ChevronRight size={16} className="text-muted-foreground group-hover:text-foreground" />
                                    </div>
                                )}
                            </div>

                            <div className="h-px bg-border" />

                            <div className="space-y-4">
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">Assigned To</span>
                                    <div className="flex items-center gap-2">
                                        <div className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                                            <User size={12} />
                                        </div>
                                        <span className="text-sm font-medium text-foreground">{ticket.assignedAgent?.firstName || 'Unassigned'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tags Section */}
                        <div className="glass-card p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-primary uppercase tracking-widest">Tags</h3>
                                <button className="text-[10px] font-bold uppercase text-muted-foreground hover:text-primary transition">Manage</button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {ticket.tags ? ticket.tags.split(',').map((tag: string) => (
                                    <span key={tag} className="px-2 py-1 rounded-lg bg-muted border border-border text-[10px] text-muted-foreground">
                                        {tag.trim()}
                                    </span>
                                )) : (
                                    <span className="text-xs text-muted-foreground italic">No tags</span>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
