import dotenv from 'dotenv';
dotenv.config();

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const env = {
  // Application
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
  HOST: process.env.HOST ?? '0.0.0.0',

  // Database
  DB_HOST: process.env.DB_HOST ?? 'localhost',
  DB_PORT: Number(process.env.DB_PORT ?? 3306),
  DB_USERNAME: process.env.DB_USERNAME ?? '',
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',
  DB_NAME: process.env.DB_NAME ?? '',

  // JWT
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'change_me_access_secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'change_me_refresh_secret',
  JWT_ACCESS_TTL: Number(process.env.JWT_ACCESS_TTL ?? ONE_YEAR_SECONDS), // 1 year
  JWT_REFRESH_TTL: Number(process.env.JWT_REFRESH_TTL ?? ONE_YEAR_SECONDS), // 1 year

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:4000/api/iam/auth/google/callback',

  // Public origin of this API (no trailing slash)
  PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? 'http://localhost:4000',

  // Frontend
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  B2B_WEBSITE_URL: process.env.B2B_WEBSITE_URL ?? 'http://localhost:3001',

  // AWS S3
  AWS_REGION: process.env.AWS_REGION ?? 'ap-south-1',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME ?? '',
  AWS_S3_BUCKET_URL: process.env.AWS_S3_BUCKET_URL ?? '',

  // Encrypts saved Shopify/WooCommerce credentials (falls back to JWT_ACCESS_SECRET)
  CHANNEL_CREDENTIALS_SECRET: process.env.CHANNEL_CREDENTIALS_SECRET ?? '',

  // Worldpay Access (optional; prefer PaymentGateway DB row for org credentials)
  WORLDPAY_USERNAME: process.env.WORLDPAY_USERNAME ?? '',
  WORLDPAY_API_PASSWORD: process.env.WORLDPAY_API_PASSWORD ?? '',
  WORLDPAY_MERCHANT_ENTITY: process.env.WORLDPAY_MERCHANT_ENTITY ?? 'default',
  WORLDPAY_MODE: (process.env.WORLDPAY_MODE === 'live' ? 'live' : 'test') as 'test' | 'live',

  // Meta / Facebook / Instagram
  META_APP_ID: process.env.META_APP_ID ?? '',
  META_APP_SECRET: process.env.META_APP_SECRET ?? '',
  META_BUSINESS_ID: process.env.META_BUSINESS_ID ?? '',
  META_LOGIN_CONFIG_ID: process.env.META_LOGIN_CONFIG_ID ?? '',
  META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN ?? '',
  META_GRAPH_VERSION: process.env.META_GRAPH_VERSION ?? 'v26.0',
  META_OAUTH_SCOPES: process.env.META_OAUTH_SCOPES ?? '',
  META_REDIRECT_URI:
    process.env.META_REDIRECT_URI ?? 'http://localhost:4000/api/social/meta/callback',
  META_API_PUBLIC_URL: process.env.META_API_PUBLIC_URL ?? 'http://localhost:4000',

  // CRM external lead ingest (optional MVP single-key fallback; prefer crm_integration_keys)
  CRM_LEAD_INGEST_API_KEY: process.env.CRM_LEAD_INGEST_API_KEY ?? '',
  CRM_LEAD_INGEST_ORG_ID: process.env.CRM_LEAD_INGEST_ORG_ID ?? '1',

  // Gmail SMTP (cold email campaigns) — use an App Password, never log SMTP_PASS
  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  SMTP_FROM: process.env.SMTP_FROM ?? '',

  // SendGrid (optional global fallback; prefer per-org marketing_email_connectors)
  // Never log SENDGRID_API_KEY
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ?? '',
  SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL ?? '',
  SENDGRID_FROM_NAME: process.env.SENDGRID_FROM_NAME ?? '',
  SENDGRID_WEBHOOK_SECRET: process.env.SENDGRID_WEBHOOK_SECRET ?? '',
  /** PEM or base64 public key for Signed Event Webhook */
  SENDGRID_WEBHOOK_VERIFICATION_KEY: process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY ?? '',

  // DHL Express MyDHL API — Basic(API Key : API Secret). Never log these values.
  DHL_API_KEY: process.env.DHL_API_KEY ?? '',
  DHL_API_SECRET: process.env.DHL_API_SECRET ?? '',
  DHL_ACCOUNT_NUMBER: process.env.DHL_ACCOUNT_NUMBER ?? '',
  DHL_MODE: (process.env.DHL_MODE === 'live' ? 'live' : 'test') as 'test' | 'live',
  DHL_DEFAULT_PRODUCT_CODE: process.env.DHL_DEFAULT_PRODUCT_CODE ?? 'N',
  DHL_SHIPPER_NAME: process.env.DHL_SHIPPER_NAME ?? '',
  DHL_SHIPPER_COMPANY: process.env.DHL_SHIPPER_COMPANY ?? '',
  DHL_SHIPPER_PHONE: process.env.DHL_SHIPPER_PHONE ?? '',
  DHL_SHIPPER_EMAIL: process.env.DHL_SHIPPER_EMAIL ?? '',
  DHL_SHIPPER_ADDRESS1: process.env.DHL_SHIPPER_ADDRESS1 ?? '',
  DHL_SHIPPER_ADDRESS2: process.env.DHL_SHIPPER_ADDRESS2 ?? '',
  DHL_SHIPPER_CITY: process.env.DHL_SHIPPER_CITY ?? '',
  DHL_SHIPPER_POSTAL: process.env.DHL_SHIPPER_POSTAL ?? '',
  DHL_SHIPPER_COUNTRY: process.env.DHL_SHIPPER_COUNTRY ?? 'GB',
  DHL_SHIPPER_STATE: process.env.DHL_SHIPPER_STATE ?? ''
};


