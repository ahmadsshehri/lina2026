'use client';
import { useEffect, useState, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../../lib/userHelpers';

interface Unit { id: string; unitNumber: string; type: string; status: string; basePrice: number; }
interface Tenant {
  id: string; propertyId: string; unitId: string; unitNumber: string;
  name: string; phone: string; idNumber: string; contractNumber: string;
  contractStart: any; contractEnd: any; paymentCycle: string;
  rentAmount: number; status: string; notes?: string;
  renewedAt?: any; isFormer?: boolean;
}
interface Payment {
  id: string; tenantId: string; unitNumber: string; tenantName: string;
  amountDue: number; amountPaid: number; balance: number;
  paidDate: any; paymentMethod: string; referenceNumber: string;
  receivedBy: string; periodMonth?: number; periodYear?: number;
  deleteRequested?: boolean;
}

const CYCLE: Record<string, string> = { monthly: 'شهري', quarterly: 'ربع سنوي', semi: 'نصف سنوي', annual: 'سنوي' };
const CYCLE_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semi: 6, annual: 12 };
const METHOD: Record<string, string> = { transfer: 'تحويل', cash: 'كاش', ejar: 'إيجار', stc_pay: 'STC Pay' };

function fmtDate(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function toDate(ts: any): Date | null {
  if (!ts) return null;
  return ts?.toDate ? ts.toDate() : new Date(ts);
}

function daysUntil(ts: any): number {
  const d = toDate(ts);
  if (!d) return 999;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

// حساب الدفعات المستحقة بناءً على العقد
function buildPaymentSchedule(tenant: Tenant, payments: Payment[]) {
  const start = toDate(tenant.contractStart);
  const end   = toDate(tenant.contractEnd);
  if (!start || !end || !tenant.rentAmount) return [];

  const step = CYCLE_MONTHS[tenant.paymentCycle] || 1;
  const schedule: { label: string; year: number; month: number; due: number; paid: number; balance: number; status: string; periodStart: Date; periodEnd: Date }[] = [];

  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endLimit = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cur <= endLimit) {
    const periodStart = new Date(cur);
    const periodEnd   = new Date(cur.getFullYear(), cur.getMonth() + step - 1, 28);
    const due = tenant.rentAmount * step;

    // الدفعات المرتبطة بهذه الفترة
    const periodPays = payments.filter(p => {
      if (p.tenantId !== tenant.id) return false;
      const pd = toDate(p.paidDate);
      if (!pd) return false;
      // تحقق من periodMonth/periodYear إن وُجد، وإلا من التاريخ
      if (p.periodYear && p.periodMonth) {
        return p.periodYear === periodStart.getFullYear() && p.periodMonth === (periodStart.getMonth() + 1);
      }
      const periodEndFull = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 0);
      return pd >= periodStart && pd <= periodEndFull;
    });

    const paid = periodPays.reduce((s, p) => s + (p.amountPaid || 0), 0);
    const balance = Math.max(0, due - paid);
    const now = new Date();

    let status = 'upcoming';
    if (paid >= due) status = 'paid';
    else if (paid > 0) status = 'partial';
    else if (periodEnd < now) status = 'late';
    else if (periodStart <= now) status = 'current';

    const monthAr = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    const label = step === 1
      ? `${monthAr[cur.getMonth()]} ${cur.getFullYear()}`
      : `${monthAr[periodStart.getMonth()]} ${periodStart.getFullYear()} — ${monthAr[periodEnd.getMonth()]} ${periodEnd.getFullYear()}`;

    schedule.push({
      label, year: periodStart.getFullYear(), month: periodStart.getMonth() + 1,
      due, paid, balance, status, periodStart, periodEnd,
    });

    cur = new Date(cur.getFullYear(), cur.getMonth() + step, 1);
  }

  return schedule;
}

