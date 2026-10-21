import fs from 'fs/promises';
import path from 'path';
import { AppDataSource } from '@config/data-source.js';
import { ChannelConnection } from '@entities/catalog/ChannelConnection.js';
import { decryptJson } from '@utils/credentialCrypto.js';
import { fetchGoodTillOrders } from '@services/import/goodtillOrderImport.js';
import { fetchWooOrders } from '@services/import/wooOrderImport.js';
import { runOrderImport } from '@services/import/orderImportService.js';
import type { GoodTillCredentials } from '@services/import/goodtillApiClient.js';
import type { WordPressApiCredentials } from '@services/import/wordpressApiImport.js';
import type { ParsedExternalOrder } from '@services/import/externalOrderTypes.js';

const DEFAULT_DAYS = 90;
const FIRST_RUN_LOOKBACK_HOURS = 48;
const CURSOR_OVERLAP_MS = 15 * 60 * 1000;

export interface ChannelFetchInput {
  from?: string;
  to?: string;
  includeVoided?: boolean;
  statuses?: string[];
  maxOrders?: number;
  /** WooCommerce only: filter on order creation (default) or last-modified date. */
  dateField?: 'created' | 'modified';
}

export interface ConnectionSyncState {
  lastSyncedAt?: string;
  lastTrigger?: 'manual' | 'cron';
  cronCursor?: string;
  lastCronRunAt?: string;
  lastCronError?: string | null;
  lastCronResult?: { fetched: number; created: number; updated: number };
}

const stateFile = path.resolve(process.cwd(), process.env.CHANNEL_SYNC_STATE_FILE || 'data/channel-sync-state.json');

async function readState(): Promise<Record<string, ConnectionSyncState>> {
  try {
    return JSON.parse(await fs.readFile(stateFile, 'utf8')) as Record<string, ConnectionSyncState>;
  } catch {
    return {};
  }
}

async function patchState(connectionId: string, patch: ConnectionSyncState): Promise<void> {
  const state = await readState();
  state[connectionId] = { ...state[connectionId], ...patch };
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
}

export function resolveRange(input: { from?: string; to?: string }): { from: Date; to: Date } {
  const to = input.to ? new Date(input.to) : new Date();
  const from = input.from
    ? new Date(input.from)
    : new Date(to.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error('Invalid from/to date');
  }
  return { from, to };
}

function isGoodTillConnection(conn: ChannelConnection): boolean {
  // Some legacy Good Till rows were saved with an empty channel value.
  return conn.channel === 'goodtill' || (!conn.channel && (conn.storeUrl ?? '').includes('thegoodtill.com'));
}

export async function loadConnection(connectionId: string, organizationId: string): Promise<ChannelConnection> {
  const conn = await AppDataSource.getRepository(ChannelConnection).findOne({
    where: { id: connectionId, organization: { id: organizationId } },
    relations: ['organization']
  });
  if (!conn) throw new Error('Channel connection not found for this organization');
  if (conn.status !== 'active') throw new Error(`Connection "${conn.name}" is inactive`);
  return conn;
}

/** Fetch and map orders from whichever channel the connection points at. */
export async function fetchOrdersForConnection(
  conn: ChannelConnection,
  input: ChannelFetchInput
): Promise<ParsedExternalOrder[]> {
  const { from, to } = resolveRange(input);

  if (isGoodTillConnection(conn)) {
    // `Omit<T, never>` gives the mapped type an implicit index signature,
    // matching how the catalog controllers call decryptJson.
    const creds = decryptJson<Omit<GoodTillCredentials, never>>(conn.credentialsEncrypted);
    return fetchGoodTillOrders(creds, {
      connectionId: conn.id,
      from,
      to,
      includeVoided: input.includeVoided ?? false,
      maxSales: input.maxOrders
    });
  }

  if (conn.channel === 'wordpress' || conn.channel === 'woocommerce') {
    const raw = decryptJson<Omit<WordPressApiCredentials, never>>(conn.credentialsEncrypted);
    const creds: WordPressApiCredentials = {
      ...raw,
      storeUrl: raw.storeUrl ?? conn.storeUrl ?? ''
    };
    if (!creds.storeUrl) throw new Error('Connection has no store URL');
    return fetchWooOrders(creds, {
      connectionId: conn.id,
      from,
      to,
      statuses: input.statuses,
      maxOrders: input.maxOrders,
      dateField: input.dateField
    });
  }

  throw new Error(`Order sync is not supported for channel "${conn.channel}"`);
}

