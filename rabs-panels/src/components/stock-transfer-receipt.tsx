'use client';

import { forwardRef } from 'react';

/**
 * A4 stock transfer receipt.
 *
 * Colours are literal rather than theme tokens: the sheet must look the same
 * in dark mode, when printed, and when rasterised into a PDF.
 */

const ACCENT = '#A31F24';
const INK = '#1a1a1a';
const MUTED = '#6b7280';
const RULE = '#e5e7eb';

export interface TransferReceiptData {
    id: string;
    transferNumber: string;
    transferDate: string;
    expectedArrivalDate?: string | null;
    status: string;
    notes?: string | null;
    shippedAt?: string | null;
    receivedAt?: string | null;
    createdAt?: string;
    fromWarehouse?: Warehouse | null;
    toWarehouse?: Warehouse | null;
    createdBy?: Person | null;
    receivedBy?: Person | null;
    lines?: Array<{
        id: string;
        quantitySent: number;
        quantityReceived: number;
        lotNumber?: string | null;
        notes?: string | null;
        variant?: {
            id: string;
            variantSku: string;
            name?: string | null;
            catalogItem?: { name?: string | null } | null;
        } | null;
    }>;
    movements?: Array<{
        id: string;
        movementType: string;
        quantity: number;
        quantityBefore: number;
        quantityAfter: number;
        warehouse?: { id: string; name: string } | null;
        variant?: { id: string; variantSku: string } | null;
    }>;
}

interface Warehouse {
    id: string;
    code?: string;
    name: string;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    stateProvince?: string | null;
    postalCode?: string | null;
    countryCode?: string | null;
}

interface Person {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
}

export interface CompanyDetails {
    name: string;
    legalName?: string | null;
    taxId?: string | null;
    registrationNumber?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    logoUrl?: string | null;
}

const personName = (p?: Person | null) => {
    if (!p) return null;
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
    return name || p.email || null;
};

const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const formatDateTime = (value?: string | null) =>
    value
        ? new Date(value).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        })
        : '—';

function addressLines(w?: Warehouse | null) {
    if (!w) return [];
    return [w.addressLine1, w.addressLine2, [w.city, w.stateProvince].filter(Boolean).join(', '), w.postalCode, w.countryCode]
        .map((v) => (v ?? '').trim())
        .filter(Boolean);
}

