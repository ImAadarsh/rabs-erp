import { AppDataSource } from '@config/data-source.js';
import { RabsSettings, RabsStatus, RabsProduct, RabsLabourRule, RabsPriceAudit } from '@entities/rabs/RabsEntities.js';
import { Ctx, bad, conflict, notFound, requireCap, invalidateSettings, getSettings, ensureStatuses } from './rabsCore.js';
import { CAPABILITIES, DEFAULT_ROLE_PERMISSIONS, RABS_ROLES } from './rabsWorkflow.js';
import { hashPassword } from '@utils/password.js';
import { staffList } from './rabsViews.js';

const repo = <T extends object>(e: new () => T) => AppDataSource.getRepository(e);

async function audit(ctx: Ctx, entity: string, entityId: string | null, label: string, before: Record<string, any>, after: Record<string, any>, fields: string[]) {
  for (const f of fields) {
    if (after[f] === undefined) continue;
    const o = before[f] === null || before[f] === undefined ? null : String(before[f]);
    const n = after[f] === null ? null : String(after[f]);
    if (o === n || (o !== null && n !== null && !Number.isNaN(Number(o)) && Number(o) === Number(n))) continue;
    await repo(RabsPriceAudit).insert({ organizationId: ctx.orgId, entity, entityId, entityLabel: label.slice(0, 255), field: f, oldValue: o?.slice(0, 255) ?? null, newValue: n?.slice(0, 255) ?? null, changedBy: ctx.userId });
  }
}

// ---- Settings ----------------------------------------------------------------

const SETTINGS_AUDITED = ['vatRate', 'depositMode', 'depositPercent', 'depositFixedAmount', 'depositMinAmount', 'defaultDeliveryCharge', 'pricesIncludeVat', 'autoCloseWhenPaid'];

export async function getAdminSettings(ctx: Ctx) {
  requireCap(ctx, 'admin');
  invalidateSettings(ctx.orgId);
  return getSettings(ctx.orgId);
}

export async function updateSettings(ctx: Ctx, patch: Partial<RabsSettings>) {
  requireCap(ctx, 'admin');
  const before = await getSettings(ctx.orgId);
  const allowed: Array<keyof RabsSettings> = [
    'vatRate', 'pricesIncludeVat', 'depositMode', 'depositPercent', 'depositFixedAmount', 'depositMinAmount', 'autoCloseWhenPaid',
    'defaultDeliveryCharge', 'quoteValidityDays', 'jobPrefix', 'quotePrefix', 'invoicePrefix', 'documentFooter', 'quoteTerms', 'companyDetails',
    'nextJobNumber', 'nextQuoteNumber', 'nextInvoiceNumber'
  ];
  const upd: Partial<RabsSettings> = {};
  for (const k of allowed) if (patch[k] !== undefined) (upd as any)[k] = patch[k];
  for (const k of ['nextJobNumber', 'nextQuoteNumber', 'nextInvoiceNumber'] as const) {
    if (upd[k] !== undefined && Number(upd[k]) < Number(before[k])) throw bad('Document numbers can only move forward (to avoid duplicates)');
  }
  await repo(RabsSettings).update({ id: before.id }, upd);
  await audit(ctx, 'settings', before.id, 'Workflow settings', before, upd, SETTINGS_AUDITED);
  invalidateSettings(ctx.orgId);
  return getSettings(ctx.orgId);
}

// ---- Statuses & colours ---------------------------------------------------------

export async function listStatuses(ctx: Ctx) {
  return ensureStatuses(ctx.orgId);
}

export async function updateStatuses(ctx: Ctx, items: Array<{ code: string; label?: string; color?: string; textColor?: string; nextActionLabel?: string | null; isActive?: boolean }>) {
  requireCap(ctx, 'admin');
  const existing = await ensureStatuses(ctx.orgId);
  const map = new Map(existing.map((s) => [s.code, s]));
  for (const it of items) {
    const s = map.get(it.code);
    if (!s) throw bad(`Unknown status ${it.code}`);
    const upd: Partial<RabsStatus> = {};
    if (it.label !== undefined) upd.label = it.label.trim();
    if (it.color !== undefined) upd.color = it.color;
    if (it.textColor !== undefined) upd.textColor = it.textColor;
    if (it.nextActionLabel !== undefined) upd.nextActionLabel = it.nextActionLabel?.trim() || null;
    if (it.isActive !== undefined) upd.isActive = it.isActive;
    if (Object.keys(upd).length) {
      await repo(RabsStatus).update({ id: s.id }, upd);
      await audit(ctx, 'status', s.id, s.code, s, upd, ['label', 'color', 'textColor', 'nextActionLabel']);
    }
  }
  return ensureStatuses(ctx.orgId);
}

// ---- Product catalogue ---------------------------------------------------------------

