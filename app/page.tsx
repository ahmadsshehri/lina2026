'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthed(true);
      } else {
        router.push('/login');
      }
      setChecking(false);
    });
    return unsub;
  }, []);

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '12px', background: '#f9fafb' }}>
        <p style={{ color: '#6b7280', fontSize: '14px', fontFamily: 'sans-serif' }}>جارٍ التحقق...</p>
      </div>
    );
  }

  if (!authed) {
    return null;
  }

  const cards = [
    { label: 'الايجار الشهري', icon: '📋', href: '/monthly', color: '#dbeafe', border: '#93c5fd' },
    { label: 'الشقق المفروشة', icon: '🏨', href: '/furnished', color: '#d1fae5', border: '#6ee7b7' },
    { label: 'المصاريف', icon: '💳', href: '/expenses', color: '#fef3c7', border: '#fcd34d' },
    { label: 'التقارير', icon: '📊', href: '/reports', color: '#ede9fe', border: '#c4b5fd' },
    { label: 'تقويم الحجوزات', icon: '📅', href: '/calendar', color: '#fce7f3', border: '#f9a8d4' },
    { label: 'التدفق المالي', icon: '💰', href: '/cashflow', color: '#ecfdf5', border: '#6ee7b7' },
    { label: 'الوحدات والعقارات', icon: '🏢', href: '/units', color: '#f0f9ff', border: '#7dd3fc' },
    { label: 'المستخدمون', icon: '👥', href: '/users', color: '#fff7ed', border: '#fdba74' },
  ];

  return (
    <div dir="rtl" style={{ padding: '24px', fontFamily: 'sans-serif', minHeight: '100vh', background: '#f9fafb' }}>
      <div style={{ marginBottom: '24px', borderBottom: '1px solid #e5e7eb', paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#1B4F72', margin: '0' }}>
            نظام ادارة العقارات
          </h1>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
            لوحة التحكم الرئيسية
          </p>
        </div>
        <button
          onClick={() => { auth.signOut(); router.push('/login'); }}
          style={{ padding: '8px 16px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
        >
          تسجيل الخروج
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        {cards.map(function(card) {
          return (
            <a
              key={card.href}
              href={card.href}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 16px', background: card.color, border: '1px solid ' + card.border, borderRadius: '12px', textDecoration: 'none', color: '#1f2937', cursor: 'pointer', gap: '10px' }}
            >
              <span style={{ fontSize: '36px' }}>{card.icon}</span>
              <span style={{ fontSize: '14px', fontWeight: '500', textAlign: 'center' }}>{card.label}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
