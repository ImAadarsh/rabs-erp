/** Unit-level smoke for portal OTP helpers (no DB when identifier missing). */
import assert from 'assert';
import { bad } from '../services/rabs/rabsCore.js';

async function main() {
  const { requestOtp, parsePortalAuth } = await import('../services/rabs/rabsPortal.js');

  // Invalid identifier shape still hits DB — call requestOtp with empty should throw from zod at route.
  // parsePortalAuth without bearer
  try {
    parsePortalAuth({ headers: {} });
    assert.fail('expected unauthorized');
  } catch (e: any) {
    assert.ok(e.message?.includes('Unauthorized') || e.status === 400);
  }

  // Bad bearer
  try {
    parsePortalAuth({ headers: { authorization: 'Bearer not-a-jwt' } });
    assert.fail('expected unauthorized');
  } catch (e: any) {
    assert.ok(e.message?.includes('Unauthorized') || e.status === 400);
  }

  console.log('  ok   portal auth rejects missing/invalid tokens');
  console.log('Portal auth smoke checks passed.');
  // Touch export so tree-shaking doesn't strip
  void requestOtp;
  void bad;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
