import { AppDataSource } from '@config/data-source.js';
import { B2bPortalSettings } from '@entities/b2b/B2bPortalSettings.js';
import { CatalogItem } from '@entities/catalog/CatalogItem.js';
import { ChannelMapping } from '@entities/catalog/ChannelMapping.js';
import { PriceList } from '@entities/catalog/PriceList.js';
import { PriceListItem } from '@entities/catalog/PriceListItem.js';
import { StockItem } from '@entities/inventory/StockItem.js';
import { Customer } from '@entities/orders/Customer.js';
import { In } from 'typeorm';

export type PortalProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  subCategory: string;
  description: string;
  imageUrl: string;
  featured: boolean;
  isPromo: boolean;
  tierPricing: { minCases: number; pricePerCase: number }[];
  variants: PortalVariant[];
  nutrition?: Record<string, string>;
};

export type PortalVariant = {
  id: string;
  sku: string;
  name: string;
  flavor?: string;
  color?: string;
  size?: string;
  packSize: string;
  unitsPerCase: number;
  barcode: string;
  casePrice: number;
  unitPrice: number;
  rrp: number;
  stockLevel: number;
  weightKg: number;
  vatRate: number;
};

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseUnitsPerCase(packSize: string | null | undefined): number {
  if (!packSize) return 1;
  const match = packSize.match(/(\d+)\s*[x×]/i);
  if (match) return Math.max(1, parseInt(match[1], 10));
  return 1;
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'uncategorised';
}

export async function getOrCreateB2bSettings(organizationId: string): Promise<B2bPortalSettings> {
  const repo = AppDataSource.getRepository(B2bPortalSettings);
  let settings = await repo.findOne({
    where: { organization: { id: organizationId } },
    relations: ['organization', 'defaultPriceList', 'defaultWarehouse']
  });
  if (!settings) {
    settings = repo.create({
      organization: { id: organizationId } as any,
      enabled: true,
      publishMode: 'all_active',
      defaultPriceList: null,
      defaultWarehouse: null
    });
    await repo.save(settings);
    settings = await repo.findOne({
      where: { id: settings.id },
      relations: ['organization', 'defaultPriceList', 'defaultWarehouse']
    }) as B2bPortalSettings;
  }
  return settings;
}

export async function resolvePriceList(organizationId: string, customer?: Customer | null): Promise<PriceList | null> {
  const settings = await getOrCreateB2bSettings(organizationId);
  const repo = AppDataSource.getRepository(PriceList);

  if (settings.defaultPriceList?.id) {
    const listed = await repo.findOne({ where: { id: settings.defaultPriceList.id, status: 'active' } });
    if (listed) return listed;
  }

  if (customer?.tier) {
    const tierList = await repo.findOne({
      where: {
        organization: { id: organizationId },
        type: 'customer_tier',
        status: 'active',
        code: customer.tier
      }
    });
    if (tierList) return tierList;
  }

  const wholesaleDefault = await repo.findOne({
    where: {
      organization: { id: organizationId },
      type: 'wholesale',
      status: 'active',
      isDefault: true
    }
  });
  if (wholesaleDefault) return wholesaleDefault;

  return repo.findOne({
    where: {
      organization: { id: organizationId },
      type: 'wholesale',
      status: 'active'
    }
  });
}

async function loadPublishedItems(organizationId: string, settings: B2bPortalSettings): Promise<CatalogItem[]> {
  const itemRepo = AppDataSource.getRepository(CatalogItem);
  const qb = itemRepo.createQueryBuilder('ci')
    .leftJoinAndSelect('ci.variants', 'v')
    .leftJoinAndSelect('v.barcodes', 'b')
    .leftJoinAndSelect('ci.media', 'm')
    .leftJoinAndSelect('ci.taxCode', 'tax')
    .where('ci.organization_id = :organizationId', { organizationId })
    .andWhere('ci.status = :status', { status: 'active' })
    .andWhere('ci.deleted_at IS NULL')
    .orderBy('ci.name', 'ASC');

  if (settings.publishMode === 'mapped_only') {
    qb.innerJoin(ChannelMapping, 'cm', 'cm.catalog_item_id = ci.id AND cm.channel = :channel AND cm.sync_enabled = 1', {
      channel: 'b2b_portal'
    });
  }

  return qb.getMany();
}

async function stockByVariant(variantIds: string[], warehouseId?: string | null): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (variantIds.length === 0) return map;
  const repo = AppDataSource.getRepository(StockItem);
  const qb = repo.createQueryBuilder('s')
    .select('s.variant_id', 'variantId')
    .addSelect('SUM(s.quantity_on_hand - s.quantity_reserved)', 'qty')
    .where('s.variant_id IN (:...ids)', { ids: variantIds })
    .andWhere("s.status = 'available'")
    .groupBy('s.variant_id');
  if (warehouseId) {
    qb.andWhere('s.warehouse_id = :warehouseId', { warehouseId });
  }
  const rows = await qb.getRawMany();
  for (const row of rows) {
    map.set(String(row.variantId), num(row.qty));
  }
  return map;
}

