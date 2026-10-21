/**
 * JSON replacer applied to every `res.json` body (see app.ts). Strips stored secrets that
 * can ride along on entities and joined relations (channel connection credentials, password /
 * PIN / key hashes, gateway secrets, social OAuth tokens) so no endpoint can leak them.
 */
const SECRET_KEYS = new Set([
  'credentialsEncrypted',
  'credentials_encrypted',
  'passwordHash',
  'password_hash',
  'pinHash',
  'pinSalt',
  'pin_sha256',
  'pin_salt',
  'keyHash',
  'key_hash',
  'apiKeyEncrypted',
  'apiSecretEncrypted',
  'api_key_encrypted',
  'api_secret_encrypted',
  'webhookSecret',
  'webhook_secret'
]);

const ENCRYPTED_SUFFIX = /encrypted$/i;

/** OAuth tokens are only secret on stored account rows; login responses legitimately return tokens. */
function isStoredAccountRow(holder: Record<string, unknown>): boolean {
  return 'platform' in holder || 'tokenExpiresAt' in holder || 'token_expires_at' in holder;
}

export function secretStrippingReplacer(this: unknown, key: string, value: unknown): unknown {
  if (!key) return value;
  if (SECRET_KEYS.has(key) || ENCRYPTED_SUFFIX.test(key)) return undefined;
  if (
    (key === 'accessToken' || key === 'refreshToken' || key === 'access_token' || key === 'refresh_token') &&
    this &&
    typeof this === 'object' &&
    isStoredAccountRow(this as Record<string, unknown>)
  ) {
    return undefined;
  }
  return value;
}
