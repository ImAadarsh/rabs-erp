'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getStockTransfer, getOrganization } from '@/lib/api';
import { downloadElementAsPdf } from '@/lib/document-pdf';
import {
    StockTransferReceipt,
    type TransferReceiptData,
    type CompanyDetails
} from '@/components/stock-transfer-receipt';
import { ArrowLeft, Download, Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function StockTransferReceiptPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const { session, hydrated } = useSession();
    const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER']);

    const sheetRef = useRef<HTMLDivElement>(null);
    const [transfer, setTransfer] = useState<TransferReceiptData | null>(null);
    const [company, setCompany] = useState<CompanyDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);

    const orgId = session?.user?.organizationId;

    const load = useCallback(async () => {
        if (!params?.id) return;
        try {
            setLoading(true);
            const res = await getStockTransfer(params.id);
            setTransfer(res.data);
        } catch {
            toast.error('Failed to load stock transfer');
        } finally {
            setLoading(false);
        }
    }, [params?.id]);

    useEffect(() => {
        if (hydrated && hasAccess) void load();
    }, [hydrated, hasAccess, load]);

    useEffect(() => {
        if (!orgId) return;
        getOrganization(orgId)
            .then((res) => setCompany(res.data))
            .catch(() => { /* the receipt still renders without a letterhead */ });
    }, [orgId]);

    const onDownload = async () => {
        if (!sheetRef.current || !transfer) return;
        try {
            setDownloading(true);
            await downloadElementAsPdf(sheetRef.current, `${transfer.transferNumber}.pdf`);
            toast.success('Receipt downloaded');
        } catch {
            toast.error('Could not generate the PDF');
        } finally {
            setDownloading(false);
        }
    };

    if (!hydrated || !hasAccess) return null;

    return (
        <div className="min-h-screen app-surface">
            <div className="no-print">
                <Sidebar />
            </div>
            <div className="flex flex-col overflow-hidden lg:ml-[280px]">
                <div className="no-print">
                    <Header title="Inventory · Transfer Receipt" />
                </div>
                <main className="flex-1 overflow-auto p-4 md:p-6">
                    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-5">
                        <div className="no-print flex flex-wrap items-center justify-between gap-3">
                            <Link
                                href="/inventory/stock-transfers"
                                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                            >
                                <ArrowLeft size={16} />
                                Back to stock transfers
                            </Link>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => window.print()}
                                    disabled={!transfer}
                                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                                >
                                    <Printer size={16} />
                                    Print
                                </button>
                                <button
                                    onClick={onDownload}
                                    disabled={!transfer || downloading}
                                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {downloading
                                        ? <Loader2 size={16} className="animate-spin" />
                                        : <Download size={16} />}
                                    Download PDF
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-24 text-sm text-muted-foreground">
                                Loading receipt…
                            </div>
                        ) : !transfer ? (
                            <div className="rounded-2xl border border-border bg-card py-24 text-center">
                                <p className="text-muted-foreground">This stock transfer no longer exists.</p>
                                <button
                                    onClick={() => router.push('/inventory/stock-transfers')}
                                    className="mt-4 text-sm text-primary hover:underline"
                                >
                                    Back to stock transfers
                                </button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <div className="mx-auto w-fit rounded-lg border border-border shadow-lg">
                                    <StockTransferReceipt ref={sheetRef} transfer={transfer} company={company} />
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