async function priceItemsForList(priceListId: string | undefined, variantIds: string[]): Promise<Map<string, PriceListItem[]>> {
  const map = new Map<string, PriceListItem[]>();
  if (!priceListId || variantIds.length === 0) return map;
  const items = await AppDataSource.getRepository(PriceListItem).find({
    where: {
      priceList: { id: priceListId },
      variant: { id: In(variantIds) }
    },
    relations: ['variant']
  });
  for (const item of items) {
    const vid = item.variant?.id;
    if (!vid) continue;
    const list = map.get(vid) ?? [];
    list.push(item);
    map.set(vid, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.minQuantity ?? 1) - (b.minQuantity ?? 1));
  }
  return map;
}

function mapItem(
  item: CatalogItem,
  stock: Map<string, number>,
  prices: Map<string, PriceListItem[]>
): PortalProduct | null {
  const variants = (item.variants ?? []).filter((v) => v.status === 'active');
  if (variants.length === 0) return null;

  const primaryMedia = (item.media ?? []).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.position - b.position)[0];
  const mappedVariants: PortalVariant[] = variants.map((v) => {
    const barcode = (v.barcodes ?? []).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0]?.barcode ?? '';
    const priceRows = prices.get(v.id) ?? [];
    const baseRow = priceRows[0];
    const casePrice = num(baseRow?.price, num(item.sellingPrice));
    const unitsPerCase = parseUnitsPerCase(item.packSize);
    const vatRate = num(item.taxCode?.rate, 0.2);
    const optionName = (v.option1Name ?? '').toLowerCase();
    const flavor = optionName.includes('flavor') || optionName.includes('flavour') ? v.option1Value ?? undefined : undefined;
    const color = optionName.includes('color') || optionName.includes('colour') ? v.option1Value ?? undefined : (v.option2Name ?? '').toLowerCase().includes('color') ? v.option2Value ?? undefined : undefined;
    const size = (v.option1Name ?? '').toLowerCase().includes('size') ? v.option1Value ?? undefined : (v.option2Name ?? '').toLowerCase().includes('size') ? v.option2Value ?? undefined : v.option3Value ?? undefined;
    return {
      id: v.id,
      sku: v.variantSku,
      name: v.name || item.name,
      flavor,
      color,
      size,
      packSize: item.packSize || '1',
      unitsPerCase,
      barcode,
      casePrice,
      unitPrice: unitsPerCase > 0 ? Number((casePrice / unitsPerCase).toFixed(4)) : casePrice,
      rrp: num(baseRow?.compareAtPrice, casePrice),
      stockLevel: stock.get(v.id) ?? 0,
      weightKg: num(v.weightValue, num(item.weightValue)),
      vatRate
    };
  });

  const firstPrices = prices.get(variants[0].id) ?? [];
  const tierPricing = firstPrices.map((p) => ({
    minCases: p.minQuantity ?? 1,
    pricePerCase: num(p.price)
  }));
  if (tierPricing.length === 0 && mappedVariants[0]) {
    tierPricing.push({ minCases: 1, pricePerCase: mappedVariants[0].casePrice });
  }

  const attrs = item.attributes ?? {};
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    brand: item.brand || 'RABS',
    category: item.category ? slugify(item.category) : 'general',
    subCategory: item.subCategory ? slugify(item.subCategory) : '',
    description: item.description || item.longDescription || '',
    imageUrl: primaryMedia?.url || variants[0]?.imageUrl || '',
    featured: Boolean(attrs.featured),
    isPromo: Boolean(attrs.isPromo) || firstPrices.some((p) => p.compareAtPrice != null && num(p.compareAtPrice) > num(p.price)),
    tierPricing,
    variants: mappedVariants,
    nutrition: attrs.nutrition
  };
}

export async function listPortalProducts(opts: {
  organizationId: string;
  customer?: Customer | null;
  category?: string;
  search?: string;
}): Promise<PortalProduct[]> {
  const settings = await getOrCreateB2bSettings(opts.organizationId);
  if (!settings.enabled) return [];
  const items = await loadPublishedItems(opts.organizationId, settings);
  const variantIds = items.flatMap((i) => (i.variants ?? []).map((v) => v.id));
  const priceList = await resolvePriceList(opts.organizationId, opts.customer);
  const [stock, prices] = await Promise.all([
    stockByVariant(variantIds, settings.defaultWarehouse?.id),
    priceItemsForList(priceList?.id, variantIds)
  ]);

  let products = items.map((item) => mapItem(item, stock, prices)).filter((p): p is PortalProduct => Boolean(p));

  if (opts.category && opts.category !== 'all') {
    const cat = opts.category.toLowerCase();
    products = products.filter((p) => p.category === cat || p.subCategory === cat);
  }
  if (opts.search) {
    const q = opts.search.toLowerCase();
    products = products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.variants.some((v) => v.name.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q) || v.barcode.includes(q))
    );
  }
  return products;
}

