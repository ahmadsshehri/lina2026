import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'نظام إدارة العقارات',
  description: 'نظام متكامل لإدارة العقارات السكنية',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
      </head>
      <body>
        {children}
        <Toaster position="top-center" toastOptions={{ duration: 3000 }}/>
      </body>
    </html>
  );
}
