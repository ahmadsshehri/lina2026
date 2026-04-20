import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'كِراءَك',
  description: 'نظام إدارة العقارات والوحدات السكنية',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1B4F72" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="كِراءَك" />
      </head>
      <body>
        {children}
        <Toaster position="top-center" toastOptions={{ duration: 3000 }}/>
      </body>
    </html>
  );
}
