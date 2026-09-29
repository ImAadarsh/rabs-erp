import type { ImportChannel } from './types.js';
import type { ChannelMapping } from '@entities/catalog/ChannelMapping.js';

/** Map import channel to DB enum (channel_mappings has no wordpress/custom). */
export function toChannelMappingChannel(channel: ImportChannel): ChannelMapping['channel'] {
  switch (channel) {
    case 'shopify':
      return 'shopify';
    case 'woocommerce':
    case 'wordpress':
      return 'woocommerce';
    case 'goodtill':
      return 'pos';
    case 'wix':
      return 'wix';
    case 'amazon':
      return 'amazon';
    case 'ebay':
      return 'ebay';
    case 'tiktok':
      return 'tiktok';
    case 'etsy':
      return 'etsy';
    default:
      return 'b2b_portal';
  }
}
