/**
 * Idempotent seed for the RABS one-click CRM workflow.
 * - RABS roles (OFFICE, SURVEYOR, FITTER, DRIVER) + sample staff (existing users are left untouched)
 * - Flooring/furniture catalogue with cost & sell prices, units, calc methods, stock in inventory
 * - Accessories, labour/fitting rules, 25% deposit rule, statuses & colours
 * - 20 customers driven through the real workflow services so every status is represented
 *
 * Usage: SEED_STAFF_PASSWORD='...' node dist/scripts/seedRabsWorkflow.js
 *        (staff password is only used when creating new staff users)
 */
import 'dotenv/config';
import zlib from 'zlib';
import { AppDataSource } from '../config/data-source.js';
import { hashPassword } from '../utils/password.js';
import { RabsProduct, RabsLabourRule, RabsCustomer, RabsJob, RabsMeasurement, RabsBooking } from '../entities/rabs/RabsEntities.js';
import { getSettings, ensureStatuses, invalidateSettings, todayISO, type Ctx } from '../services/rabs/rabsCore.js';
import { capabilitiesFor } from '../services/rabs/rabsWorkflow.js';
import { ensureRabsRoles } from '../services/rabs/rabsAdmin.js';
import * as J from '../services/rabs/rabsJobs.js';
import * as Q from '../services/rabs/rabsQuotes.js';
import * as O from '../services/rabs/rabsOps.js';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@rabsinteriors.app';
const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD || '';

const STAFF = [
  { email: 'manager@rabsinteriors.app', first: 'Rab', last: 'Manager', role: 'ADMIN' },
  { email: 'office@rabsinteriors.app', first: 'Sarah', last: 'Bennett', role: 'OFFICE' },
  { email: 'surveyor@rabsinteriors.app', first: 'James', last: 'Walker', role: 'SURVEYOR' },
  { email: 'fitter@rabsinteriors.app', first: 'Dave', last: 'Hughes', role: 'FITTER' },
  { email: 'fitter2@rabsinteriors.app', first: 'Mark', last: 'Taylor', role: 'FITTER' },
  { email: 'driver@rabsinteriors.app', first: 'Lee', last: 'Robinson', role: 'DRIVER' },
  { email: 'accounts@rabsinteriors.app', first: 'Priya', last: 'Shah', role: 'ACCOUNTANT' }
];

