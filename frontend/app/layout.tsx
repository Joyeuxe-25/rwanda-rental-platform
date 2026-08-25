import type { Metadata, Viewport } from 'next';
import { Outfit, Inter } from 'next/font/google';

import { AuthProvider } from '@/components/auth/auth-provider';
import { NotificationProvider } from '@/components/notifications/notification-provider';
import { AppShell } from '@/components/layout/app-shell';
import { SkipLink } from '@/components/layout/skip-link';
import './globals.css';

// Display + body fonts loaded via Next.js font optimization (self-hosted at
// build time; no runtime CSS import), exposed as CSS variables to Tailwind.
const fontDisplay = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});
const fontBody = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Rwanda Rental Platform',
    template: '%s · Rwanda Rental Platform',
  },
  description:
    'Rwanda Rental Platform — connecting landlords and tenants for property rentals across Rwanda.',
  applicationName: 'Rwanda Rental Platform',
  metadataBase: new URL('http://localhost:3000'),
};

export const viewport: Viewport = {
  themeColor: '#273469',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontDisplay.variable} ${fontBody.variable}`}>
      <body className="font-sans">
        <AuthProvider>
          <NotificationProvider>
            <SkipLink />
            <AppShell>{children}</AppShell>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
