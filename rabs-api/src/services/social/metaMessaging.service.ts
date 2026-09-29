import { AppDataSource } from '@config/data-source.js';
import { SocialAccount } from '@entities/social/SocialAccount.js';
import { SocialMessage } from '@entities/social/SocialMessage.js';
import { MetaGraphError, metaGraphGet, metaGraphPost } from './metaGraph.client.js';
import { isOrganicMetaAccount, metaAccountKind, requireAccountToken } from './metaAccount.util.js';

function pageIdForAccount(account: SocialAccount): string {
  const meta = (account.metadata || {}) as Record<string, unknown>;
  if (typeof meta.pageId === 'string' && meta.pageId) return meta.pageId;
  if (account.platform === 'facebook' && account.accountId && account.accountHandle !== 'ads') {
    return account.accountId;
  }
  throw new MetaGraphError('No Facebook Page id linked to this account for messaging', 400);
}

export async function sendMetaMessage(opts: {
  socialAccountId: string;
  recipientId: string;
  messageText: string;
  userId?: string;
}): Promise<SocialMessage> {
  const accountRepo = AppDataSource.getRepository(SocialAccount);
  const msgRepo = AppDataSource.getRepository(SocialMessage);

  const account = await accountRepo.findOne({ where: { id: opts.socialAccountId } });
  if (!account) throw new MetaGraphError('Social account not found', 404);
  if (!account.accessToken) throw new MetaGraphError('Account missing Meta token. Reconnect Meta.', 400);
  if (!['facebook', 'instagram'].includes(account.platform)) {
    throw new MetaGraphError('Messaging only supported for Facebook Pages and Instagram', 400);
  }

  const pageId = pageIdForAccount(account);
  await metaGraphPost(`/${pageId}/messages`, account.accessToken, {
    recipient: JSON.stringify({ id: opts.recipientId }),
    messaging_type: 'RESPONSE',
    message: JSON.stringify({ text: opts.messageText })
  });

  const saved = msgRepo.create({
    socialAccountId: account.id,
    platformConversationId: opts.recipientId,
    senderId: pageId,
    senderName: account.accountName,
    senderHandle: account.accountHandle,
    messageText: opts.messageText,
    direction: 'outbound',
    isRead: true,
    readAt: new Date(),
    repliedById: opts.userId || null
  });
  return await msgRepo.save(saved);
}

async function findAccountByPageOrIgId(platformId: string): Promise<SocialAccount | null> {
  const repo = AppDataSource.getRepository(SocialAccount);
  const byAccount = await repo.findOne({ where: { accountId: platformId, isActive: true } });
  if (byAccount) return byAccount;

  const all = await repo
    .createQueryBuilder('a')
    .where('a.is_active = true')
    .andWhere(`JSON_UNQUOTE(JSON_EXTRACT(a.metadata, '$.pageId')) = :pid`, { pid: platformId })
    .getMany();
  return all[0] || null;
}

export async function ingestWebhookPayload(body: any): Promise<{ stored: number }> {
  const msgRepo = AppDataSource.getRepository(SocialMessage);
  let stored = 0;

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const pageOrIgId = String(entry.id || '');

    // Messenger (Page)
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const event of messaging) {
      const text = event?.message?.text;
      const mid = event?.message?.mid;
      if (!text || event?.message?.is_echo) continue;

      const senderId = String(event.sender?.id || '');
      const account = await findAccountByPageOrIgId(pageOrIgId);
      if (!account) continue;

      if (mid) {
        const exists = await msgRepo.findOne({
          where: {
            socialAccountId: account.id,
            platformConversationId: senderId,
            messageText: text
          }
        });
        // Soft dedupe: skip identical recent inbound
        if (exists && exists.direction === 'inbound') continue;
      }

      await msgRepo.save(
        msgRepo.create({
          socialAccountId: account.id,
          platformConversationId: senderId,
          senderId,
          senderName: undefined,
          messageText: text,
          direction: 'inbound',
          isRead: false
        })
      );
      stored += 1;
    }

    // Instagram messaging sometimes nested under entry.messaging too (same shape)
  }

  return { stored };
}

export type GraphConversation = {
  id: string;
  platform: 'facebook' | 'instagram';
  socialAccountId: string;
  accountName: string;
  accountHandle?: string;
  updatedTime?: string;
  messageCount?: number;
  unreadCount?: number;
  canReply?: boolean;
  participants: Array<{ id: string; name?: string }>;
  snippet?: string;
  tags: string[];
  folder?: string;
  locked?: { message: string; missingPermission?: string };
};

export type GraphThreadMessage = {
  id: string;
  text?: string;
  from?: { id: string; name?: string };
  createdTime?: string;
  tags: string[];
  direction: 'inbound' | 'outbound';
};

async function organicAccountsForInbox(organizationId: string, accountId?: string): Promise<SocialAccount[]> {
  const repo = AppDataSource.getRepository(SocialAccount);
  if (accountId) {
    const one = await repo.findOne({ where: { id: accountId, organizationId } });
    if (!one) throw new MetaGraphError('Social account not found', 404);
    return [one];
  }
  const all = await repo.find({ where: { organizationId, isActive: true } });
  return all.filter((a) => isOrganicMetaAccount(a) && a.accessToken);
}