export async function recordManualSync(connectionId: string): Promise<void> {
  await patchState(connectionId, { lastSyncedAt: new Date().toISOString(), lastTrigger: 'manual' });
}

export async function getSyncStatus(organizationId?: string) {
  const state = await readState();
  const qb = AppDataSource.getRepository(ChannelConnection)
    .createQueryBuilder('c')
    .leftJoin('c.organization', 'org')
    .select(['c.id']);
  if (organizationId) qb.where('org.id = :organizationId', { organizationId });
  const ids = (await qb.getMany()).map((c) => String(c.id));
  return {
    cronEnabled: isCronEnabled(),
    intervalMinutes: intervalMinutes(),
    connections: Object.fromEntries(ids.map((id) => [id, state[id] ?? {}]))
  };
}

function isCronEnabled(): boolean {
  return (process.env.CHANNEL_SYNC_CRON || '').toLowerCase() === 'on';
}

function intervalMinutes(): number {
  const n = Number(process.env.CHANNEL_SYNC_INTERVAL_MIN || 15);
  return Number.isFinite(n) && n >= 5 ? n : 15;
}

async function syncConnectionIncrementally(conn: ChannelConnection): Promise<void> {
  const state = (await readState())[conn.id] ?? {};
  const now = new Date();
  const cursor = state.cronCursor ? new Date(state.cronCursor) : null;
  const from = cursor && !Number.isNaN(cursor.getTime())
    ? new Date(cursor.getTime() - CURSOR_OVERLAP_MS)
    : new Date(now.getTime() - FIRST_RUN_LOOKBACK_HOURS * 60 * 60 * 1000);

  try {
    // Modified-date window so cancellations/refunds/completions on older orders reach the ERP.
    const orders = await fetchOrdersForConnection(conn, {
      from: from.toISOString(),
      to: now.toISOString(),
      dateField: 'modified'
    });
    const summary = await runOrderImport(orders, {
      organizationId: String(conn.organization.id),
      connectionId: conn.id,
      createCustomers: true,
      importPayments: true,
      updateExisting: true
    });
    await patchState(conn.id, {
      cronCursor: now.toISOString(),
      lastCronRunAt: now.toISOString(),
      lastSyncedAt: now.toISOString(),
      lastTrigger: 'cron',
      lastCronError: null,
      lastCronResult: { fetched: orders.length, created: summary.ordersCreated, updated: summary.ordersUpdated }
    });
  } catch (err) {
    await patchState(conn.id, {
      lastCronRunAt: now.toISOString(),
      lastCronError: err instanceof Error ? err.message : String(err)
    });
    console.warn(`[channel-sync] ${conn.name} (#${conn.id}) failed:`, err instanceof Error ? err.message : err);
  }
}

let running = false;

export async function runIncrementalChannelSync(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const rows = await AppDataSource.getRepository(ChannelConnection).find({
      where: { status: 'active' },
      relations: ['organization'],
      order: { createdAt: 'DESC' }
    });
    const seen = new Set<string>();
    for (const conn of rows) {
      const supported = isGoodTillConnection(conn) || conn.channel === 'wordpress' || conn.channel === 'woocommerce';
      if (!supported || !conn.organization) continue;
      // Legacy duplicate rows point at the same store; sync only the newest.
      const key = `${conn.organization.id}:${conn.storeUrl ?? conn.shopDomain ?? conn.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await syncConnectionIncrementally(conn);
    }
  } finally {
    running = false;
  }
}

export function startChannelSyncCron(): void {
  if (!isCronEnabled()) return;
  const minutes = intervalMinutes();
  console.log(`[channel-sync] incremental sync every ${minutes} min`);
  setInterval(() => {
    runIncrementalChannelSync().catch((err) => console.error('[channel-sync] run failed:', err));
  }, minutes * 60 * 1000).unref();
}
