import fs from 'fs/promises';
import path from 'path';
import { AppDataSource } from '@config/data-source.js';

export type ReportCategory =
  | 'sales'
  | 'inventory'
  | 'finance'
  | 'operations'
  | 'hr'
  | 'marketing'
  | 'customer'
  | 'executive';

export type DateRange = { from?: string | null; to?: string | null };

type Dataset = {
  key: string;
  label: string;
  category: ReportCategory;
  /** SELECT … FROM … WHERE <org filter>; `?` placeholders only. */
  base: string;
  /** Fully qualified date column used for from/to filtering. */
  dateColumn?: string;
  suffix?: string;
};

/**
 * Built-in, org-scoped datasets. Report definitions pick one via parameters.dataset
 * (or fall back to their category default); user-supplied SQL is never executed.
 */
const DATASETS: Dataset[] = [
  {
    key: 'sales_by_day',
    label: 'Sales by day',
    category: 'sales',
    base: `SELECT DATE(o.order_date) AS day, COUNT(*) AS orders, ROUND(SUM(o.subtotal), 2) AS subtotal,
             ROUND(SUM(o.tax_amount), 2) AS tax, ROUND(SUM(o.total), 2) AS revenue
           FROM orders o
           WHERE o.organization_id = ? AND o.status NOT IN ('cancelled', 'refunded')`,
    dateColumn: 'o.order_date',
    suffix: 'GROUP BY DATE(o.order_date) ORDER BY day DESC LIMIT 1000'
  },
  {
    key: 'orders',
    label: 'Orders list',
    category: 'sales',
    base: `SELECT o.order_number, o.order_date, o.status, o.payment_status, o.fulfillment_status, o.channel,
             o.customer_email, o.currency, o.subtotal, o.tax_amount, o.shipping_amount, o.total
           FROM orders o
           WHERE o.organization_id = ?`,
    dateColumn: 'o.order_date',
    suffix: 'ORDER BY o.order_date DESC LIMIT 10000'
  },
  {
    key: 'top_products',
    label: 'Top products by revenue',
    category: 'sales',
    base: `SELECT ol.sku, ol.name, SUM(ol.quantity) AS quantity, ROUND(SUM(ol.line_total), 2) AS revenue,
             COUNT(DISTINCT o.id) AS orders
           FROM order_lines ol
           JOIN orders o ON o.id = ol.order_id
           WHERE o.organization_id = ? AND o.status NOT IN ('cancelled', 'refunded')`,
    dateColumn: 'o.order_date',
    suffix: 'GROUP BY ol.sku, ol.name ORDER BY revenue DESC LIMIT 200'
  },
  {
    key: 'orders_by_status',
    label: 'Orders by status',
    category: 'operations',
    base: `SELECT o.status, o.fulfillment_status, COUNT(*) AS orders, ROUND(SUM(o.total), 2) AS value
           FROM orders o
           WHERE o.organization_id = ?`,
    dateColumn: 'o.order_date',
    suffix: 'GROUP BY o.status, o.fulfillment_status ORDER BY orders DESC'
  },
  {
    key: 'stock_levels',
    label: 'Stock levels',
    category: 'inventory',
    base: `SELECT ci.sku, ci.name, v.variant_sku, w.name AS warehouse,
             SUM(si.quantity_on_hand) AS on_hand, SUM(si.quantity_reserved) AS reserved,
             SUM(si.quantity_available) AS available, MAX(si.reorder_point) AS reorder_point
           FROM stock_items si
           JOIN variants v ON v.id = si.variant_id
           JOIN catalog_items ci ON ci.id = v.catalog_item_id
           LEFT JOIN warehouses w ON w.id = si.warehouse_id
           WHERE ci.organization_id = ?`,
    suffix: 'GROUP BY ci.sku, ci.name, v.variant_sku, w.name ORDER BY ci.name LIMIT 10000'
  },
  {
    key: 'low_stock',
    label: 'Low stock (at or below reorder point)',
    category: 'inventory',
    base: `SELECT ci.sku, ci.name, v.variant_sku, w.name AS warehouse,
             SUM(si.quantity_available) AS available, MAX(si.reorder_point) AS reorder_point,
             MAX(si.reorder_quantity) AS reorder_quantity
           FROM stock_items si
           JOIN variants v ON v.id = si.variant_id
           JOIN catalog_items ci ON ci.id = v.catalog_item_id
           LEFT JOIN warehouses w ON w.id = si.warehouse_id
           WHERE ci.organization_id = ?`,
    suffix:
      'GROUP BY ci.sku, ci.name, v.variant_sku, w.name HAVING available <= reorder_point ORDER BY available ASC LIMIT 5000'
  },
  {
    key: 'stock_movements',
    label: 'Stock movements',
    category: 'inventory',
    base: `SELECT sm.created_at, sm.movement_type, v.variant_sku, v.name AS variant, w.name AS warehouse,
             sm.quantity, sm.quantity_before, sm.quantity_after, sm.unit_cost, sm.reference_type, sm.reference_number, sm.notes
           FROM stock_movements sm
           LEFT JOIN variants v ON v.id = sm.variant_id
           LEFT JOIN warehouses w ON w.id = sm.warehouse_id
           WHERE sm.organization_id = ?`,
    dateColumn: 'sm.created_at',
    suffix: 'ORDER BY sm.created_at DESC LIMIT 20000'
  },
  {
    key: 'campaigns',
    label: 'Marketing campaigns',
    category: 'marketing',
    base: `SELECT mc.campaign_code, mc.campaign_name, mc.campaign_type, mc.status, mc.start_date, mc.end_date,
             mc.currency, mc.budget, mc.total_sent, mc.total_delivered, mc.total_opens, mc.total_clicks,
             mc.total_conversions, mc.total_revenue
           FROM campaigns mc
           WHERE mc.organization_id = ?`,
    dateColumn: 'mc.created_at',
    suffix: 'ORDER BY mc.created_at DESC LIMIT 10000'
  },
  {
    key: 'products',
    label: 'Product catalogue',
    category: 'inventory',
    base: `SELECT ci.sku, ci.name, ci.category, ci.brand, ci.status, ci.currency, ci.cost_price, ci.selling_price
           FROM catalog_items ci
           WHERE ci.organization_id = ? AND ci.deleted_at IS NULL`,
    dateColumn: 'ci.created_at',
    suffix: 'ORDER BY ci.name LIMIT 20000'
  },
  {
    key: 'invoices',
    label: 'Invoices',
    category: 'finance',
    base: `SELECT i.invoice_number, i.invoice_date, i.due_date, i.status, i.currency, i.subtotal, i.tax_amount,
             i.total, i.paid_amount, i.balance_due
           FROM invoices i
           WHERE i.organization_id = ?`,
    dateColumn: 'i.invoice_date',
    suffix: 'ORDER BY i.invoice_date DESC LIMIT 10000'
  },
  {
    key: 'ar_aging',
    label: 'Accounts receivable aging',
    category: 'finance',
    base: `SELECT
             CASE
               WHEN i.due_date IS NULL OR i.due_date >= CURDATE() THEN 'Current'
               WHEN DATEDIFF(CURDATE(), i.due_date) <= 30 THEN '1-30 days'
               WHEN DATEDIFF(CURDATE(), i.due_date) <= 60 THEN '31-60 days'
               WHEN DATEDIFF(CURDATE(), i.due_date) <= 90 THEN '61-90 days'
               ELSE '90+ days'
             END AS bucket,
             COUNT(*) AS invoices, ROUND(SUM(i.balance_due), 2) AS outstanding
           FROM invoices i
           WHERE i.organization_id = ? AND i.balance_due > 0 AND i.status NOT IN ('void', 'cancelled', 'draft')`,
    dateColumn: 'i.invoice_date',
    suffix: 'GROUP BY bucket ORDER BY MIN(i.due_date)'
  },
  {
    key: 'customers',
    label: 'Customers',
    category: 'customer',
    base: `SELECT c.customer_number, c.first_name, c.last_name, c.company_name, c.email, c.phone, c.customer_type,
             c.status, c.total_orders, c.lifetime_value, c.created_at
           FROM customers c
           WHERE c.organization_id = ? AND c.deleted_at IS NULL`,
    dateColumn: 'c.created_at',
    suffix: 'ORDER BY c.created_at DESC LIMIT 20000'
  },
  {
    key: 'top_customers',
    label: 'Top customers by revenue',
    category: 'customer',
    base: `SELECT c.customer_number, COALESCE(NULLIF(c.company_name, ''), CONCAT_WS(' ', c.first_name, c.last_name)) AS customer,
             c.email, COUNT(o.id) AS orders, ROUND(SUM(o.total), 2) AS revenue
           FROM orders o
           JOIN customers c ON c.id = o.customer_id
           WHERE o.organization_id = ? AND o.status NOT IN ('cancelled', 'refunded')`,
    dateColumn: 'o.order_date',
    suffix: 'GROUP BY c.id, c.customer_number, customer, c.email ORDER BY revenue DESC LIMIT 200'
  },
  {
    key: 'employees',
    label: 'Employees',
    category: 'hr',
    base: `SELECT e.employee_number, e.first_name, e.last_name, e.email, e.department, e.job_title,
             e.employment_type, e.status, e.hire_date, e.termination_date
           FROM employees e
           WHERE e.organization_id = ? AND e.deleted_at IS NULL`,
    dateColumn: 'e.hire_date',
    suffix: 'ORDER BY e.last_name, e.first_name LIMIT 20000'
  },
  {
    key: 'crm_leads',
    label: 'CRM leads',
    category: 'marketing',
    base: `SELECT l.name, l.company, l.email, l.phone, l.source, l.status, l.priority, l.score, l.created_at
           FROM crm_leads l
           WHERE l.organization_id = ?`,
    dateColumn: 'l.created_at',
    suffix: 'ORDER BY l.created_at DESC LIMIT 20000'
  },
  {
    key: 'crm_deals',
    label: 'CRM deals',
    category: 'sales',
    base: `SELECT d.name, d.status, d.currency, d.amount, d.expected_close, d.created_at
           FROM crm_deals d
           WHERE d.organization_id = ?`,
    dateColumn: 'd.created_at',
    suffix: 'ORDER BY d.created_at DESC LIMIT 20000'
  },
  {
    key: 'executive_kpis',
    label: 'Executive KPIs',
    category: 'executive',
    base: `SELECT
             (SELECT COUNT(*) FROM orders o WHERE o.organization_id = ? AND o.status NOT IN ('cancelled','refunded') {RANGE_o.order_date}) AS orders,
             (SELECT ROUND(COALESCE(SUM(o.total), 0), 2) FROM orders o WHERE o.organization_id = ? AND o.status NOT IN ('cancelled','refunded') {RANGE_o.order_date}) AS revenue,
             (SELECT COUNT(*) FROM customers c WHERE c.organization_id = ? AND c.deleted_at IS NULL {RANGE_c.created_at}) AS new_customers,
             (SELECT ROUND(COALESCE(SUM(i.total), 0), 2) FROM invoices i WHERE i.organization_id = ? {RANGE_i.invoice_date}) AS invoiced,
             (SELECT ROUND(COALESCE(SUM(i.balance_due), 0), 2) FROM invoices i WHERE i.organization_id = ? AND i.balance_due > 0) AS receivables_outstanding,
             (SELECT COUNT(*) FROM crm_leads l WHERE l.organization_id = ? {RANGE_l.created_at}) AS new_leads`
  }
];

