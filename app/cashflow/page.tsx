'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import {
  collection, getDocs, addDoc, query, where,
  serverTimestamp, Timestamp
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../../lib/userHelpers';

interface Transfer {
  id: string; type: string; amount: number; date: any;
  fromUser: string; toUser: string; paymentMethod: string; notes: string;
}
interface MonthReport {
  // إيرادات
  rentReceivedByManager: number;   // إيجار شهري استلمه المسؤول
  rentReceivedByOwner: number;     // إيجار شهري استلمه المالك
  furnishedRevenue: number;        // إيرادات مفروشة
  totalRevenue: number;
  // مصاريف
  expensesByManager: number;       // مصاريف دفعها المسؤول
  expensesByOwner: number;         // مصاريف دفعها المالك
  totalExpenses: number;
  netProfit: number;
}

function fmtDate(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function CashflowPage() {
  const router = useRouter();
  const [appUser, setAppUser] = useState<AppUserBasic | null>(null);
  const [properties, setProperties] = useState<PropertyBasic[]>([]);
  const [propId, setPropId] = useState('');
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [report, setReport] = useState<MonthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr());
  const [form, setForm] = useState({
    type: 'owner_transfer', amount: '',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'transfer', notes: '',
  });

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
        await loadData(props[0].id, selectedMonth);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadData = async (pid: string, month: string) => {
    const [y, m] = month.split('-').map(Number);
    const startOfMonth = new Date(y, m - 1, 1);
    const endOfMonth = new Date(y, m, 0, 23, 59, 59);

    const [tSnap, paySnap, bookSnap, expSnap] = await Promise.all([
      getDocs(query(collection(db, 'transfers'), where('propertyId', '==', pid))),
      getDocs(query(collection(db, 'rentPayments'), where('propertyId', '==', pid))),
      getDocs(query(collection(db, 'bookings'), where('propertyId', '==', pid))),
      getDocs(query(collection(db, 'expenses'), where('propertyId', '==', pid))),
    ]);

    // التحويلات في الشهر المحدد
    const monthTransfers = tSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as Transfer))
      .filter(t => {
        const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
        return d >= startOfMonth && d <= endOfMonth;
      })
      .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
    setTransfers(monthTransfers);

    // الدفعات في الشهر
    const monthPayments = paySnap.docs
      .map(d => d.data() as any)
      .filter(p => {
        const d = p.paidDate?.toDate ? p.paidDate.toDate() : null;
        return d && d >= startOfMonth && d <= endOfMonth;
      });

    // إيرادات مستلمة بواسطة المسؤول
    const rentReceivedByManager = monthPayments
      .filter(p => p.receivedBy === 'manager' || !p.receivedBy) // القديم بدون receivedBy يُحسب كمسؤول
      .reduce((s: number, p: any) => s + (p.amountPaid || 0), 0);

    // إيرادات مستلمة بواسطة المالك مباشرة
    const rentReceivedByOwner = monthPayments
      .filter(p => p.receivedBy === 'owner')
      .reduce((s: number, p: any) => s + (p.amountPaid || 0), 0);

    // إيرادات مفروشة
    const furnishedRevenue = bookSnap.docs
      .map(d => d.data() as any)
      .filter(b => {
        if (b.status === 'cancelled') return false;
        const d = b.checkinDate?.toDate ? b.checkinDate.toDate() : null;
        return d && d >= startOfMonth && d <= endOfMonth;
      })
      .reduce((s: number, b: any) => s + (b.netRevenue || 0), 0);

    // مصاريف في الشهر
    const monthExpenses = expSnap.docs
      .map(d => d.data() as any)
      .filter(e => {
        const d = e.date?.toDate ? e.date.toDate() : null;
        return d && d >= startOfMonth && d <= endOfMonth;
      });

    const expensesByManager = monthExpenses
      .filter(e => e.paidBy === 'manager' || !e.paidBy)
      .reduce((s: number, e: any) => s + (e.amount || 0), 0);

    const expensesByOwner = monthExpenses
      .filter(e => e.paidBy === 'owner')
      .reduce((s: number, e: any) => s + (e.amount || 0), 0);

    const totalRevenue = rentReceivedByManager + rentReceivedByOwner + furnishedRevenue;
    const totalExpenses = expensesByManager + expensesByOwner;

    setReport({
      rentReceivedByManager,
      rentReceivedByOwner,
      furnishedRevenue,
      totalRevenue,
      expensesByManager,
      expensesByOwner,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
    });
  };

  const saveTransfer = async () => {
    if (!form.amount || !propId) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'transfers'), {
        propertyId: propId,
        type: form.type,
        amount: Number(form.amount),
        date: Timestamp.fromDate(new Date(form.date)),
        fromUser: form.type === 'owner_transfer' ? 'مسؤول العقار' : 'المالك',
        toUser: form.type === 'owner_transfer' ? 'المالك' : 'مسؤول العقار',
        paymentMethod: form.paymentMethod,
        notes: form.notes,
        createdAt: serverTimestamp(),
      });
      await loadData(propId, selectedMonth);
      setShowModal(false);
      setForm({ type: 'owner_transfer', amount: '', date: new Date().toISOString().split('T')[0], paymentMethod: 'transfer', notes: '' });
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const totalTransferredToOwner = transfers
    .filter(t => t.type === 'owner_transfer')
    .reduce((s, t) => s + t.amount, 0);

  // ما يستحقه المالك = ما استلمه المسؤول + إيرادات مفروشة - مصاريف المسؤول
  const dueToOwner = (report?.rentReceivedByManager || 0) +
                     (report?.furnishedRevenue || 0) -
                     (report?.expensesByManager || 0);
  const remaining = dueToOwner - totalTransferredToOwner;

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' });
    return { val, label };
  });

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
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: '600', color: '#fff' }}>التدفق النقدي</h1>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>التسويات والتحويلات</p>
        </div>
        <button onClick={() => setShowModal(true)}
          style={{ background: '#D4AC0D', border: 'none', borderRadius: '10px', padding: '10px 14px', cursor: 'pointer', color: '#fff', fontSize: '13px', fontWeight: '600' }}>
          + تحويل
        </button>
      </div>

      <div style={{ padding: '16px', maxWidth: '700px', margin: '0 auto' }}>

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: properties.length > 1 ? '1fr 1fr' : '1fr', gap: '10px', marginBottom: '16px' }}>
          {properties.length > 1 && (
            <select value={propId} onChange={e => { setPropId(e.target.value); loadData(e.target.value, selectedMonth); }}
              style={selStyle}>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <select value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); loadData(propId, e.target.value); }}
            style={selStyle}>
            {monthOptions.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
          </select>
        </div>

        {/* ═══ بطاقة التدفق النقدي التفصيلية ═══ */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#1B4F72', marginBottom: '16px' }}>
            📊 قائمة التدفق النقدي — {monthOptions.find(m => m.val === selectedMonth)?.label}
          </div>

          {/* ─── الإيرادات ─── */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#065f46', background: '#d1fae5', padding: '6px 10px', borderRadius: '8px', marginBottom: '8px' }}>
              📥 الإيرادات
            </div>

            {/* إيجار استلمه المسؤول */}
            <Row
              label="إيجار شهري — استلمه مسؤول العقار"
              value={report?.rentReceivedByManager || 0}
              positive tag="مسؤول"
              tagColor="#1e40af" tagBg="#dbeafe"
            />
            {/* إيجار استلمه المالك مباشرة */}
            <Row
              label="إيجار شهري — استلمه المالك مباشرة"
              value={report?.rentReceivedByOwner || 0}
              positive tag="مالك"
              tagColor="#7c3aed" tagBg="#ede9fe"
            />
            {/* إيرادات مفروشة */}
            <Row
              label="إيرادات الشقق المفروشة"
              value={report?.furnishedRevenue || 0}
              positive tag="مفروش"
              tagColor="#065f46" tagBg="#d1fae5"
            />
            {/* إجمالي */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f0fdf4', borderRadius: '10px', marginTop: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#374151' }}>إجمالي الإيرادات</span>
              <span style={{ fontSize: '16px', fontWeight: '700', color: '#16a34a' }}>+ {(report?.totalRevenue || 0).toLocaleString('ar-SA')} ر.س</span>
            </div>
          </div>

          {/* ─── المصاريف ─── */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#991b1b', background: '#fee2e2', padding: '6px 10px', borderRadius: '8px', marginBottom: '8px' }}>
              📤 المصاريف
            </div>

            <Row
              label="مصاريف دفعها مسؤول العقار"
              value={report?.expensesByManager || 0}
              positive={false} tag="مسؤول"
              tagColor="#1e40af" tagBg="#dbeafe"
            />
            <Row
              label="مصاريف دفعها المالك مباشرة"
              value={report?.expensesByOwner || 0}
              positive={false} tag="مالك"
              tagColor="#7c3aed" tagBg="#ede9fe"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#fef2f2', borderRadius: '10px', marginTop: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#374151' }}>إجمالي المصاريف</span>
              <span style={{ fontSize: '16px', fontWeight: '700', color: '#dc2626' }}>− {(report?.totalExpenses || 0).toLocaleString('ar-SA')} ر.س</span>
            </div>
          </div>

          {/* ─── الصافي ─── */}
          <div style={{ padding: '14px', background: (report?.netProfit || 0) >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#374151' }}>💰 صافي الشهر</span>
            <span style={{ fontSize: '22px', fontWeight: '700', color: (report?.netProfit || 0) >= 0 ? '#16a34a' : '#dc2626' }}>
              {(report?.netProfit || 0).toLocaleString('ar-SA')} ر.س
            </span>
          </div>

          {/* ─── تسوية المسؤول ─── */}
          <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '10px' }}>🔄 تسوية مع مسؤول العقار</div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
              <span style={{ color: '#6b7280' }}>إيجار استلمه المسؤول</span>
              <span style={{ color: '#16a34a', fontWeight: '600' }}>+ {(report?.rentReceivedByManager || 0).toLocaleString('ar-SA')} ر.س</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
              <span style={{ color: '#6b7280' }}>إيرادات مفروشة</span>
              <span style={{ color: '#16a34a', fontWeight: '600' }}>+ {(report?.furnishedRevenue || 0).toLocaleString('ar-SA')} ر.س</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
              <span style={{ color: '#6b7280' }}>مصاريف دفعها المسؤول</span>
              <span style={{ color: '#dc2626', fontWeight: '600' }}>− {(report?.expensesByManager || 0).toLocaleString('ar-SA')} ر.س</span>
            </div>

            <div style={{ height: '1px', background: '#e5e7eb', marginBottom: '10px' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
              <span style={{ color: '#374151', fontWeight: '600' }}>المستحق للمالك من المسؤول</span>
              <span style={{ color: '#1e40af', fontWeight: '700' }}>{dueToOwner.toLocaleString('ar-SA')} ر.س</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
              <span style={{ color: '#6b7280' }}>محوّل للمالك هذا الشهر</span>
              <span style={{ color: '#374151', fontWeight: '600' }}>− {totalTransferredToOwner.toLocaleString('ar-SA')} ر.س</span>
            </div>

            {remaining !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: remaining > 0 ? '#fef3c7' : '#fee2e2', borderRadius: '10px' }}>
                <span style={{ fontSize: '13px', color: remaining > 0 ? '#92400e' : '#991b1b', fontWeight: '600' }}>
                  {remaining > 0 ? '⏳ متبقي للتحويل' : '⚠️ تم تحويل أكثر من المستحق'}
                </span>
                <span style={{ fontSize: '15px', fontWeight: '700', color: remaining > 0 ? '#d97706' : '#dc2626' }}>
                  {Math.abs(remaining).toLocaleString('ar-SA')} ر.س
                </span>
              </div>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '16px' }}>
          {[
            ['إيرادات المسؤول', ((report?.rentReceivedByManager || 0) + (report?.furnishedRevenue || 0)).toLocaleString('ar-SA') + ' ر.س', '#1e40af', '#dbeafe'],
            ['إيرادات المالك', (report?.rentReceivedByOwner || 0).toLocaleString('ar-SA') + ' ر.س', '#7c3aed', '#ede9fe'],
            ['محوّل للمالك', totalTransferredToOwner.toLocaleString('ar-SA') + ' ر.س', '#16a34a', '#d1fae5'],
          ].map(([l, v, c, bg]) => (
            <div key={String(l)} style={{ background: String(bg), borderRadius: '14px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>{l}</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: String(c) }}>{v}</div>
            </div>
          ))}
        </div>

        {/* سجل التحويلات */}
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '10px' }}>سجل التحويلات</div>
        {transfers.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '16px', padding: '32px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>💸</div>
            <p style={{ color: '#9ca3af', fontSize: '14px', margin: '0 0 16px' }}>لا توجد تحويلات هذا الشهر</p>
            <button onClick={() => setShowModal(true)} style={{ padding: '10px 20px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px' }}>
              + تسجيل تحويل
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {transfers.map(t => (
              <div key={t.id} style={{ background: '#fff', borderRadius: '14px', padding: '14px 16px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: t.type === 'owner_transfer' ? '#d1fae5' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
                  {t.type === 'owner_transfer' ? '↑' : '↓'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                    {t.type === 'owner_transfer' ? 'تحويل للمالك' : 'مصروف مسؤول'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                    {fmtDate(t.date)} · {t.paymentMethod === 'transfer' ? 'تحويل بنكي' : 'كاش'}
                    {t.notes ? ` · ${t.notes}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: t.type === 'owner_transfer' ? '#16a34a' : '#dc2626' }}>
                  {t.amount?.toLocaleString('ar-SA')} ر.س
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal تحويل */}
      {showModal && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '500px' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '17px', color: '#1B4F72', fontWeight: '600' }}>تسجيل تحويل مالي</h2>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: '#f3f4f6', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={lbl}>نوع المعاملة</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[['owner_transfer', 'تحويل للمالك', '↑', '#d1fae5', '#065f46'], ['manager_expense', 'مصروف مسؤول', '↓', '#fee2e2', '#991b1b']].map(([v, l, icon, bg, color]) => (
                    <button key={v} onClick={() => setForm(f => ({ ...f, type: v }))}
                      style={{ padding: '12px', border: `2px solid ${form.type === v ? color : '#e5e7eb'}`, borderRadius: '12px', background: form.type === v ? bg : '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '20px', color }}>{icon}</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color }}>{l}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={lbl}>المبلغ (ر.س)</label>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>التاريخ</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>طريقة التحويل</label>
                <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))} style={inp}>
                  <option value="transfer">تحويل بنكي</option>
                  <option value="cash">كاش</option>
                </select>
              </div>
              <div>
                <label style={lbl}>ملاحظات</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button onClick={saveTransfer} disabled={saving}
                style={{ flex: 1, padding: '13px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '15px', fontWeight: '600', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'جارٍ الحفظ...' : 'حفظ التحويل'}
              </button>
              <button onClick={() => setShowModal(false)}
                style={{ padding: '13px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '15px' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// مكوّن صف في جدول التدفق
function Row({ label, value, positive, tag, tagColor, tagBg }: {
  label: string; value: number; positive: boolean;
  tag: string; tagColor: string; tagBg: string;
}) {
  if (value === 0) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ background: tagBg, color: tagColor, fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '8px' }}>{tag}</span>
        <span style={{ fontSize: '12px', color: '#6b7280' }}>{label}</span>
      </div>
      <span style={{ fontSize: '13px', fontWeight: '600', color: positive ? '#16a34a' : '#dc2626' }}>
        {positive ? '+' : '−'} {value.toLocaleString('ar-SA')} ر.س
      </span>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: '13px', color: '#374151', marginBottom: '6px', fontWeight: '500' };
const inp: React.CSSProperties = { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', boxSizing: 'border-box', background: '#fff' };
const selStyle: React.CSSProperties = { border: '1.5px solid #e5e7eb', borderRadius: '12px', padding: '12px 16px', fontSize: '14px', background: '#fff', width: '100%' };
