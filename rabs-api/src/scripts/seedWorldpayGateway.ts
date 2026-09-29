import { AppDataSource } from '../config/data-source.js';
import { Organization } from '../entities/iam/Organization.js';
import { PaymentGateway } from '../entities/finance/PaymentGateway.js';
import { credentialsFromEnv, encryptWorldpayCredentials } from '../services/payments/worldpay.service.js';

/**
 * Non-destructive: upserts an active Worldpay PaymentGateway from local env vars.
 * Never prints secret values.
 */
async function seedWorldpayGateway() {
  const creds = credentialsFromEnv();
  if (!creds) {
    throw new Error('Set WORLDPAY_USERNAME and WORLDPAY_API_PASSWORD in rabs-api/.env before seeding');
  }

  await AppDataSource.initialize();
  const org = await AppDataSource.getRepository(Organization).findOne({ where: { status: 'active' } });
  if (!org) throw new Error('No active organization found');

  const repo = AppDataSource.getRepository(PaymentGateway);
  let gateway = await repo.findOne({
    where: { organizationId: org.id, provider: 'worldpay' }
  });

  const mode = process.env.WORLDPAY_MODE === 'live' ? 'live' : 'test';
  const enc = encryptWorldpayCredentials(creds);

  if (!gateway) {
    gateway = repo.create({
      organizationId: org.id,
      name: 'Worldpay Access',
      provider: 'worldpay',
      mode,
      isDefault: true,
      isActive: true,
      supportedCurrencies: ['GBP', 'EUR', 'USD'],
      apiKeyEncrypted: enc.apiKeyEncrypted,
      apiSecretEncrypted: enc.apiSecretEncrypted
    });
  } else {
    gateway.name = gateway.name || 'Worldpay Access';
    gateway.mode = mode;
    gateway.isActive = true;
    gateway.apiKeyEncrypted = enc.apiKeyEncrypted;
    gateway.apiSecretEncrypted = enc.apiSecretEncrypted;
    if (!gateway.isDefault) {
      // Prefer Worldpay as default when seeding explicitly
      gateway.isDefault = true;
    }
  }

  if (gateway.isDefault) {
    await repo
      .createQueryBuilder()
      .update(PaymentGateway)
      .set({ isDefault: false })
      .where('organization_id = :orgId AND provider != :provider', { orgId: org.id, provider: 'worldpay' })
      .execute();
  }

  await repo.save(gateway);
  console.log('Worldpay PaymentGateway upserted.');
  console.log(`  Org: ${org.name} (${org.id})`);
  console.log(`  Gateway id: ${gateway.id}`);
  console.log(`  Mode: ${mode}`);
  console.log(`  Username hint: ${creds.username.slice(0, 4)}…`);
  await AppDataSource.destroy();
}

seedWorldpayGateway().catch(async (err) => {
  console.error(err.message || err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
