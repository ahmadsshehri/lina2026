// app/cashflow/page.tsx — التدفق المالي والتسويات
'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useStore } from '../../store/useStore';
import { getTransfers, createTransfer, getMonthlyReport } from '../../lib/db';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import type { Transfer } from '../../types';

export default function CashflowPage() {
  const { activeProperty, activeMonth, setActivePage } = useStore();
  const { appUser } = useAuth();
  const [transfers,  setTransfers]  = useState<Transfer[]>([]);
  const [report,     setReport]     = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);

  const load = async () => {
    if (!activeProperty) return;
    setLoading(true);
    const [y, m] = activeMonth.split('-').map(Number);
    const [t, r] = await Promise.all([
      getTransfers(activeProperty.id),
      getMonthlyReport(activeProperty.id, y, m),
    ]);
    setTransfers(t);
    setReport(r);
    setLoading(false);
  };

  useEffect(() => { setActivePage('cashflow'); load(); }, [activeProperty, activeMonth]);

  // تصفية التحويلات للشهر الحالي
  const [y, m] = activeMonth.split('-').map(Number);
  const monthTransfers = transfers.filter(t => {
    const d = (t.date as Timestamp).toDate();
    return d.getMonth() + 1 === m && d.getFullYear() === y;
  });

  const totalTransferredToOwner = monthTransfers
    .filter(t => t.type === 'owner_transfer')
    .reduce((s, t) => s + t.amount, 0);

  const totalManagerExpenses = monthTransfers
    .filter(t => t.type === 'manager_expense')
    .reduce((s, t) => s + t.amount, 0);

  if (!activeProperty) return <NoProperty />;

  const fmt = (n: number) => n?.toLocaleString('ar-SA') || '0';

  return (
    <div className="p-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-medium text-gray-800">التدفق المالي</h1>
          <p className="text-sm text-gray-400">{activeMonth} — التسويات والتحويلات</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-[#1B4F72] text-white text-sm rounded-lg px-4 py-1.5 hover:bg-[#2E86C1] transition-colors"
        >+ تسجيل تحويل</button>
      </div>

      {loading ? <PageLoader /> : (
        <>
          {/* تسوية الشهر */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
            <div className="text-sm font-medium text-gray-700 mb-4">
              تسوية شهر {activeMonth}
            </div>
            <div className="space-y-2">
              <RecRow label="إيرادات الإيجار الشهري"    val={report?.monthlyRevenue || 0}  color="green"  sign="+"/>
              <RecRow label="إيرادات الشقق المفروشة"     val={report?.furnishedRevenue || 0} color="green"  sign="+"/>
              <div className="border-t border-dashed border-gray-200 my-3"/>
              <RecRow label="مصاريف الكهرباء"            val={report?.expenseByCategory?.electricity || 0} color="red" sign="−"/>
              <RecRow label="مصاريف المياه"              val={report?.expenseByCategory?.water || 0}        color="red" sign="−"/>
              <RecRow label="الرواتب"                    val={report?.expenseByCategory?.salary || 0}       color="red" sign="−"/>
              <RecRow label="الصيانة"                    val={report?.expenseByCategory?.maintenance || 0}  color="red" sign="−"/>
              <RecRow label="النظافة والمستلزمات"        val={report?.expenseByCategory?.cleaning || 0}     color="red" sign="−"/>
              <RecRow label="مصاريف أخرى"               val={report?.expenseByCategory?.other || 0}        color="red" sign="−"/>
              <div className="border-t-2 border-gray-300 my-3"/>
              <div className="flex items-center justify-between py-2 bg-gray-50 rounded-lg px-3">
                <span className="text-sm font-medium text-gray-700">صافي الشهر للمالك</span>
                <span className={`text-xl font-medium ${(report?.netProfit||0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmt(report?.netProfit || 0)} ر.س
                </span>
              </div>
              <div className="flex items-center justify-between py-1 px-3">
                <span className="text-xs text-gray-400">تم تحويله للمالك هذا الشهر</span>
                <span className="text-sm font-medium text-blue-600">{fmt(totalTransferredToOwner)} ر.س</span>
              </div>
              {(report?.netProfit||0) - totalTransferredToOwner !== 0 && (
                <div className="flex items-center justify-between py-1 px-3">
                  <span className="text-xs text-gray-400">
                    {(report?.netProfit||0) - totalTransferredToOwner > 0 ? 'متبقي للتحويل' : 'تم تحويل أكثر من الصافي'}
                  </span>
                  <span className={`text-sm font-medium ${(report?.netProfit||0) - totalTransferredToOwner > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                    {fmt(Math.abs((report?.netProfit||0) - totalTransferredToOwner))} ر.س
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-white rounded-xl border border-gray-100 p-4 border-t-2 border-t-green-400">
              <div className="text-xs text-gray-400">إجمالي الإيرادات</div>
              <div className="text-lg font-medium text-green-600 mt-1">{fmt(report?.totalRevenue || 0)} ر.س</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 border-t-2 border-t-red-400">
              <div className="text-xs text-gray-400">إجمالي المصاريف</div>
              <div className="text-lg font-medium text-red-500 mt-1">{fmt(report?.totalExpenses || 0)} ر.س</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 border-t-2 border-t-blue-400">
              <div className="text-xs text-gray-400">محوّل للمالك (الشهر)</div>
              <div className="text-lg font-medium text-blue-600 mt-1">{fmt(totalTransferredToOwner)} ر.س</div>
            </div>
          </div>

          {/* Transfers Table */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="text-sm font-medium text-gray-700">سجل التحويلات</div>
              <span className="text-xs text-gray-400">{monthTransfers.length} عملية هذا الشهر</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['التاريخ','النوع','المبلغ','من','إلى','الطريقة','ملاحظات'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthTransfers.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-300">لا توجد تحويلات هذا الشهر</td></tr>
                )}
                {monthTransfers.map(t => (
                  <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5 text-xs text-gray-500">{fmtTs(t.date)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${t.type === 'owner_transfer' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-600'}`}>
                        {t.type === 'owner_transfer' ? 'تحويل للمالك' : 'مصروف مسؤول'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-medium">{t.amount.toLocaleString('ar-SA')} ر.س</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{t.fromUser}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{t.toUser}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400">
                      {t.paymentMethod === 'transfer' ? 'تحويل' : 'كاش'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 max-w-[150px] truncate">{t.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showModal && (
        <TransferModal
          propertyId={activeProperty.id}
          currentUser={appUser}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ─── Transfer Modal ───────────────────────────────────────────────────────────
function TransferModal({ propertyId, currentUser, onClose, onSaved }: any) {
  const { register, handleSubmit } = useForm<any>({
    defaultValues: { type: 'owner_transfer', paymentMethod: 'transfer', date: new Date().toISOString().split('T')[0] }
  });
  const [saving, setSaving] = useState(false);

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      await createTransfer({
        propertyId,
        type:          data.type,
        amount:        Number(data.amount),
        date:          Timestamp.fromDate(new Date(data.date)),
        fromUser:      data.type === 'owner_transfer' ? 'مسؤول العقار' : 'المالك',
        toUser:        data.type === 'owner_transfer' ? 'المالك'       : 'مسؤول العقار',
        paymentMethod: data.paymentMethod,
        notes:         data.notes,
      });
      toast.success('تم تسجيل التحويل');
      onSaved(); onClose();
    } catch { toast.error('حدث خطأ'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-800">تسجيل تحويل مالي</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">نوع المعاملة</label>
            <select {...register('type')} className={inputCls}>
              <option value="owner_transfer">تحويل للمالك</option>
              <option value="manager_expense">مصروف مسؤول</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">المبلغ (ر.س)</label>
              <input {...register('amount', {required:true})} type="number" className={inputCls}/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">التاريخ</label>
              <input {...register('date')} type="date" className={inputCls}/>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">طريقة التحويل</label>
            <select {...register('paymentMethod')} className={inputCls}>
              <option value="transfer">تحويل بنكي</option>
              <option value="cash">كاش</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ملاحظات</label>
            <textarea {...register('notes')} className={inputCls} rows={2}/>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ التحويل'}
            </button>
            <button type="button" onClick={onClose} className={btnSecondary}>إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RecRow({ label, val, color, sign }: { label: string; val: number; color: 'green'|'red'; sign: string }) {
  if (!val) return null;
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-medium ${color === 'green' ? 'text-green-600' : 'text-red-500'}`}>
        {sign} {val.toLocaleString('ar-SA')} ر.س
      </span>
    </div>
  );
}
function fmtTs(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}
const inputCls     = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
const btnPrimary   = 'bg-[#1B4F72] text-white text-sm rounded-lg px-5 py-2 hover:bg-[#2E86C1] transition-colors disabled:opacity-60';
const btnSecondary = 'border border-gray-200 text-gray-600 text-sm rounded-lg px-5 py-2 hover:bg-gray-50';
function PageLoader() {
  return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>;
}
function NoProperty() {
  return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">يرجى اختيار عقار أولاً</div>;
}
