import { AppDataSource } from '../config/data-source.js';
import { PaymentGateway } from '../entities/finance/PaymentGateway.js';
import { testWorldpayConnection } from '../services/payments/worldpay.service.js';

async function main() {
  await AppDataSource.initialize();
  const g = await AppDataSource.getRepository(PaymentGateway).findOne({ where: { provider: 'worldpay' } });
  if (!g) {
    console.log('worldpayTest: NO_GATEWAY');
    process.exit(1);
  }
  const r = await testWorldpayConnection(g);
  console.log(
    JSON.stringify({
      ok: r.ok,
      httpStatus: r.httpStatus,
      mode: r.mode,
      message: r.message.slice(0, 240)
    })
  );
  await AppDataSource.destroy();
}

main().catch(async (e) => {
  console.error(e.message || e);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