function tagsFromGraph(row: any): string[] {
  const data = row?.tags?.data || row?.tags || [];
  if (!Array.isArray(data)) return [];
  return data.map((t: any) => (typeof t === 'string' ? t : t?.name)).filter(Boolean);
}

export async function fetchMetaInbox(opts: {
  organizationId: string;
  accountId?: string;
  platform?: string;
}): Promise<{
  conversations: GraphConversation[];
  unreadTotal: number;
  igLocked?: { message: string; missingPermission: string };
}> {
  const accounts = await organicAccountsForInbox(opts.organizationId, opts.accountId);
  const conversations: GraphConversation[] = [];
  let igLocked: { message: string; missingPermission: string } | undefined;

  for (const account of accounts) {
    const kind = metaAccountKind(account);
    if (opts.platform && opts.platform !== 'all') {
      if (opts.platform === 'facebook' && kind !== 'page') continue;
      if (opts.platform === 'instagram' && kind !== 'instagram') continue;
    }
    if (!account.accessToken || !account.accountId) continue;

    if (kind === 'instagram') {
      try {
        const res = await metaGraphGet<{ data?: any[] }>(`/${account.accountId}/conversations`, account.accessToken, {
          platform: 'instagram',
          fields: 'id,updated_time,message_count,unread_count,participants',
          limit: 40
        });
        for (const c of res.data || []) {
          conversations.push(mapConversation(c, account, 'instagram'));
        }
      } catch (err: any) {
        igLocked = {
          message:
            err?.message ||
            'Instagram DMs require instagram_manage_messages. This token does not have it.',
          missingPermission: 'instagram_manage_messages'
        };
      }
      continue;
    }

    if (kind !== 'page') continue;

    try {
      const res = await metaGraphGet<{ data?: any[] }>(`/${account.accountId}/conversations`, account.accessToken, {
        fields:
          'id,updated_time,message_count,unread_count,participants,can_reply,messages.limit(1){message,from,created_time,tags}',
        limit: 40
      });
      for (const c of res.data || []) {
        conversations.push(mapConversation(c, account, 'facebook'));
      }
    } catch (err: any) {
      conversations.push({
        id: `error-${account.id}`,
        platform: 'facebook',
        socialAccountId: account.id,
        accountName: account.accountName,
        accountHandle: account.accountHandle,
        participants: [],
        tags: ['error'],
        locked: { message: err?.message, missingPermission: err?.missingPermission }
      });
    }
  }

  conversations.sort((a, b) => String(b.updatedTime || '').localeCompare(String(a.updatedTime || '')));
  const unreadTotal = conversations.reduce((n, c) => n + (c.unreadCount || 0), 0);
  return { conversations, unreadTotal, igLocked };
}

function mapConversation(c: any, account: SocialAccount, platform: 'facebook' | 'instagram'): GraphConversation {
  const last = c.messages?.data?.[0];
  const participantNames = (c.participants?.data || []).map((p: any) => ({
    id: String(p.id || ''),
    name: p.name
  }));
  const tags = tagsFromGraph(last);
  const folder = tags.includes('inbox') ? 'inbox' : tags.find((t) => !String(t).startsWith('source:')) || 'inbox';
  return {
    id: c.id,
    platform,
    socialAccountId: account.id,
    accountName: account.accountName,
    accountHandle: account.accountHandle,
    updatedTime: c.updated_time,
    messageCount: c.message_count,
    unreadCount: c.unread_count || 0,
    canReply: c.can_reply,
    participants: participantNames,
    snippet: last?.message,
    tags,
    folder
  };
}

export async function fetchMetaThread(opts: {
  organizationId: string;
  accountId: string;
  threadId: string;
}): Promise<{
  conversation: GraphConversation;
  messages: GraphThreadMessage[];
}> {
  const repo = AppDataSource.getRepository(SocialAccount);
  const account = await repo.findOne({ where: { id: opts.accountId, organizationId: opts.organizationId } });
  if (!account) throw new MetaGraphError('Social account not found', 404);
  const token = requireAccountToken(account);
  const kind = metaAccountKind(account);
  const platform = kind === 'instagram' ? 'instagram' : 'facebook';

  const conv = await metaGraphGet<any>(`/${opts.threadId}`, token, {
    fields: 'id,updated_time,message_count,unread_count,participants,can_reply'
  });
  const msgs = await metaGraphGet<{ data?: any[]; paging?: any }>(`/${opts.threadId}/messages`, token, {
    fields: 'id,message,from,created_time,tags',
    limit: 50
  });

  const pageId = account.accountId;
  const messages: GraphThreadMessage[] = (msgs.data || []).map((m) => {
    const fromId = String(m.from?.id || '');
    return {
      id: m.id,
      text: m.message,
      from: { id: fromId, name: m.from?.name },
      createdTime: m.created_time,
      tags: tagsFromGraph(m),
      direction: fromId === pageId ? 'outbound' : 'inbound'
    };
  });

  return {
    conversation: mapConversation(conv, account, platform),
    messages
  };
}