type P = Partial<RabsProduct> & { code: string; name: string; category: string; stock?: number };
const PRODUCTS: P[] = [
  { code: 'CPT-TWIST-4', name: 'Heathland Twist Carpet', category: 'Carpet', kind: 'flooring', unit: 'm2', calcMethod: 'per_m2', rollWidthM: 4, wastagePercent: 0, costPrice: 9.5, sellPrice: 18.99, colour: 'Oatmeal', supplier: 'Cormar', stock: 300 },
  { code: 'CPT-SAXONY-5', name: 'Cosy Saxony Carpet', category: 'Carpet', kind: 'flooring', unit: 'm2', calcMethod: 'per_m2', rollWidthM: 5, wastagePercent: 0, costPrice: 11, sellPrice: 22.99, colour: 'Silver', supplier: 'Victoria', stock: 250 },
  { code: 'CPT-BERBER-4', name: 'Wool Berber Loop Carpet', category: 'Carpet', kind: 'flooring', unit: 'm2', calcMethod: 'per_m2', rollWidthM: 4, wastagePercent: 0, costPrice: 17.5, sellPrice: 32.99, colour: 'Natural', supplier: 'Cormar', stock: 10 },
  { code: 'CPT-STAINFREE-4', name: 'Stainfree Supreme Carpet', category: 'Carpet', kind: 'flooring', unit: 'm2', calcMethod: 'per_m2', rollWidthM: 4, wastagePercent: 0, costPrice: 8, sellPrice: 15.99, colour: 'Charcoal', supplier: 'Abingdon', stock: 400 },
  { code: 'CPT-SQYD-TWIST', name: 'Budget Twist (priced per sq yd)', category: 'Carpet', kind: 'flooring', unit: 'sqyd', calcMethod: 'per_sqyd', rollWidthM: 4, wastagePercent: 0, costPrice: 5.5, sellPrice: 10.99, colour: 'Beige', supplier: 'Abingdon', stock: 300 },
  { code: 'VIN-CUSHION-4', name: 'Cushion Floor Vinyl', category: 'Vinyl', kind: 'flooring', unit: 'm2', calcMethod: 'per_m2', rollWidthM: 4, wastagePercent: 0, costPrice: 7.5, sellPrice: 14.99, colour: 'Grey Oak', supplier: 'Tarkett', stock: 150 },
  { code: 'VIN-SAFETY-2', name: 'Safety Vinyl (anti-slip)', category: 'Vinyl', kind: 'flooring', unit: 'm2', calcMethod: 'per_m2', rollWidthM: 2, wastagePercent: 0, costPrice: 14, sellPrice: 26.99, colour: 'Slate', supplier: 'Polyflor', stock: 60 },
  { code: 'LAM-8MM-OAK', name: '8mm Laminate', category: 'Laminate', kind: 'flooring', unit: 'pack', calcMethod: 'per_pack', packCoverageM2: 2.22, wastagePercent: 10, costPrice: 14.5, sellPrice: 27.99, colour: 'Natural Oak', supplier: 'Kronotex', stock: 120 },
  { code: 'LAM-12MM-ASH', name: '12mm AC5 Laminate', category: 'Laminate', kind: 'flooring', unit: 'pack', calcMethod: 'per_pack', packCoverageM2: 1.48, wastagePercent: 10, costPrice: 16, sellPrice: 31.99, colour: 'Grey Ash', supplier: 'Kaindl', stock: 80 },
  { code: 'LVT-CLICK-HERR', name: 'Click LVT Herringbone', category: 'LVT', kind: 'flooring', unit: 'm2', calcMethod: 'per_m2', wastagePercent: 10, costPrice: 18, sellPrice: 34.99, colour: 'Honey Oak', supplier: 'Karndean', stock: 0 },
  { code: 'LVT-GLUE-STONE', name: 'Glue-down LVT Stone Tile', category: 'LVT', kind: 'flooring', unit: 'm2', calcMethod: 'per_m2', wastagePercent: 10, costPrice: 15, sellPrice: 29.99, colour: 'Portland Stone', supplier: 'Amtico', stock: 90 },
  { code: 'FLR-ENG-OAK', name: 'Engineered Oak Flooring 14mm', category: 'Flooring', kind: 'flooring', unit: 'm2', calcMethod: 'per_m2', wastagePercent: 8, costPrice: 28, sellPrice: 49.99, colour: 'Brushed Oak', supplier: 'V4', stock: 60 },
  { code: 'BED-DBL-DIVAN', name: 'Double Divan Bed & Mattress', category: 'Beds', kind: 'furniture', unit: 'item', calcMethod: 'per_item', costPrice: 180, sellPrice: 349, colour: 'Grey Plush', supplier: 'Sweet Dreams', stock: 6 },
  { code: 'BED-KING-OTTO', name: 'King Size Ottoman Bed', category: 'Beds', kind: 'furniture', unit: 'item', calcMethod: 'per_item', costPrice: 260, sellPrice: 499, colour: 'Charcoal', supplier: 'Birlea', stock: 3 },
  { code: 'SOFA-3S-GREY', name: '3 Seater Fabric Sofa', category: 'Sofas', kind: 'furniture', unit: 'item', calcMethod: 'per_item', costPrice: 320, sellPrice: 649, colour: 'Grey', supplier: 'SofaHouse', stock: 4 },
  { code: 'SOFA-CORNER-CH', name: 'Chesterfield Corner Sofa', category: 'Sofas', kind: 'furniture', unit: 'item', calcMethod: 'per_item', costPrice: 540, sellPrice: 999, colour: 'Oxblood', supplier: 'SofaHouse', stock: 2 },
  { code: 'FUR-WARD-2D', name: '2 Door Wardrobe', category: 'Furniture', kind: 'furniture', unit: 'item', calcMethod: 'per_item', costPrice: 120, sellPrice: 229, colour: 'White', supplier: 'Seconique', stock: 5 },
  { code: 'FUR-TV-OAK', name: 'Oak TV Unit', category: 'Furniture', kind: 'furniture', unit: 'item', calcMethod: 'per_item', costPrice: 85, sellPrice: 169, colour: 'Oak', supplier: 'Seconique', stock: 7 },
  // Accessories (tick boxes on the measurement page)
  { code: 'ACC-UNDERLAY-10', name: 'Underlay 10mm PU', category: 'Accessory', kind: 'accessory', unit: 'm2', calcMethod: 'per_m2', accessoryBasis: 'area', accessoryFactor: 1, wastagePercent: 5, appliesTo: ['Carpet'], defaultSelected: true, costPrice: 2.2, sellPrice: 4.99, stock: 600 },
  { code: 'ACC-GRIPPER', name: 'Gripper Rod', category: 'Accessory', kind: 'accessory', unit: 'linear_m', calcMethod: 'per_linear_m', accessoryBasis: 'perimeter', accessoryFactor: 1, appliesTo: ['Carpet'], defaultSelected: true, costPrice: 0.35, sellPrice: 1.2, stock: 1000 },
  { code: 'ACC-DOORBAR', name: 'Door Bar (threshold)', category: 'Accessory', kind: 'accessory', unit: 'item', calcMethod: 'per_item', accessoryBasis: 'door', accessoryFactor: 1, appliesTo: [], defaultSelected: true, costPrice: 4, sellPrice: 12.99, stock: 80 },
  { code: 'ACC-UNDERLAY-LAM', name: 'Laminate / LVT Underlay 3mm', category: 'Accessory', kind: 'accessory', unit: 'm2', calcMethod: 'per_m2', accessoryBasis: 'area', accessoryFactor: 1, wastagePercent: 5, appliesTo: ['Laminate', 'Flooring', 'LVT'], defaultSelected: true, costPrice: 1.1, sellPrice: 2.99, stock: 400 },
  { code: 'ACC-SCOTIA', name: 'Scotia Beading (2.4m length)', category: 'Accessory', kind: 'accessory', unit: 'item', calcMethod: 'per_item', accessoryBasis: 'perimeter', accessoryFactor: 0.417, appliesTo: ['Laminate', 'Flooring', 'LVT'], defaultSelected: true, costPrice: 1.5, sellPrice: 4.99, stock: 200 },
  { code: 'ACC-ADHESIVE', name: 'Flooring Adhesive (15 m² tub)', category: 'Accessory', kind: 'accessory', unit: 'pack', calcMethod: 'per_pack', packCoverageM2: 15, accessoryBasis: 'area', accessoryFactor: 1, appliesTo: ['Vinyl', 'LVT'], defaultSelected: false, costPrice: 18, sellPrice: 34.99, stock: 30 },
  { code: 'ACC-LATEX', name: 'Floor Levelling Latex (20kg bag)', category: 'Accessory', kind: 'accessory', unit: 'item', calcMethod: 'per_item', accessoryBasis: 'area', accessoryFactor: 0.2, appliesTo: ['Vinyl', 'LVT', 'Laminate', 'Flooring'], defaultSelected: false, costPrice: 12, sellPrice: 24.99, stock: 40 },
  { code: 'ACC-UPLIFT', name: 'Uplift & dispose of old flooring', category: 'Accessory', kind: 'accessory', unit: 'm2', calcMethod: 'per_m2', accessoryBasis: 'area', accessoryFactor: 1, appliesTo: [], defaultSelected: false, costPrice: 1, sellPrice: 3 },
  { code: 'ACC-STAIRRODS', name: 'Decorative Stair Rods (set)', category: 'Accessory', kind: 'accessory', unit: 'item', calcMethod: 'per_item', accessoryBasis: 'each', accessoryFactor: 1, appliesTo: ['Carpet'], defaultSelected: false, costPrice: 45, sellPrice: 89, stock: 5 }
];

