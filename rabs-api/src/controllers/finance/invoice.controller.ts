import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { z } from 'zod';
import { Invoice } from '@entities/finance/Invoice.js';
import { InvoiceLine } from '@entities/finance/InvoiceLine.js';
import { Payment } from '@entities/finance/Payment.js';
import { Order } from '@entities/orders/Order.js';
import { OrderAddress } from '@entities/orders/OrderAddress.js';
import { Organization } from '@entities/iam/Organization.js';
import { Location } from '@entities/iam/Location.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import {
    generateInvoicesForOrders,
    findUninvoicedOrderIds,
    applyBulkEligibility
} from '@services/finance/invoiceGeneration.service.js';
import {
    getOrganizationLetterhead,
    letterheadSettingsSchema,
    saveOrganizationLetterhead,
    type LetterheadSettings
} from '@services/finance/letterhead.service.js';
import { syncInvoiceLedger, voidLedgerForDeletedDocument } from '@services/finance/ledgerAutoPost.service.js';

const lineSchema = z.object({
    id: z.string().optional(),
    description: z.string(),
    quantity: z.number().positive(),
    unitPrice: z.number().min(0),
    taxRate: z.number().min(0).default(0)
});

const createSchema = z.object({
    organizationId: z.string(),
    customerId: z.string(),
    businessUnitId: z.string().optional(),
    orderId: z.string().optional(),
    invoiceNumber: z.string(),
    invoiceDate: z.string().or(z.date()),
    dueDate: z.string().or(z.date()).optional(),
    currency: z.string().length(3).default('GBP'),
    discountAmount: z.number().min(0).default(0),
    shippingAmount: z.number().min(0).default(0),
    paymentTerms: z.string().optional(),
    status: z.enum(['draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled', 'written_off']).default('draft'),
    notes: z.string().optional(),
    footerText: z.string().optional(),
    lines: z.array(lineSchema).min(1, 'At least one line item is required')
});

const updateSchema = createSchema.partial().omit({ organizationId: true });

const generateSchema = z.object({
    organizationId: z.string(),
    /** Specific orders to invoice. Omit to invoice every uninvoiced order. */
    orderIds: z.array(z.string()).optional(),
    /** Orders to invoice by their order number (e.g. "3324" or "POS-1001"). */
    orderNumbers: z.array(z.string().trim().min(1)).optional(),
    limit: z.number().int().positive().max(1000).optional()
});

type Letterhead = {
    key: string;
    label: string;
    name: string;
    legalName: string | null;
    taxId: string | null;
    registrationNumber: string | null;
    website: string | null;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
    address: {
        line1: string | null;
        line2: string | null;
        city: string | null;
        stateProvince: string | null;
        postalCode: string | null;
        countryCode: string | null;
    } | null;
    /** Free-form address from the edited letterhead; takes precedence over `address`. */
    addressLines: string[] | null;
    footerText: string | null;
    accentColor: string | null;
};

function locationAddress(l?: Location | null): Letterhead['address'] {
    if (!l?.addressLine1) return null;
    return {
        line1: l.addressLine1,
        line2: l.addressLine2 ?? null,
        city: l.city ?? null,
        stateProvince: l.stateProvince ?? null,
        postalCode: l.postalCode ?? null,
        countryCode: l.countryCode ?? null
    };
}

function pickLocation(locations?: Location[] | null) {
    return (locations || [])
        .filter((l) => l.status === 'active' && l.addressLine1)
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || Number(a.id) - Number(b.id))[0] ?? null;
}

/**
 * One letterhead for the organization plus one per active business unit.
 * A business unit can override any field via `settings.letterhead`
 * (e.g. its own trading name, VAT number or logo); unset fields fall back to the
 * unit's default location and then to the organization.
 */