/** Entity types offered by Data Exports, mapped onto list datasets. */
export const EXPORT_ENTITY_DATASETS: Record<string, string> = {
  orders: 'orders',
  customers: 'customers',
  products: 'products',
  inventory: 'stock_levels',
  stock: 'stock_levels',
  stock_movements: 'stock_movements',
  campaigns: 'campaigns',
  invoices: 'invoices',
  employees: 'employees',
  leads: 'crm_leads',
  crm_leads: 'crm_leads',
  deals: 'crm_deals',
  sales: 'sales_by_day'
};

const CATEGORY_DEFAULT: Record<ReportCategory, string> = {
  sales: 'sales_by_day',
  inventory: 'stock_levels',
  finance: 'invoices',
  operations: 'orders_by_status',
  hr: 'employees',
  marketing: 'crm_leads',
  customer: 'top_customers',
  executive: 'executive_kpis'
};

export function listDatasets() {
  return DATASETS.map(({ key, label, category, dateColumn }) => ({
    key,
    label,
    category,
    supportsDateRange: !!dateColumn || key === 'executive_kpis'
  }));
}

export function resolveDatasetKey(category: ReportCategory, parameters?: any): string {
  const requested = parameters && typeof parameters.dataset === 'string' ? parameters.dataset : null;
  if (requested && DATASETS.some((d) => d.key === requested)) return requested;
  return CATEGORY_DEFAULT[category] || 'executive_kpis';
}

