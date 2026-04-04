'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface Property { id: string; name: string; }
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
  airbnb: 'Airbnb', gathern: 'Gathern', booking: 'Booking',
  direct: 'مباشر', other: 'أخرى',
};

async function getPropertiesForUser(uid: string) {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) return [];
  const userData = userSnap.data() as any;
  if (userData.role === 'owner') {
    const snap = await getDocs(query(collection(db, 'properties'), where('ownerId', '==', uid)));
    return snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name }));
  }
  const ids: string[] = userData.propertyIds || [];
  if (ids.length === 0) return [];
  const results: any[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const snap = await getDocs(query(collection(db, 'properties'), where('__name__', 'in', chunk)));
    snap.docs.forEach(d => results.push({ id: d.id, name: (d.data() as any).name }));
  }
  return results;
}

function fmtDate(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

export default function CalendarPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
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
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return; }
      const props = await getPropertiesForUser(user.uid);
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
    setBookings(bSnap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)).filter(b => b.status !== 'cancelled'));
  };

  const daysInMonth = new Date(month.year, month.month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const today = new Date();

  const prevMonth = () => setMonth(m => {
    if (m.month === 1) return { year: m.year - 1, month: 12 };
    return { year: m.year, month: m.month - 1 };
  });
  const nextMonth = () => setMonth(m => {
    if (m.month === 12) return { year: m.year + 1, month: 1 };
    return { year: m.year, month: m.month + 1 };
  });

  const getBookingForDay = (unitId: string, day: number): Booking | null => {
    const d = new Date(month.year, month.month - 1, day);
    return bookings.find(b => {
      if (b.unitId !== unitId) return false;
      const ci = b.checkinDate?.toDate ? b.checkinDate.toDate() : new Date(b.checkinDate);
      const co = b.checkoutDate?.toDate ? b.checkoutDate.toDate() : new Date(b.checkoutDate);
      return d >= ci && d < co;
    }) || null;
  };

  const isCheckinDay = (unitId: string, day: number): boolean => {
    const d = new Date(month.year, month.month - 1, day);
    return bookings.some(b => {
      if (b.unitId !== unitId) return false;
      const ci = b.checkinDate?.toDate ? b.checkinDate.toDate() : new Date(b.checkinDate);
      return ci.getDate() === d.getDate() && ci.getMonth() === d.getMonth() && ci.getFullYear() === d.getFullYear();
    });
  };

  const monthRevenue = bookings
    .filter(b => {
      const ci = b.checkinDate?.toDate ? b.checkinDate.toDate() : new Date(b.checkinDate);
      return ci.getMonth() + 1 === month.month && ci.getFullYear() === month.year;
    })
    .reduce((s, b) => s + (b.netRevenue || 0), 0);

  const monthBookings = bookings.filter(b => {
    const ci = b.checkinDate?.toDate ? b.checkinDate.toDate() : new Date(b.checkinDate);
    return ci.getMonth() + 1 === month.month && ci.getFullYear() === month.year;
  });

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f9fafb' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #1B4F72', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: '#6b7280', fontFamily: 'sans-serif', fontSize: '14px' }}>جارٍ التحميل...</p>
      </div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={prevMonth} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#fff', fontSize: '16px' }}>‹</button>
          <span style={{ color: '#fff', fontSize: '13px', minWidth: '80px', textAlign: 'center' }}>
            {new Date(month.year, month.month - 1).toLocaleDateString('ar-SA', { month: 'short', year: 'numeric' })}
          </span>
          <button onClick={nextMonth} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#fff', fontSize: '16px' }}>›</button>
        </div>
      </div>

      <div style={{ padding: '16px', maxWidth: '900px', margin: '0 auto' }}>

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
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {Object.entries(CH_COLOR).map(([k, c]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#6b7280' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: c }} />
              {CH_LABEL[k]}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#6b7280' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#f3f4f6', border: '1px solid #e5e7eb' }} />
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
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: `${80 + daysInMonth * 26}px` }}>

                {/* Day headers */}
                <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${daysInMonth}, 24px)`, gap: '2px', padding: '8px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb' }}>
                  <div style={{ fontSize: '10px', color: '#9ca3af', display: 'flex', alignItems: 'center', paddingRight: '4px' }}>الوحدة</div>
                  {days.map(d => {
                    const isToday = today.getDate() === d && today.getMonth() + 1 === month.month && today.getFullYear() === month.year;
                    const dow = new Date(month.year, month.month - 1, d).getDay();
                    const isFri = dow === 5;
                    return (
                      <div key={d} style={{ textAlign: 'center', fontSize: '10px', color: isToday ? '#1B4F72' : isFri ? '#dc2626' : '#9ca3af', fontWeight: isToday ? '700' : '400', background: isToday ? '#dbeafe' : 'transparent', borderRadius: '4px', padding: '2px 0' }}>
                        {d}
                      </div>
                    );
                  })}
                </div>

                {/* Unit rows */}
                {units.map(unit => (
                  <div key={unit.id} style={{ display: 'grid', gridTemplateColumns: `80px repeat(${daysInMonth}, 24px)`, gap: '2px', padding: '4px 8px', borderBottom: '1px solid #f9fafb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', paddingRight: '4px' }}>
                      <span style={{ background: '#1B4F72', color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: '600' }}>
                        {unit.unitNumber}
                      </span>
                    </div>
                    {days.map(d => {
                      const booking = getBookingForDay(unit.id, d);
                      const isCI = booking && isCheckinDay(unit.id, d);
                      const color = booking ? CH_COLOR[booking.channel] || '#888' : null;
                      return (
                        <div
                          key={d}
                          onClick={() => booking ? setSelected(booking) : null}
                          style={{
                            height: '24px', borderRadius: '4px', cursor: booking ? 'pointer' : 'default',
                            background: color || '#f3f4f6',
                            border: color ? 'none' : '1px solid #e5e7eb',
                            opacity: 0.9,
                            position: 'relative',
                          }}
                          title={booking ? `${booking.guestName} (${CH_LABEL[booking.channel]})` : ''}
                        >
                          {isCI && (
                            <div style={{ position: 'absolute', top: '2px', right: '2px', width: '6px', height: '6px', background: '#fff', borderRadius: '50%', opacity: 0.8 }} />
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

        {/* This month bookings list */}
        {monthBookings.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '10px' }}>
              حجوزات {new Date(month.year, month.month - 1).toLocaleDateString('ar-SA', { month: 'long' })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {monthBookings.map(b => {
                const ch = CH_COLOR[b.channel] || '#888';
                return (
                  <div key={b.id} onClick={() => setSelected(b)}
                    style={{ background: '#fff', borderRadius: '12px', padding: '12px 14px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: ch, flexShrink: 0 }} />
                    <div style={{ background: '#1B4F72', color: '#fff', borderRadius: '6px', padding: '2px 8px', fontSize: '12px', fontWeight: '600' }}>{b.unitNumber}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#111827' }}>{b.guestName}</div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>{fmtDate(b.checkinDate)} → {fmtDate(b.checkoutDate)} · {b.nights} ليلة</div>
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
              ['الوصول', fmtDate(selected.checkinDate)],
              ['المغادرة', fmtDate(selected.checkoutDate)],
              ['الليالي', selected.nights + ' ليلة'],
              ['صافي الإيراد', (selected.netRevenue || 0).toLocaleString('ar-SA') + ' ر.س'],
            ].map(([l, v]) => (
              <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>{l}</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