function buildLetterheads(org: Organization, units: BusinessUnit[], custom: LetterheadSettings | null): Letterhead[] {
    const orgLocation = pickLocation(units.flatMap((u) => u.locations || []));
    const lh = custom;
    const base: Letterhead = {
        key: 'org',
        label: `${org.name} (organization)`,
        name: lh?.companyName || org.name,
        // An edited company name is what the invoice heading should show.
        legalName: lh?.companyName ? null : (org.legalName ?? null),
        taxId: lh?.vatNumber ?? org.taxId ?? null,
        registrationNumber: lh?.companyNumber ?? org.registrationNumber ?? null,
        website: lh?.website ?? org.website ?? null,
        phone: lh?.phone ?? org.phone ?? orgLocation?.phone ?? null,
        email: lh?.email ?? org.email ?? orgLocation?.email ?? null,
        logoUrl: lh?.logoUrl ?? org.logoUrl ?? null,
        address: locationAddress(orgLocation),
        addressLines: lh?.addressLines?.length ? lh.addressLines : null,
        footerText: lh?.footerText ?? null,
        accentColor: lh?.accentColor ?? null
    };
    const result: Letterhead[] = [base];
    for (const u of units) {
        const loc = pickLocation(u.locations);
        const o = (u.settings?.letterhead ?? {}) as Partial<Letterhead>;
        const ownAddress = o.address ?? locationAddress(loc);
        result.push({
            ...base,
            key: `bu:${u.id}`,
            label: u.name,
            name: o.name || u.name,
            legalName: o.legalName ?? base.legalName,
            taxId: o.taxId ?? base.taxId,
            registrationNumber: o.registrationNumber ?? base.registrationNumber,
            website: o.website ?? base.website,
            phone: o.phone ?? loc?.phone ?? base.phone,
            email: o.email ?? loc?.email ?? base.email,
            logoUrl: o.logoUrl ?? base.logoUrl,
            address: ownAddress ?? base.address,
            addressLines: o.addressLines ?? (ownAddress ? null : base.addressLines),
            footerText: o.footerText ?? base.footerText,
            accentColor: o.accentColor ?? base.accentColor
        });
    }
    return result;
}

/** Organization whose letterhead is read/edited; only SUPER_ADMIN may target another organization. */
function letterheadOrgId(req: Request, res: Response): string | null {
    const auth = (req as any).auth as { orgId?: string; roles?: string[] } | undefined;
    const requested = String(req.query.organizationId || req.body?.organizationId || auth?.orgId || '');
    if (!requested) {
        res.status(400).json({ error: { message: 'organizationId is required' } });
        return null;
    }
    const isSuperAdmin = (auth?.roles || []).includes('SUPER_ADMIN');
    if (!isSuperAdmin && auth?.orgId && String(auth.orgId) !== requested) {
        res.status(403).json({ error: { message: 'You can only edit your own organization letterhead' } });
        return null;
    }
    return requested;
}

/** Display name for a customer record, which stores names in parts. */
function customerName(c?: { firstName?: string | null; lastName?: string | null; companyName?: string | null; email?: string | null } | null) {
    if (!c) return null;
    const person = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    return c.companyName || person || c.email || null;
}

