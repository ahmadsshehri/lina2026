// app/expenses/page.tsx — المصاريف
'use client';
import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useStore } from '../../store/useStore';
import { getExpenses, createExpense, deleteExpense, getMeters, createMeter } from '../../lib/db';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { exportExpensesPDF } from '../../lib/export';
import type { Expense, ElectricMeter } from '../../types';

const CAT_LABEL: Record<string, string> = {
  electricity:'كهرباء', water:'مياه', maintenance:'صيانة',
  salary:'راتب', cleaning:'نظافة', other:'أخرى',
};
const CAT_COLOR: Record<string, string> = {
  electricity:'bg-orange-50 text-orange-600',
  water:       'bg-blue-50 text-blue-600',
  maintenance: 'bg-purple-50 text-purple-600',
  salary:      'bg-indigo-50 text-indigo-600',
  cleaning:    'bg-green-50 text-green-600',
  other:       'bg-gray-50 text-gray-600',
};

export default function ExpensesPage() {
  const { activeProperty, activeMonth, setActivePage } = useStore();
  const { appUser } = useAuth();
  const [expenses,  setExpenses]  = useState<Expense[]>([]);
  const [meters,    setMeters]    = useState<ElectricMeter[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [tab,       setTab]       = useState<'list'|'summary'|'meters'>('list');
  const [catFilter, setCatFilter] = useState('all');

  const load = async () => {
    if (!activeProperty) return;
    setLoading(true);
    const [e, m] = await Promise.all([
      getExpenses(activeProperty.id, activeMonth),
      getMeters(activeProperty.id),
    ]);
    setExpenses(e);
    setMeters(m);
    setLoading(false);
  };

  useEffect(() => { setActivePage('expenses'); load(); }, [activeProperty, activeMonth]);

  // احصائيات
  const total       = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory  = expenses.reduce((acc: Record<string, number>, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});
  const byPaidBy    = { owner: 0, manager: 0 };
  expenses.forEach(e => { byPaidBy[e.paidBy] += e.amount; });

  const filtered = catFilter === 'all' ? expenses : expenses.filter(e => e.category === catFilter);

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من الحذف؟')) return;
    await deleteExpense(id);
    toast.success('تم الحذف');
    load();
  };

  if (!activeProperty) return <NoProperty />;

  return (
    <div className="p-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-medium text-gray-800">المصاريف</h1>
          <p className="text-sm text-gray-400">{activeMonth} — {expenses.length} سجل</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportExpensesPDF(expenses, activeProperty.name, activeMonth)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >⬇ PDF</button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-[#1B4F72] text-white text-sm rounded-lg px-4 py-1.5 hover:bg-[#2E86C1] transition-colors"
          >+ مصروف جديد</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-gray-100 p-4 border-t-2 border-t-red-400">
          <div className="text-xs text-gray-400">إجمالي المصاريف</div>
          <div className="text-xl font-medium text-gray-800 mt-1">{total.toLocaleString('ar-SA')} ر.س</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 border-t-2 border-t-orange-400">
          <div className="text-xs text-gray-400">الكهرباء</div>
          <div className="text-xl font-medium text-orange-600 mt-1">{(byCategory.electricity||0).toLocaleString('ar-SA')} ر.س</div>
          <div className="text-xs text-gray-400">{total > 0 ? Math.round((byCategory.electricity||0)/total*100) : 0}% من الإجمالي</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 border-t-2 border-t-indigo-400">
          <div className="text-xs text-gray-400">الرواتب</div>
          <div className="text-xl font-medium text-indigo-600 mt-1">{(byCategory.salary||0).toLocaleString('ar-SA')} ر.س</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 border-t-2 border-t-gray-400">
          <div className="text-xs text-gray-400 mb-1">مصاريف بالبنك / باليد</div>
          <div className="text-sm font-medium text-gray-700">
            {byPaidBy.manager.toLocaleString('ar-SA')} / {byPaidBy.owner.toLocaleString('ar-SA')} ر.س
          </div>
          <div className="text-xs text-gray-400">مسؤول / مالك</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4 gap-1">
        {[{id:'list',label:'قائمة المصاريف'},{id:'summary',label:'الملخص التفصيلي'},{id:'meters',label:'عدادات الكهرباء'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-all
              ${tab===t.id ? 'text-[#1B4F72] border-[#1B4F72] font-medium' : 'text-gray-400 border-transparent hover:text-gray-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <PageLoader /> : (
        <>
          {/* ─── LIST ─── */}
          {tab === 'list' && (
            <div>
              <div className="flex gap-2 mb-3 flex-wrap">
                <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none">
                  <option value="all">جميع الفئات</option>
                  {Object.entries(CAT_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['التاريخ','الفئة','البيان','المبلغ','دُفع بواسطة','طريقة الدفع','إيصال',''].map(h => (
                        <th key={h} className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-300">لا توجد مصاريف لهذه الفترة</td></tr>
                    )}
                    {filtered.map(e => (
                      <tr key={e.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                        <td className="px-3 py-2.5 text-xs text-gray-500">{fmtTs(e.date)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLOR[e.category]}`}>
                            {CAT_LABEL[e.category]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-700">{e.subcategory}</td>
                        <td className="px-3 py-2.5 font-medium text-red-600">{e.amount.toLocaleString('ar-SA')} ر.س</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${e.paidBy==='owner' ? 'bg-yellow-50 text-yellow-600' : 'bg-blue-50 text-blue-600'}`}>
                            {e.paidBy === 'owner' ? 'المالك' : 'المسؤول'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">
                          {e.paymentMethod === 'transfer' ? 'تحويل' : e.paymentMethod === 'cash' ? 'كاش' : e.paymentMethod}
                        </td>
                        <td className="px-3 py-2.5">
                          {e.receiptUrl
                            ? <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">عرض</a>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {appUser?.role === 'owner' && (
                            <button onClick={() => handleDelete(e.id)} className="text-xs text-red-400 hover:text-red-600">حذف</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {filtered.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td colSpan={3} className="px-3 py-2.5 text-xs font-medium text-gray-500">الإجمالي</td>
                        <td className="px-3 py-2.5 font-medium text-red-600">
                          {filtered.reduce((s,e)=>s+e.amount,0).toLocaleString('ar-SA')} ر.س
                        </td>
                        <td colSpan={4}/>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* ─── SUMMARY ─── */}
          {tab === 'summary' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="text-sm font-medium text-gray-700 mb-4">توزيع المصاريف حسب الفئة</div>
                {Object.entries(byCategory).sort(([,a],[,b]) => b-a).map(([cat, amt]) => (
                  <div key={cat} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className={`px-2 py-0.5 rounded-full ${CAT_COLOR[cat]}`}>{CAT_LABEL[cat]}</span>
                      <span className="text-gray-700 font-medium">{amt.toLocaleString('ar-SA')} ر.س ({total > 0 ? Math.round(amt/total*100) : 0}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#1B4F72] transition-all" style={{ width: `${total>0?amt/total*100:0}%` }}/>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="text-sm font-medium text-gray-700 mb-4">مصاريف بالبنك مقابل باليد</div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-blue-700">مسؤول العقار</div>
                      <div className="text-xs text-blue-500">مصاريف تحويل / كاش</div>
                    </div>
                    <div className="text-lg font-medium text-blue-700">{byPaidBy.manager.toLocaleString('ar-SA')} ر.س</div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-yellow-700">المالك مباشرة</div>
                      <div className="text-xs text-yellow-500">دُفع من المالك</div>
                    </div>
                    <div className="text-lg font-medium text-yellow-700">{byPaidBy.owner.toLocaleString('ar-SA')} ر.س</div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border-t-2 border-gray-200">
                    <div className="text-sm font-medium text-gray-700">الإجمالي</div>
                    <div className="text-lg font-medium text-gray-800">{total.toLocaleString('ar-SA')} ر.س</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── METERS ─── */}
          {tab === 'meters' && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm text-gray-500">عدادات كهرباء العمارة</div>
                <button onClick={() => {/* open meter modal */}}
                  className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                  + عداد جديد
                </button>
              </div>
              {meters.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-300 text-sm">
                  لا توجد عدادات مسجلة — أضف عداداً لتتبع استهلاك الكهرباء
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {meters.map(meter => (
                    <div key={meter.id} className="bg-white rounded-xl border border-gray-100 p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-sm font-medium text-gray-800">{meter.meterLabel}</div>
                          <div className="text-xs text-gray-400">رقم: {meter.meterNumber}</div>
                        </div>
                        <div className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded-lg">
                          {meter.linkedUnits.length} شقة
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mb-3">
                        الشقق المربوطة: {meter.linkedUnits.join('، ')}
                      </div>
                      <button className="text-xs bg-[#1B4F72] text-white px-3 py-1.5 rounded-lg hover:bg-[#2E86C1]">
                        + تسجيل قراءة {activeMonth}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showModal && (
        <ExpenseModal
          propertyId={activeProperty.id}
          recordedBy={appUser?.uid || ''}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ─── Expense Modal ────────────────────────────────────────────────────────────
function ExpenseModal({ propertyId, recordedBy, onClose, onSaved }: {
  propertyId: string; recordedBy: string; onClose: () => void; onSaved: () => void;
}) {
  const { register, handleSubmit } = useForm<any>({
    defaultValues: { paidBy: 'manager', paymentMethod: 'transfer', date: new Date().toISOString().split('T')[0] }
  });
  const [saving,  setSaving]  = useState(false);
  const [receipt, setReceipt] = useState<File | undefined>();

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      await createExpense({
        propertyId,
        recordedBy,
        category:      data.category,
        subcategory:   data.subcategory,
        amount:        Number(data.amount),
        date:          Timestamp.fromDate(new Date(data.date)),
        paidBy:        data.paidBy,
        paymentMethod: data.paymentMethod,
        notes:         data.notes,
      }, receipt);
      toast.success('تم تسجيل المصروف');
      onSaved(); onClose();
    } catch { toast.error('حدث خطأ'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="تسجيل مصروف جديد" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">الفئة</label>
            <select {...register('category', {required:true})} className={inputCls}>
              {Object.entries(CAT_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">التاريخ</label>
            <input {...register('date', {required:true})} type="date" className={inputCls}/>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">البيان (التفاصيل)</label>
            <input {...register('subcategory', {required:true})} className={inputCls} placeholder="مثال: فاتورة كهرباء شهر مارس"/>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">المبلغ (ر.س)</label>
            <input {...register('amount', {required:true})} type="number" step="0.01" className={inputCls}/>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">دُفع بواسطة</label>
            <select {...register('paidBy')} className={inputCls}>
              <option value="manager">مسؤول العقار</option>
              <option value="owner">المالك</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">طريقة الدفع</label>
            <select {...register('paymentMethod')} className={inputCls}>
              <option value="transfer">تحويل بنكي</option>
              <option value="cash">كاش</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">صورة الإيصال</label>
            <input
              type="file" accept="image/*,application/pdf"
              onChange={e => setReceipt(e.target.files?.[0])}
              className="w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-100 file:text-gray-600 hover:file:bg-gray-200"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">ملاحظات</label>
            <textarea {...register('notes')} className={inputCls} rows={2}/>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? 'جارٍ الحفظ...' : 'حفظ المصروف'}
          </button>
          <button type="button" onClick={onClose} className={btnSecondary}>إلغاء</button>
        </div>
      </form>
    </Modal>
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
