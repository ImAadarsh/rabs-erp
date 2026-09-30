/**
 * Good Till (SumUp POS) REST API client.
 * @see https://apidoc.thegoodtill.com/
 */

const API_BASE = 'https://api.thegoodtill.com/api';

export interface GoodTillCredentials {
  subdomain: string;
  username: string;
  password: string;
  outletId?: string;
  defaultVatCodeId?: string;
}

export interface GoodTillLoginResponse {
  token: string;
  user_level: string;
  current_outlet_id: string;
  current_outlet_name: string;
  client_name: string;
  client_subdomain: string;
}

export interface GoodTillVatRate {
  id: string;
  vat_name: string;
  vat_rate: string;
  active: number;
}

export interface GoodTillEcommerceProduct {
  product_id: string;
  product_name: string;
  product_desc: string | null;
  product_sku: string;
  barcode: string | null;
  selling_price: string;
  track_inventory: number;
  inventory: string;
  has_variant: number;
  parent_product_id: string | null;
  category: string | null;
  brand: string | null;
  tags: string[];
  vat_id: string;
  vat_name: string;
  weight: number | null;
  attributes: Array<{ name: string; value: string }>;
  variants: GoodTillEcommerceProduct[];
  import_issue?: string;
}

interface ApiEnvelope<T> {
  status?: boolean;
  data?: T;
  message?: string;
}

export interface GoodTillSaleItem {
  id: string;
  product_id: string | null;
  product_sku: string | null;
  product_name: string;
  quantity: number;
  price_inc_vat_per_item: string;
  vat_rate: string;
  discount_amount: string;
  is_removed: number;
  item_notes: string | null;
  line_total_after_discount: string | number;
  line_subtotal_after_discount: string | number;
  line_vat_after_discount: string | number;
}

export interface GoodTillSalePayment {
  id: string;
  payment_method: string;
  payment_date_time: string;
  payment_amount: string;
  payment_amount_actual: string;
  payment_change_actual: string;
}

export interface GoodTillSaleDetail {
  id: string;
  outlet_id: string;
  register_id: string | null;
  staff_id: string | null;
  customer_id: string | null;
  order_no: number;
  sale_type: string;
  order_status: string;
  receipt_no: string | null;
  order_notes: string | null;
  sales_date_time: string;
  sales_details: {
    sales_items?: GoodTillSaleItem[];
    line_discount?: number | string;
    promo_offers?: number | string;
    delivery_charge?: string;
    service_charge?: string;
    total_ex_vat?: string;
    total_vat?: string;
    total?: string;
  } | null;
  sales_payments_history?: GoodTillSalePayment[] | null;
  customer?: unknown;
}

/** Good Till expects 'Y-m-d H:i:s' datetimes. */
export function formatGoodTillDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

type TokenCache = { token: string; createdAt: number; outletId: string };

const tokenCache = new Map<string, TokenCache>();

function cacheKey(creds: GoodTillCredentials): string {
  return `${creds.subdomain}:${creds.username}`;
}

export class GoodTillApiClient {
  private creds: GoodTillCredentials;
  private token: string | null = null;
  private outletId: string | null = null;

  constructor(creds: GoodTillCredentials) {
    this.creds = creds;
  }

  async login(): Promise<GoodTillLoginResponse> {
    const key = cacheKey(this.creds);
    const cached = tokenCache.get(key);
    const elevenHours = 11 * 60 * 60 * 1000;
    if (cached && Date.now() - cached.createdAt < elevenHours) {
      this.token = cached.token;
      this.outletId = this.creds.outletId ?? cached.outletId;
      return {
        token: cached.token,
        user_level: 'store_admin',
        current_outlet_id: this.outletId,
        current_outlet_name: '',
        client_name: '',
        client_subdomain: this.creds.subdomain
      };
    }

    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        subdomain: this.creds.subdomain.trim(),
        username: this.creds.username.trim(),
        password: this.creds.password
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Good Till login failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as GoodTillLoginResponse & { message?: string };
    if (data.user_level === 'operator') {
      throw new Error('Good Till API requires an admin or store owner account');
    }
    if (!data.token) {
      throw new Error(data.message ?? 'Good Till login did not return a token');
    }

    this.token = data.token;
    this.outletId = this.creds.outletId ?? data.current_outlet_id;
    tokenCache.set(key, { token: data.token, createdAt: Date.now(), outletId: this.outletId });

    return data;
  }

  private async ensureAuth(): Promise<void> {
    if (!this.token) await this.login();
  }

  getOutletId(): string {
    if (!this.outletId) throw new Error('Good Till outlet not configured');
    return this.outletId;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { outletId?: string }
  ): Promise<T> {
    await this.ensureAuth();
    const outletId = opts?.outletId ?? this.getOutletId();

    const res = await fetch(`${API_BASE}/${path.replace(/^\//, '')}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Outlet-Id': outletId
      },
      body: body != null ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Good Till API invalid JSON (${res.status}): ${text.slice(0, 300)}`);
    }

    if (!res.ok) {
      const err = parsed as { message?: string; error?: string };
      throw new Error(
        err.message ?? err.error ?? `Good Till API error (${res.status}): ${text.slice(0, 300)}`
      );
    }

