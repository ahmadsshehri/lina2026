// app/monthly/page.tsx — إدارة الإيجار الشهري
'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useStore } from '../../store/useStore';
import {
  getTenants, createTenant, updateTenant, terminateTenant,
  createPayment, getTenantPayments, getPayments,
} from '../../lib/db';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { exportPaymentsPDF, exportArrearsPDF } from '../../lib/export';
import type { Tenant, RentPayment } from '../../types';

type Tab = 'tenants' | 'payments' | 'arrears';

const paymentCycleLabel: Record<string, string> = {
  monthly: 'شهري', quarterly: 'ربع سنوي', semi: 'نصف سنوي', annual: 'سنوي',
};
const methodLabel: Record<string, string> = {
  transfer: 'تحويل', cash: 'كاش', ejar: 'إيجار', stc_pay: 'STC Pay',
};

export default function MonthlyPage() {
  const { activeProperty, activeMonth, setActivePage } = useStore();
  const { appUser } = useAuth();
  const [tab,      setTab]      = useState<Tab>('tenants');
  const [tenants,  setTenants]  = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [showPayModal,    setShowPayModal]    = useState<Tenant | null>(null);
  const [editTenant,      setEditTenant]      = useState<Tenant | null>(null);

  const load = async () => {
    if (!activeProperty) return;
    setLoading(true);
    const [t, p] = await Promise.all([
      getTenants(activeProperty.id),
      getPayments(activeProperty.id),
    ]);
    setTenants(t);
    setPayments(p);
    setLoading(false);
  };

  useEffect(() => { setActivePage('monthly'); load(); }, [activeProperty]);

  // حساب المتأخرين
  const today = new Date();
  const arrears = tenants.filter(t => {
    if (t.status !== 'active') return false;
    const tenantPayments = payments.filter(p => p.tenantId === t.id);
    const totalBalance = tenantPayments.reduce((s, p) => s + (p.balance || 0), 0);
    return totalBalance > 0;
  });

  const totalArrears = arrears.reduce((s, t) => {
    const bal = payments.filter(p => p.tenantId === t.id).reduce((x, p) => x + (p.balance || 0), 0);
    return s + bal;
  }, 0);

  if (!activeProperty) return <NoProperty />;

  return (
    <div className="p-5" dir="rtl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-medium text-gray-800">الإيجار الشهري</h1>
          <p className="text-sm text-gray-400">{tenants.filter(t => t.status === 'active').length} مستأجر نشط</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportPaymentsPDF(payments.filter(p => {
              const [y,m] = activeMonth.split('-').map(Number);
              const d = p.paidDate ? (p.paidDate as Timestamp).toDate() : null;
              return d?.getMonth() === m-1 && d?.getFullYear() === y;
            }), activeProperty.name, activeMonth)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            ⬇ PDF
          </button>
          <button
            onClick={() => { setEditTenant(null); setShowTenantModal(true); }}
            className="bg-[#1B4F72] text-white text-sm rounded-lg px-4 py-1.5 hover:bg-[#2E86C1] transition-colors"
          >
            + مستأجر جديد
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4 gap-1">
        {[
          { id: 'tenants', label: 'المستأجرون والعقود' },
          { id: 'payments', label: 'سجل الدفعات' },
          { id: 'arrears', label: `المتأخرات ${arrears.length > 0 ? `(${arrears.length})` : ''}` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={`px-4 py-2 text-sm transition-all border-b-2 -mb-px
              ${tab === t.id
                ? 'text-[#1B4F72] border-[#1B4F72] font-medium'
                : 'text-gray-400 border-transparent hover:text-gray-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <PageLoader /> : (
        <>
          {/* ─── Tenants Tab ─── */}
          {tab === 'tenants' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['ش','المستأجر','الجوال','رقم العقد','بداية العقد','نهاية العقد','دورة الدفع','الإيجار','الحالة',''].map(h => (
                      <th key={h} className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tenants.map(t => (
                    <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-2.5 font-medium text-[#1B4F72]">{t.unitNumber}</td>
                      <td className="px-3 py-2.5 font-medium">{t.name}</td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs dir-ltr text-left">{t.phone}</td>
                      <td className="px-3 py-2.5 text-gray-400 text-xs">{t.contractNumber}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{fmtTs(t.contractStart)}</td>
                      <td className="px-3 py-2.5 text-xs">
                        <span className={isExpiringSoon(t.contractEnd) ? 'text-orange-500 font-medium' : 'text-gray-500'}>
                          {fmtTs(t.contractEnd)}
                          {isExpiringSoon(t.contractEnd) && ' ⚠️'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5"><Badge label={paymentCycleLabel[t.paymentCycle]} color="blue" /></td>
                      <td className="px-3 py-2.5 font-medium">{t.rentAmount.toLocaleString('ar-SA')}</td>
                      <td className="px-3 py-2.5">
                        <Badge
                          label={t.status === 'active' ? 'نشط' : t.status === 'expired' ? 'منتهي' : 'موقوف'}
                          color={t.status === 'active' ? 'green' : 'red'}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <button
                            onClick={() => setShowPayModal(t)}
                            className="text-xs bg-[#1B4F72] text-white px-2 py-1 rounded hover:bg-[#2E86C1]"
                          >
                            دفعة
                          </button>
                          <button
                            onClick={() => { setEditTenant(t); setShowTenantModal(true); }}
                            className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50"
                          >
                            تعديل
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ─── Payments Tab ─── */}
          {tab === 'payments' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['تاريخ الدفع','الشقة','المستأجر','المطلوب','المدفوع','الرصيد','الطريقة','مرجع'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-2.5 text-xs text-gray-500">{fmtTs(p.paidDate)}</td>
                      <td className="px-3 py-2.5 font-medium text-[#1B4F72]">{p.unitNumber}</td>
                      <td className="px-3 py-2.5">{p.tenantName}</td>
                      <td className="px-3 py-2.5">{p.amountDue.toLocaleString('ar-SA')}</td>
                      <td className="px-3 py-2.5 text-green-600 font-medium">{p.amountPaid.toLocaleString('ar-SA')}</td>
                      <td className="px-3 py-2.5">
                        {p.balance > 0
                          ? <span className="text-red-500 font-medium">{p.balance.toLocaleString('ar-SA')}</span>
                          : <span className="text-green-500">—</span>}
                      </td>
                      <td className="px-3 py-2.5"><Badge label={methodLabel[p.paymentMethod]} color="blue" /></td>
                      <td className="px-3 py-2.5 text-gray-400 text-xs">{p.referenceNumber || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ─── Arrears Tab ─── */}
          {tab === 'arrears' && (
            <div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white rounded-xl border border-gray-100 p-4 border-t-2 border-t-red-400">
                  <div className="text-xs text-gray-400">إجمالي المتأخرات</div>
                  <div className="text-xl font-medium text-red-600 mt-1">{totalArrears.toLocaleString('ar-SA')} ر.س</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4 border-t-2 border-t-orange-400">
                  <div className="text-xs text-gray-400">عدد المتأخرين</div>
                  <div className="text-xl font-medium text-orange-600 mt-1">{arrears.length}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4 border-t-2 border-t-yellow-400">
                  <div className="text-xs text-gray-400">عقود تنتهي قريباً (30 يوم)</div>
                  <div className="text-xl font-medium text-yellow-600 mt-1">
                    {tenants.filter(t => isExpiringSoon(t.contractEnd)).length}
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['الشقة','المستأجر','الجوال','المبلغ المتأخر','دورة الدفع','إجراء'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {arrears.map(t => {
                      const bal = payments.filter(p => p.tenantId === t.id).reduce((s, p) => s + (p.balance || 0), 0);
                      return (
                        <tr key={t.id} className="border-t border-gray-50 hover:bg-red-50/30">
                          <td className="px-4 py-2.5 font-medium text-[#1B4F72]">{t.unitNumber}</td>
                          <td className="px-4 py-2.5 font-medium">{t.name}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">{t.phone}</td>
                          <td className="px-4 py-2.5 font-medium text-red-600">{bal.toLocaleString('ar-SA')} ر.س</td>
                          <td className="px-4 py-2.5"><Badge label={paymentCycleLabel[t.paymentCycle]} color="blue" /></td>
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => setShowPayModal(t)}
                              className="text-xs bg-[#1B4F72] text-white px-3 py-1 rounded hover:bg-[#2E86C1]"
                            >
                              تسجيل دفعة
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {arrears.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-300">لا توجد متأخرات ✓</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showTenantModal && (
        <TenantModal
          tenant={editTenant}
          propertyId={activeProperty.id}
          onClose={() => { setShowTenantModal(false); setEditTenant(null); }}
          onSaved={load}
        />
      )}
      {showPayModal && (
        <PaymentModal
          tenant={showPayModal}
          propertyId={activeProperty.id}
          receivedBy={appUser?.uid || ''}
          onClose={() => setShowPayModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ─── Tenant Modal ─────────────────────────────────────────────────────────────
function TenantModal({ tenant, propertyId, onClose, onSaved }: {
  tenant: Tenant | null; propertyId: string; onClose: () => void; onSaved: () => void;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<any>({
    defaultValues: tenant ? {
      ...tenant,
      contractStart: fmtInputDate(tenant.contractStart),
      contractEnd:   fmtInputDate(tenant.contractEnd),
    } : {}
  });
  const [saving, setSaving] = useState(false);

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      const payload = {
        ...data,
        propertyId,
        rentAmount:    Number(data.rentAmount),
        contractStart: Timestamp.fromDate(new Date(data.contractStart)),
        contractEnd:   Timestamp.fromDate(new Date(data.contractEnd)),
        ejarLinked:    data.ejarLinked === 'true' || data.ejarLinked === true,
        status:        'active' as const,
      };
      if (tenant?.id) {
        await updateTenant(tenant.id, payload);
        toast.success('تم تحديث بيانات المستأجر');
      } else {
        await createTenant(payload);
        toast.success('تم إضافة المستأجر');
      }
      onSaved(); onClose();
    } catch (e) {
      toast.error('حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={tenant ? 'تعديل بيانات المستأجر' : 'إضافة مستأجر جديد'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="رقم الشقة" error={errors.unitNumber?.message as string}>
            <input {...register('unitNumber', {required:'مطلوب'})} className={inputCls} placeholder="مثال: 05"/>
          </FormField>
          <FormField label="اسم المستأجر" error={errors.name?.message as string}>
            <input {...register('name', {required:'مطلوب'})} className={inputCls}/>
          </FormField>
          <FormField label="رقم الجوال">
            <input {...register('phone')} className={inputCls} placeholder="05xxxxxxxx"/>
          </FormField>
          <FormField label="رقم الهوية / الإقامة">
            <input {...register('idNumber')} className={inputCls}/>
          </FormField>
          <FormField label="رقم العقد">
            <input {...register('contractNumber')} className={inputCls}/>
          </FormField>
          <FormField label="قيمة الإيجار (ر.س)" error={errors.rentAmount?.message as string}>
            <input {...register('rentAmount', {required:'مطلوب'})} type="number" className={inputCls}/>
          </FormField>
          <FormField label="بداية العقد">
            <input {...register('contractStart', {required:'مطلوب'})} type="date" className={inputCls}/>
          </FormField>
          <FormField label="نهاية العقد">
            <input {...register('contractEnd', {required:'مطلوب'})} type="date" className={inputCls}/>
          </FormField>
          <FormField label="دورة الدفع">
            <select {...register('paymentCycle')} className={inputCls}>
              <option value="monthly">شهري</option>
              <option value="quarterly">ربع سنوي</option>
              <option value="semi">نصف سنوي</option>
              <option value="annual">سنوي</option>
            </select>
          </FormField>
          <FormField label="ربط إيجار">
            <select {...register('ejarLinked')} className={inputCls}>
              <option value="false">لا</option>
              <option value="true">نعم</option>
            </select>
          </FormField>
        </div>
        <FormField label="ملاحظات">
          <textarea {...register('notes')} className={inputCls} rows={2}/>
        </FormField>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? 'جارٍ الحفظ...' : tenant ? 'حفظ التعديلات' : 'إضافة المستأجر'}
          </button>
          <button type="button" onClick={onClose} className={btnSecondary}>إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Payment Modal ─────────────────────────────────────────────────────────────
function PaymentModal({ tenant, propertyId, receivedBy, onClose, onSaved }: {
  tenant: Tenant; propertyId: string; receivedBy: string;
  onClose: () => void; onSaved: () => void;
}) {
  const { register, handleSubmit } = useForm<any>({
    defaultValues: { amountDue: tenant.rentAmount, amountPaid: tenant.rentAmount }
  });
  const [saving, setSaving] = useState(false);

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      await createPayment({
        propertyId,
        tenantId:       tenant.id,
        unitId:         tenant.unitId,
        unitNumber:     tenant.unitNumber,
        tenantName:     tenant.name,
        dueDate:        Timestamp.fromDate(new Date()),
        paidDate:       Timestamp.fromDate(new Date(data.paidDate || new Date())),
        amountDue:      Number(data.amountDue),
        amountPaid:     Number(data.amountPaid),
        balance:        Number(data.amountDue) - Number(data.amountPaid),
        paymentMethod:  data.paymentMethod,
        referenceNumber: data.referenceNumber,
        notes:          data.notes,
        receivedBy,
      });
      toast.success('تم تسجيل الدفعة');
      onSaved(); onClose();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`تسجيل دفعة — شقة ${tenant.unitNumber} (${tenant.name})`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="تاريخ الدفع">
            <input {...register('paidDate')} type="date" className={inputCls}
              defaultValue={new Date().toISOString().split('T')[0]}/>
          </FormField>
          <FormField label="طريقة الدفع">
            <select {...register('paymentMethod')} className={inputCls}>
              <option value="transfer">تحويل بنكي</option>
              <option value="cash">كاش</option>
              <option value="ejar">منصة إيجار</option>
              <option value="stc_pay">STC Pay</option>
            </select>
          </FormField>
          <FormField label="المبلغ المطلوب (ر.س)">
            <input {...register('amountDue')} type="number" className={inputCls}/>
          </FormField>
          <FormField label="المبلغ المدفوع (ر.س)">
            <input {...register('amountPaid')} type="number" className={inputCls}/>
          </FormField>
          <FormField label="رقم المرجع / الحوالة" cls="col-span-2">
            <input {...register('referenceNumber')} className={inputCls}/>
          </FormField>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? 'جارٍ الحفظ...' : 'تسجيل الدفعة'}
          </button>
          <button type="button" onClick={onClose} className={btnSecondary}>إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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

function FormField({ label, error, children, cls = '' }: {
  label: string; error?: string; children: React.ReactNode; cls?: string;
}) {
  return (
    <div className={cls}>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: 'green' | 'red' | 'orange' | 'blue' }) {
  const cls = {
    green:  'bg-green-50 text-green-700',
    red:    'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    blue:   'bg-blue-50 text-blue-700',
  }[color];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
}

const inputCls    = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
const btnPrimary  = 'bg-[#1B4F72] text-white text-sm rounded-lg px-5 py-2 hover:bg-[#2E86C1] transition-colors disabled:opacity-60';
const btnSecondary = 'border border-gray-200 text-gray-600 text-sm rounded-lg px-5 py-2 hover:bg-gray-50';

function fmtTs(ts: any): string {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}
function fmtInputDate(ts: any): string {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().split('T')[0];
}
function isExpiringSoon(ts: any): boolean {
  if (!ts) return false;
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return (d.getTime() - Date.now()) < 30 * 86400000;
}
function PageLoader() {
  return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>;
}
function NoProperty() {
  return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">يرجى اختيار عقار أولاً</div>;
}
