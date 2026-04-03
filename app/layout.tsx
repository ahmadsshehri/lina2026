// app/layout.tsx
import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '../context/AuthContext';
import AppLayout from '../components/layout/AppLayout';
import './globals.css';

export const metadata: Metadata = {
  title: 'نظام إدارة العقارات',
  description: 'نظام متكامل لإدارة العقارات السكنية',
  manifest: '/manifest.json',
  themeColor: '#1B4F72',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-status-bar-style" content="default"/>
        <link rel="apple-touch-icon" href="/icon-192.png"/>
      </head>
      <body>
        <AuthProvider>
          <AppLayout>{children}</AppLayout>
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: { fontFamily: 'system-ui, sans-serif', direction: 'rtl' },
              success: { iconTheme: { primary: '#1E8449', secondary: '#fff' } },
              error:   { iconTheme: { primary: '#E74C3C', secondary: '#fff' } },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