export class InvoiceController {
    static async list(req: Request, res: Response) {
        try {
            const orgId = req.query.organizationId as string;
            if (!orgId) return res.status(400).json({ error: { message: 'organizationId is required' } });

            const {
                status, channel, connectionId, currency, dateFrom, dateTo,
                minAmount, maxAmount, search, sortBy, sortDir, outstanding,
                page = '1', limit = '100'
            } = req.query;

            const qb = AppDataSource.getRepository(Invoice).createQueryBuilder('i')
                .leftJoinAndSelect('i.customer', 'c')
                .leftJoinAndSelect('i.order', 'o')
                .leftJoinAndSelect('o.channelConnection', 'conn')
                .where('i.organization_id = :orgId', { orgId });

            if (status) qb.andWhere('i.status = :status', { status });
            if (currency) qb.andWhere('i.currency = :currency', { currency });
            if (channel) qb.andWhere('o.channel = :channel', { channel });
            if (connectionId) qb.andWhere('o.channel_connection_id = :connectionId', { connectionId });
            if (dateFrom) qb.andWhere('i.invoice_date >= :dateFrom', { dateFrom: String(dateFrom) });
            if (dateTo) qb.andWhere('i.invoice_date <= :dateTo', { dateTo: String(dateTo) });
            if (minAmount) qb.andWhere('i.total >= :minAmount', { minAmount: Number(minAmount) });
            if (maxAmount) qb.andWhere('i.total <= :maxAmount', { maxAmount: Number(maxAmount) });
            if (outstanding === 'true') qb.andWhere('i.total > i.paid_amount');

            if (search) {
                qb.andWhere(
                    `(i.invoice_number LIKE :s OR o.order_number LIKE :s OR o.channel_order_number LIKE :s
                      OR c.email LIKE :s OR c.company_name LIKE :s
                      OR CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, '')) LIKE :s)`,
                    { s: `%${search}%` }
                );
            }

            const sortable: Record<string, string> = {
                invoiceDate: 'i.invoiceDate',
                dueDate: 'i.dueDate',
                total: 'i.total',
                status: 'i.status',
                invoiceNumber: 'i.invoiceNumber',
                createdAt: 'i.createdAt'
            };
            qb.orderBy(
                sortable[String(sortBy)] ?? 'i.invoiceDate',
                String(sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
            ).addOrderBy('i.id', 'DESC');

            const totals = await qb.clone()
                .select('SUM(i.total)', 'invoiced')
                .addSelect('SUM(i.paid_amount)', 'paid')
                .addSelect('COUNT(i.id)', 'count')
                .addSelect("SUM(CASE WHEN i.status = 'overdue' THEN 1 ELSE 0 END)", 'overdue')
                .orderBy()
                .getRawOne<{ invoiced: string | null; paid: string | null; count: string; overdue: string | null }>();

            const pageNum = Math.max(1, parseInt(page as string) || 1);
            const take = Math.min(500, Math.max(1, parseInt(limit as string) || 100));
            qb.skip((pageNum - 1) * take).take(take);

            const [items, total] = await qb.getManyAndCount();

            const invoiced = Number(totals?.invoiced ?? 0);
            const paid = Number(totals?.paid ?? 0);

            res.json({
                data: items.map((i) => ({ ...i, customerName: customerName(i.customer) })),
                summary: {
                    count: Number(totals?.count ?? 0),
                    totalInvoiced: invoiced,
                    totalPaid: paid,
                    totalOutstanding: invoiced - paid,
                    overdueCount: Number(totals?.overdue ?? 0)
                },
                pagination: { page: pageNum, limit: take, total, totalPages: Math.ceil(total / take) }
            });
        } catch (error: any) {
            res.status(500).json({ error: { message: error.message } });
        }
    }

    /**
     * Full payload for rendering a printable invoice: the invoice and its
     * lines, the buying customer, the originating order with its channel and
     * addresses, the selling organization with its trading address, and the
     * payments received against the order.
     */
    static async get(req: Request, res: Response) {
        try {
            const invoice = await AppDataSource.getRepository(Invoice).findOne({
                where: { id: req.params.id },
                relations: ['customer', 'lines', 'creator', 'businessUnit']
            });
            if (!invoice) return res.status(404).json({ error: { message: 'Not found' } });

            const [organization, order] = await Promise.all([
                AppDataSource.getRepository(Organization).findOne({ where: { id: invoice.organizationId } }),
                invoice.orderId
                    ? AppDataSource.getRepository(Order).findOne({
                        where: { id: invoice.orderId },
                        relations: ['channelConnection', 'lines']
                    })
                    : Promise.resolve(null)
            ]);

            const [addresses, payments, units, customLetterhead] = await Promise.all([
                invoice.orderId
                    ? AppDataSource.getRepository(OrderAddress).find({ where: { order: { id: invoice.orderId } } })
                    : Promise.resolve([]),
                invoice.orderId
                    ? AppDataSource.getRepository(Payment).find({
                        where: { orderId: invoice.orderId },
                        order: { paymentDate: 'ASC' }
                    })
                    : Promise.resolve([]),
                AppDataSource.getRepository(BusinessUnit).find({
                    where: { organization: { id: invoice.organizationId }, status: 'active' },
                    relations: ['locations'],
                    order: { id: 'ASC' }
                }).catch(() => [] as BusinessUnit[]),
                getOrganizationLetterhead(String(invoice.organizationId)).catch(() => null)
            ]);

            const letterheads = organization ? buildLetterheads(organization, units, customLetterhead) : [];
            const defaultKey = invoice.businessUnit?.id && letterheads.some((l) => l.key === `bu:${invoice.businessUnit!.id}`)
                ? `bu:${invoice.businessUnit.id}`
                : 'org';

            res.json({
                data: {
                    ...invoice,
                    customerName: customerName(invoice.customer),
                    order,
                    billingAddress: addresses.find((a) => a.addressType === 'billing') ?? null,
                    shippingAddress: addresses.find((a) => a.addressType === 'shipping') ?? null,
                    payments,
                    letterheads,
                    defaultLetterheadKey: defaultKey,
                    seller: letterheads.find((l) => l.key === defaultKey) ?? null
                }
            });
        } catch (error: any) {
            res.status(500).json({ error: { message: error.message } });
        }
    }

    /** Editable invoice letterhead of an organization (null fields fall back to the profile). */
    static async getLetterhead(req: Request, res: Response) {
        try {
            const orgId = letterheadOrgId(req, res);
            if (!orgId) return;
            const organization = await AppDataSource.getRepository(Organization).findOne({ where: { id: orgId } });
            if (!organization) return res.status(404).json({ error: { message: 'Organization not found' } });
            res.json({
                data: {
                    organizationId: orgId,
                    settings: await getOrganizationLetterhead(orgId),
                    profile: {
                        name: organization.name,
                        legalName: organization.legalName,
                        taxId: organization.taxId,
                        registrationNumber: organization.registrationNumber,
                        website: organization.website,
                        phone: organization.phone,
                        email: organization.email,
                        logoUrl: organization.logoUrl
                    }
                }
            });
        } catch (error: any) {
            res.status(500).json({ error: { message: error.message } });
        }
    }

    static async saveLetterhead(req: Request, res: Response) {
        try {
            const orgId = letterheadOrgId(req, res);
            if (!orgId) return;
            const parsed = letterheadSettingsSchema.safeParse(req.body?.settings ?? req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    error: { message: parsed.error.issues.map((i) => i.message).join('; '), details: parsed.error.issues }
                });
            }
            const organization = await AppDataSource.getRepository(Organization).findOne({ where: { id: orgId } });
            if (!organization) return res.status(404).json({ error: { message: 'Organization not found' } });
            const settings = await saveOrganizationLetterhead(orgId, parsed.data, (req as any).auth?.sub ?? null);
            res.json({ data: { organizationId: orgId, settings } });
        } catch (error: any) {
            res.status(error?.status || 500).json({ error: { message: error.message } });
        }
    }

    /** Orders on real sales channels that do not have an invoice yet. */
    static async uninvoicedOrders(req: Request, res: Response) {
        try {
            const orgId = req.query.organizationId as string;
            if (!orgId) return res.status(400).json({ error: { message: 'organizationId is required' } });

            const ids = await findUninvoicedOrderIds(orgId);

            const qb = AppDataSource.getRepository(Order)
                .createQueryBuilder('o')
                .select('o.channel', 'channel')
                .addSelect('conn.name', 'store')
                .addSelect('COUNT(o.id)', 'count')
                .addSelect('SUM(o.total)', 'value')
                .leftJoin(Invoice, 'i', 'i.order_id = o.id')
                .leftJoin('o.channelConnection', 'conn')
                .groupBy('o.channel')
                .addGroupBy('conn.name');

            applyBulkEligibility(qb, orgId);
            const byChannel = await qb.getRawMany<{ channel: string; store: string | null; count: string; value: string | null }>();

            res.json({
                data: {
                    count: ids.length,
                    orderIds: ids,
                    byChannel: byChannel.map((r) => ({
                        channel: r.channel,
                        store: r.store,
                        count: Number(r.count),
                        value: Number(r.value ?? 0)
                    }))
                }
            });
        } catch (error: any) {
            res.status(500).json({ error: { message: error.message } });
        }
    }

    /**
     * Creates one invoice per order. Re-running is safe: orders that already
     * have an invoice are reported as skipped instead of duplicated.
     */
    static async generate(req: Request, res: Response) {
        try {
            const body = generateSchema.parse(req.body);
            const notFound: Array<{ orderId: string; orderNumber: string; reason: string }> = [];
            let orderIds: string[];
            if (body.orderNumbers?.length) {
                const wanted = [...new Set(body.orderNumbers)];
                const found = await AppDataSource.getRepository(Order)
                    .createQueryBuilder('o')
                    .select(['o.id', 'o.orderNumber'])
                    .where('o.organization_id = :orgId', { orgId: body.organizationId })
                    .andWhere('o.orderNumber IN (:...nums)', { nums: wanted })
                    .getMany();
                const byNumber = new Map(found.map((o) => [String(o.orderNumber).toLowerCase(), String(o.id)]));
                orderIds = [];
                for (const n of wanted) {
                    const id = byNumber.get(n.toLowerCase());
                    if (id) orderIds.push(id);
                    else notFound.push({ orderId: '—', orderNumber: n, reason: `Order ${n} not found in this organization` });
                }
            } else {
                orderIds = body.orderIds?.length
                    ? body.orderIds
                    : await findUninvoicedOrderIds(body.organizationId, body.limit);
            }

            if (orderIds.length === 0) {
                return res.json({ data: { created: 0, skipped: notFound, invoices: [] } });
            }

            const userId = (req as any).user?.id ? String((req as any).user.id) : undefined;
            const result = await generateInvoicesForOrders(body.organizationId, orderIds, userId);
            result.skipped.push(...notFound);

            res.status(201).json({
                data: {
                    created: result.created.length,
                    skipped: result.skipped,
                    invoices: result.created.map((i) => ({
                        id: i.id,
                        invoiceNumber: i.invoiceNumber,
                        orderId: i.orderId,
                        total: i.total
                    }))
                }
            });
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: { message: error.errors[0].message } });
            }
            res.status(500).json({ error: { message: error.message } });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const data = createSchema.parse(req.body);

            if (data.orderId) {
                const clash = await AppDataSource.getRepository(Invoice).findOne({
                    where: { orderId: data.orderId },
                    select: { id: true, invoiceNumber: true }
                });
                if (clash) {
                    return res.status(409).json({
                        error: { message: `Order already invoiced as ${clash.invoiceNumber}`, invoiceId: clash.id }
                    });
                }
            }

            let subtotal = 0;
            let totalTax = 0;
            const lines = data.lines.map((l) => {
                const lineTotal = l.quantity * l.unitPrice;
                const taxAmount = lineTotal * (l.taxRate / 100);
                subtotal += lineTotal;
                totalTax += taxAmount;
                return {
                    description: l.description,
                    quantity: l.quantity,
                    unitPrice: l.unitPrice,
                    taxRate: l.taxRate,
                    taxAmount,
                    lineTotal
                };
            });

            const total = subtotal + totalTax + data.shippingAmount - data.discountAmount;

            const repo = AppDataSource.getRepository(Invoice);
            const item = repo.create({
                ...data,
                invoiceDate: new Date(data.invoiceDate),
                dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
                lines,
                subtotal,
                taxAmount: totalTax,
                total,
                paidAmount: 0
            });

            const saved = await repo.save(item);
            await syncInvoiceLedger(String(saved.id), (req as any).user?.id ? String((req as any).user.id) : null);
            res.status(201).json({ data: saved });
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: { message: error.errors[0].message } });
            }
            res.status(500).json({ error: { message: error.message } });
        }
    }

    static async update(req: Request, res: Response) {
        try {
            const data = updateSchema.parse(req.body);
            const repo = AppDataSource.getRepository(Invoice);
            const item = await repo.findOne({ where: { id: req.params.id }, relations: ['lines'] });
            if (!item) return res.status(404).json({ error: { message: 'Not found' } });
            const before = { total: Number(item.total), tax: Number(item.taxAmount) };

            Object.assign(item, data);

            if (data.invoiceDate) item.invoiceDate = new Date(data.invoiceDate);
            if (data.dueDate) item.dueDate = new Date(data.dueDate);
            if (data.status === 'sent' && !item.sentAt) item.sentAt = new Date();
            if (data.status === 'paid') {
                item.paidAt = item.paidAt ?? new Date();
                item.paidAmount = Number(item.total);
            }

            if (data.lines) {
                let subtotal = 0;
                let totalTax = 0;
                const lineRepo = AppDataSource.getRepository(InvoiceLine);
                item.lines = data.lines.map((l) => {
                    const lineTotal = l.quantity * l.unitPrice;
                    const taxAmount = lineTotal * (l.taxRate / 100);
                    subtotal += lineTotal;
                    totalTax += taxAmount;
                    return lineRepo.create({
                        description: l.description,
                        quantity: l.quantity,
                        unitPrice: l.unitPrice,
                        taxRate: l.taxRate,
                        taxAmount,
                        lineTotal
                    });
                });
                item.subtotal = subtotal;
                item.taxAmount = totalTax;
                item.total = subtotal + totalTax + (Number(item.shippingAmount) || 0) - (Number(item.discountAmount) || 0);
            }

            if (
                item.journalEntryId &&
                (Math.abs(Number(item.total) - before.total) > 0.005 || Math.abs(Number(item.taxAmount) - before.tax) > 0.005)
            ) {
                return res.status(409).json({
                    error: { message: 'This invoice is posted to the ledger, so its amounts cannot change. Cancel it and issue a new invoice instead.' }
                });
            }

            if (data.lines) await AppDataSource.getRepository(InvoiceLine).delete({ invoiceId: item.id });
            const saved = await repo.save(item);
            await syncInvoiceLedger(String(saved.id), (req as any).user?.id ? String((req as any).user.id) : null);
            res.json({ data: saved });
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: { message: error.errors[0].message } });
            }
            res.status(500).json({ error: { message: error.message } });
        }
    }

    static async remove(req: Request, res: Response) {
        try {
            const repo = AppDataSource.getRepository(Invoice);
            const item = await repo.findOne({ where: { id: req.params.id } });
            if (!item) return res.status(404).json({ error: { message: 'Not found' } });

            await voidLedgerForDeletedDocument('invoice', String(item.id));
            await repo.remove(item);
            res.json({ data: { id: item.id } });
        } catch (error: any) {
            res.status(500).json({ error: { message: error.message } });
        }
    }
}
