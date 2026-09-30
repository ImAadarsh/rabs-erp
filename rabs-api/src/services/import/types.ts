export type ImportSourceType =
  | 'shopify_csv'
  | 'woocommerce_csv'
  | 'wordpress_csv'
  | 'shopify_api'
  | 'woocommerce_api'
  | 'wordpress_api'
  | 'custom_csv';

export type ImportChannel =
  | 'shopify'
  | 'woocommerce'
  | 'wordpress'
  | 'goodtill'
  | 'wix'
  | 'amazon'
  | 'ebay'
  | 'tiktok'
  | 'etsy'
  | 'custom';

export type DuplicateMode = 'skip' | 'update';

export interface ImportOptions {
  organizationId: string;
  businessUnitId?: string;
  warehouseId?: string;
  priceListId?: string;
  duplicateMode: DuplicateMode;
  importProducts: boolean;
  importVariants: boolean;
  importInventory: boolean;
  importPrices: boolean;
  importMedia: boolean;
  importChannelMappings: boolean;
}

export interface ParsedVariant {
  option1Name?: string;
  option1Value?: string;
  option2Name?: string;
  option2Value?: string;
  variantSku: string;
  channelVariantId: string;
  name?: string;
  price?: number;
  compareAtPrice?: number;
  inventoryQty?: number;
  imageUrl?: string;
  barcode?: string;
  status: 'active' | 'inactive' | 'discontinued';
}

export interface ParsedMedia {
  url: string;
  position: number;
  variantSku?: string;
}

export interface ParsedProduct {
  handle: string;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  brand?: string;
  productType?: string;
  tags?: string[];
  status: 'active' | 'inactive' | 'discontinued';
  variants: ParsedVariant[];
  media: ParsedMedia[];
}

export interface ImportPreviewSummary {
  productCount: number;
  variantCount: number;
  mediaCount: number;
  sampleProducts: ParsedProduct[];
}

export interface ImportResultSummary {
  productsCreated: number;
  productsUpdated: number;
  productsSkipped: number;
  variantsCreated: number;
  variantsUpdated: number;
  variantsSkipped: number;
  stockItemsCreated: number;
  stockItemsUpdated: number;
  priceListItemsCreated: number;
  mediaCreated: number;
  channelMappingsCreated: number;
  errors: Array<{ handle: string; message: string }>;
}
