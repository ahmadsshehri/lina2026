'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../../lib/userHelpers';

interface Unit { id: string; unitNumber: string; }
interface Booking {
  id: string; unitId: string; unitNumber: string; guestName: string;
  channel: string; checkinDate: any; checkoutDate: any;
  nights: number; netRevenue: number; status: string;
}

const CH_COLOR: Record<string, string> = {
  airbnb: '#E74C3C', gathern: '#27AE60', booking: '#2E86C1',
  direct: '#D4AC0D', other: '#7D3C98',
};
const CH_LABEL: Record<string, string> = {
  airbnb: 'Airbnb', gathern: 'Gathern', booking: 'Booking.com',
  direct: 'مباشر', other: 'أخرى',
};

function fmtDate(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

// ✅ الإصلاح الجوهري: يوم الـ checkin يُظلَّل، يوم الـ checkout لا يُظلَّل
// المقارنة الصحيحة: checkin <= day < checkout
function getBookingForDay(bookings: Booking[], unitId: string, year: number, month: number, day: number): Booking | null {
  // نبني تاريخ اليوم بدون وقت
  const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
  const dayEnd   = new Date(year, month - 1, day, 23, 59, 59, 999);

  return bookings.find(b => {
    if (b.unitId !== unitId || b.status === 'cancelled') return false;

    const ci = b.checkinDate?.toDate ? b.checkinDate.toDate() : new Date(b.checkinDate);
    const co = b.checkoutDate?.toDate ? b.checkoutDate.toDate() : new Date(b.checkoutDate);

    // نُسوّي إلى منتصف الليل لتجنب مشاكل التوقيت
    const ciDay = new Date(ci.getFullYear(), ci.getMonth(), ci.getDate());
    const coDay = new Date(co.getFullYear(), co.getMonth(), co.getDate());

    // ✅ checkin <= day < checkout  (يوم المغادرة لا يُحتسب)
    return dayStart >= ciDay && dayStart < coDay;
  }) || null;
}

function isCheckinDay(bookings: Booking[], unitId: string, year: number, month: number, day: number): boolean {
  const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
  return bookings.some(b => {
    if (b.unitId !== unitId || b.status === 'cancelled') return false;
    const ci = b.checkinDate?.toDate ? b.checkinDate.toDate() : new Date(b.checkinDate);
    const ciDay = new Date(ci.getFullYear(), ci.getMonth(), ci.getDate());
    return dayStart.getTime() === ciDay.getTime();
  });
}

function isCheckoutDay(bookings: Booking[], unitId: string, year: number, month: number, day: number): boolean {
  const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
  return bookings.some(b => {
    if (b.unitId !== unitId || b.status === 'cancelled') return false;
    const co = b.checkoutDate?.toDate ? b.checkoutDate.toDate() : new Date(b.checkoutDate);
    const coDay = new Date(co.getFullYear(), co.getMonth(), co.getDate());
    return dayStart.getTime() === coDay.getTime();
  });
}

export default function CalendarPage() {
  const router = useRouter();
  const [appUser, setAppUser] = useState<AppUserBasic | null>(null);
  const [properties, setProperties] = useState<PropertyBasic[]>([]);
  const [propId, setPropId] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [selected, setSelected] = useState<Booking | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }
      const user = await getCurrentUser(fbUser.uid);
      if (!user) { router.push('/login'); return; }
      setAppUser(user);
      const props = await loadPropertiesForUser(fbUser.uid, user.role);
      setProperties(props);
      if (props.length > 0) {
        setPropId(props[0].id);
        await loadData(props[0].id);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadData = async (pid: string) => {
    const [uSnap, bSnap] = await Promise.all([
      getDocs(query(collection(db, 'units'), where('propertyId', '==', pid), where('type', '==', 'furnished'))),
      getDocs(query(collection(db, 'bookings'), where('propertyId', '==', pid))),
    ]);
    setUnits(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as Unit)));
    setBookings(bSnap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
  };

  const daysInMonth = new Date(month.year, month.month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const today = new Date();

  const prevMonth = () => setMonth(m => m.month === 1 ? { year: m.year - 1, month: 12 } : { ...m, month: m.month - 1 });
  const nextMonth = () => setMonth(m => m.month === 12 ? { year: m.year + 1, month: 1 } : { ...m, month: m.month + 1 });

  const monthBookings = bookings.filter(b => {
    if (b.status === 'cancelled') return false;
    const ci = b.checkinDate?.toDate ? b.checkinDate.toDate() : new Date(b.checkinDate);
    return ci.getMonth() + 1 === month.month && ci.getFullYear() === month.year;
  });
  const monthRevenue = monthBookings.reduce((s, b) => s + (b.netRevenue || 0), 0);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f9fafb' }}>
      <div style={{ width: '40px', height: '40px', border: '3px solid #1B4F72', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div dir="rtl" style={{ fontFamily: 'sans-serif', background: '#f9fafb', minHeight: '100vh' }}>

      {/* Top bar */}
      <div style={{ background: '#1B4F72', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => router.push('/')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}>
          <span style={{ color: '#fff', fontSize: '18px' }}>←</span>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: '600', color: '#fff' }}>تقويم الحجوزات</h1>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>{units.length} وحدة مفروشة</p>
        </div>
        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={prevMonth} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#fff', fontSize: '16px' }}>‹</button>
          <span style={{ color: '#fff', fontSize: '13px', minWidth: '90px', textAlign: 'center' }}>
            {new Date(month.year, month.month - 1).toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={nextMonth} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#fff', fontSize: '16px' }}>›</button>
        </div>
      </div>

      <div style={{ padding: '16px', maxWidth: '960px', margin: '0 auto' }}>

        {/* Property selector */}
        {properties.length > 1 && (
          <div style={{ marginBottom: '14px' }}>
            <select value={propId} onChange={e => { setPropId(e.target.value); loadData(e.target.value); }}
              style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '12px', padding: '12px 16px', fontSize: '14px', background: '#fff' }}>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '16px' }}>
          {[
            { label: 'حجوزات الشهر', val: monthBookings.length, color: '#1e40af', bg: '#dbeafe' },
            { label: 'إيرادات الشهر', val: monthRevenue.toLocaleString('ar-SA') + ' ر.س', color: '#16a34a', bg: '#d1fae5' },
            { label: 'الوحدات المفروشة', val: units.length, color: '#7c3aed', bg: '#ede9fe' },
          ].map(k => (
            <div key={k.label} style={{ background: k.bg, borderRadius: '14px', padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>{k.label}</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: k.color }}>{k.val}</div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '14px', marginBottom: '12px', flexWrap: 'wrap', background: '#fff', padding: '10px 14px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          {Object.entries(CH_COLOR).map(([k, c]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#6b7280' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: c }} />
              {CH_LABEL[k]}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#6b7280' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fff', border: '2px solid #666' }} />
            يوم الوصول (●)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#6b7280' }}>
            <div style={{ width: '10px', height: '10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '2px' }} />
            شاغر
          </div>
        </div>

        {/* Calendar grid */}
        {units.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📅</div>
            <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>لا توجد وحدات مفروشة — أضف وحدات من صفحة الوحدات</p>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: `${90 + daysInMonth * 28}px` }}>

                {/* Day headers */}
                <div style={{ display: 'grid', gridTemplateColumns: `90px repeat(${daysInMonth}, 26px)`, gap: '2px', padding: '8px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb', alignItems: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#9ca3af', paddingRight: '6px' }}>الوحدة</div>
                  {days.map(d => {
                    const isToday = today.getDate() === d && today.getMonth() + 1 === month.month && today.getFullYear() === month.year;
                    const dow = new Date(month.year, month.month - 1, d).getDay();
                    const isFri = dow === 5;
                    return (
                      <div key={d} style={{ textAlign: 'center', fontSize: '10px', color: isToday ? '#fff' : isFri ? '#dc2626' : '#9ca3af', fontWeight: isToday ? '700' : '400', background: isToday ? '#1B4F72' : 'transparent', borderRadius: '4px', padding: '2px 0' }}>
                        {d}
                      </div>
                    );
                  })}
                </div>

                {/* Unit rows */}
                {units.map(unit => (
                  <div key={unit.id} style={{ display: 'grid', gridTemplateColumns: `90px repeat(${daysInMonth}, 26px)`, gap: '2px', padding: '4px 8px', borderBottom: '1px solid #f9fafb', alignItems: 'center' }}>
                    <div style={{ paddingRight: '6px' }}>
                      <span style={{ background: '#1B4F72', color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: '600' }}>
                        {unit.unitNumber}
                      </span>
                    </div>
                    {days.map(d => {
                      const booking = getBookingForDay(bookings, unit.id, month.year, month.month, d);
                      const isCI = isCheckinDay(bookings, unit.id, month.year, month.month, d);
                      const isCO = isCheckoutDay(bookings, unit.id, month.year, month.month, d);
                      const color = booking ? CH_COLOR[booking.channel] || '#888' : null;

                      return (
                        <div
                          key={d}
                          onClick={() => booking ? setSelected(booking) : null}
                          title={
                            booking
                              ? `${booking.guestName} (${CH_LABEL[booking.channel]})${isCI ? ' — يوم الوصول' : isCO ? ' — يوم المغادرة' : ''}`
                              : isCO ? 'يوم المغادرة (شاغر)' : ''
                          }
                          style={{
                            height: '26px',
                            borderRadius: isCI ? '6px 2px 2px 6px' : isCO ? '2px 6px 6px 2px' : '2px',
                            cursor: booking ? 'pointer' : 'default',
                            background: color || '#f3f4f6',
                            border: color ? 'none' : '1px solid #e5e7eb',
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {/* نقطة بيضاء في يوم الوصول */}
                          {isCI && color && (
                            <div style={{ width: '6px', height: '6px', background: '#fff', borderRadius: '50%', opacity: 0.9 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* قائمة حجوزات الشهر */}
        {monthBookings.length > 0 && (
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '10px' }}>
              حجوزات {new Date(month.year, month.month - 1).toLocaleDateString('ar-SA', { month: 'long' })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {monthBookings.sort((a, b) => (a.checkinDate?.seconds || 0) - (b.checkinDate?.seconds || 0)).map(b => {
                const ch = CH_COLOR[b.channel] || '#888';
                return (
                  <div key={b.id} onClick={() => setSelected(b)}
                    style={{ background: '#fff', borderRadius: '12px', padding: '12px 14px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: ch, flexShrink: 0 }} />
                    <div style={{ background: '#1B4F72', color: '#fff', borderRadius: '6px', padding: '2px 8px', fontSize: '12px', fontWeight: '600' }}>{b.unitNumber}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#111827' }}>{b.guestName}</div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                        {fmtDate(b.checkinDate)} ← وصول · {fmtDate(b.checkoutDate)} ← مغادرة · {b.nights} ليلة
                      </div>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#16a34a' }}>{b.netRevenue?.toLocaleString('ar-SA')} ر.س</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Booking detail popup */}
      {selected && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }}
          onClick={() => setSelected(null)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '500px' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#1B4F72' }}>تفاصيل الحجز</h3>
              <button onClick={() => setSelected(null)} style={{ border: 'none', background: '#f3f4f6', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
            {[
              ['الضيف', selected.guestName],
              ['الشقة', selected.unitNumber],
              ['المنصة', CH_LABEL[selected.channel] || selected.channel],
              ['تاريخ الوصول', fmtDate(selected.checkinDate)],
              ['تاريخ المغادرة', fmtDate(selected.checkoutDate)],
              ['عدد الليالي', selected.nights + ' ليلة'],
              ['صافي الإيراد', (selected.netRevenue || 0).toLocaleString('ar-SA') + ' ر.س'],
            ].map(([l, v]) => (
              <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>{l}</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{v}</span>
              </div>
            ))}
            <button onClick={() => setSelected(null)} style={{ width: '100%', marginTop: '16px', padding: '12px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px' }}>
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
