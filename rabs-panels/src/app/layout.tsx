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
        <meta name="theme-color" content="#9A7B52" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <title>Rabs Interiors</title>
        <meta name="description" content="Rabs Interiors - Complete business management platform" />
        <link rel="icon" href="/brand/rabs-mark.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/brand/rabs-mark-180.png" />
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