export async function findPortalProductByBarcode(organizationId: string, barcode: string, customer?: Customer | null): Promise<PortalProduct | null> {
  const products = await listPortalProducts({ organizationId, customer });
  const code = barcode.trim();
  return products.find((p) => p.variants.some((v) => v.barcode === code)) ?? null;
}

export async function listPortalCategories(organizationId: string): Promise<{ id: string; name: string; slug: string; subcategories: { id: string; name: string; slug: string; parentId: string }[] }[]> {
  const products = await listPortalProducts({ organizationId });
  const map = new Map<string, { id: string; name: string; slug: string; subs: Map<string, { id: string; name: string; slug: string; parentId: string }> }>();
  for (const p of products) {
    if (!p.category) continue;
    if (!map.has(p.category)) {
      map.set(p.category, {
        id: p.category,
        name: p.category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        slug: p.category,
        subs: new Map()
      });
    }
    if (p.subCategory) {
      const parent = map.get(p.category)!;
      if (!parent.subs.has(p.subCategory)) {
        parent.subs.set(p.subCategory, {
          id: p.subCategory,
          name: p.subCategory.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          slug: p.subCategory,
          parentId: p.category
        });
      }
    }
  }
  return [
    { id: 'all', name: 'All products', slug: 'all', subcategories: [] },
    ...Array.from(map.values()).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      subcategories: Array.from(c.subs.values())
    }))
  ];
}

export function mapCustomerToProfile(customer: Customer, settings?: B2bPortalSettings | null) {
  const addr = (customer.addresses ?? []).find((a) => a.isDefault) ?? customer.addresses?.[0];
  const tierMap: Record<string, 'Gold Wholesale' | 'Platinum Premier' | 'Silver Standard'> = {
    platinum: 'Platinum Premier',
    gold: 'Gold Wholesale',
    silver: 'Silver Standard',
    standard: 'Silver Standard'
  };
  return {
    id: customer.id,
    companyName: customer.companyName || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Retailer',
    tradingName: customer.companyName || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Retailer',
    accountNumber: customer.customerNumber || `RABS-${customer.id}`,
    vatNumber: customer.taxId || '',
    contactName: `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || customer.email || 'Retailer',
    email: customer.email || '',
    phone: customer.phone || '',
    tier: tierMap[customer.tier] ?? 'Silver Standard',
    creditLimit: num(customer.creditLimit),
    creditUsed: num(customer.creditUsed),
    paymentTerms: customer.paymentTerms || '30 Days Net',
    deliveryAddress: {
      street: [addr?.addressLine1, addr?.addressLine2].filter(Boolean).join(', ') || '',
      city: addr?.city || '',
      postcode: addr?.postalCode || '',
      country: addr?.countryCode || 'GB'
    },
    assignedRep: {
      name: settings?.assignedRepName || 'RABS Trade Desk',
      phone: settings?.assignedRepPhone || '',
      email: settings?.assignedRepEmail || ''
    }
  };
}

export function mapOrderToPortal(order: {
  id: string;
  orderNumber: string;
  orderDate: Date;
  status: string;
  paymentStatus: string;
  shippingMethod?: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  customerNotes?: string | null;
  internalNotes?: string | null;
  lines?: { sku: string; name: string; quantity: number; unitPrice: number; lineTotal: number }[];
}) {
  const statusMap: Record<string, string> = {
    pending: 'Pending',
    confirmed: 'Processing',
    processing: 'Processing',
    completed: 'Delivered',
    cancelled: 'Cancelled',
    refunded: 'Cancelled',
    on_hold: 'Pending'
  };
  const notes = `${order.customerNotes ?? ''}\n${order.internalNotes ?? ''}`;
  const paymentMethod = notes.includes('Trade Credit')
    ? 'Trade Credit (Wallet)'
    : notes.includes('Credit Card') || notes.includes('card')
      ? 'Credit Card'
      : 'Bank Transfer (Open Banking)';
  const lines = order.lines ?? [];
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    date: new Date(order.orderDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    status: statusMap[order.status] ?? 'Processing',
    paymentMethod,
    gatewayUsed: undefined as string | undefined,
    deliveryMethod: order.shippingMethod || 'Next Working Day Pallet Freight',
    items: lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      variantName: l.name,
      quantity: l.quantity,
      pricePerCase: num(l.unitPrice),
      total: num(l.lineTotal)
    })),
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    totalWeightKg: 0,
    subtotal: num(order.subtotal),
    vatAmount: num(order.taxAmount),
    total: num(order.total)
  };
}