const LABOUR: Array<Partial<RabsLabourRule> & { name: string }> = [
  { name: 'Carpet fitting', category: 'Carpet', basis: 'per_m2', costRate: 3.5, sellRate: 6, minCharge: 60 },
  { name: 'Stair carpet fitting (per stair)', category: 'Carpet', roomType: 'Stairs', basis: 'per_stair', costRate: 5, sellRate: 8, minCharge: 0 },
  { name: 'Vinyl fitting', category: 'Vinyl', basis: 'per_m2', costRate: 3, sellRate: 5.5, minCharge: 50 },
  { name: 'Laminate fitting', category: 'Laminate', basis: 'per_m2', costRate: 7, sellRate: 12, minCharge: 80 },
  { name: 'LVT fitting', category: 'LVT', basis: 'per_m2', costRate: 9, sellRate: 16, minCharge: 90 },
  { name: 'Wood flooring fitting', category: 'Flooring', basis: 'per_m2', costRate: 10, sellRate: 18, minCharge: 100 },
  { name: 'Bed assembly', category: 'Beds', basis: 'per_item', costRate: 15, sellRate: 30, minCharge: 0 },
  { name: 'Furniture assembly', category: 'Furniture', basis: 'per_item', costRate: 10, sellRate: 25, minCharge: 0 }
];

