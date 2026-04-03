// app/calendar/page.tsx — تقويم الحجوزات
'use client';
import { useEffect, useState, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { getBookings, getUnits } from '../../lib/db';
import { Timestamp } from 'firebase/firestore';
import type { Booking, Unit } from '../../types';

const COLORS: Record<string, string> = {
  airbnb:  '#E74C3C',
  gathern: '#27AE60',
  booking: '#2E86C1',
  direct:  '#D4AC0D',
  other:   '#7D3C98',
};
const CHANNEL_LABEL: Record<string, string> = {
  airbnb:'Airbnb', gathern:'Gathern', booking:'Booking.com', direct:'مباشر', other:'أخرى',
};

const STATUS_LABEL: Record<string, string> = {
  confirmed:'مؤكد', checkedin:'وصل', checkedout:'غادر', cancelled:'ملغي',
};

export default function CalendarPage() {
  const { activeProperty, activeMonth, setActiveMonth, setActivePage } = useStore();
  const [bookings,  setBookings]  = useState<Booking[]>([]);
  const [furnUnits, setFurnUnits] = useState<Unit[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tooltip,   setTooltip]   = useState<{ b: Booking; x: number; y: number } | null>(null);

  useEffect(() => {
    setActivePage('calendar');
    if (!activeProperty) return;
    setLoading(true);
    Promise.all([
      getBookings(activeProperty.id, activeMonth),
      getUnits(activeProperty.id),
    ]).then(([b, u]) => {
      setBookings(b);
      setFurnUnits(u.filter(u => u.type === 'furnished'));
    }).finally(() => setLoading(false));
  }, [activeProperty, activeMonth]);

  const [year, month] = activeMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const today = new Date();
  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d;

  // أيام الأسبوع للرأس
  const dayNames = ['أح','إث','ثل','أر','خم','جم','سب'];

  function getBookingsForUnit(unitId: string) {
    return bookings.filter(b => b.unitId === unitId && b.status !== 'cancelled');
  }

  function getDayStatus(unitId: string, day: number): Booking | null {
    const d = new Date(year, month - 1, day);
    return getBookingsForUnit(unitId).find(b => {
      const ci = (b.checkinDate as Timestamp).toDate();
      const co = (b.checkoutDate as Timestamp).toDate();
      return d >= ci && d < co;
    }) || null;
  }

  // شهور التنقل
  const prevMonth = () => {
    const d = new Date(year, month - 2, 1);
    setActiveMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  };
  const nextMonth = () => {
    const d = new Date(year, month, 1);
    setActiveMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  };

  // احصائيات سريعة
  const totalBookings = bookings.filter(b => b.status !== 'cancelled').length;
  const totalRevenue  = bookings.filter(b => b.status !== 'cancelled').reduce((s,b) => s + b.netRevenue, 0);

  if (!activeProperty) return <NoProperty />;

  return (
    <div className="p-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-medium text-gray-800">تقويم الحجوزات</h1>
          <p className="text-sm text-gray-400">{furnUnits.length} شقة مفروشة</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[100px] text-center">
            {new Date(year, month-1).toLocaleDateString('ar-SA', {month:'long', year:'numeric'})}
          </span>
          <button onClick={nextMonth} className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <div className="text-xs text-gray-400">إجمالي الحجوزات</div>
          <div className="text-lg font-medium text-gray-800 mt-0.5">{totalBookings}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <div className="text-xs text-gray-400">صافي الإيرادات</div>
          <div className="text-lg font-medium text-green-600 mt-0.5">{totalRevenue.toLocaleString('ar-SA')} ر.س</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3 col-span-2">
          <div className="text-xs text-gray-400 mb-1.5">توزيع المنصات</div>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(COLORS).map(([ch, color]) => {
              const count = bookings.filter(b => b.channel === ch && b.status !== 'cancelled').length;
              if (!count) return null;
              return (
                <div key={ch} className="flex items-center gap-1 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }}/>
                  <span className="text-gray-600">{CHANNEL_LABEL[ch]}: {count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mb-3 flex-wrap">
        {Object.entries(COLORS).map(([ch, color]) => (
          <div key={ch} className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-3 h-3 rounded" style={{ background: color }}/>
            {CHANNEL_LABEL[ch]}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3 h-3 rounded bg-gray-100 border border-gray-200"/>
          شاغر
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3 h-3 rounded bg-blue-100 border-2 border-blue-400"/>
          اليوم
        </div>
      </div>

      {/* Calendar Grid */}
      {loading ? <PageLoader /> : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <div style={{ minWidth: `${90 + daysInMonth * 28}px` }}>

            {/* Day headers */}
            <div className="flex border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="w-24 flex-shrink-0 px-3 py-2 text-xs text-gray-400 font-medium border-l border-gray-100">
                الوحدة
              </div>
              {days.map(d => {
                const dow = new Date(year, month-1, d).getDay();
                return (
                  <div
                    key={d}
                    className={`w-7 flex-shrink-0 py-2 text-center text-[10px] border-l border-gray-50
                      ${isToday(d) ? 'bg-blue-50 text-blue-600 font-medium' :
                        dow === 5 ? 'text-red-400 bg-red-50/30' :
                        'text-gray-400'}`}
                  >
                    <div>{d}</div>
                    <div className="text-[8px] opacity-60">{dayNames[dow]}</div>
                  </div>
                );
              })}
            </div>

            {/* Unit rows */}
            {furnUnits.map(unit => (
              <div key={unit.id} className="flex border-b border-gray-50 hover:bg-gray-50/30">
                <div className="w-24 flex-shrink-0 px-3 py-2 border-l border-gray-100 flex items-center">
                  <div>
                    <div className="text-xs font-medium text-[#1B4F72]">شقة {unit.unitNumber}</div>
                    <div className="text-[10px] text-gray-400">
                      {getBookingsForUnit(unit.id).length} حجز
                    </div>
                  </div>
                </div>
                {days.map(d => {
                  const booking = getDayStatus(unit.id, d);
                  const ci = booking ? (booking.checkinDate as Timestamp).toDate() : null;
                  const isCheckin = ci && ci.getDate() === d && ci.getMonth() + 1 === month;

                  return (
                    <div
                      key={d}
                      className={`w-7 flex-shrink-0 h-10 border-l border-gray-50 relative cursor-pointer
                        ${isToday(d) ? 'border-l-blue-200' : ''}`}
                      onClick={(e) => {
                        if (booking) {
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          setTooltip({ b: booking, x: rect.left, y: rect.bottom + 8 });
                        } else setTooltip(null);
                      }}
                    >
                      {booking ? (
                        <div
                          className={`absolute inset-y-1 inset-x-0 opacity-90 transition-opacity hover:opacity-100
                            ${isCheckin ? 'rounded-r-md mr-0.5' : ''}`}
                          style={{ background: COLORS[booking.channel] || '#888' }}
                        >
                          {isCheckin && (
                            <div className="text-[8px] text-white font-medium px-1 pt-0.5 truncate leading-tight">
                              {booking.guestName.split(' ')[0]}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className={`absolute inset-y-1 inset-x-0.5 rounded
                          ${isToday(d) ? 'bg-blue-50' : ''}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-lg border border-gray-100 p-3 w-64"
          style={{ top: Math.min(tooltip.y, window.innerHeight - 200), left: Math.min(tooltip.x, window.innerWidth - 280) }}
          onClick={() => setTooltip(null)}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full" style={{ background: COLORS[tooltip.b.channel] }}/>
            <span className="text-xs font-medium text-gray-700">{CHANNEL_LABEL[tooltip.b.channel]}</span>
            <span className={`mr-auto text-xs px-1.5 py-0.5 rounded-full
              ${tooltip.b.status==='checkedin' ? 'bg-green-50 text-green-600' :
                tooltip.b.status==='checkedout' ? 'bg-gray-50 text-gray-500' :
                'bg-blue-50 text-blue-600'}`}>
              {STATUS_LABEL[tooltip.b.status]}
            </span>
          </div>
          <div className="space-y-1 text-xs">
            <Row label="الضيف"   val={tooltip.b.guestName}/>
            <Row label="الجوال"  val={tooltip.b.guestPhone || '—'}/>
            <Row label="الوصول"  val={fmtTs(tooltip.b.checkinDate)}/>
            <Row label="المغادرة" val={fmtTs(tooltip.b.checkoutDate)}/>
            <Row label="الليالي" val={`${tooltip.b.nights} ليلة`}/>
            <Row label="الإيراد" val={`${tooltip.b.totalRevenue.toLocaleString('ar-SA')} ر.س`}/>
            <Row label="صافي"   val={`${tooltip.b.netRevenue.toLocaleString('ar-SA')} ر.س`}/>
            {tooltip.b.depositAmount > 0 && (
              <Row label="تأمين" val={`${tooltip.b.depositAmount.toLocaleString('ar-SA')} (${depositLabel[tooltip.b.depositStatus]})`}/>
            )}
          </div>
          <button onClick={() => setTooltip(null)} className="mt-2 text-xs text-gray-400 hover:text-gray-600">إغلاق ✕</button>
        </div>
      )}

      {/* Booking list below calendar */}
      {!loading && bookings.length > 0 && (
        <div className="mt-5">
          <div className="text-sm font-medium text-gray-700 mb-3">قائمة الحجوزات</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {bookings
              .filter(b => b.status !== 'cancelled')
              .sort((a, b) => (a.checkinDate as Timestamp).seconds - (b.checkinDate as Timestamp).seconds)
              .map(b => (
                <div key={b.id} className="bg-white rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[b.channel] }}/>
                    <span className="text-xs font-medium">شقة {b.unitNumber}</span>
                    <span className="text-xs text-gray-400 mr-auto">{CHANNEL_LABEL[b.channel]}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-800 mb-1">{b.guestName}</div>
                  <div className="text-xs text-gray-500 mb-2">
                    {fmtTs(b.checkinDate)} → {fmtTs(b.checkoutDate)} ({b.nights} ليلة)
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-green-600">
                      {b.netRevenue.toLocaleString('ar-SA')} ر.س
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full
                      ${b.status==='confirmed' ? 'bg-blue-50 text-blue-600' :
                        b.status==='checkedin' ? 'bg-green-50 text-green-600' :
                        'bg-gray-50 text-gray-500'}`}>
                      {STATUS_LABEL[b.status]}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

const depositLabel: Record<string,string> = { held:'محتجز', returned:'مُعاد', deducted:'مخصوم' };
function Row({ label, val }: { label: string; val: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 font-medium">{val}</span>
    </div>
  );
}
function fmtTs(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
}
function PageLoader() {
  return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>;
}
function NoProperty() {
  return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">يرجى اختيار عقار أولاً</div>;
}
