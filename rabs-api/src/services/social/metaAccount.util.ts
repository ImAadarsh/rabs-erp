import { SocialAccount } from '@entities/social/SocialAccount.js';
import { META_USER_HANDLE, MetaGraphError } from './metaGraph.client.js';

export type MetaAccountKind = 'page' | 'instagram' | 'ads' | 'user' | 'other';

export function accountMeta(account: SocialAccount): Record<string, unknown> {
  return (account.metadata && typeof account.metadata === 'object' ? account.metadata : {}) as Record<
    string,
    unknown
  >;
}

export function metaAccountKind(account: SocialAccount): MetaAccountKind {
  const meta = accountMeta(account);
  if (account.accountHandle === META_USER_HANDLE || meta.tokenType === 'user') return 'user';
  if (
    account.accountHandle === 'ads' ||
    String(account.accountId || '').startsWith('act_') ||
    meta.tokenType === 'user_ads'
  ) {
    return 'ads';
  }
  if (account.platform === 'instagram') return 'instagram';
  if (account.platform === 'facebook') return 'page';
  return 'other';
}

export function isOrganicMetaAccount(account: SocialAccount): boolean {
  const kind = metaAccountKind(account);
  return kind === 'page' || kind === 'instagram';
}

export function requireAccountToken(account: SocialAccount): string {
  if (!account.accessToken) {
    throw new MetaGraphError('Account has no Meta access token. Reconnect via Connect Meta.', 400);
  }
  return account.accessToken;
}
