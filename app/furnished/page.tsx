// app/furnished/page.tsx — الشقق المفروشة
'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useStore } from '../../store/useStore';
import {
  getBookings, createBooking, updateBooking, updateDepositStatus,
  getUnits, calcOccupancy,
} from '../../lib/db';
import { Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { exportBookingsPDF } from '../../lib/export';
import type { Booking, Unit } from '../../types';

const CHANNEL_COLORS: Record<string, string> = {
  airbnb:  { bg: 'bg-red-50',    text: 'text-red-600',    dot: '#E74C3C' },
  gathern: { bg: 'bg-green-50',  text: 'text-green-700',  dot: '#27AE60' },
  booking: { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: '#2E86C1' },
  direct:  { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: '#D4AC0D' },
  other:   { bg: 'bg-purple-50', text: 'text-purple-700', dot: '#7D3C98' },
} as any;

const channelLabel: Record<string, string> = {
  airbnb: 'Airbnb', gathern: 'Gathern', booking: 'Booking.com',
  direct: 'مباشر', other: 'أخرى',
};
const statusLabel: Record<string, string> = {
  confirmed: 'مؤكد', checkedin: 'وصل', checkedout: 'غادر', cancelled: 'ملغي',
};
const depositLabel: Record<string, string> = {
  held: 'محتجز', returned: 'مُعاد', deducted: 'مخصوم',
};

export default function FurnishedPage() {
  const { activeProperty, activeMonth, setActivePage } = useStore();
  const [bookings,      setBookings]      = useState<Booking[]>([]);
  const [furnUnits,     setFurnUnits]     = useState<Unit[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showModal,     setShowModal]     = useState(false);
  const [editBooking,   setEditBooking]   = useState<Booking | null>(null);
  const [filterChannel, setFilterChannel] = useState('all');
  const [filterUnit,    setFilterUnit]    = useState('all');

  const load = async () => {
    if (!activeProperty) return;
    setLoading(true);
    const [b, u] = await Promise.all([
      getBookings(activeProperty.id, activeMonth),
      getUnits(activeProperty.id),
    ]);
    setBookings(b);
    setFurnUnits(u.filter(u => u.type === 'furnished'));
    setLoading(false);
  };

  useEffect(() => { setActivePage('furnished'); load(); }, [activeProperty, activeMonth]);

  const [y, m] = activeMonth.split('-').map(Number);

  const filtered = bookings.filter(b => {
    if (filterChannel !== 'all' && b.channel !== filterChannel) return false;
    if (filterUnit    !== 'all' && b.unitId  !== filterUnit)    return false;
    return true;
  });

  const activeBookings = filtered.filter(b => b.status !== 'cancelled');
  const totalRevenue   = activeBookings.reduce((s, b) => s + b.netRevenue, 0);
  const totalNights    = activeBookings.reduce((s, b) => s + b.nights, 0);
  const pendingDeposit = bookings.filter(b => b.depositStatus === 'held' && b.status === 'checkedout').length;

  // متوسط الإشغال
  const avgOccupancy = furnUnits.length > 0
    ? Math.round(furnUnits.reduce((s, u) => s + calcOccupancy(bookings, u.id, y, m), 0) / furnUnits.length)
    : 0;

  if (!activeProperty) return <NoProperty />;

  return (
    <div className="p-5" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-medium text-gray-800">الشقق المفروشة</h1>
          <p className="text-sm text-gray-400">{activeMonth} — {furnUnits.length} وحدة مفروشة</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportBookingsPDF(activeBookings, activeProperty.name, activeMonth)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >⬇ PDF</button>
          <button
            onClick={() => { setEditBooking(null); setShowModal(true); }}
            className="bg-[#1B4F72] text-white text-sm rounded-lg px-4 py-1.5 hover:bg-[#2E86C1] transition-colors"
          >+ حجز جديد</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard label="صافي الإيرادات" value={`${totalRevenue.toLocaleString('ar-SA')} ر.س`} accent="#1E8449"/>
        <KpiCard label="متوسط الإشغال" value={`${avgOccupancy}%`} accent="#D4AC0D"
          sub={furnUnits.map(u => `${u.unitNumber}: ${calcOccupancy(bookings, u.id, y, m)}%`).join(' | ')}/>
        <KpiCard label="عدد الحجوزات" value={`${activeBookings.length} حجز`} accent="#2E86C1"
          sub={`${totalNights} ليلة إجمالاً`}/>
        <KpiCard label="تأمينات معلقة" value={`${pendingDeposit} حجز`}
          accent={pendingDeposit > 0 ? '#E74C3C' : '#1E8449'}
          sub={pendingDeposit > 0 ? 'تحتاج مراجعة' : 'لا شيء معلق ✓'}/>
      </div>

      {/* Occupancy per unit */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <div className="text-sm font-medium text-gray-700 mb-3">نسبة الإشغال لكل وحدة — {activeMonth}</div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {furnUnits.map(u => {
            const occ = calcOccupancy(bookings, u.id, y, m);
            return (
              <div key={u.id} className="flex items-center gap-3">
                <div className="text-sm font-medium text-[#1B4F72] w-16">ش {u.unitNumber}</div>
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span></span><span>{occ}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${occ}%`,
                        background: occ >= 70 ? '#1E8449' : occ >= 50 ? '#D4AC0D' : '#E74C3C'
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <select
          value={filterChannel}
          onChange={e => setFilterChannel(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
        >
          <option value="all">جميع المنصات</option>
          {Object.entries(channelLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          value={filterUnit}
          onChange={e => setFilterUnit(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
        >
          <option value="all">جميع الوحدات</option>
          {furnUnits.map(u => <option key={u.id} value={u.id}>شقة {u.unitNumber}</option>)}
        </select>
        <div className="flex gap-1.5 items-center mr-auto">
          {Object.entries(channelLabel).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1 text-xs text-gray-500">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: (CHANNEL_COLORS[k] as any)?.dot }}/>
              {v}
            </div>
          ))}
        </div>
      </div>

      {/* Bookings Table */}
      {loading ? <PageLoader /> : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['الشقة','الضيف','المنصة','الوصول','المغادرة','ليالي','الإيراد','صافي','تأمين','الحالة',''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-gray-300">لا توجد حجوزات لهذه الفترة</td></tr>
              )}
              {filtered.map(b => {
                const ch = CHANNEL_COLORS[b.channel] as any;
                return (
                  <tr key={b.id} className={`border-t border-gray-50 hover:bg-gray-50/50 ${b.status === 'cancelled' ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2.5 font-medium text-[#1B4F72]">{b.unitNumber}</td>
                    <td className="px-3 py-2.5 font-medium">{b.guestName}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ch?.bg} ${ch?.text}`}>
                        {channelLabel[b.channel]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{fmtTs(b.checkinDate)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{fmtTs(b.checkoutDate)}</td>
                    <td className="px-3 py-2.5 text-center">{b.nights}</td>
                    <td className="px-3 py-2.5">{b.totalRevenue.toLocaleString('ar-SA')}</td>
                    <td className="px-3 py-2.5 font-medium text-green-600">{b.netRevenue.toLocaleString('ar-SA')}</td>
                    <td className="px-3 py-2.5">
                      {b.depositAmount > 0 ? (
                        <button
                          onClick={() => handleDepositClick(b)}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer
                            ${b.depositStatus === 'held'     ? 'bg-orange-50 text-orange-600 hover:bg-orange-100' :
                              b.depositStatus === 'returned' ? 'bg-green-50 text-green-600' :
                              'bg-red-50 text-red-600'}`}
                        >
                          {depositLabel[b.depositStatus]} ({b.depositAmount.toLocaleString()})
                        </button>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full
                        ${b.status === 'confirmed'  ? 'bg-blue-50 text-blue-600' :
                          b.status === 'checkedin'  ? 'bg-green-50 text-green-600' :
                          b.status === 'checkedout' ? 'bg-gray-50 text-gray-500' :
                          'bg-red-50 text-red-400'}`}>
                        {statusLabel[b.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setEditBooking(b); setShowModal(true); }}
                          className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50"
                        >تعديل</button>
                        {b.status === 'confirmed' && (
                          <button
                            onClick={() => changeStatus(b.id, 'checkedin')}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                          >وصل</button>
                        )}
                        {b.status === 'checkedin' && (
                          <button
                            onClick={() => changeStatus(b.id, 'checkedout')}
                            className="text-xs bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700"
                          >غادر</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={6} className="px-3 py-2.5 text-xs font-medium text-gray-500">الإجماليات</td>
                  <td className="px-3 py-2.5 font-medium">{activeBookings.reduce((s,b)=>s+b.totalRevenue,0).toLocaleString('ar-SA')}</td>
                  <td className="px-3 py-2.5 font-medium text-green-600">{totalRevenue.toLocaleString('ar-SA')}</td>
                  <td colSpan={3}/>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {showModal && (
        <BookingModal
          booking={editBooking}
          propertyId={activeProperty.id}
          furnUnits={furnUnits}
          onClose={() => { setShowModal(false); setEditBooking(null); }}
          onSaved={load}
        />
      )}
    </div>
  );

  async function changeStatus(id: string, status: Booking['status']) {
    await updateBooking(id, { status });
    toast.success(`تم تحديث الحالة إلى: ${statusLabel[status]}`);
    load();
  }

  function handleDepositClick(b: Booking) {
    if (b.depositStatus !== 'held') return;
    if (confirm(`هل تريد تسجيل إعادة التأمين (${b.depositAmount.toLocaleString()} ر.س)؟`)) {
      updateDepositStatus(b.id, 'returned', new Date())
        .then(() => { toast.success('تم تسجيل إعادة التأمين'); load(); });
    }
  }
}

// ─── Booking Modal ────────────────────────────────────────────────────────────
function BookingModal({ booking, propertyId, furnUnits, onClose, onSaved }: {
  booking: Booking | null; propertyId: string; furnUnits: Unit[];
  onClose: () => void; onSaved: () => void;
}) {
  const { register, handleSubmit, watch } = useForm<any>({
    defaultValues: booking ? {
      ...booking,
      checkinDate:  fmtInputDate(booking.checkinDate),
      checkoutDate: fmtInputDate(booking.checkoutDate),
    } : { depositStatus: 'held', status: 'confirmed', platformFee: 0 }
  });
  const [saving, setSaving] = useState(false);

  const checkin  = watch('checkinDate');
  const checkout = watch('checkoutDate');
  const nights   = checkin && checkout
    ? Math.max(0, Math.ceil((new Date(checkout).getTime() - new Date(checkin).getTime()) / 86400000))
    : 0;

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      const unit = furnUnits.find(u => u.id === data.unitId);
      const payload = {
        ...data,
        propertyId,
        unitNumber:    unit?.unitNumber || data.unitId,
        checkinDate:   Timestamp.fromDate(new Date(data.checkinDate)),
        checkoutDate:  Timestamp.fromDate(new Date(data.checkoutDate)),
        nights,
        totalRevenue:  Number(data.totalRevenue),
        platformFee:   Number(data.platformFee || 0),
        netRevenue:    Number(data.totalRevenue) - Number(data.platformFee || 0),
        nightlyRate:   nights > 0 ? Number(data.totalRevenue) / nights : 0,
        depositAmount: Number(data.depositAmount || 0),
      };
      if (booking?.id) {
        await updateBooking(booking.id, payload);
        toast.success('تم تحديث الحجز');
      } else {
        await createBooking(payload);
        toast.success('تم تسجيل الحجز');
      }
      onSaved(); onClose();
    } catch { toast.error('حدث خطأ'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={booking ? 'تعديل حجز' : 'حجز جديد'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="الشقة" error="">
            <select {...register('unitId', {required:true})} className={inputCls}>
              {furnUnits.map(u => <option key={u.id} value={u.id}>شقة {u.unitNumber}</option>)}
            </select>
          </FormField>
          <FormField label="المنصة" error="">
            <select {...register('channel')} className={inputCls}>
              {Object.entries(channelLabel).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FormField>
          <FormField label="اسم الضيف" error="">
            <input {...register('guestName', {required:true})} className={inputCls}/>
          </FormField>
          <FormField label="رقم الجوال" error="">
            <input {...register('guestPhone')} className={inputCls}/>
          </FormField>
          <FormField label="تاريخ الوصول" error="">
            <input {...register('checkinDate', {required:true})} type="date" className={inputCls}/>
          </FormField>
          <FormField label="تاريخ المغادرة" error="">
            <input {...register('checkoutDate', {required:true})} type="date" className={inputCls}/>
          </FormField>
          {nights > 0 && (
            <div className="col-span-2 bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700 font-medium">
              عدد الليالي: {nights} ليلة
            </div>
          )}
          <FormField label="الإيراد الإجمالي (ر.س)" error="">
            <input {...register('totalRevenue', {required:true})} type="number" className={inputCls}/>
          </FormField>
          <FormField label="عمولة المنصة (ر.س)" error="">
            <input {...register('platformFee')} type="number" className={inputCls} placeholder="0"/>
          </FormField>
          <FormField label="مبلغ التأمين (ر.س)" error="">
            <input {...register('depositAmount')} type="number" className={inputCls} placeholder="0"/>
          </FormField>
          <FormField label="حالة التأمين" error="">
            <select {...register('depositStatus')} className={inputCls}>
              <option value="held">محتجز</option>
              <option value="returned">مُعاد</option>
              <option value="deducted">مخصوم</option>
            </select>
          </FormField>
          <FormField label="حالة الحجز" error="">
            <select {...register('status')} className={inputCls}>
              <option value="confirmed">مؤكد</option>
              <option value="checkedin">وصل</option>
              <option value="checkedout">غادر</option>
              <option value="cancelled">ملغي</option>
            </select>
          </FormField>
        </div>
        <FormField label="ملاحظات" error="">
          <textarea {...register('notes')} className={inputCls} rows={2}/>
        </FormField>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? 'جارٍ الحفظ...' : booking ? 'حفظ التعديلات' : 'حفظ الحجز'}
          </button>
          <button type="button" onClick={onClose} className={btnSecondary}>إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}

// shared UI helpers (reused across pages)
function KpiCard({ label, value, sub, accent }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-1 h-full rounded-r-xl" style={{ background: accent }}/>
      <div className="text-xs text-gray-400 mb-1 pr-2">{label}</div>
      <div className="text-xl font-medium text-gray-800 pr-2">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-1 pr-2 truncate">{sub}</div>}
    </div>
  );
}
function Modal({ title, onClose, children }: any) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
function FormField({ label, error, children }: any) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  );
}
const inputCls     = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
const btnPrimary   = 'bg-[#1B4F72] text-white text-sm rounded-lg px-5 py-2 hover:bg-[#2E86C1] transition-colors disabled:opacity-60';
const btnSecondary = 'border border-gray-200 text-gray-600 text-sm rounded-lg px-5 py-2 hover:bg-gray-50';
function fmtTs(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}
function fmtInputDate(ts: any) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().split('T')[0];
}
function PageLoader() {
  return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>;
}
function NoProperty() {
  return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">يرجى اختيار عقار أولاً</div>;
}
