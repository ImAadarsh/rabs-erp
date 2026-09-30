import { ChannelConnection } from '@entities/catalog/ChannelConnection.js';
import { Order } from '@entities/orders/Order.js';
import { decryptJson } from '@utils/credentialCrypto.js';
import type { ShopifyApiCredentials } from '@services/import/shopifyApiImport.js';
import type { WordPressApiCredentials } from '@services/import/wordpressApiImport.js';

export type ChannelRefundResult = {
  channel: 'woocommerce' | 'shopify';
  externalRefundId: string;
};

function normalizeStoreUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function wooAuth(creds: WordPressApiCredentials): string {
  if (creds.authMode === 'appPassword') {
    return basicAuth(creds.username ?? '', creds.appPassword ?? '');
  }
  return basicAuth(creds.consumerKey ?? '', creds.consumerSecret ?? '');
}

async function refundWooCommerce(
  order: Order,
  connection: ChannelConnection,
  amount: number,
  reason: string
): Promise<ChannelRefundResult> {
  const raw = decryptJson<Omit<WordPressApiCredentials, never>>(connection.credentialsEncrypted);
  const creds: WordPressApiCredentials = {
    ...raw,
    storeUrl: raw.storeUrl ?? connection.storeUrl ?? ''
  };
  if (!creds.storeUrl) throw new Error('WooCommerce connection has no store URL');

  const response = await fetch(
    `${normalizeStoreUrl(creds.storeUrl)}/wp-json/wc/v3/orders/${encodeURIComponent(order.channelOrderId!)}/refunds`,
    {
      method: 'POST',
      headers: {
        Authorization: wooAuth(creds),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amount.toFixed(2),
        reason,
        api_refund: true
      })
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`WooCommerce refund failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = JSON.parse(text) as { id?: number | string };
  if (data.id == null) throw new Error('WooCommerce did not return a refund ID');
  return { channel: 'woocommerce', externalRefundId: String(data.id) };
}

type ShopifyTransaction = {
  id: number | string;
  kind: string;
  status: string;
  gateway: string;
  amount: string;
};

function normalizeShopDomain(domain: string): string {
  let value = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!value.includes('.')) value = `${value}.myshopify.com`;
  return value;
}

async function refundShopify(
  order: Order,
  connection: ChannelConnection,
  amount: number,
  reason: string
): Promise<ChannelRefundResult> {
  const creds = decryptJson<Omit<ShopifyApiCredentials, never>>(connection.credentialsEncrypted);
  const domain = normalizeShopDomain(creds.shopDomain ?? connection.shopDomain ?? '');
  if (!domain || !creds.accessToken) throw new Error('Shopify connection credentials are incomplete');

  const baseUrl = `https://${domain}/admin/api/2025-10`;
  const headers = {
    'X-Shopify-Access-Token': creds.accessToken,
    'Content-Type': 'application/json'
  };
  const transactionResponse = await fetch(
    `${baseUrl}/orders/${encodeURIComponent(order.channelOrderId!)}/transactions.json`,
    { headers }
  );
  const transactionText = await transactionResponse.text();
  if (!transactionResponse.ok) {
    throw new Error(`Shopify transactions lookup failed (${transactionResponse.status}): ${transactionText.slice(0, 300)}`);
  }

  const transactions = (JSON.parse(transactionText) as { transactions?: ShopifyTransaction[] }).transactions ?? [];
  const parent = transactions.find(
    (transaction) =>
      transaction.status === 'success' &&
      (transaction.kind === 'sale' || transaction.kind === 'capture')
  );
  if (!parent) throw new Error('Shopify order has no successful sale or capture transaction to refund');

  const refundResponse = await fetch(
    `${baseUrl}/orders/${encodeURIComponent(order.channelOrderId!)}/refunds.json`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        refund: {
          notify: true,
          note: reason,
          currency: order.currency,
          transactions: [
            {
              parent_id: parent.id,
              amount: amount.toFixed(2),
              kind: 'refund',
              gateway: parent.gateway
            }
          ]
        }
      })
    }
  );
  const refundText = await refundResponse.text();
  if (!refundResponse.ok) {
    throw new Error(`Shopify refund failed (${refundResponse.status}): ${refundText.slice(0, 300)}`);
  }

  const refund = (JSON.parse(refundText) as { refund?: { id?: number | string } }).refund;
  if (refund?.id == null) throw new Error('Shopify did not return a refund ID');
  return { channel: 'shopify', externalRefundId: String(refund.id) };
}

export async function refundOrderOnChannel(
  order: Order,
  amount: number,
  reason: string
): Promise<ChannelRefundResult> {
  const connection = order.channelConnection;
  if (!connection || connection.status !== 'active') {
    throw new Error('This order has no active sales-channel connection');
  }
  if (!order.channelOrderId) {
    throw new Error('This order has no external channel order ID');
  }

  if (connection.channel === 'woocommerce' || connection.channel === 'wordpress') {
    return refundWooCommerce(order, connection, amount, reason);
  }
  if (connection.channel === 'shopify') {
    return refundShopify(order, connection, amount, reason);
  }
  if (connection.channel === 'goodtill') {
    throw new Error('EPOS refunds are not supported by the configured Good Till API');
  }

  throw new Error(`Refunds are not supported for channel "${connection.channel}"`);
}
