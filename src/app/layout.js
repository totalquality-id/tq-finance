import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

// Font adaptif: perangkat Apple memakai SF Pro bawaan sistem lewat -apple-system
// di globals.css; perangkat lain memakai Inter (optical sizing).
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
  axes: ['opsz'],
});

export const metadata = {
  title: { default: 'TQ Finance', template: '%s · TQ Finance' },
  description: 'Sistem akuntansi & keuangan PT. Total Quality Indonesia',
  applicationName: 'TQ Finance',
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' };

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
