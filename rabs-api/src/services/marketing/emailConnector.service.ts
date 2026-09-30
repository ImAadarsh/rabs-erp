import { AppDataSource } from '@config/data-source.js';
import { MarketingEmailConnector } from '@entities/marketing/MarketingEmailConnector.js';
import type { MarketingEmailProviderKind } from '@entities/marketing/MarketingEmailConnector.js';
import { encryptJson, maskSecret } from '@utils/credentialCrypto.js';
import { createEmailProvider, createEmailProviderFromCredentials } from './email/index.js';

function hintFromCredentials(
  provider: MarketingEmailProviderKind,
  credentials: Record<string, unknown>
): string | null {
  if (credentials.useEnv === true) return 'env-ref';
  const key =
    (credentials.apiKey as string) ||
    (credentials.user as string) ||
    (credentials.accessKeyId as string) ||
    '';
  if (!key) return null;
  return maskSecret(String(key));
}

export function serializeConnector(c: MarketingEmailConnector) {
  return {
    id: c.id,
    organizationId: c.organizationId,
    provider: c.provider,
    name: c.name,
    keyHint: c.keyHint,
    status: c.status,
    isDefault: c.isDefault,
    lastTestedAt: c.lastTestedAt,
    lastTestOk: c.lastTestOk,
    lastTestMessage: c.lastTestMessage,
    createdById: c.createdById,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
    // credentials never exposed
  };
}

export async function listConnectors(organizationId: string) {
  return AppDataSource.getRepository(MarketingEmailConnector).find({
    where: { organizationId },
    order: { isDefault: 'DESC', createdAt: 'DESC' }
  });
}

export async function getConnector(id: string, organizationId: string) {
  const item = await AppDataSource.getRepository(MarketingEmailConnector).findOne({
    where: { id }
  });
  if (!item || String(item.organizationId) !== String(organizationId)) return null;
  return item;
}

export async function getDefaultConnector(organizationId: string) {
  const repo = AppDataSource.getRepository(MarketingEmailConnector);
  const preferred = await repo.findOne({
    where: { organizationId, isDefault: true, status: 'active' }
  });
  if (preferred) return preferred;
  return repo.findOne({
    where: { organizationId, status: 'active' },
    order: { createdAt: 'DESC' }
  });
}

async function clearOtherDefaults(organizationId: string, exceptId?: string) {
  const qb = AppDataSource.getRepository(MarketingEmailConnector)
    .createQueryBuilder()
    .update(MarketingEmailConnector)
    .set({ isDefault: false })
    .where('organization_id = :organizationId', { organizationId });
  if (exceptId) qb.andWhere('id <> :exceptId', { exceptId });
  await qb.execute();
}

export async function createConnector(opts: {
  organizationId: string;
  provider: MarketingEmailProviderKind;
  name: string;
  credentials: Record<string, unknown>;
  isDefault?: boolean;
  createdById?: string | null;
  status?: 'active' | 'inactive' | 'error';
}) {
  const repo = AppDataSource.getRepository(MarketingEmailConnector);
  if (opts.isDefault) {
    await clearOtherDefaults(opts.organizationId);
  }
  const saved = await repo.save(
    repo.create({
      organizationId: opts.organizationId,
      provider: opts.provider,
      name: opts.name,
      credentialsEncrypted: encryptJson(opts.credentials),
      keyHint: hintFromCredentials(opts.provider, opts.credentials),
      status: opts.status || 'active',
      isDefault: Boolean(opts.isDefault),
      createdById: opts.createdById ?? null
    })
  );
  return saved;
}

export async function updateConnector(
  item: MarketingEmailConnector,
  opts: {
    name?: string;
    credentials?: Record<string, unknown>;
    isDefault?: boolean;
    status?: 'active' | 'inactive' | 'error';
  }
) {
  const repo = AppDataSource.getRepository(MarketingEmailConnector);
  if (opts.name !== undefined) item.name = opts.name;
  if (opts.status !== undefined) item.status = opts.status;
  if (opts.credentials) {
    item.credentialsEncrypted = encryptJson(opts.credentials);
    item.keyHint = hintFromCredentials(item.provider, opts.credentials);
  }
  if (opts.isDefault === true) {
    await clearOtherDefaults(item.organizationId, item.id);
    item.isDefault = true;
  } else if (opts.isDefault === false) {
    item.isDefault = false;
  }
  return repo.save(item);
}

export async function deleteConnector(item: MarketingEmailConnector) {
  await AppDataSource.getRepository(MarketingEmailConnector).remove(item);
}

export async function testConnector(item: MarketingEmailConnector) {
  const provider = createEmailProvider(item);
  const result = await provider.verifyConnection();
  item.lastTestedAt = new Date();
  item.lastTestOk = result.ok;
  item.lastTestMessage = result.message.slice(0, 500);
  if (!result.ok && item.status === 'active') {
    // keep active; surface error on last_test_* only
  }
  await AppDataSource.getRepository(MarketingEmailConnector).save(item);
  return result;
}

/** Test credentials without persisting (e.g. before create). */
export async function testRawCredentials(
  provider: MarketingEmailProviderKind,
  credentials: Record<string, unknown>
) {
  const p = createEmailProviderFromCredentials(provider, credentials);
  return p.verifyConnection();
}
