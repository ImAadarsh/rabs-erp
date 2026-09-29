import crypto from 'crypto';
import { env } from '@config/env.js';

const GRAPH_VERSION = env.META_GRAPH_VERSION || 'v26.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Default Facebook Login scopes for inbox + Page/IG attach.
 * Publish scopes are NOT in this list — Login for Business rejected them as Invalid Scopes.
 * Request them only via intent=publish on classic /dialog/oauth (no config_id).
 */
export const META_SOCIAL_SCOPES = [
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_messaging',
  'instagram_basic'
] as const;

/**
 * Meta security best practice: sign each Graph call with an HMAC-SHA256 of the
 * access token keyed by the app secret. Required when "Require App Secret Proof"
 * is enabled on the app; harmless otherwise.
 */
function appSecretProof(accessToken: string): string | undefined {
  if (!env.META_APP_SECRET || !accessToken) return undefined;
  return crypto.createHmac('sha256', env.META_APP_SECRET).update(accessToken).digest('hex');
}

export class MetaGraphError extends Error {
  status: number;
  code?: number;
  type?: string;
  fbtraceId?: string;
  missingPermission?: string;

  constructor(
    message: string,
    status = 500,
    details?: { code?: number; type?: string; fbtrace_id?: string; missingPermission?: string }
  ) {
    super(message);
    this.name = 'MetaGraphError';
    this.status = status;
    this.code = details?.code;
    this.type = details?.type;
    this.fbtraceId = details?.fbtrace_id;
    this.missingPermission = details?.missingPermission || inferMissingPermission(message);
  }
}

export function inferMissingPermission(message: string): string | undefined {
  const msg = message || '';
  const names = [
    'pages_manage_posts',
    'instagram_content_publish',
    'instagram_manage_messages',
    'instagram_manage_insights',
    'instagram_manage_comments',
    'pages_read_user_content',
    'pages_manage_engagement',
    'read_insights',
    'ads_read',
    'ads_management',
    'pages_messaging',
    'pages_read_engagement'
  ];
  return names.find((n) => msg.includes(n));
}

export function metaErrorBody(error: any) {
  const message = error?.message || 'Meta request failed';
  return {
    error: {
      message,
      code: error?.code,
      missingPermission: error?.missingPermission || inferMissingPermission(message)
    }
  };
}

export function assertMetaConfigured(): void {
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    throw new MetaGraphError('Meta app is not configured. Set META_APP_ID and META_APP_SECRET.', 503);
  }
}

type GraphParams = Record<string, string | number | boolean | undefined | null>;

function toQuery(params: GraphParams): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  return q.toString();
}

export async function metaGraphGet<T = any>(
  path: string,
  accessToken: string,
  params: GraphParams = {}
): Promise<T> {
  const qs = toQuery({ ...params, access_token: accessToken, appsecret_proof: appSecretProof(accessToken) });
  const url = `${GRAPH_BASE}${path.startsWith('/') ? path : `/${path}`}?${qs}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    throw new MetaGraphError(
      body?.error?.message || `Meta Graph GET failed (${res.status})`,
      res.status,
      body?.error
    );
  }
  return body as T;
}

export async function metaGraphPost<T = any>(
  path: string,
  accessToken: string,
  body: GraphParams = {},
  options?: { asForm?: boolean }
): Promise<T> {
  const url = `${GRAPH_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const payload = { ...body, access_token: accessToken, appsecret_proof: appSecretProof(accessToken) };
  let res: Response;
  if (options?.asForm === false) {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } else {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: toQuery(payload)
    });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new MetaGraphError(
      data?.error?.message || `Meta Graph POST failed (${res.status})`,
      res.status,
      data?.error
    );
  }
  return data as T;
}

export async function metaGraphDelete<T = any>(
  path: string,
  accessToken: string,
  params: GraphParams = {}
): Promise<T> {
  const qs = toQuery({ ...params, access_token: accessToken, appsecret_proof: appSecretProof(accessToken) });
  const url = `${GRAPH_BASE}${path.startsWith('/') ? path : `/${path}`}?${qs}`;
  const res = await fetch(url, { method: 'DELETE' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    throw new MetaGraphError(
      body?.error?.message || `Meta Graph DELETE failed (${res.status})`,
      res.status,
      body?.error
    );
  }
  return body as T;
}

/** Marketing API scopes — used only for intent=ads reconnect. */
export const META_ADS_SCOPES = ['ads_read', 'ads_management'] as const;

/**
 * Pages + Instagram Graph publish (and related IG Graph perms).
 * Valid Facebook Login permission names. Do not put these in a Login for Business config.
 * Requested only via intent=publish on classic /dialog/oauth.
 */
export const META_PUBLISH_SCOPES = [
  'pages_manage_posts',
  'instagram_content_publish',
  'instagram_manage_comments',
  'instagram_manage_insights',
  'instagram_manage_messages'
] as const;

export const META_USER_HANDLE = '__meta_user__';

export function extraScopesForIntent(intent: string): string[] {
  if (intent === 'ads') return [...META_ADS_SCOPES];
  if (intent === 'publish') {
    // Keep ads on the same token so a publish reconnect does not drop Marketing API.
    return [...META_PUBLISH_SCOPES, ...META_ADS_SCOPES];
  }
  return [];
}

/** Resolved OAuth scope string (env override or ERP default). */
export function resolveMetaOAuthScopes(extra: string[] = []): string {
  const base = (env.META_OAUTH_SCOPES || META_SOCIAL_SCOPES.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...base, ...extra.map((s) => s.trim()).filter(Boolean)])].join(',');
}

