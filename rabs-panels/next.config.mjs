/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  async redirects() {
    return [
      { source: '/payments/gateways', destination: '/finance/gateways', permanent: false },
      { source: '/settings/gateways', destination: '/finance/gateways', permanent: false },
      { source: '/gateways', destination: '/finance/gateways', permanent: false },
    ];
  },
};
export default nextConfig;