const PRODUCT_AUDITED = ['costPrice', 'sellPrice', 'wastagePercent', 'calcMethod', 'unit', 'rollWidthM', 'packCoverageM2', 'accessoryFactor', 'isActive'];
export type ProductInput = Partial<Omit<RabsProduct, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>>;

function validateProduct(p: ProductInput & { calcMethod?: string }) {
  if (p.calcMethod === 'per_pack' && !(Number(p.packCoverageM2) > 0)) throw bad('Pack coverage (m² per pack) is required for pack-priced products');
  if (p.kind === 'accessory' && !p.accessoryBasis) throw bad('Choose how the accessory quantity is worked out (per m², per metre of wall, per door or each)');
}

export async function listProducts(ctx: Ctx, includeInactive = true) {
  requireCap(ctx, 'admin');
  return repo(RabsProduct).find({ where: { organizationId: ctx.orgId, ...(includeInactive ? {} : { isActive: true }) }, order: { kind: 'ASC', category: 'ASC', sortOrder: 'ASC', name: 'ASC' } });
}

export async function createProduct(ctx: Ctx, input: ProductInput) {
  requireCap(ctx, 'admin');
  validateProduct(input);
  const dup = await repo(RabsProduct).findOne({ where: { organizationId: ctx.orgId, code: input.code! } });
  if (dup) throw conflict(`Product code ${input.code} already exists`);
  const p = await repo(RabsProduct).save(repo(RabsProduct).create({ ...input, organizationId: ctx.orgId, isActive: input.isActive ?? true, defaultSelected: input.defaultSelected ?? false, sortOrder: input.sortOrder ?? 0, wastagePercent: input.wastagePercent ?? 0 }));
  await repo(RabsPriceAudit).insert({ organizationId: ctx.orgId, entity: 'product', entityId: p.id, entityLabel: p.name, field: 'created', oldValue: null, newValue: `cost £${p.costPrice} / sell £${p.sellPrice}`, changedBy: ctx.userId });
  return p;
}

export async function updateProduct(ctx: Ctx, id: string, input: ProductInput) {
  requireCap(ctx, 'admin');
  const p = await repo(RabsProduct).findOne({ where: { id, organizationId: ctx.orgId } });
  if (!p) throw notFound('Product');
  validateProduct({ ...p, ...input });
  if (input.code && input.code !== p.code) {
    const dup = await repo(RabsProduct).findOne({ where: { organizationId: ctx.orgId, code: input.code } });
    if (dup) throw conflict(`Product code ${input.code} already exists`);
  }
  await repo(RabsProduct).update({ id }, input);
  await audit(ctx, 'product', id, p.name, p, input, PRODUCT_AUDITED);
  return repo(RabsProduct).findOneOrFail({ where: { id } });
}

// ---- Labour / fitting price rules --------------------------------------------------------

export type LabourInput = Partial<Omit<RabsLabourRule, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>>;

export async function listLabour(ctx: Ctx) {
  requireCap(ctx, 'admin');
  return repo(RabsLabourRule).find({ where: { organizationId: ctx.orgId }, order: { category: 'ASC', name: 'ASC' } });
}

export async function createLabour(ctx: Ctx, input: LabourInput) {
  requireCap(ctx, 'admin');
  const r = await repo(RabsLabourRule).save(repo(RabsLabourRule).create({ ...input, organizationId: ctx.orgId, isActive: input.isActive ?? true, category: input.category || 'ANY' }));
  await repo(RabsPriceAudit).insert({ organizationId: ctx.orgId, entity: 'labour_rule', entityId: r.id, entityLabel: r.name, field: 'created', oldValue: null, newValue: `sell £${r.sellRate} ${r.basis}`, changedBy: ctx.userId });
  return r;
}

export async function updateLabour(ctx: Ctx, id: string, input: LabourInput) {
  requireCap(ctx, 'admin');
  const r = await repo(RabsLabourRule).findOne({ where: { id, organizationId: ctx.orgId } });
  if (!r) throw notFound('Labour rule');
  await repo(RabsLabourRule).update({ id }, input);
  await audit(ctx, 'labour_rule', id, r.name, r, input, ['costRate', 'sellRate', 'minCharge', 'basis', 'category', 'isActive']);
  return repo(RabsLabourRule).findOneOrFail({ where: { id } });
}

export async function listAudit(ctx: Ctx, limit = 200) {
  requireCap(ctx, 'admin');
  return AppDataSource.query(
    `SELECT a.*, TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) changedByName
       FROM rabs_price_audit a LEFT JOIN users u ON u.id = a.changed_by WHERE a.organization_id = ? ORDER BY a.id DESC LIMIT ?`,
    [ctx.orgId, Math.min(limit, 1000)]
  );
}

// ---- Permissions matrix & staff ----------------------------------------------------------------