export default function MonthlyPage() {
  const router = useRouter();
  const [appUser, setAppUser] = useState<AppUserBasic | null>(null);
  const [properties, setProperties] = useState<PropertyBasic[]>([]);
  const [propId, setPropId] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active'|'schedule'|'expiring'|'former'|'archive'>('active');
  const [showTenant, setShowTenant] = useState(false);
  const [showPay, setShowPay] = useState<{ tenant: Tenant; period?: any } | null>(null);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [renewConfirm, setRenewConfirm] = useState<Tenant | null>(null);
  const [partialPay, setPartialPay] = useState<{ period: any; tenant: Tenant } | null>(null);

  const canDelete = appUser?.role === 'owner';
  const canEdit   = appUser?.role === 'owner' || appUser?.role === 'manager';

  const EMPTY_TF = {
    unitId: '', name: '', phone: '', idNumber: '', contractNumber: '',
    rentAmount: '', contractStart: '', contractEnd: '',
    paymentCycle: 'monthly', status: 'active', notes: '',
  };
  const [tf, setTf] = useState(EMPTY_TF);
  const [pf, setPf] = useState({
    amountDue: '', amountPaid: '', paidDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'transfer', referenceNumber: '', receivedBy: 'manager',
    periodMonth: 0, periodYear: 0,
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }
      const user = await getCurrentUser(fbUser.uid);
      if (!user) { router.push('/login'); return; }
      setAppUser(user);
      setPf(f => ({ ...f, receivedBy: user.role === 'owner' ? 'owner' : 'manager' }));
      const props = await loadPropertiesForUser(fbUser.uid, user.role);
      setProperties(props);
      if (props.length > 0) { setPropId(props[0].id); await loadData(props[0].id); }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadData = async (pid: string) => {
    const [uSnap, ts, ps] = await Promise.all([
      getDocs(query(collection(db, 'units'), where('propertyId', '==', pid))),
      getDocs(query(collection(db, 'tenants'), where('propertyId', '==', pid))),
      getDocs(query(collection(db, 'rentPayments'), where('propertyId', '==', pid))),
    ]);
    setUnits(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as Unit)));
    setTenants(ts.docs.map(d => ({ id: d.id, ...d.data() } as Tenant)));
    setPayments(ps.docs.map(d => ({ id: d.id, ...d.data() } as Payment)));
  };

  // فتح نموذج إضافة مستأجر
  const openAdd = () => {
    setEditTenant(null);
    setTf(EMPTY_TF);
    setShowTenant(true);
  };

  // فتح نموذج تعديل
  const openEdit = (t: Tenant) => {
    setEditTenant(t);
    setTf({
      unitId: t.unitId || '', name: t.name, phone: t.phone || '',
      idNumber: t.idNumber || '', contractNumber: t.contractNumber || '',
      rentAmount: String(t.rentAmount),
      contractStart: t.contractStart ? (() => { const d = toDate(t.contractStart); return d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : ''; })() : '',
      contractEnd: t.contractEnd ? (() => { const d = toDate(t.contractEnd); return d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : ''; })() : '',
      paymentCycle: t.paymentCycle, status: t.status, notes: t.notes || '',
    });
    setShowTenant(true);
  };

  // حساب نهاية العقد تلقائياً بعد سنة
  const handleContractStartChange = (val: string) => {
    setTf(f => {
      const newTf = { ...f, contractStart: val };
      if (val && !f.contractEnd) {
        const start = new Date(val);
        const end = new Date(start);
        end.setFullYear(end.getFullYear() + 1);
        end.setDate(end.getDate() - 1);
        newTf.contractEnd = `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
      }
      return newTf;
    });
  };

  const saveTenant = async () => {
    if (!tf.unitId || !tf.name || !propId || !canEdit) return;
    setSaving(true);
    try {
      const selectedUnit = units.find(u => u.id === tf.unitId);
      const data: any = {
        unitId: tf.unitId,
        unitNumber: selectedUnit?.unitNumber || '',
        name: tf.name, phone: tf.phone, idNumber: tf.idNumber,
        contractNumber: tf.contractNumber,
        rentAmount: Number(tf.rentAmount) || selectedUnit?.basePrice || 0,
        contractStart: tf.contractStart ? Timestamp.fromDate(new Date(tf.contractStart)) : null,
        contractEnd: tf.contractEnd ? Timestamp.fromDate(new Date(tf.contractEnd)) : null,
        paymentCycle: tf.paymentCycle, status: tf.status,
        notes: tf.notes, propertyId: propId,
      };

      if (editTenant) {
        await updateDoc(doc(db, 'tenants', editTenant.id), data);
        // تحديث حالة الوحدة
        if (tf.status !== 'active' && editTenant.status === 'active') {
          await updateDoc(doc(db, 'units', tf.unitId), { status: 'vacant' });
        } else if (tf.status === 'active') {
          await updateDoc(doc(db, 'units', tf.unitId), { status: 'occupied' });
        }
      } else {
        await addDoc(collection(db, 'tenants'), { ...data, createdAt: serverTimestamp() });
        await updateDoc(doc(db, 'units', tf.unitId), { status: 'occupied' });
      }
      await loadData(propId);
      setShowTenant(false);
    } catch (e: any) { alert('حدث خطأ: ' + e.message); }
    setSaving(false);
  };

  // تجديد العقد
  const renewContract = async (t: Tenant) => {
    const end = toDate(t.contractEnd);
    if (!end) return;
    setSaving(true);
    try {
      const newStart = new Date(end);
      newStart.setDate(newStart.getDate() + 1);
      const newEnd = new Date(newStart);
      newEnd.setFullYear(newEnd.getFullYear() + 1);
      newEnd.setDate(newEnd.getDate() - 1);
      await updateDoc(doc(db, 'tenants', t.id), {
        contractStart: Timestamp.fromDate(newStart),
        contractEnd: Timestamp.fromDate(newEnd),
        status: 'active',
        renewedAt: serverTimestamp(),
      });
      await loadData(propId);
      setRenewConfirm(null);
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  // تسجيل دفعة ذكية
  const savePeriodPayment = async (tenant: Tenant, period: any, amountPaid: number, isPartial = false) => {
    if (!amountPaid) return;
    setSaving(true);
    try {
      const baseData = {
        propertyId: propId, tenantId: tenant.id,
        unitId: tenant.unitId, unitNumber: tenant.unitNumber, tenantName: tenant.name,
        paymentMethod: pf.paymentMethod, referenceNumber: pf.referenceNumber,
        receivedBy: pf.receivedBy, recordedBy: auth.currentUser?.uid,
        paidDate: pf.paidDate ? Timestamp.fromDate(new Date(pf.paidDate)) : Timestamp.now(),
      };

      if (isPartial) {
        // دفع جزئي
        await addDoc(collection(db, 'rentPayments'), {
          ...baseData,
          amountDue: period.due,
          amountPaid,
          balance: Math.max(0, period.due - amountPaid),
          periodMonth: period.month, periodYear: period.year,
          createdAt: serverTimestamp(),
        });
      } else {
        // دفع كامل — قد يغطي فترات متعددة إذا كان المبلغ أكبر
        let remaining = amountPaid;
        const schedule = buildPaymentSchedule(tenant, payments);
        const unpaidPeriods = schedule.filter(p => p.status !== 'paid').sort((a,b) => a.periodStart.getTime() - b.periodStart.getTime());

        for (const p of unpaidPeriods) {
          if (remaining <= 0) break;
          const payForPeriod = Math.min(remaining, p.due - p.paid);
          if (payForPeriod <= 0) continue;
          await addDoc(collection(db, 'rentPayments'), {
            ...baseData,
            amountDue: p.due, amountPaid: payForPeriod,
            balance: Math.max(0, p.due - p.paid - payForPeriod),
            periodMonth: p.month, periodYear: p.year,
            createdAt: serverTimestamp(),
          });
          remaining -= payForPeriod;
        }
      }

      await loadData(propId);
      setShowPay(null);
      setPartialPay(null);
      setPf(f => ({ ...f, amountPaid: '', referenceNumber: '' }));
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  // حذف دفعة
  const handleDeletePayment = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه الدفعة؟')) return;
    await deleteDoc(doc(db, 'rentPayments', id));
    await loadData(propId);
  };

  // ─── تصنيف المستأجرين ───
  const now = new Date();
  const activeTenants  = tenants.filter(t => t.status === 'active');
  const formerTenants  = tenants.filter(t => t.status !== 'active' || t.isFormer);
  const expiringTenants = activeTenants.filter(t => {
    const days = daysUntil(t.contractEnd);
    return days >= 0 && days <= 30;
  });
  const expiredTenants = activeTenants.filter(t => daysUntil(t.contractEnd) < 0);

  // الوحدات المتاحة للإضافة
  const availableUnits = units.filter(u => u.type !== 'furnished' && (u.status === 'vacant' || (editTenant && u.id === editTenant.unitId)));

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
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
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: '600', color: '#fff' }}>الإيجار الشهري</h1>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
            {activeTenants.length} مستأجر نشط
            {expiringTenants.length > 0 && ` · ⚠️ ${expiringTenants.length} عقد يقترب من الانتهاء`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {properties.length > 1 && (
            <select value={propId} onChange={e => { setPropId(e.target.value); loadData(e.target.value); }}
              style={{ border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
              {properties.map(p => <option key={p.id} value={p.id} style={{ color: '#000' }}>{p.name}</option>)}
            </select>
          )}
          {canEdit && (
            <button onClick={openAdd}
              style={{ background: '#D4AC0D', border: 'none', borderRadius: '10px', padding: '10px 14px', cursor: 'pointer', color: '#fff', fontSize: '13px', fontWeight: '600' }}>
              + مستأجر
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '16px', maxWidth: '900px', margin: '0 auto' }}>

        {/* تنبيه العقود المنتهية */}
        {expiredTenants.length > 0 && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '12px 16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#dc2626', marginBottom: '6px' }}>
              ⚠️ {expiredTenants.length} عقد منتهٍ — يحتاج إجراء
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {expiredTenants.map(t => (
                <button key={t.id} onClick={() => setRenewConfirm(t)}
                  style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', color: '#dc2626' }}>
                  شقة {t.unitNumber} — {t.name} · تجديد؟
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', background: '#fff', borderRadius: '12px', padding: '4px', marginBottom: '16px', border: '1px solid #e5e7eb', overflowX: 'auto' }}>
          {([
            ['active',   `المستأجرون (${activeTenants.length})`],
            ['schedule', 'جدول الدفعات'],
            ['expiring', `تنبيهات العقود ${expiringTenants.length > 0 ? `(${expiringTenants.length})` : ''}`],
            ['former',   `السابقون (${formerTenants.length})`],
            ['archive',  '📁 الأرشيف'],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ flex: 1, padding: '8px 6px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: tab === id ? '600' : '400', background: tab === id ? '#1B4F72' : 'transparent', color: tab === id ? '#fff' : '#6b7280', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>

        {/* ══ TAB: المستأجرون النشطون ══ */}
        {tab === 'active' && (
          activeTenants.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
              <p style={{ color: '#6b7280', margin: '0 0 16px' }}>لا يوجد مستأجرون نشطون</p>
              {canEdit && <button onClick={openAdd} style={btn1}>+ إضافة مستأجر</button>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeTenants.map(t => {
                const tenantPayments = payments.filter(p => p.tenantId === t.id);
                const schedule = buildPaymentSchedule(t, tenantPayments);
                const latePeriods = schedule.filter(s => s.status === 'late' || s.status === 'partial');
                const currentPeriod = schedule.find(s => s.status === 'current' || s.status === 'late' || s.status === 'partial');
                const daysLeft = daysUntil(t.contractEnd);
                const totalArrears = schedule.reduce((s, p) => s + p.balance, 0);

                return (
                  <div key={t.id} style={{ background: '#fff', borderRadius: '14px', border: `1px solid ${daysLeft < 0 ? '#fca5a5' : daysLeft <= 30 ? '#fbbf24' : '#e5e7eb'}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>

                    {/* تنبيه العقد */}
                    {daysLeft < 0 && (
                      <div style={{ background: '#fee2e2', padding: '6px 14px', fontSize: '12px', color: '#dc2626', fontWeight: '600' }}>
                        ⚠️ العقد منتهٍ منذ {Math.abs(daysLeft)} يوم
                      </div>
                    )}
                    {daysLeft >= 0 && daysLeft <= 30 && (
                      <div style={{ background: '#fef3c7', padding: '6px 14px', fontSize: '12px', color: '#92400e', fontWeight: '600' }}>
                        ⏰ ينتهي العقد خلال {daysLeft} يوم ({fmtDate(t.contractEnd)})
                      </div>
                    )}

                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ background: '#1B4F72', color: '#fff', borderRadius: '8px', padding: '6px 10px', fontSize: '14px', fontWeight: '700' }}>{t.unitNumber}</div>
                          <div>
                            <div style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>{t.name}</div>
                            <div style={{ fontSize: '12px', color: '#9ca3af' }}>{t.phone}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: '15px', fontWeight: '700', color: '#1B4F72' }}>{t.rentAmount.toLocaleString('ar-SA')} ر.س</div>
                          <div style={{ fontSize: '11px', color: '#9ca3af' }}>{CYCLE[t.paymentCycle]}</div>
                        </div>
                      </div>

                      {/* إحصائيات سريعة */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '12px' }}>
                        {[
                          ['بداية العقد', fmtDate(t.contractStart)],
                          ['نهاية العقد', fmtDate(t.contractEnd)],
                          ['المتأخرات', totalArrears > 0 ? totalArrears.toLocaleString('ar-SA') + ' ر.س' : '✅ لا يوجد'],
                        ].map(([l, v]) => (
                          <div key={String(l)} style={{ background: '#f9fafb', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '3px' }}>{l}</div>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* الدفعة الحالية */}
                      {currentPeriod && (
                        <div style={{ background: currentPeriod.status === 'late' ? '#fee2e2' : currentPeriod.status === 'partial' ? '#fef3c7' : '#f0f9ff', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{currentPeriod.label}</div>
                            <div style={{ fontSize: '11px', color: '#6b7280' }}>
                              المطلوب: {currentPeriod.due.toLocaleString('ar-SA')} ر.س
                              {currentPeriod.paid > 0 && ` · مدفوع: ${currentPeriod.paid.toLocaleString('ar-SA')} ر.س`}
                            </div>
                          </div>
                          <span style={{ padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '600', background: currentPeriod.status === 'late' ? '#dc2626' : currentPeriod.status === 'partial' ? '#d97706' : '#1e40af', color: '#fff' }}>
                            {currentPeriod.status === 'late' ? 'متأخر' : currentPeriod.status === 'partial' ? 'جزئي' : 'مستحق'}
                          </span>
                        </div>
                      )}

                      {/* أزرار الإجراءات */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button onClick={() => {
                          const period = schedule.find(p => p.status !== 'paid') || schedule[0];
                          setShowPay({ tenant: t, period });
                          setPf(f => ({ ...f, amountDue: String(period?.balance || t.rentAmount), amountPaid: '' }));
                        }}
                          style={{ flex: 1, padding: '9px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                          💰 تسجيل دفعة
                        </button>
                        <button onClick={() => router.push(`/monthly/${t.id}`)}
                          style={{ padding: '9px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                          👁️ تفاصيل
                        </button>
                        {canEdit && (
                          <button onClick={() => openEdit(t)}
                            style={{ padding: '9px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                            ✏️
                          </button>
                        )}
                        {(daysLeft < 0 || daysLeft <= 30) && (
                          <button onClick={() => setRenewConfirm(t)}
                            style={{ padding: '9px 12px', background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                            🔄 تجديد
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ══ TAB: جدول الدفعات ══ */}
        {tab === 'schedule' && (
          <div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '14px' }}>
              جدول تفصيلي للدفعات المستحقة والمدفوعة لجميع المستأجرين
            </div>
            {activeTenants.map(t => {
              const tenantPayments = payments.filter(p => p.tenantId === t.id);
              const schedule = buildPaymentSchedule(t, tenantPayments);
              if (schedule.length === 0) return null;
              const totalArrears = schedule.reduce((s, p) => s + p.balance, 0);

              return (
                <div key={t.id} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', marginBottom: '14px', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: '#1B4F72', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ background: '#fff', color: '#1B4F72', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', fontWeight: '700' }}>{t.unitNumber}</span>
                      <span style={{ color: '#fff', fontWeight: '600', fontSize: '14px' }}>{t.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      {totalArrears > 0 && <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '600' }}>متأخرات: {totalArrears.toLocaleString('ar-SA')} ر.س</span>}
                      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>{t.rentAmount.toLocaleString('ar-SA')} ر.س / {CYCLE[t.paymentCycle]}</span>
                    </div>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead style={{ background: '#f9fafb' }}>
                        <tr>
                          {['الفترة', 'المستحق', 'المدفوع', 'المتبقي', 'الحالة', ''].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280', fontWeight: '500', borderBottom: '1px solid #e5e7eb', fontSize: '12px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {schedule.map((row, i) => {
                          const colors = {
                            paid:     { bg: '#d1fae5', color: '#065f46', label: '✅ مسدد' },
                            partial:  { bg: '#fef3c7', color: '#92400e', label: '⚠️ جزئي' },
                            late:     { bg: '#fee2e2', color: '#dc2626', label: '🔴 متأخر' },
                            current:  { bg: '#dbeafe', color: '#1e40af', label: '📌 مستحق' },
                            upcoming: { bg: '#f3f4f6', color: '#6b7280', label: '⏳ قادم' },
                          }[row.status] || { bg: '#f3f4f6', color: '#374151', label: row.status };

                          return (
                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fafafa' : '#fff' }}>
                              <td style={{ padding: '10px 12px', fontWeight: '500', color: '#374151' }}>{row.label}</td>
                              <td style={{ padding: '10px 12px', color: '#1B4F72', fontWeight: '600' }}>{row.due.toLocaleString('ar-SA')} ر.س</td>
                              <td style={{ padding: '10px 12px', color: '#16a34a', fontWeight: '600' }}>{row.paid > 0 ? row.paid.toLocaleString('ar-SA') + ' ر.س' : '—'}</td>
                              <td style={{ padding: '10px 12px', color: row.balance > 0 ? '#dc2626' : '#16a34a', fontWeight: '600' }}>
                                {row.balance > 0 ? row.balance.toLocaleString('ar-SA') + ' ر.س' : '✓'}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{ background: colors.bg, color: colors.color, padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '600' }}>{colors.label}</span>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {row.status !== 'paid' && row.status !== 'upcoming' && canEdit && (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => {
                                      setShowPay({ tenant: t, period: row });
                                      setPf(f => ({ ...f, amountDue: String(row.balance), amountPaid: String(row.balance), periodMonth: row.month, periodYear: row.year }));
                                    }}
                                      style={{ padding: '4px 10px', background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>
                                      سدد
                                    </button>
                                    <button onClick={() => {
                                      setPartialPay({ period: row, tenant: t });
                                      setPf(f => ({ ...f, amountDue: String(row.due), amountPaid: '', periodMonth: row.month, periodYear: row.year }));
                                    }}
                                      style={{ padding: '4px 10px', background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>
                                      جزئي
                                    </button>
                                  </div>
                                )}
                                {row.status === 'upcoming' && (
                                  <button onClick={() => {
                                    setShowPay({ tenant: t, period: row });
                                    setPf(f => ({ ...f, amountDue: String(row.due), amountPaid: String(row.due), periodMonth: row.month, periodYear: row.year }));
                                  }}
                                    style={{ padding: '4px 10px', background: '#dbeafe', color: '#1e40af', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>
                                    دفع مسبق
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ TAB: تنبيهات العقود ══ */}
        {tab === 'expiring' && (
          <div>
            {/* منتهية */}
            {expiredTenants.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#dc2626', marginBottom: '10px' }}>🔴 عقود منتهية ({expiredTenants.length})</div>
                {expiredTenants.map(t => (
                  <div key={t.id} style={{ background: '#fff', borderRadius: '12px', padding: '14px 16px', border: '1px solid #fca5a5', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: '#dc2626', color: '#fff', borderRadius: '8px', padding: '6px 10px', fontSize: '13px', fontWeight: '700' }}>{t.unitNumber}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{t.name}</div>
                      <div style={{ fontSize: '12px', color: '#dc2626' }}>انتهى: {fmtDate(t.contractEnd)} (منذ {Math.abs(daysUntil(t.contractEnd))} يوم)</div>
                    </div>
                    <button onClick={() => setRenewConfirm(t)}
                      style={{ padding: '8px 16px', background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                      🔄 تجديد العقد
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* تقترب من الانتهاء */}
            {expiringTenants.filter(t => daysUntil(t.contractEnd) >= 0).length > 0 && (
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#d97706', marginBottom: '10px' }}>⚠️ تنتهي خلال 30 يوم</div>
                {expiringTenants.filter(t => daysUntil(t.contractEnd) >= 0).map(t => (
                  <div key={t.id} style={{ background: '#fff', borderRadius: '12px', padding: '14px 16px', border: '1px solid #fbbf24', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: '#d97706', color: '#fff', borderRadius: '8px', padding: '6px 10px', fontSize: '13px', fontWeight: '700' }}>{t.unitNumber}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{t.name}</div>
                      <div style={{ fontSize: '12px', color: '#d97706' }}>ينتهي: {fmtDate(t.contractEnd)} (بعد {daysUntil(t.contractEnd)} يوم)</div>
                    </div>
                    <button onClick={() => setRenewConfirm(t)}
                      style={{ padding: '8px 16px', background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                      🔄 تجديد مسبق
                    </button>
                  </div>
                ))}
              </div>
            )}

            {expiringTenants.length === 0 && expiredTenants.length === 0 && (
              <div style={{ background: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                <p style={{ color: '#6b7280' }}>لا توجد عقود تحتاج انتباه</p>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: المستأجرون السابقون ══ */}
        {tab === 'former' && (
          formerTenants.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
              <p style={{ color: '#6b7280' }}>لا يوجد مستأجرون سابقون</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {formerTenants.map(t => (
                <div key={t.id} style={{ background: '#fff', borderRadius: '12px', padding: '14px 16px', border: '1px solid #e5e7eb', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ background: '#6b7280', color: '#fff', borderRadius: '8px', padding: '6px 10px', fontSize: '13px', fontWeight: '700' }}>{t.unitNumber}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>{t.name}</div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      {fmtDate(t.contractStart)} → {fmtDate(t.contractEnd)}
                      · {t.rentAmount?.toLocaleString('ar-SA')} ر.س
                    </div>
                    {t.notes && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>📝 {t.notes}</div>}
                  </div>
                  <span style={{ background: '#f3f4f6', color: '#6b7280', padding: '3px 10px', borderRadius: '10px', fontSize: '11px' }}>مغادر</span>
                  {canEdit && (
                    <button onClick={() => openEdit(t)}
                      style={{ padding: '6px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                      تعديل
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* ══ TAB: الأرشيف ══ */}
        {tab === 'archive' && (
          <div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '14px' }}>
              سجل كامل بجميع المستأجرين — الحاليين والسابقين
            </div>
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ background: '#1B4F72' }}>
                  <tr>
                    {['الشقة', 'الاسم', 'رقم الهوية', 'الجوال', 'من', 'إلى', 'مدة الإقامة', 'عدد مرات الاستئجار', 'الحالة', 'ملاحظات'].map(h => (
                      <th key={h} style={{ padding: '10px 10px', textAlign: 'right', color: '#fff', fontWeight: '500', fontSize: '11px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tenants
                    .sort((a, b) => (b.contractStart?.seconds || 0) - (a.contractStart?.seconds || 0))
                    .map((t, i) => {
                      const start = toDate(t.contractStart);
                      const end = toDate(t.contractEnd);
                      const duration = start && end
                        ? Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30))) + ' شهر'
                        : '—';
                      // عدد مرات الاستئجار = عدد العقود بنفس رقم الهوية
                      const timesRented = tenants.filter(x => x.idNumber && x.idNumber === t.idNumber).length;

                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fafafa' : '#fff' }}>
                          <td style={{ padding: '9px 10px', fontWeight: '700', color: '#1B4F72' }}>{t.unitNumber}</td>
                          <td style={{ padding: '9px 10px', fontWeight: '500', color: '#111827' }}>{t.name}</td>
                          <td style={{ padding: '9px 10px', color: '#6b7280', direction: 'ltr' }}>{t.idNumber || '—'}</td>
                          <td style={{ padding: '9px 10px', color: '#6b7280', direction: 'ltr' }}>{t.phone || '—'}</td>
                          <td style={{ padding: '9px 10px', color: '#6b7280' }}>{fmtDate(t.contractStart)}</td>
                          <td style={{ padding: '9px 10px', color: '#6b7280' }}>{fmtDate(t.contractEnd)}</td>
                          <td style={{ padding: '9px 10px', color: '#374151' }}>{duration}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'center', color: '#1B4F72', fontWeight: '600' }}>{timesRented}</td>
                          <td style={{ padding: '9px 10px' }}>
                            <span style={{ background: t.status === 'active' ? '#d1fae5' : '#f3f4f6', color: t.status === 'active' ? '#065f46' : '#6b7280', padding: '2px 8px', borderRadius: '8px', fontSize: '11px' }}>
                              {t.status === 'active' ? 'نشط' : 'مغادر'}
                            </span>
                          </td>
                          <td style={{ padding: '9px 10px', color: '#6b7280', fontSize: '11px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.notes || '—'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ══ Modal إضافة/تعديل مستأجر ══ */}
      {showTenant && canEdit && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowTenant(false)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '520px', maxHeight: '92vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '17px', color: '#1B4F72', fontWeight: '600' }}>{editTenant ? 'تعديل المستأجر' : 'إضافة مستأجر جديد'}</h2>
              <button onClick={() => setShowTenant(false)} style={{ border: 'none', background: '#f3f4f6', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

              {/* رقم الشقة — من الوحدات المسجلة */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>رقم الشقة <span style={{ color: '#dc2626' }}>*</span></label>
                <select value={tf.unitId} onChange={e => {
                  const unit = units.find(u => u.id === e.target.value);
                  setTf(f => ({ ...f, unitId: e.target.value, rentAmount: f.rentAmount || String(unit?.basePrice || '') }));
                }} style={inp}>
                  <option value="">اختر الشقة...</option>
                  {availableUnits.sort((a,b) => a.unitNumber.localeCompare(b.unitNumber, undefined, {numeric:true})).map(u => (
                    <option key={u.id} value={u.id}>
                      شقة {u.unitNumber} — {u.type === 'monthly' ? 'شهري' : 'خاصة'}
                      {u.basePrice ? ` (${u.basePrice.toLocaleString('ar-SA')} ر.س)` : ''}
                      {u.status !== 'vacant' && editTenant?.unitId === u.id ? ' ← الحالية' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {[
                ['name', 'اسم المستأجر', 'text'],
                ['phone', 'رقم الجوال', 'tel'],
                ['idNumber', 'رقم الهوية', 'text'],
                ['contractNumber', 'رقم العقد', 'text'],
                ['rentAmount', 'مبلغ الإيجار (ر.س)', 'number'],
              ].map(([k, l, t]) => (
                <div key={k}>
                  <label style={lbl}>{l}</label>
                  <input type={t} value={(tf as any)[k]} onChange={e => setTf(f => ({ ...f, [k]: e.target.value }))} style={inp} />
                </div>
              ))}

              <div>
                <label style={lbl}>بداية العقد</label>
                <input type="date" value={tf.contractStart}
                  onChange={e => handleContractStartChange(e.target.value)} style={inp} />
              </div>

              <div>
                <label style={lbl}>نهاية العقد <span style={{ fontSize: '10px', color: '#9ca3af' }}>(تلقائي: سنة)</span></label>
                <input type="date" value={tf.contractEnd} onChange={e => setTf(f => ({ ...f, contractEnd: e.target.value }))} style={inp} />
              </div>

              <div>
                <label style={lbl}>دورة الدفع</label>
                <select value={tf.paymentCycle} onChange={e => setTf(f => ({ ...f, paymentCycle: e.target.value }))} style={inp}>
                  <option value="monthly">شهري</option>
                  <option value="quarterly">ربع سنوي</option>
                  <option value="semi">نصف سنوي</option>
                  <option value="annual">سنوي</option>
                </select>
              </div>

              <div>
                <label style={lbl}>حالة العقد</label>
                <select value={tf.status} onChange={e => setTf(f => ({ ...f, status: e.target.value }))} style={inp}>
                  <option value="active">نشط — مستأجر موجود</option>
                  <option value="expired">منتهي — مستأجر غادر</option>
                  <option value="terminated">مُنهى مبكراً</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>ملاحظات خاصة (تبقى في الأرشيف)</label>
                <textarea value={tf.notes} onChange={e => setTf(f => ({ ...f, notes: e.target.value }))} rows={3}
                  placeholder="أي ملاحظات عن المستأجر، تبقى محفوظة حتى بعد المغادرة..."
                  style={{ ...inp, resize: 'none' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={saveTenant} disabled={saving}
                style={{ flex: 1, padding: '13px', background: saving ? '#9ca3af' : '#1B4F72', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '15px', fontWeight: '600', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'جارٍ الحفظ...' : editTenant ? 'حفظ التعديلات' : 'إضافة المستأجر'}
              </button>
              <button onClick={() => setShowTenant(false)}
                style={{ padding: '13px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '15px' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal تسجيل دفعة ذكية ══ */}
      {showPay && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowPay(null)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '17px', color: '#1B4F72', fontWeight: '600' }}>
                تسجيل دفعة — {showPay.tenant.name}
              </h2>
              <button onClick={() => setShowPay(null)} style={{ border: 'none', background: '#f3f4f6', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            {showPay.period && (
              <div style={{ background: '#f0f9ff', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#1e40af' }}>
                📅 الفترة: <strong>{showPay.period.label}</strong>
                · المستحق: <strong>{showPay.period.balance.toLocaleString('ar-SA')} ر.س</strong>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={lbl}>المبلغ المستحق (ر.س)</label>
                  <input type="number" value={pf.amountDue || showPay.tenant.rentAmount} onChange={e => setPf(f => ({ ...f, amountDue: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>المبلغ المدفوع (ر.س)</label>
                  <input type="number" value={pf.amountPaid} onChange={e => setPf(f => ({ ...f, amountPaid: e.target.value }))}
                    placeholder="أدخل المبلغ..." style={inp} autoFocus />
                </div>
                <div>
                  <label style={lbl}>تاريخ الاستلام</label>
                  <input type="date" value={pf.paidDate} onChange={e => setPf(f => ({ ...f, paidDate: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>طريقة الدفع</label>
                  <select value={pf.paymentMethod} onChange={e => setPf(f => ({ ...f, paymentMethod: e.target.value }))} style={inp}>
                    <option value="transfer">تحويل بنكي</option>
                    <option value="cash">كاش</option>
                    <option value="ejar">إيجار</option>
                    <option value="stc_pay">STC Pay</option>
                  </select>
                </div>
              </div>

              {/* مستلم المبلغ */}
              <div>
                <label style={{ ...lbl, fontWeight: '600' }}>💰 مستلم المبلغ</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { val: 'manager', label: 'مسؤول العقار', icon: '👤', color: '#1e40af', bg: '#dbeafe' },
                    { val: 'owner', label: 'المالك', icon: '👑', color: '#7c3aed', bg: '#ede9fe' },
                  ].map(opt => (
                    <button key={opt.val} onClick={() => setPf(f => ({ ...f, receivedBy: opt.val }))}
                      style={{ padding: '10px', border: `2px solid ${pf.receivedBy === opt.val ? opt.color : '#e5e7eb'}`, borderRadius: '10px', background: pf.receivedBy === opt.val ? opt.bg : '#fff', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: '18px' }}>{opt.icon}</div>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: pf.receivedBy === opt.val ? opt.color : '#374151' }}>{opt.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={lbl}>رقم المرجع</label>
                <input value={pf.referenceNumber} onChange={e => setPf(f => ({ ...f, referenceNumber: e.target.value }))} style={inp} />
              </div>

              {/* إشعار ذكي */}
              {pf.amountPaid && showPay.period && Number(pf.amountPaid) > showPay.period.balance && (
                <div style={{ background: '#dbeafe', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#1e40af' }}>
                  💡 المبلغ المدفوع ({Number(pf.amountPaid).toLocaleString('ar-SA')} ر.س) يزيد عن المستحق للفترة الحالية. سيتم تطبيق الزيادة على الفترات القادمة تلقائياً.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => {
                const amount = Number(pf.amountPaid);
                if (!amount) return;
                savePeriodPayment(showPay.tenant, showPay.period, amount, false);
              }} disabled={saving}
                style={{ flex: 1, padding: '13px', background: saving ? '#9ca3af' : '#1B4F72', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '15px', fontWeight: '600' }}>
                {saving ? 'جارٍ الحفظ...' : '✅ تسجيل الدفعة'}
              </button>
              <button onClick={() => setShowPay(null)}
                style={{ padding: '13px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '15px' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal دفع جزئي ══ */}
      {partialPay && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '380px', maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 8px', color: '#1B4F72' }}>دفع جزئي</h3>
            <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '16px' }}>
              {partialPay.period.label} — المستحق: {partialPay.period.due.toLocaleString('ar-SA')} ر.س
            </p>
            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>المبلغ المدفوع (ر.س)</label>
              <input type="number" value={pf.amountPaid} onChange={e => setPf(f => ({ ...f, amountPaid: e.target.value }))}
                placeholder="أقل من المستحق..." style={inp} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => {
                const amount = Number(pf.amountPaid);
                if (!amount || amount >= partialPay.period.due) { alert('أدخل مبلغاً جزئياً أقل من المستحق'); return; }
                savePeriodPayment(partialPay.tenant, partialPay.period, amount, true);
              }} disabled={saving}
                style={{ flex: 1, padding: '11px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                {saving ? 'جارٍ...' : 'تسجيل الدفع الجزئي'}
              </button>
              <button onClick={() => setPartialPay(null)}
                style={{ padding: '11px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal تأكيد التجديد ══ */}
      {renewConfirm && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '380px', maxWidth: '95vw', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔄</div>
            <h3 style={{ margin: '0 0 8px', color: '#1B4F72' }}>تجديد عقد</h3>
            <p style={{ color: '#374151', fontWeight: '600', marginBottom: '4px' }}>{renewConfirm.name} — شقة {renewConfirm.unitNumber}</p>
            <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '6px' }}>
              انتهى العقد: {fmtDate(renewConfirm.contractEnd)}
            </p>
            <p style={{ color: '#16a34a', fontSize: '13px', marginBottom: '20px' }}>
              سيتجدد تلقائياً لمدة سنة إضافية بنفس الشروط
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => renewContract(renewConfirm)} disabled={saving}
                style={{ flex: 1, padding: '12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                {saving ? 'جارٍ...' : '✅ تأكيد التجديد'}
              </button>
              <button onClick={() => setRenewConfirm(null)}
                style={{ padding: '12px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: '13px', color: '#374151', marginBottom: '6px', fontWeight: '500' };
const inp: React.CSSProperties = { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', boxSizing: 'border-box', background: '#fff' };
const btn1: React.CSSProperties = { padding: '10px 20px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px' };