type Room = { name: string; l?: number; w?: number; ft?: [number, number, number, number]; product: string; qty?: number; stairs?: number; doors?: number };
type Target =
  | 'NEW' | 'APPOINTMENT' | 'MEASUREMENT' | 'QUOTE_DRAFT' | 'QUOTE_SENT' | 'ACCEPTED' | 'DEPOSIT_PENDING' | 'CONFIRMED' | 'MATERIALS_PENDING'
  | 'READY_TO_FIT' | 'DELIVERY_REQUIRED' | 'FITTING_BOOKED' | 'FITTING_TODAY' | 'FITTING_COMPLETE' | 'DELIVERY_BOOKED' | 'DELIVERY_COMPLETE'
  | 'BALANCE_PENDING' | 'FULLY_PAID' | 'ISSUE' | 'CLOSED';
type Scenario = { name: string; phone: string; email?: string; addr: string; city: string; postcode: string; source: string; target: Target; rooms: Room[]; discount?: number; delivery?: boolean };

const S: Scenario[] = [
  { name: 'Emma Collins', phone: '07700 900101', email: 'emma.collins@example.co.uk', addr: '14 Hartshill Road', city: 'Stoke-on-Trent', postcode: 'ST4 7NQ', source: 'Facebook', target: 'NEW', rooms: [] },
  { name: 'Tom Harris', phone: '07700 900102', addr: '3 Moorland Road', city: 'Burslem', postcode: 'ST6 1DS', source: 'Phone', target: 'APPOINTMENT', rooms: [] },
  { name: 'Rachel Green', phone: '07700 900103', email: 'rachel.green@example.co.uk', addr: '27 Victoria Park Road', city: 'Tunstall', postcode: 'ST6 6DX', source: 'Walk-in', target: 'MEASUREMENT', rooms: [{ name: 'Lounge', l: 4.2, w: 3.6, product: 'CPT-SAXONY-5' }] },
  { name: 'Paul Wright', phone: '07700 900104', addr: '8 Leek Road', city: 'Hanley', postcode: 'ST1 3NP', source: 'Website', target: 'QUOTE_DRAFT', rooms: [{ name: 'Kitchen', l: 3.8, w: 3.1, product: 'LAM-8MM-OAK' }, { name: 'Hall', l: 4.5, w: 1.2, product: 'LAM-8MM-OAK' }] },
  { name: 'Karen Hughes', phone: '07700 900105', email: 'karen.h@example.co.uk', addr: '51 Uttoxeter Road', city: 'Longton', postcode: 'ST3 1NY', source: 'Instagram', target: 'QUOTE_SENT', rooms: [{ name: 'Dining Room', l: 4, w: 3.5, product: 'LVT-CLICK-HERR' }] },
  { name: 'Steve Mills', phone: '07700 900106', addr: '19 Newcastle Road', city: 'Stoke-on-Trent', postcode: 'ST4 6PR', source: 'Referral', target: 'ACCEPTED', rooms: [{ name: 'Bedroom 1', ft: [12, 6, 10, 0], product: 'CPT-TWIST-4' }] },
  { name: 'Linda Baker', phone: '07700 900107', addr: '6 Chell Heath Road', city: 'Chell', postcode: 'ST6 6PD', source: 'Phone', target: 'DEPOSIT_PENDING', rooms: [{ name: 'Lounge', l: 5.2, w: 3.9, product: 'CPT-STAINFREE-4' }] },
  { name: 'Andrew Clarke', phone: '07700 900108', addr: '42 Trentham Road', city: 'Longton', postcode: 'ST3 4DP', source: 'Repeat customer', target: 'CONFIRMED', rooms: [{ name: 'Bathroom', l: 2.4, w: 1.9, product: 'VIN-CUSHION-4' }] },
  { name: 'Helen Turner', phone: '07700 900109', email: 'helen.turner@example.co.uk', addr: '11 Basford Park Road', city: 'Newcastle-under-Lyme', postcode: 'ST5 0PT', source: 'Walk-in', target: 'MATERIALS_PENDING', rooms: [{ name: 'Lounge', l: 5, w: 4, product: 'CPT-BERBER-4' }] },
  { name: 'Mohammed Khan', phone: '07700 900110', addr: '88 Waterloo Road', city: 'Burslem', postcode: 'ST6 3EX', source: 'WhatsApp', target: 'READY_TO_FIT', rooms: [{ name: 'Bedroom 2', l: 3.5, w: 3, product: 'CPT-TWIST-4' }, { name: 'Box Room', l: 2.4, w: 2.1, product: 'CPT-TWIST-4' }] },
  { name: 'Joanne Price', phone: '07700 900111', addr: '2 Sneyd Street', city: 'Cobridge', postcode: 'ST6 2NP', source: 'TikTok', target: 'DELIVERY_REQUIRED', rooms: [{ name: 'Lounge', product: 'SOFA-3S-GREY', qty: 1 }], delivery: true },
  { name: 'Chris Edwards', phone: '07700 900112', addr: '35 Hanley Road', city: 'Sneyd Green', postcode: 'ST1 6BG', source: 'Facebook', target: 'FITTING_BOOKED', rooms: [{ name: 'Hall, Stairs & Landing', l: 4, w: 1, stairs: 13, product: 'CPT-SAXONY-5' }] },
  { name: 'Sophie Allen', phone: '07700 900113', email: 'sophie.allen@example.co.uk', addr: '9 Birches Head Road', city: 'Hanley', postcode: 'ST1 6LH', source: 'Website', target: 'FITTING_TODAY', rooms: [{ name: 'Lounge', l: 4.8, w: 3.7, product: 'CPT-TWIST-4' }, { name: 'Bedroom 1', l: 3.9, w: 3.4, product: 'CPT-TWIST-4' }] },
  { name: 'Ian Wood', phone: '07700 900114', addr: '17 Etruria Road', city: 'Hanley', postcode: 'ST1 5NQ', source: 'Referral', target: 'FITTING_COMPLETE', rooms: [{ name: 'Kitchen', l: 4.1, w: 3.2, product: 'LVT-GLUE-STONE' }] },
  { name: 'Natalie Scott', phone: '07700 900115', addr: '23 Greenbank Road', city: 'Tunstall', postcode: 'ST6 7EY', source: 'Walk-in', target: 'DELIVERY_BOOKED', rooms: [{ name: 'Bedroom 1', product: 'BED-KING-OTTO', qty: 1 }], delivery: true },
  { name: 'Barry Cooper', phone: '07700 900116', addr: '60 Weston Road', city: 'Meir', postcode: 'ST3 6AB', source: 'Phone', target: 'DELIVERY_COMPLETE', rooms: [{ name: 'Bedroom 2', product: 'FUR-WARD-2D', qty: 1 }], delivery: true },
  { name: 'Margaret Hill', phone: '07700 900117', email: 'm.hill@example.co.uk', addr: '4 Queens Road', city: 'Penkhull', postcode: 'ST4 7LH', source: 'Repeat customer', target: 'BALANCE_PENDING', rooms: [{ name: 'Lounge', l: 5.5, w: 4.2, product: 'FLR-ENG-OAK' }], discount: 5 },
  { name: 'Daniel Ward', phone: '07700 900118', addr: '31 Werrington Road', city: 'Bucknall', postcode: 'ST2 9AF', source: 'Instagram', target: 'FULLY_PAID', rooms: [{ name: 'Bedroom 3', l: 3, w: 2.7, product: 'CPT-SQYD-TWIST' }] },
  { name: 'Julie Morgan', phone: '07700 900119', addr: '12 Station Road', city: 'Kidsgrove', postcode: 'ST7 4AR', source: 'Facebook', target: 'ISSUE', rooms: [{ name: 'Conservatory', l: 3.6, w: 3, product: 'LAM-12MM-ASH' }] },
  { name: 'Peter Lawson', phone: '07700 900120', email: 'peter.lawson@example.co.uk', addr: '76 Lightwood Road', city: 'Longton', postcode: 'ST3 4JR', source: 'Referral', target: 'CLOSED', rooms: [{ name: 'Lounge', l: 5, w: 4, product: 'CPT-TWIST-4' }, { name: 'Bedroom 1', l: 4, w: 3, product: 'CPT-TWIST-4' }] }
];

