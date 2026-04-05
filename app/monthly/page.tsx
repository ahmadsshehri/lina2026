'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, serverTimestamp, Timestamp, getDoc
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../../lib/userHelpers';

interface Tenant {
  id: string; propertyId: string; unitId: string; unitNumber: string;
  name: string; phone: string; idNumber: string; contractNumber: string;
  contractStart: any; contractEnd: any; paymentCycle: string;
  rentAmount: number; status: string;
}
interface Payment {
  id: string; tenantId: string; unitNumber: string; tenantName: string;
  amountDue: number; amountPaid: number; balance: number;
  paidDate: any; paymentMethod: string; referenceNumber: string;
  receivedBy: string; // 'owner' | 'manager'
  deleteRequested?: boolean;
}

const CYCLE: Record<string, string> = { monthly: 'شهري', quarterly: 'ربع سنوي', semi: 'نصف سنوي', annual: 'سنوي' };
const METHOD: Record<string, string> = { transfer: 'تحويل', cash: 'كاش', ejar: 'إيجار', stc_pay: 'STC Pay' };

function fmtDate(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

export default function MonthlyPage() {
  const router = useRouter();
  const [appUser, setAppUser] = useState<AppUserBasic | null>(null);
  const [properties, setProperties] = useState<PropertyBasic[]>([]);
  const [propId, setPropId] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'tenants' | 'payments' | 'arrears'>('tenants');
  const [showTenant, setShowTenant] = useState(false);
  const [showPay, setShowPay] = useState<Tenant | null>(null);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const canDelete = appUser?.role === 'owner';
  const canAddTenant = appUser?.role === 'owner' || appUser?.role === 'manager';

  const [tf, setTf] = useState({
    unitNumber: '', name: '', phone: '', idNumber: '', contractNumber: '',
    rentAmount: '', contractStart: '', contractEnd: '', paymentCycle: 'monthly', status: 'active',
  });
  const [pf, setPf] = useState({
    amountDue: '', amountPaid: '', paidDate: '',
    paymentMethod: 'transfer', referenceNumber: '',
    receivedBy: 'manager', // ← الجديد: مستلم المبلغ
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }
      const user = await getCurrentUser(fbUser.uid);
      if (!user) { router.push('/login'); return; }
      setAppUser(user);
      // تحديد المستلم الافتراضي حسب دور المستخدم
      setPf(f => ({ ...f, receivedBy: user.role === 'owner' ? 'owner' : 'manager' }));
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
    const [ts, ps] = await Promise.all([
      getDocs(query(collection(db, 'tenants'), where('propertyId', '==', pid))),
      getDocs(query(collection(db, 'rentPayments'), where('propertyId', '==', pid))),
    ]);
    setTenants(ts.docs.map(d => ({ id: d.id, ...d.data() } as Tenant)));
    setPayments(ps.docs.map(d => ({ id: d.id, ...d.data() } as Payment)));
  };

  const saveTenant = async () => {
    if (!tf.unitNumber || !tf.name || !propId || !canAddTenant) return;
    setSaving(true);
    try {
      const data = {
        ...tf, propertyId: propId, unitId: tf.unitNumber,
        rentAmount: Number(tf.rentAmount),
        contractStart: tf.contractStart ? Timestamp.fromDate(new Date(tf.contractStart)) : null,
        contractEnd: tf.contractEnd ? Timestamp.fromDate(new Date(tf.contractEnd)) : null,
      };
      if (editTenant) {
        await updateDoc(doc(db, 'tenants', editTenant.id), data);
      } else {
        await addDoc(collection(db, 'tenants'), { ...data, createdAt: serverTimestamp() });
      }
      await loadData(propId);
      setShowTenant(false);
      setEditTenant(null);
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const savePayment = async () => {
    if (!showPay || !pf.amountPaid) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'rentPayments'), {
        propertyId: propId,
        tenantId: showPay.id,
        unitId: showPay.unitId,
        unitNumber: showPay.unitNumber,
        tenantName: showPay.name,
        amountDue: Number(pf.amountDue || showPay.rentAmount),
        amountPaid: Number(pf.amountPaid),
        balance: Number(pf.amountDue || showPay.rentAmount) - Number(pf.amountPaid),
        paymentMethod: pf.paymentMethod,
        referenceNumber: pf.referenceNumber,
        receivedBy: pf.receivedBy,        // ← حقل مستلم المبلغ
        paidDate: pf.paidDate ? Timestamp.fromDate(new Date(pf.paidDate)) : Timestamp.now(),
        recordedBy: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
      });
      await loadData(propId);
      setShowPay(null);
      setPf({ amountDue: '', amountPaid: '', paidDate: '', paymentMethod: 'transfer', referenceNumber: '', receivedBy: appUser?.role === 'owner' ? 'owner' : 'manager' });
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  // المالك يحذف مباشرة
  const handleDeleteOwner = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه الدفعة؟')) return;
    await deleteDoc(doc(db, 'rentPayments', id));
    await loadData(propId);
  };

  // غير المالك يرسل طلب حذف
  const sendDeleteRequest = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'deleteRequests'), {
        type: 'rentPayment',
        documentId: deleteTarget.id,
        propertyId: propId,
        requestedBy: auth.currentUser?.uid,
        requestedByName: appUser?.name,
        requestedByRole: appUser?.role,
        reason: deleteReason,
        status: 'pending',
        paymentDetails: {
          tenantName: deleteTarget.tenantName,
          unitNumber: deleteTarget.unitNumber,
          amountPaid: deleteTarget.amountPaid,
          paidDate: deleteTarget.paidDate,
        },
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'rentPayments', deleteTarget.id), {
        deleteRequested: true,
        deleteRequestedBy: appUser?.name,
      });
      await loadData(propId);
      setDeleteTarget(null);
      setDeleteReason('');
      alert('✅ تم إرسال طلب الحذف للمالك');
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const openEdit = (t: Tenant) => {
    setEditTenant(t);
    setTf({ unitNumber: t.unitNumber, name: t.name, phone: t.phone || '', idNumber: t.idNumber || '', contractNumber: t.contractNumber || '', rentAmount: String(t.rentAmount), contractStart: '', contractEnd: '', paymentCycle: t.paymentCycle, status: t.status });
    setShowTenant(true);
  };

  const arrears = tenants.filter(t => {
    if (t.status !== 'active') return false;
    const bal = payments.filter(p => p.tenantId === t.id).reduce((s, p) => s + (p.balance || 0), 0);
    return bal > 0;
  });

  const pendingDeletes = payments.filter(p => p.deleteRequested).length;

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
            {tenants.filter(t => t.status === 'active').length} مستأجر نشط
            {pendingDeletes > 0 && ` · ${pendingDeletes} طلب حذف`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {properties.length > 1 && (
            <select value={propId} onChange={e => { setPropId(e.target.value); loadData(e.target.value); }}
              style={{ border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
              {properties.map(p => <option key={p.id} value={p.id} style={{ color: '#000' }}>{p.name}</option>)}
            </select>
          )}
          {canAddTenant && (
            <button onClick={() => { setEditTenant(null); setTf({ unitNumber: '', name: '', phone: '', idNumber: '', contractNumber: '', rentAmount: '', contractStart: '', contractEnd: '', paymentCycle: 'monthly', status: 'active' }); setShowTenant(true); }}
              style={{ background: '#D4AC0D', border: 'none', borderRadius: '10px', padding: '10px 14px', cursor: 'pointer', color: '#fff', fontSize: '13px', fontWeight: '600' }}>
              + إضافة
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '16px', maxWidth: '800px', margin: '0 auto' }}>

        {/* تنبيه طلبات الحذف للمالك */}
        {canDelete && pendingDeletes > 0 && (
          <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#92400e' }}>
            ⏳ {pendingDeletes} طلب حذف دفعة معلق — راجع تبويب "الدفعات"
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', background: '#fff', borderRadius: '12px', padding: '4px', marginBottom: '16px', border: '1px solid #e5e7eb' }}>
          {[['tenants', 'المستأجرون'], ['payments', 'الدفعات'], ['arrears', `المتأخرات (${arrears.length})`]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id as any)}
              style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: tab === id ? '600' : '400', background: tab === id ? '#1B4F72' : 'transparent', color: tab === id ? '#fff' : '#6b7280', transition: 'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>

        {/* TENANTS */}
        {tab === 'tenants' && (
          tenants.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
              <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 16px' }}>لا يوجد مستأجرون</p>
              {canAddTenant && <button onClick={() => setShowTenant(true)} style={btnPrimary}>+ إضافة مستأجر</button>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tenants.map(t => (
                <div key={t.id} style={{ background: '#fff', borderRadius: '14px', padding: '16px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ background: '#1B4F72', color: '#fff', borderRadius: '8px', padding: '6px 10px', fontSize: '14px', fontWeight: '700' }}>{t.unitNumber}</div>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>{t.name}</div>
                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>{t.phone}</div>
                      </div>
                    </div>
                    <span style={{ background: t.status === 'active' ? '#d1fae5' : '#fee2e2', color: t.status === 'active' ? '#065f46' : '#991b1b', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>
                      {t.status === 'active' ? 'نشط' : 'منتهي'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                    {[['الإيجار', t.rentAmount.toLocaleString('ar-SA') + ' ر.س'], ['دورة الدفع', CYCLE[t.paymentCycle] || t.paymentCycle], ['نهاية العقد', fmtDate(t.contractEnd)]].map(([l, v]) => (
                      <div key={String(l)} style={{ background: '#f9fafb', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '3px' }}>{l}</div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setShowPay(t)}
                      style={{ flex: 1, padding: '9px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                      تسجيل دفعة
                    </button>
                    {canAddTenant && (
                      <button onClick={() => openEdit(t)}
                        style={{ padding: '9px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        تعديل
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* PAYMENTS */}
        {tab === 'payments' && (
          payments.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>💳</div>
              <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>لا توجد دفعات مسجلة</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {payments.sort((a, b) => (b.paidDate?.seconds || 0) - (a.paidDate?.seconds || 0)).map(p => (
                <div key={p.id} style={{ background: p.deleteRequested ? '#fff7ed' : '#fff', borderRadius: '14px', padding: '14px 16px', border: `1px solid ${p.deleteRequested ? '#fbbf24' : '#e5e7eb'}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ background: '#1B4F72', color: '#fff', borderRadius: '8px', padding: '4px 8px', fontSize: '12px', fontWeight: '700', flexShrink: 0 }}>{p.unitNumber}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{p.tenantName}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span>{fmtDate(p.paidDate)}</span>
                      <span>· {METHOD[p.paymentMethod] || p.paymentMethod}</span>
                      {/* مستلم المبلغ */}
                      <span style={{ background: p.receivedBy === 'owner' ? '#fef3c7' : '#dbeafe', color: p.receivedBy === 'owner' ? '#92400e' : '#1e40af', padding: '0px 6px', borderRadius: '6px', fontSize: '10px' }}>
                        استلمه: {p.receivedBy === 'owner' ? 'المالك' : 'المسؤول'}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'left', flexShrink: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#16a34a' }}>{p.amountPaid?.toLocaleString('ar-SA')} ر.س</div>
                    {p.balance > 0 && <div style={{ fontSize: '11px', color: '#dc2626' }}>متبقي: {p.balance?.toLocaleString('ar-SA')}</div>}
                  </div>
                  <div>
                    {p.deleteRequested ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                        <span style={{ fontSize: '10px', color: '#d97706', background: '#fef3c7', padding: '2px 6px', borderRadius: '6px' }}>🔴 طلب حذف</span>
                        {canDelete && (
                          <button onClick={() => handleDeleteOwner(p.id)}
                            style={{ padding: '3px 8px', border: '1px solid #fca5a5', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', color: '#dc2626' }}>
                            تأكيد
                          </button>
                        )}
                      </div>
                    ) : canDelete ? (
                      <button onClick={() => handleDeleteOwner(p.id)}
                        style={{ padding: '4px 10px', border: '1px solid #fca5a5', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', color: '#dc2626' }}>
                        حذف
                      </button>
                    ) : (
                      <button onClick={() => setDeleteTarget(p)}
                        style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', color: '#6b7280' }}>
                        🔒 طلب حذف
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ARREARS */}
        {tab === 'arrears' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              {[
                { label: 'إجمالي المتأخرات', val: arrears.reduce((s, t) => s + payments.filter(p => p.tenantId === t.id).reduce((x, p) => x + (p.balance || 0), 0), 0).toLocaleString('ar-SA') + ' ر.س', color: '#dc2626', bg: '#fee2e2' },
                { label: 'عدد المتأخرين', val: arrears.length + ' مستأجر', color: '#d97706', bg: '#fef3c7' },
              ].map(k => (
                <div key={k.label} style={{ background: k.bg, borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>{k.label}</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: k.color }}>{k.val}</div>
                </div>
              ))}
            </div>
            {arrears.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: '16px', padding: '32px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>✅</div>
                <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>لا توجد متأخرات</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {arrears.map(t => {
                  const bal = payments.filter(p => p.tenantId === t.id).reduce((s, p) => s + (p.balance || 0), 0);
                  return (
                    <div key={t.id} style={{ background: '#fff', borderRadius: '14px', padding: '16px', border: '1px solid #fca5a5' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ background: '#dc2626', color: '#fff', borderRadius: '8px', padding: '6px 10px', fontSize: '14px', fontWeight: '700' }}>{t.unitNumber}</div>
                          <div>
                            <div style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>{t.name}</div>
                            <div style={{ fontSize: '12px', color: '#9ca3af' }}>{t.phone}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#dc2626' }}>{bal.toLocaleString('ar-SA')} ر.س</div>
                      </div>
                      <button onClick={() => setShowPay(t)}
                        style={{ width: '100%', padding: '9px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                        تسجيل دفعة
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tenant Modal */}
      {showTenant && canAddTenant && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowTenant(false)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '17px', color: '#1B4F72', fontWeight: '600' }}>{editTenant ? 'تعديل المستأجر' : 'إضافة مستأجر جديد'}</h2>
              <button onClick={() => setShowTenant(false)} style={{ border: 'none', background: '#f3f4f6', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[['unitNumber', 'رقم الشقة', 'text'], ['name', 'اسم المستأجر', 'text'], ['phone', 'رقم الجوال', 'text'], ['idNumber', 'رقم الهوية', 'text'], ['contractNumber', 'رقم العقد', 'text'], ['rentAmount', 'الإيجار (ر.س)', 'number'], ['contractStart', 'بداية العقد', 'date'], ['contractEnd', 'نهاية العقد', 'date']].map(([k, l, t]) => (
                <div key={k}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#374151', marginBottom: '4px', fontWeight: '500' }}>{l}</label>
                  <input type={t} value={(tf as any)[k]} onChange={e => setTf(f => ({ ...f, [k]: e.target.value }))}
                    style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#374151', marginBottom: '4px', fontWeight: '500' }}>دورة الدفع</label>
                <select value={tf.paymentCycle} onChange={e => setTf(f => ({ ...f, paymentCycle: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', background: '#fff' }}>
                  <option value="monthly">شهري</option>
                  <option value="quarterly">ربع سنوي</option>
                  <option value="semi">نصف سنوي</option>
                  <option value="annual">سنوي</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={saveTenant} disabled={saving}
                style={{ flex: 1, padding: '13px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '15px', fontWeight: '600', opacity: saving ? 0.7 : 1 }}>
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

      {/* Payment Modal */}
      {showPay && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowPay(null)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '17px', color: '#1B4F72', fontWeight: '600' }}>دفعة — شقة {showPay.unitNumber}</h2>
              <button onClick={() => setShowPay(null)} style={{ border: 'none', background: '#f3f4f6', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={lbl}>المبلغ المطلوب (ر.س)</label>
                  <input type="number" value={pf.amountDue || showPay.rentAmount} onChange={e => setPf(f => ({ ...f, amountDue: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>المبلغ المدفوع (ر.س)</label>
                  <input type="number" value={pf.amountPaid} onChange={e => setPf(f => ({ ...f, amountPaid: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>تاريخ الدفع</label>
                  <input type="date" value={pf.paidDate} onChange={e => setPf(f => ({ ...f, paidDate: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>طريقة الدفع</label>
                  <select value={pf.paymentMethod} onChange={e => setPf(f => ({ ...f, paymentMethod: e.target.value }))} style={inp}>
                    <option value="transfer">تحويل بنكي</option>
                    <option value="cash">كاش</option>
                    <option value="ejar">منصة إيجار</option>
                    <option value="stc_pay">STC Pay</option>
                  </select>
                </div>
              </div>

              {/* ← الجديد: مستلم المبلغ */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '8px', fontWeight: '600' }}>
                  💰 مستلم المبلغ
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { val: 'manager', label: 'مسؤول العقار', icon: '👤', color: '#1e40af', bg: '#dbeafe' },
                    { val: 'owner',   label: 'المالك',        icon: '👑', color: '#7c3aed', bg: '#ede9fe' },
                  ].map(opt => (
                    <button key={opt.val} onClick={() => setPf(f => ({ ...f, receivedBy: opt.val }))}
                      style={{ padding: '12px', border: `2px solid ${pf.receivedBy === opt.val ? opt.color : '#e5e7eb'}`, borderRadius: '12px', background: pf.receivedBy === opt.val ? opt.bg : '#fff', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}>
                      <div style={{ fontSize: '20px', marginBottom: '4px' }}>{opt.icon}</div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: pf.receivedBy === opt.val ? opt.color : '#374151' }}>{opt.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={lbl}>رقم المرجع</label>
                <input value={pf.referenceNumber} onChange={e => setPf(f => ({ ...f, referenceNumber: e.target.value }))} style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={savePayment} disabled={saving}
                style={{ flex: 1, padding: '13px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '15px', fontWeight: '600', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'جارٍ الحفظ...' : 'تسجيل الدفعة'}
              </button>
              <button onClick={() => setShowPay(null)}
                style={{ padding: '13px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '15px' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal طلب حذف الدفعة */}
      {deleteTarget && !canDelete && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 8px', color: '#1B4F72', fontSize: '16px' }}>🔒 طلب حذف دفعة</h3>
            <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '12px', marginBottom: '14px', fontSize: '13px' }}>
              <div><strong>المستأجر:</strong> {deleteTarget.tenantName} — شقة {deleteTarget.unitNumber}</div>
              <div><strong>المبلغ:</strong> {deleteTarget.amountPaid?.toLocaleString('ar-SA')} ر.س</div>
              <div><strong>التاريخ:</strong> {fmtDate(deleteTarget.paidDate)}</div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '6px', fontWeight: '500' }}>سبب طلب الحذف</label>
              <textarea value={deleteReason} onChange={e => setDeleteReason(e.target.value)} rows={3}
                placeholder="اذكر سبب الحذف..."
                style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px', fontSize: '13px', resize: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={sendDeleteRequest} disabled={saving}
                style={{ flex: 1, padding: '11px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                {saving ? 'جارٍ الإرسال...' : 'إرسال الطلب للمالك'}
              </button>
              <button onClick={() => { setDeleteTarget(null); setDeleteReason(''); }}
                style={{ padding: '11px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: '12px', color: '#374151', marginBottom: '4px', fontWeight: '500' };
const inp: React.CSSProperties = { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', boxSizing: 'border-box', background: '#fff' };
const btnPrimary: React.CSSProperties = { padding: '10px 20px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontFamily: 'sans-serif' };