function WarehousePanel({ label, warehouse, accent }: { label: string; warehouse?: Warehouse | null; accent: string }) {
    const lines = addressLines(warehouse);
    return (
        <div style={{ flex: 1, border: `1px solid ${RULE}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{
                fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase',
                color: accent, fontWeight: 700, marginBottom: 6
            }}>
                {label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: INK, lineHeight: 1.35 }}>
                {warehouse?.name ?? '—'}
            </div>
            {warehouse?.code && (
                <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>Code {warehouse.code}</div>
            )}
            {lines.length > 0 && (
                <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>
                    {lines.map((line, i) => <div key={i}>{line}</div>)}
                </div>
            )}
        </div>
    );
}

export const StockTransferReceipt = forwardRef<HTMLDivElement, {
    transfer: TransferReceiptData;
    company?: CompanyDetails | null;
}>(function StockTransferReceipt({ transfer, company }, ref) {
    const lines = transfer.lines ?? [];
    const totalSent = lines.reduce((s, l) => s + (l.quantitySent ?? 0), 0);
    const totalReceived = lines.reduce((s, l) => s + (l.quantityReceived ?? 0), 0);
    const isComplete = transfer.status === 'received';

    return (
        <div
            ref={ref}
            className="print-sheet"
            style={{
                width: '210mm',
                minHeight: '297mm',
                background: '#ffffff',
                color: INK,
                padding: '16mm 14mm',
                boxSizing: 'border-box',
                fontFamily: "'Poppins', 'Inter', system-ui, sans-serif",
                fontSize: 11,
                lineHeight: 1.5
            }}
        >
            {/* Letterhead */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    {company?.logoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={company.logoUrl}
                            alt=""
                            style={{ height: 48, width: 'auto', maxWidth: 170, objectFit: 'contain' }}
                        />
                    )}
                    <div>
                        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3 }}>
                            {company?.name ?? 'Stock Transfer'}
                        </div>
                        {company?.legalName && (
                            <div style={{ fontSize: 10.5, color: MUTED }}>{company.legalName}</div>
                        )}
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 4, lineHeight: 1.6 }}>
                            {company?.email && <div>{company.email}</div>}
                            {company?.phone && <div>{company.phone}</div>}
                            {company?.taxId && <div>VAT {company.taxId}</div>}
                        </div>
                    </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <div style={{
                        fontSize: 17, fontWeight: 700, color: ACCENT,
                        textTransform: 'uppercase', letterSpacing: 1
                    }}>
                        Transfer Receipt
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{transfer.transferNumber}</div>
                    <div style={{
                        display: 'inline-block', marginTop: 8, padding: '3px 12px', borderRadius: 999,
                        fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6,
                        background: isComplete ? '#dcfce7' : '#f3f4f6',
                        color: isComplete ? '#15803d' : '#4b5563',
                        border: `1px solid ${isComplete ? '#86efac' : RULE}`
                    }}>
                        {isComplete ? 'Completed' : transfer.status.replace(/_/g, ' ')}
                    </div>
                </div>
            </div>

            <div style={{ height: 3, background: ACCENT, borderRadius: 2, margin: '16px 0 18px' }} />

            {/* Movement route */}
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
                <WarehousePanel label="Dispatched from" warehouse={transfer.fromWarehouse} accent="#b91c1c" />
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, color: ACCENT, fontWeight: 700, minWidth: 28
                }}>
                    →
                </div>
                <WarehousePanel label="Received at" warehouse={transfer.toWarehouse} accent="#15803d" />
            </div>

            {/* Document meta */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
                marginTop: 18, padding: '12px 16px', background: '#faf8f2',
                border: `1px solid ${RULE}`, borderRadius: 8
            }}>
                {([
                    ['Transfer date', formatDate(transfer.transferDate)],
                    ['Dispatched', formatDateTime(transfer.shippedAt)],
                    ['Received', formatDateTime(transfer.receivedAt)],
                    ['Total units', String(totalSent)]
                ] as Array<[string, string]>).map(([label, value]) => (
                    <div key={label}>
                        <div style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.8, color: MUTED, fontWeight: 600 }}>
                            {label}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, marginTop: 3 }}>{value}</div>
                    </div>
                ))}
            </div>

            {/* Lines */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
                <thead>
                    <tr style={{ background: INK, color: '#ffffff' }}>
                        <th style={{ ...th, width: 28, textAlign: 'center' }}>#</th>
                        <th style={th}>SKU</th>
                        <th style={th}>Description</th>
                        <th style={{ ...th, width: 70 }}>Lot</th>
                        <th style={{ ...th, width: 52, textAlign: 'right' }}>Sent</th>
                        <th style={{ ...th, width: 62, textAlign: 'right' }}>Received</th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map((line, i) => {
                        const short = line.quantityReceived < line.quantitySent;
                        return (
                            <tr key={line.id} style={{ background: i % 2 ? '#fbfbfb' : '#ffffff' }}>
                                <td style={{ ...td, textAlign: 'center', color: MUTED }}>{i + 1}</td>
                                <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>
                                    {line.variant?.variantSku ?? '—'}
                                </td>
                                <td style={td}>
                                    {line.variant?.catalogItem?.name || line.variant?.name || '—'}
                                    {line.notes && (
                                        <div style={{ fontSize: 9.5, color: MUTED, marginTop: 2 }}>{line.notes}</div>
                                    )}
                                </td>
                                <td style={{ ...td, color: MUTED }}>{line.lotNumber || '—'}</td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{line.quantitySent}</td>
                                <td style={{
                                    ...td, textAlign: 'right', fontWeight: 700,
                                    color: short ? '#b91c1c' : '#15803d'
                                }}>
                                    {line.quantityReceived}
                                </td>
                            </tr>
                        );
                    })}
                    {lines.length === 0 && (
                        <tr>
                            <td colSpan={6} style={{ ...td, textAlign: 'center', color: MUTED, padding: 20 }}>
                                No line items on this transfer.
                            </td>
                        </tr>
                    )}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={4} style={{ ...td, textAlign: 'right', fontWeight: 700, borderTop: `2px solid ${INK}` }}>
                            Totals
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, borderTop: `2px solid ${INK}` }}>
                            {totalSent}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, borderTop: `2px solid ${INK}` }}>
                            {totalReceived}
                        </td>
                    </tr>
                </tfoot>
            </table>

            {transfer.notes && (
                <div style={{ marginTop: 18, padding: '12px 16px', border: `1px solid ${RULE}`, borderRadius: 8 }}>
                    <div style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.8, color: MUTED, fontWeight: 600 }}>
                        Notes
                    </div>
                    <div style={{ fontSize: 10.5, marginTop: 4, whiteSpace: 'pre-wrap' }}>{transfer.notes}</div>
                </div>
            )}

            {/* Stock ledger */}
            {transfer.movements && transfer.movements.length > 0 && (
                <div style={{ marginTop: 20 }}>
                    <div style={{
                        fontSize: 9, textTransform: 'uppercase', letterSpacing: 1,
                        color: MUTED, fontWeight: 700, marginBottom: 8
                    }}>
                        Stock ledger entries
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${RULE}` }}>
                                <th style={thLight}>Warehouse</th>
                                <th style={thLight}>SKU</th>
                                <th style={thLight}>Movement</th>
                                <th style={{ ...thLight, textAlign: 'right' }}>Change</th>
                                <th style={{ ...thLight, textAlign: 'right' }}>Before</th>
                                <th style={{ ...thLight, textAlign: 'right' }}>After</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transfer.movements.map((m) => (
                                <tr key={m.id} style={{ borderBottom: `1px solid ${RULE}` }}>
                                    <td style={tdLight}>{m.warehouse?.name ?? '—'}</td>
                                    <td style={{ ...tdLight, fontFamily: 'ui-monospace, monospace' }}>
                                        {m.variant?.variantSku ?? '—'}
                                    </td>
                                    <td style={{ ...tdLight, textTransform: 'capitalize' }}>
                                        {m.movementType.replace(/_/g, ' ')}
                                    </td>
                                    <td style={{
                                        ...tdLight, textAlign: 'right', fontWeight: 700,
                                        color: m.quantity < 0 ? '#b91c1c' : '#15803d'
                                    }}>
                                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                                    </td>
                                    <td style={{ ...tdLight, textAlign: 'right', color: MUTED }}>{m.quantityBefore}</td>
                                    <td style={{ ...tdLight, textAlign: 'right' }}>{m.quantityAfter}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Signatures */}
            <div style={{ display: 'flex', gap: 40, marginTop: 32 }}>
                {([
                    ['Dispatched by', personName(transfer.createdBy)],
                    ['Received by', personName(transfer.receivedBy)]
                ] as Array<[string, string | null]>).map(([label, name]) => (
                    <div key={label} style={{ flex: 1 }}>
                        <div style={{ borderBottom: `1px solid ${INK}`, height: 34 }} />
                        <div style={{ fontSize: 9, color: MUTED, marginTop: 5 }}>{label}</div>
                        {name && <div style={{ fontSize: 10.5, fontWeight: 600 }}>{name}</div>}
                    </div>
                ))}
            </div>

            <div style={{
                marginTop: 26, paddingTop: 10, borderTop: `1px solid ${RULE}`,
                fontSize: 9, color: MUTED, display: 'flex', justifyContent: 'space-between'
            }}>
                <span>
                    {transfer.transferNumber} · Generated {formatDateTime(new Date().toISOString())}
                </span>
                {company?.website && <span>{company.website}</span>}
            </div>
        </div>
    );
});

const th: React.CSSProperties = {
    padding: '8px 10px', textAlign: 'left', fontSize: 9,
    textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700
};

const td: React.CSSProperties = {
    padding: '8px 10px', fontSize: 10.5, borderBottom: `1px solid ${RULE}`, verticalAlign: 'top'
};

const thLight: React.CSSProperties = {
    padding: '6px 8px', textAlign: 'left', fontSize: 8.5,
    textTransform: 'uppercase', letterSpacing: 0.6, color: MUTED, fontWeight: 700
};

const tdLight: React.CSSProperties = { padding: '6px 8px', fontSize: 10 };