const ORDER: Target[] = ['NEW', 'APPOINTMENT', 'MEASUREMENT', 'QUOTE_DRAFT', 'QUOTE_SENT', 'ACCEPTED', 'DEPOSIT_PENDING', 'CONFIRMED', 'MATERIALS_PENDING', 'READY_TO_FIT', 'FITTING_BOOKED', 'FITTING_COMPLETE', 'BALANCE_PENDING', 'FULLY_PAID', 'CLOSED'];
const rank = (t: Target) => {
  const map: Partial<Record<Target, Target>> = { DELIVERY_REQUIRED: 'READY_TO_FIT', FITTING_TODAY: 'FITTING_BOOKED', DELIVERY_BOOKED: 'FITTING_BOOKED', DELIVERY_COMPLETE: 'FITTING_COMPLETE', ISSUE: 'FITTING_COMPLETE' };
  return ORDER.indexOf(map[t] ?? t);
};

function dayOffset(n: number) {
  const d = new Date(`${todayISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Minimal PNG encoder for seed photos / signatures (no external deps).
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w: number, h: number, px: (x: number, y: number) => [number, number, number]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const roomPhoto = (seed: number) =>
  png(160, 120, (x, y) => {
    const floor = y > 70;
    const stripe = Math.floor((x + seed * 7) / 20) % 2 === 0;
    return floor ? (stripe ? [150, 110, 70] : [135, 98, 60]) : [225 - (seed % 5) * 10, 220, 205];
  });
const signaturePng = () =>
  png(300, 100, (x, y) => {
    const curve = 50 + Math.sin(x / 18) * 25 * Math.cos(x / 60);
    return Math.abs(y - curve) < 2 && x > 20 && x < 280 ? [20, 20, 60] : [255, 255, 255];
  });
const asFile = (buf: Buffer, name: string) => ({ buffer: buf, originalname: name, mimetype: 'image/png', size: buf.length } as Express.Multer.File);

async function main() {
  await AppDataSource.initialize();
  const ds = AppDataSource;
  const [admin] = await ds.query('SELECT id, organization_id orgId FROM users WHERE email = ?', [ADMIN_EMAIL]);
  if (!admin) throw new Error(`Admin user ${ADMIN_EMAIL} not found — run seedRabsReference first`);
  const orgId = String(admin.orgId);
  console.log('Organization', orgId);

  await ensureRabsRoles(orgId);
  await getSettings(orgId);
  await ds.query(
    `UPDATE rabs_settings SET deposit_mode='percent', deposit_percent=25, default_delivery_charge=35,
       company_details = COALESCE(company_details, CAST(? AS JSON)) WHERE organization_id = ?`,
    [JSON.stringify({ name: 'RABS Carpets & Furniture', tagline: 'Turning Houses Into Homes', address: '194 Waterloo Road, Stoke-on-Trent ST6 3HF', phone: '07774 596 596', email: 'info@rabsinteriors.app' }), orgId]
  );
  invalidateSettings(orgId);
  await ensureStatuses(orgId);

  // Staff
  const [bu] = await ds.query('SELECT id FROM business_units WHERE organization_id = ? ORDER BY id LIMIT 1', [orgId]);
  const staffIds: Record<string, string> = {};
  for (const s of STAFF) {
    let [u] = await ds.query('SELECT id FROM users WHERE email = ?', [s.email]);
    if (!u) {
      if (!STAFF_PASSWORD) throw new Error('SEED_STAFF_PASSWORD is required to create staff users');
      const r = await ds.query(
        "INSERT INTO users (organization_id, email, password_hash, first_name, last_name, sso_provider, email_verified, status) VALUES (?, ?, ?, ?, ?, 'local', 1, 'active')",
        [orgId, s.email, await hashPassword(STAFF_PASSWORD), s.first, s.last]
      );
      u = { id: r.insertId };
      console.log('Created staff', s.email, s.role);
    }
    const [role] = await ds.query('SELECT id FROM roles WHERE organization_id = ? AND code = ?', [orgId, s.role]);
    const has = await ds.query('SELECT id FROM role_assignments WHERE user_id = ? AND role_id = ?', [u.id, role.id]);
    if (!has.length) await ds.query('INSERT INTO role_assignments (user_id, role_id, business_unit_id) VALUES (?, ?, ?)', [u.id, role.id, bu?.id ?? null]);
    staffIds[s.email] = String(u.id);
  }

  // Warehouse for RABS stock
  const [loc] = await ds.query(
    'SELECT l.id FROM locations l JOIN business_units b ON b.id = l.business_unit_id WHERE b.organization_id = ? ORDER BY l.id LIMIT 1',
    [orgId]
  );
  if (!loc) console.warn('No location found — stock will not be linked');
  let [wh] = await ds.query("SELECT id FROM warehouses WHERE code = 'RABS-SHOWROOM'");
  if (!wh && loc) {
    const r = await ds.query("INSERT INTO warehouses (location_id, code, name, type, country_code, status) VALUES (?, 'RABS-SHOWROOM', 'RABS Showroom & Store (Waterloo Road)', 'store', 'GB', 'active')", [loc.id]);
    wh = { id: r.insertId };
  }

  // Products (+ catalog item / variant / stock so material checks use real inventory)
  const prodRepo = ds.getRepository(RabsProduct);
  const products = new Map<string, RabsProduct>();
  let sort = 0;
  for (const p of PRODUCTS) {
    const { stock, ...fields } = p;
    let row = await prodRepo.findOne({ where: { organizationId: orgId, code: p.code } });
    if (!row) {
      row = await prodRepo.save(prodRepo.create({ ...fields, organizationId: orgId, isActive: true, defaultSelected: p.defaultSelected ?? false, wastagePercent: p.wastagePercent ?? 0, sortOrder: sort }));
    }
    sort++;
    if (!row.variantId && stock !== undefined && wh) {
      const sku = `RABSW-${p.code}`;
      let [ci] = await ds.query('SELECT id FROM catalog_items WHERE organization_id = ? AND sku = ?', [orgId, sku]);
      if (!ci) {
        const r = await ds.query(
          "INSERT INTO catalog_items (organization_id, sku, name, category, brand, uom, cost_price, selling_price, currency, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GBP', 'active')",
          [orgId, sku, `${p.name}${p.colour ? ` — ${p.colour}` : ''}`, p.category, p.supplier ?? null, p.unit, p.costPrice, p.sellPrice]
        );
        ci = { id: r.insertId };
      }
      let [v] = await ds.query('SELECT id FROM variants WHERE variant_sku = ?', [sku]);
      if (!v) {
        const r = await ds.query("INSERT INTO variants (catalog_item_id, variant_sku, status) VALUES (?, ?, 'active')", [ci.id, sku]);
        v = { id: r.insertId };
      }
      const [si] = await ds.query('SELECT id FROM stock_items WHERE variant_id = ? AND warehouse_id = ?', [v.id, wh.id]);
      if (!si) await ds.query("INSERT INTO stock_items (variant_id, warehouse_id, quantity_on_hand, quantity_reserved, status) VALUES (?, ?, ?, 0, 'available')", [v.id, wh.id, stock]);
      await prodRepo.update({ id: row.id }, { variantId: String(v.id) });
      row.variantId = String(v.id);
    }
    products.set(p.code, row);
  }
  console.log('Products', products.size);

  const labourRepo = ds.getRepository(RabsLabourRule);
  for (const l of LABOUR) {
    const exists = await labourRepo.findOne({ where: { organizationId: orgId, name: l.name } });
    if (!exists) await labourRepo.save(labourRepo.create({ ...l, organizationId: orgId, isActive: true, category: l.category ?? 'ANY' }));
  }

  // Sample journeys
  const settings = await getSettings(orgId);
  const ctx: Ctx = { orgId, userId: staffIds['office@rabsinteriors.app'], roles: ['SUPER_ADMIN'], caps: new Set(capabilitiesFor(['SUPER_ADMIN'], null)), settings };
  const surveyor = staffIds['surveyor@rabsinteriors.app'];
  const fitters = [staffIds['fitter@rabsinteriors.app'], staffIds['fitter2@rabsinteriors.app']];
  const driver = staffIds['driver@rabsinteriors.app'];

  let i = 0;
  for (const s of S) {
    i++;
    const exists = await ds.getRepository(RabsCustomer).findOne({ where: { organizationId: orgId, phone: s.phone } });
    if (exists) {
      console.log('skip (exists):', s.name);
      continue;
    }
    const r = rank(s.target);
    const cust = await J.createCustomer(ctx, { name: s.name, phone: s.phone, email: s.email, addressLine1: s.addr, city: s.city, postcode: s.postcode, source: s.source });
    const job = await J.createJob(ctx, { customerId: cust.id, requiresFitting: !s.delivery, requiresDelivery: !!s.delivery });
    if (s.target === 'NEW') continue;
    const apptDay = r >= rank('MEASUREMENT') ? -(20 - i) : 1;
    await J.createAppointment(ctx, job.id, { scheduledAt: `${dayOffset(apptDay)}T10:30:00`, purpose: 'measure', staffUserId: surveyor, notes: 'Park on the drive' });
    if (r < rank('MEASUREMENT')) continue;

    const m = await J.startMeasurement(ctx, job.id);
    for (const [ri, room] of s.rooms.entries()) {
      const product = products.get(room.product)!;
      const added = await J.addRoom(ctx, m.id, {
        name: room.name,
        unitInput: room.ft ? 'ftin' : 'm',
        lengthM: room.l,
        widthM: room.w,
        lengthFt: room.ft?.[0],
        lengthIn: room.ft?.[1],
        widthFt: room.ft?.[2],
        widthIn: room.ft?.[3],
        stairs: room.stairs ?? 0,
        doors: room.doors ?? (product.kind === 'furniture' ? 0 : 1),
        productId: product.id,
        productQty: room.qty ?? null
      });
      if (product.kind !== 'furniture') await J.addRoomPhotos(ctx, added.id, [asFile(roomPhoto(i + ri), `${room.name}.png`)]);
    }
    if (r < rank('QUOTE_DRAFT')) continue;

    const q = await Q.createQuoteFromMeasurement(ctx, job.id);
    if (s.discount) await Q.updateQuote(ctx, q.id, { discountType: 'percent', discountValue: s.discount });
    if (r < rank('QUOTE_SENT')) continue;
    await Q.sendQuote(ctx, q.id);
    if (r < rank('ACCEPTED')) continue;
    await Q.acceptQuote(ctx, q.id, { acceptedByName: s.name, convert: r >= rank('DEPOSIT_PENDING') });
    if (r < rank('CONFIRMED')) continue;

    const fresh = await ds.getRepository(RabsJob).findOneOrFail({ where: { id: job.id } });
    await O.recordPayment(ctx, job.id, { amount: fresh.depositRequired, method: i % 2 ? 'card' : 'bank_transfer', reference: `DEP-${fresh.jobNumber}` });
    if (r < rank('MATERIALS_PENDING')) continue;
    await O.checkMaterials(ctx, job.id);
    if (s.target === 'MATERIALS_PENDING' || r < rank('FITTING_BOOKED')) continue;

    const type = s.delivery ? 'delivery' : 'fitting';
    const staff = type === 'delivery' ? driver : fitters[i % 2 === 0 ? 0 : 1];
    const bookDay = s.target === 'FITTING_TODAY' ? 0 : r === rank('FITTING_BOOKED') ? 2 + (i % 4) : -(12 - (i % 5));
    const b = await O.bookWork(ctx, job.id, { type, scheduledDate: dayOffset(bookDay), slot: i % 2 ? 'AM' : 'PM', staffUserId: s.target === 'FITTING_TODAY' ? fitters[0] : staff, instructions: 'Customer has a dog — please close the gate.' });
    if (r < rank('FITTING_COMPLETE')) continue;

    const booking = await ds.getRepository(RabsBooking).findOneOrFail({ where: { jobId: job.id, type } });
    await O.startBooking(ctx, booking.id);
    await O.addBookingPhotos(ctx, booking.id, 'before', [asFile(roomPhoto(i + 3), 'before.png')]);
    await O.updateChecklist(ctx, booking.id, (booking.checklist || []).map((c) => ({ ...c, done: true })));
    await O.addBookingPhotos(ctx, booking.id, 'after', [asFile(roomPhoto(i + 9), 'after.png')]);
    await O.saveSignature(ctx, booking.id, `data:image/png;base64,${signaturePng().toString('base64')}`, s.name);
    await O.completeBooking(ctx, booking.id, 'All done, customer happy.');
    void b;
    if (s.target === 'ISSUE') {
      await O.raiseIssue(ctx, job.id, 'Customer reports a lifting seam near the conservatory doors — revisit needed');
      continue;
    }
    if (r < rank('BALANCE_PENDING')) continue;
    await O.generateInvoice(ctx, job.id);
    if (r < rank('FULLY_PAID')) continue;
    const j2 = await ds.getRepository(RabsJob).findOneOrFail({ where: { id: job.id } });
    await O.recordPayment(ctx, job.id, { amount: j2.balanceDue, method: 'card', reference: `BAL-${j2.jobNumber}` });
    if (r < rank('CLOSED')) continue;
    await O.closeJob(ctx, job.id, {});
  }

  const summary = await ds.query('SELECT status, COUNT(*) n FROM rabs_jobs WHERE organization_id = ? GROUP BY status ORDER BY status', [orgId]);
  console.table(summary);
  const meas = await ds.getRepository(RabsMeasurement).count();
  console.log('Measurements:', meas);
  await ds.destroy();
  console.log('RABS workflow seed complete.');
}

main().catch(async (e) => {
  console.error(e);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