    return parsed as T;
  }

  /**
   * Fetch full sale records (line items + payment history) for a date range.
   * Paginates automatically — Good Till caps `limit` at 50 per page.
   * @see apidoc — Sale | Get Sales Details
   * GET /api/external/get_sales_details
   */
  async getSalesDetails(opts: {
    from: Date;
    to: Date;
    includeVoided?: boolean;
    maxSales?: number;
  }): Promise<GoodTillSaleDetail[]> {
    const pageSize = 50;
    const maxSales = opts.maxSales ?? 5000;
    const all: GoodTillSaleDetail[] = [];
    let offset = 0;

    // Hard page ceiling as a runaway guard.
    for (let page = 0; page < Math.ceil(maxSales / pageSize) + 1; page++) {
      const qs = new URLSearchParams({
        from: formatGoodTillDate(opts.from),
        to: formatGoodTillDate(opts.to),
        timezone: 'local',
        limit: String(pageSize),
        offset: String(offset),
        include_voided: opts.includeVoided ? '1' : '0'
      });

      const res = await this.request<ApiEnvelope<GoodTillSaleDetail[]>>(
        'GET',
        `external/get_sales_details?${qs.toString()}`
      );
      const batch = res.data ?? [];
      all.push(...batch);
      if (batch.length < pageSize || all.length >= maxSales) break;
      offset += batch.length;
    }

    return all.slice(0, maxSales);
  }

  async getVatRates(): Promise<GoodTillVatRate[]> {
    const res = await this.request<ApiEnvelope<GoodTillVatRate[]>>('GET', 'ajax/vat_rates');
    return res.data ?? [];
  }

  async getEcommerceProducts(): Promise<GoodTillEcommerceProduct[]> {
    const data = await this.request<GoodTillEcommerceProduct[] | ApiEnvelope<GoodTillEcommerceProduct[]>>(
      'GET',
      'ecommerce/products'
    );
    if (Array.isArray(data)) return data;
    return data.data ?? [];
  }

  async getProducts(): Promise<Array<Record<string, unknown>>> {
    const res = await this.request<ApiEnvelope<Array<Record<string, unknown>>>>('GET', 'products');
    return res.data ?? [];
  }

  async createProduct(payload: Record<string, unknown>): Promise<{ id: string }> {
    const res = await this.request<ApiEnvelope<{ id: string }>>('POST', 'products', payload);
    const id = res.data?.id ?? (res as unknown as { id?: string }).id;
    if (!id) throw new Error('Good Till create product did not return an id');
    return { id };
  }

  async getProductDetails(productId: string): Promise<Record<string, unknown>> {
    const res = await this.request<{ data?: Record<string, unknown>; success?: number }>(
      'GET',
      `products/${productId}`
    );
    const data = res.data;
    if (!data) throw new Error('Product not found in EPOS');
    return data;
  }

  async updateProduct(productId: string, payload: Record<string, unknown>): Promise<void> {
    await this.request('PUT', `products/${productId}`, payload);
  }

  /**
   * Soft-delete a product in Good Till / SumUp POS.
   * @see https://apidoc.thegoodtill.com/ — Product | Delete a product
   * DELETE /api/products/delete/:id
   */
  async deleteProduct(productId: string): Promise<void> {
    await this.request('DELETE', `products/delete/${encodeURIComponent(productId)}`);
  }

  /** Safe update: fetch full product then merge patch (Good Till clears omitted fields). */
  async patchProduct(productId: string, patch: Record<string, unknown>): Promise<void> {
    const details = await this.getProductDetails(productId);
    const payload: Record<string, unknown> = { ...details, ...patch, id: details.id };
    delete payload.inventory_id;
    delete payload.image;
    await this.updateProduct(productId, payload);
  }

  /**
   * Read live inventory for specific SKUs (or all if omitted).
   * @see apidoc — Ecommerce | Get product inventory
   * GET /api/ecommerce/get_inventory
   */
  async getEcommerceInventory(
    skus?: string[]
  ): Promise<Array<{ product_id: string; product_sku: string; track_inventory: number; inventory: string }>> {
    const q = skus?.length ? `?sku=${encodeURIComponent(skus.join(','))}` : '';
    const res = await this.request<
      ApiEnvelope<Array<{ product_id: string; product_sku: string; track_inventory: number; inventory: string }>>
    >('GET', `ecommerce/get_inventory${q}`);
    return res.data ?? [];
  }

  /**
   * Adjust inventory. NOTE the inverted semantics from Good Till:
   * `quantity` is positive to DECREMENT and negative to INCREMENT.
   * The `PUT /products/:id` endpoint silently ignores the `inventory` field,
   * so this delta endpoint is the only way to move stock via the API.
   * @see apidoc — Ecommerce | Adjust product inventory
   * POST /api/ecommerce/adjust_inventory
   */
  async adjustInventory(
    products: Array<{ id?: string; sku?: string; quantity: number }>
  ): Promise<void> {
    const items = products.filter((p) => Number.isFinite(p.quantity) && p.quantity !== 0);
    if (!items.length) return;
    await this.request('POST', 'ecommerce/adjust_inventory', { products: items });
  }

  /**
   * Set an EPOS product's stock to an absolute target value using the delta
   * adjust endpoint. `currentInventory` is the value already known from the
   * ecommerce product list, avoiding an extra read.
   */
  async setInventoryLevel(
    productId: string,
    desiredQty: number,
    currentInventory: number
  ): Promise<void> {
    const delta = currentInventory - desiredQty; // positive decrements, negative increments
    if (delta === 0) return;
    await this.adjustInventory([{ id: productId, quantity: delta }]);
  }
}

export async function testGoodTillConnection(
  creds: GoodTillCredentials
): Promise<{ productCount: number; storeName: string; outletName: string; outletId: string }> {
  const client = new GoodTillApiClient(creds);
  const login = await client.login();
  const products = await client.getEcommerceProducts();
  return {
    productCount: products.length,
    storeName: login.client_name || creds.subdomain,
    outletName: login.current_outlet_name,
    outletId: client.getOutletId()
  };
}