export async function getPermissions(ctx: Ctx) {
  requireCap(ctx, 'admin');
  const s = await getSettings(ctx.orgId);
  const roles = await AppDataSource.query('SELECT code, name FROM roles WHERE organization_id = ? ORDER BY name', [ctx.orgId]);
  return { capabilities: CAPABILITIES, matrix: { ...DEFAULT_ROLE_PERMISSIONS, ...(s.rolePermissions || {}) }, roles };
}

export async function updatePermissions(ctx: Ctx, matrix: Record<string, string[]>) {
  requireCap(ctx, 'admin');
  const keys = new Set(CAPABILITIES.map((c) => c.key));
  for (const k of Object.keys(matrix)) if (!keys.has(k as any)) throw bad(`Unknown permission ${k}`);
  if (matrix.admin && !matrix.admin.includes('ADMIN')) throw bad('The ADMIN role must keep admin access');
  const s = await getSettings(ctx.orgId);
  await repo(RabsSettings).update({ id: s.id }, { rolePermissions: { ...(s.rolePermissions || {}), ...matrix } });
  await repo(RabsPriceAudit).insert({ organizationId: ctx.orgId, entity: 'permissions', entityId: null, entityLabel: 'Staff permissions', field: 'matrix', oldValue: null, newValue: Object.keys(matrix).join(', ').slice(0, 255), changedBy: ctx.userId });
  invalidateSettings(ctx.orgId);
  return getPermissions(ctx);
}

export async function ensureRabsRoles(orgId: string) {
  for (const r of RABS_ROLES) {
    const exists = await AppDataSource.query('SELECT id FROM roles WHERE organization_id = ? AND code = ?', [orgId, r.code]);
    if (!exists.length) {
      await AppDataSource.query('INSERT INTO roles (organization_id, name, code, permissions) VALUES (?, ?, ?, ?)', [orgId, r.name, r.code, JSON.stringify({ rabs: true, description: r.description })]);
    }
  }
}

export async function listStaff(ctx: Ctx) {
  requireCap(ctx, 'admin');
  return staffList(ctx.orgId);
}

export async function createStaff(ctx: Ctx, input: { email: string; firstName: string; lastName?: string | null; roleCode: string; password: string }) {
  requireCap(ctx, 'admin');
  await ensureRabsRoles(ctx.orgId);
  const email = input.email.trim().toLowerCase();
  const exists = await AppDataSource.query('SELECT id FROM users WHERE email = ?', [email]);
  if (exists.length) throw conflict('A user with this email already exists');
  const [role] = await AppDataSource.query('SELECT id FROM roles WHERE organization_id = ? AND code = ?', [ctx.orgId, input.roleCode]);
  if (!role) throw bad('Unknown role');
  if (input.roleCode === 'SUPER_ADMIN' && !ctx.roles.includes('SUPER_ADMIN')) throw bad('Only a super admin can create super admins');
  const hash = await hashPassword(input.password);
  const r = await AppDataSource.query(
    `INSERT INTO users (organization_id, email, password_hash, first_name, last_name, sso_provider, email_verified, status) VALUES (?, ?, ?, ?, ?, 'local', 1, 'active')`,
    [ctx.orgId, email, hash, input.firstName.trim(), input.lastName?.trim() || null]
  );
  const [bu] = await AppDataSource.query('SELECT id FROM business_units WHERE organization_id = ? ORDER BY id LIMIT 1', [ctx.orgId]);
  await AppDataSource.query('INSERT INTO role_assignments (user_id, role_id, business_unit_id) VALUES (?, ?, ?)', [r.insertId, role.id, bu?.id ?? null]);
  return (await staffList(ctx.orgId)).find((s: any) => s.id === String(r.insertId));
}

export async function setStaffRole(ctx: Ctx, userId: string, roleCode: string) {
  requireCap(ctx, 'admin');
  const [u] = await AppDataSource.query('SELECT id FROM users WHERE id = ? AND organization_id = ?', [userId, ctx.orgId]);
  if (!u) throw notFound('Staff member');
  if (userId === ctx.userId) throw bad("You can't change your own role");
  const [role] = await AppDataSource.query('SELECT id FROM roles WHERE organization_id = ? AND code = ?', [ctx.orgId, roleCode]);
  if (!role) throw bad('Unknown role');
  if (roleCode === 'SUPER_ADMIN' && !ctx.roles.includes('SUPER_ADMIN')) throw bad('Only a super admin can grant super admin');
  const [bu] = await AppDataSource.query('SELECT id FROM business_units WHERE organization_id = ? ORDER BY id LIMIT 1', [ctx.orgId]);
  await AppDataSource.query('DELETE FROM role_assignments WHERE user_id = ?', [userId]);
  await AppDataSource.query('INSERT INTO role_assignments (user_id, role_id, business_unit_id) VALUES (?, ?, ?)', [userId, role.id, bu?.id ?? null]);
  return (await staffList(ctx.orgId)).find((s: any) => s.id === String(userId));
}