export function buildMetaOAuthUrl(
  state: string,
  opts?: { extraScopes?: string[]; rerequest?: boolean }
): string {
  assertMetaConfigured();
  const params = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: env.META_REDIRECT_URI,
    state,
    response_type: 'code',
    override_default_response_type: 'true',
    display: 'page'
  });
  // Classic Facebook Login only. Never /dialog/oauth/business and never config_id —
  // Login Config IDs inject invalid Graph names and return Invalid Scopes.
  const scopes = resolveMetaOAuthScopes(opts?.extraScopes);
  if (scopes) params.set('scope', scopes);
  if (opts?.rerequest) params.set('auth_type', 'rerequest');
  const authUrl = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
  console.info('[meta-oauth-url]', {
    graphVersion: GRAPH_VERSION,
    dialog: 'facebook_login',
    scopes,
    extra: opts?.extraScopes || [],
    rerequest: Boolean(opts?.rerequest),
    configIdInDialog: false,
    businessDialog: false
  });
  return authUrl;
}

export async function metaGraphGetAll<T = any>(
  path: string,
  accessToken: string,
  params: GraphParams = {},
  maxPages = 8
): Promise<T[]> {
  const items: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i += 1) {
    const res = await metaGraphGet<{ data?: T[]; paging?: { cursors?: { after?: string } } }>(
      path,
      accessToken,
      { limit: 50, ...params, after }
    );
    const page = res.data || [];
    items.push(...page);
    after = res.paging?.cursors?.after;
    if (!after || page.length === 0) break;
  }
  return items;
}

export type DebugTokenInfo = {
  isValid: boolean;
  type?: string;
  scopes: string[];
  granular: Array<{ scope: string; target_ids?: string[] }>;
  expiresAt?: number;
};

export async function debugMetaToken(accessToken: string): Promise<DebugTokenInfo> {
  const res = await metaGraphGet<{
    data?: {
      is_valid?: boolean;
      type?: string;
      scopes?: string[];
      granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
      expires_at?: number;
    };
  }>('/debug_token', accessToken, { input_token: accessToken });
  const d = res.data || {};
  return {
    isValid: Boolean(d.is_valid),
    type: d.type,
    scopes: d.scopes || [],
    granular: d.granular_scopes || [],
    expiresAt: d.expires_at
  };
}

export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  token_type?: string;
  expires_in?: number;
}> {
  assertMetaConfigured();
  const qs = toQuery({
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    redirect_uri: env.META_REDIRECT_URI,
    code
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${qs}`);
  const body = await res.json();
  if (!res.ok || body?.error || !body?.access_token) {
    throw new MetaGraphError(body?.error?.message || 'Failed to exchange Meta OAuth code', res.status, body?.error);
  }
  return body;
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{
  access_token: string;
  token_type?: string;
  expires_in?: number;
}> {
  assertMetaConfigured();
  const qs = toQuery({
    grant_type: 'fb_exchange_token',
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    fb_exchange_token: shortLivedToken
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${qs}`);
  const body = await res.json();
  if (!res.ok || body?.error || !body?.access_token) {
    throw new MetaGraphError(body?.error?.message || 'Failed to obtain long-lived Meta token', res.status, body?.error);
  }
  return body;
}

export function sanitizeSocialAccount<T extends Record<string, any>>(account: T): Omit<T, 'accessToken' | 'refreshToken'> {
  const { accessToken: _a, refreshToken: _r, ...rest } = account;
  return rest;
}

/** Returns which permissions the user granted vs declined for the current token. */
export async function getGrantedPermissions(userToken: string): Promise<{
  granted: string[];
  declined: string[];
}> {
  const res = await metaGraphGet<{ data?: Array<{ permission: string; status: string }> }>(
    '/me/permissions',
    userToken
  );
  const granted: string[] = [];
  const declined: string[] = [];
  for (const row of res.data || []) {
    if (row.status === 'granted') granted.push(row.permission);
    else declined.push(row.permission);
  }
  return { granted, declined };
}