function normDate(v?: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw Object.assign(new Error(`Invalid date: ${v}`), { status: 400 });
  }
  return d.toISOString().slice(0, 10);
}

/**
 * mysql2 parses DATE/DATETIME values as local (process TZ) wall-clock times, so toISOString()
 * would shift a DATE like 2026-10-13 to "2026-10-12T23:00:00.000Z" during BST.
 * Emit the same wall-clock value the database holds instead.
 */
function formatDbDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0) return day;
  return `${day} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function runDataset(
  datasetKey: string,
  organizationId: string,
  range: DateRange = {}
): Promise<{ dataset: string; label: string; columns: string[]; rows: Record<string, unknown>[] }> {
  const ds = DATASETS.find((d) => d.key === datasetKey);
  if (!ds) throw Object.assign(new Error(`Unknown dataset "${datasetKey}"`), { status: 400 });
  const from = normDate(range.from);
  const to = normDate(range.to);

  let sql: string;
  const params: unknown[] = [];

  if (ds.key === 'executive_kpis') {
    sql = ds.base.replace(/\{RANGE_([\w.]+)\}/g, (_m, col: string) => {
      let clause = '';
      if (from) clause += ` AND ${col} >= ?`;
      if (to) clause += ` AND ${col} < DATE_ADD(?, INTERVAL 1 DAY)`;
      return clause;
    });
    // Re-walk placeholders in order: each sub-select starts with org id, then optional from/to.
    const parts = sql.split('?');
    for (let i = 0; i < parts.length - 1; i++) {
      const before = parts[i];
      if (/organization_id = $/.test(before)) params.push(organizationId);
      else if (/>= $/.test(before)) params.push(from);
      else params.push(to);
    }
  } else {
    sql = ds.base;
    params.push(organizationId);
    if (ds.dateColumn && from) {
      sql += ` AND ${ds.dateColumn} >= ?`;
      params.push(from);
    }
    if (ds.dateColumn && to) {
      sql += ` AND ${ds.dateColumn} < DATE_ADD(?, INTERVAL 1 DAY)`;
      params.push(to);
    }
    if (ds.suffix) sql += ` ${ds.suffix}`;
  }

  const raw: Record<string, unknown>[] = await AppDataSource.query(sql, params);
  const rows = raw.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      out[k] = v instanceof Date ? formatDbDate(v) : typeof v === 'bigint' ? Number(v) : v;
    }
    return out;
  });
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return { dataset: ds.key, label: ds.label, columns, rows };
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map(csvCell).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(','));
  return lines.join('\r\n');
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function toXml(columns: string[], rows: Record<string, unknown>[]): string {
  const tag = (c: string) => c.replace(/[^A-Za-z0-9_]/g, '_');
  const body = rows
    .map(
      (r) =>
        `  <row>${columns
          .map((c) => `<${tag(c)}>${xmlEscape(r[c] == null ? '' : String(r[c]))}</${tag(c)}>`)
          .join('')}</row>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rows>\n${body}\n</rows>\n`;
}

/** Private (not statically served) directory for generated exports; downloaded via an authenticated route. */
export const exportsRoot = path.resolve(process.cwd(), 'exports');

export async function writeExportFile(fileName: string, content: string): Promise<{ filePath: string; size: number }> {
  await fs.mkdir(exportsRoot, { recursive: true });
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  const filePath = path.join(exportsRoot, safe);
  await fs.writeFile(filePath, content, 'utf8');
  return { filePath, size: Buffer.byteLength(content, 'utf8') };
}
