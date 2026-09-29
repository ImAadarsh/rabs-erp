import '@/app/globals.css';
import type { ReactNode } from 'react';
import { Inter, Poppins } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap'
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap'
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#A31F24" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <title>RABS Carpets &amp; Furniture</title>
        <meta name="description" content="RABS Carpets &amp; Furniture — Turning Houses Into Homes. Carpet, laminate, LVT, flooring, vinyl, beds, sofas and furniture." />
        <link rel="icon" href="/brand/rabs-icon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/brand/rabs-icon-180.png" />
      </head>
      <body className={`${inter.variable} ${poppins.variable} font-sans antialiased`} suppressHydrationWarning>
        <ServiceWorkerRegistration />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}


