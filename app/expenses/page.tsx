'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import {
  collection, getDocs, addDoc, deleteDoc, doc,
  query, where, serverTimestamp, Timestamp, getDoc, updateDoc
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../../lib/userHelpers';

interface Expense {
  id: string; category: string; subcategory: string;
  amount: number; date: any; paidBy: string;
  paymentMethod: string; notes: string;
  deleteRequested?: boolean; deleteRequestedBy?: string;
}

const CAT: Record<string, string> = {
  electricity: 'كهرباء', water: 'مياه', maintenance: 'صيانة',
  salary: 'راتب', cleaning: 'نظافة', other: 'أخرى',
};
const CAT_COLOR: Record<string, { bg: string; text: string }> = {
  electricity: { bg: '#fef3c7', text: '#92400e' },
  water:       { bg: '#dbeafe', text: '#1e40af' },
  maintenance: { bg: '#ede9fe', text: '#5b21b6' },
  salary:      { bg: '#e0e7ff', text: '#3730a3' },
  cleaning:    { bg: '#d1fae5', text: '#065f46' },
  other:       { bg: '#f3f4f6', text: '#374151' },
};

function fmtDate(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

export default function ExpensesPage() {
  const router = useRouter();
  const [appUser, setAppUser] = useState<AppUserBasic | null>(null);
  const [properties, setProperties] = useState<PropertyBasic[]>([]);
  const [propId, setPropId] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catFilter, setCatFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [form, setForm] = useState({
    category: 'electricity', subcategory: '', amount: '',
    date: '', paidBy: 'manager', paymentMethod: 'transfer', notes: '',
  });

  const canDelete = appUser?.role === 'owner';

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
        await loadExpenses(props[0].id);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadExpenses = async (pid: string) => {
    const snap = await getDocs(query(collection(db, 'expenses'), where('propertyId', '==', pid)));
    setExpenses(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Expense))
        .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
    );
  };

  const saveExpense = async () => {
    if (!form.amount || !form.subcategory || !propId) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'expenses'), {
        ...form,
        propertyId: propId,
        amount: Number(form.amount),
        date: form.date ? Timestamp.fromDate(new Date(form.date)) : Timestamp.now(),
        recordedBy: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
      });
      await loadExpenses(propId);
      setShowModal(false);
      setForm({ category: 'electricity', subcategory: '', amount: '', date: '', paidBy: 'manager', paymentMethod: 'transfer', notes: '' });
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  // المالك يحذف مباشرة
  const handleDeleteOwner = async (id: string) => {
    if (!confirm('هل أنت متأكد من الحذف؟')) return;
    await deleteDoc(doc(db, 'expenses', id));
    await loadExpenses(propId);
  };

  // غير المالك يرسل طلب حذف
  const sendDeleteRequest = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      // نضيف إشعار طلب الحذف في collection منفصلة
      await addDoc(collection(db, 'deleteRequests'), {
        type: 'expense',
        documentId: deleteTarget.id,
        propertyId: propId,
        requestedBy: auth.currentUser?.uid,
        requestedByName: appUser?.name,
        requestedByRole: appUser?.role,
        reason: deleteReason,
        status: 'pending',
        expenseDetails: {
          category: deleteTarget.category,
          subcategory: deleteTarget.subcategory,
          amount: deleteTarget.amount,
          date: deleteTarget.date,
        },
        createdAt: serverTimestamp(),
      });
      // نعلّم المصروف بأن عليه طلب حذف
      await updateDoc(doc(db, 'expenses', deleteTarget.id), {
        deleteRequested: true,
        deleteRequestedBy: appUser?.name,
      });
      await loadExpenses(propId);
      setDeleteTarget(null);
      setDeleteReason('');
      alert('✅ تم إرسال طلب الحذف للمالك');
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const filtered = catFilter === 'all' ? expenses : expenses.filter(e => e.category === catFilter);
  const total = filtered.reduce((s, e) => s + (e.amount || 0), 0);
  const byCategory = expenses.reduce((acc: Record<string, number>, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount; return acc;
  }, {});
  const byPaidBy = {
    manager: expenses.filter(e => e.paidBy === 'manager').reduce((s, e) => s + e.amount, 0),
    owner: expenses.filter(e => e.paidBy === 'owner').reduce((s, e) => s + e.amount, 0),
  };
  const pendingDeletes = expenses.filter(e => e.deleteRequested).length;

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
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: '600', color: '#fff' }}>المصاريف</h1>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
            {expenses.length} مصروف{pendingDeletes > 0 && ` · ${pendingDeletes} طلب حذف معلق`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {properties.length > 1 && (
            <select value={propId} onChange={e => { setPropId(e.target.value); loadExpenses(e.target.value); }}
              style={{ border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
              {properties.map(p => <option key={p.id} value={p.id} style={{ color: '#000' }}>{p.name}</option>)}
            </select>
          )}
          <button onClick={() => setShowModal(true)}
            style={{ background: '#D4AC0D', border: 'none', borderRadius: '10px', padding: '10px 14px', cursor: 'pointer', color: '#fff', fontSize: '13px', fontWeight: '600' }}>
            + مصروف
          </button>
        </div>
      </div>

      <div style={{ padding: '16px', maxWidth: '900px', margin: '0 auto' }}>

        {/* طلبات الحذف المعلقة — للمالك فقط */}
        {canDelete && pendingDeletes > 0 && (
          <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#92400e', marginBottom: '6px' }}>
              ⏳ {pendingDeletes} طلب حذف معلق يحتاج مراجعتك
            </div>
            <div style={{ fontSize: '12px', color: '#78350f' }}>
              المصاريف المعلّمة بـ 🔴 تحتاج موافقتك على الحذف
            </div>
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '16px' }}>
          {[
            ['إجمالي المصاريف', total.toLocaleString('ar-SA') + ' ر.س', '#dc2626', '#fee2e2'],
            ['الكهرباء', (byCategory.electricity || 0).toLocaleString('ar-SA') + ' ر.س', '#d97706', '#fef3c7'],
            ['دفعه المسؤول', byPaidBy.manager.toLocaleString('ar-SA') + ' ر.س', '#1B4F72', '#dbeafe'],
            ['دفعه المالك', byPaidBy.owner.toLocaleString('ar-SA') + ' ر.س', '#7c3aed', '#ede9fe'],
          ].map(([l, v, c, bg]) => (
            <div key={String(l)} style={{ background: String(bg), borderRadius: '12px', padding: '14px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>{l}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: String(c) }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Category bars */}
        {Object.keys(byCategory).length > 0 && (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>توزيع المصاريف</div>
            {Object.entries(byCategory).sort(([, a], [, b]) => b - a).map(([cat, amt]) => {
              const pct = total > 0 ? Math.round(amt / total * 100) : 0;
              const cc = CAT_COLOR[cat] || { bg: '#f3f4f6', text: '#374151' };
              return (
                <div key={cat} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ background: cc.bg, color: cc.text, padding: '2px 8px', borderRadius: '10px' }}>{CAT[cat] || cat}</span>
                    <span style={{ color: '#374151', fontWeight: '500' }}>{amt.toLocaleString('ar-SA')} ر.س ({pct}%)</span>
                  </div>
                  <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#1B4F72', width: `${pct}%`, borderRadius: '3px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Filter */}
        <div style={{ marginBottom: '12px' }}>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', background: '#fff' }}>
            <option value="all">جميع الفئات</option>
            {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['التاريخ', 'الفئة', 'البيان', 'المبلغ', 'دُفع بواسطة', 'الطريقة', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: '500', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>لا توجد مصاريف</td></tr>
              )}
              {filtered.map((e, i) => {
                const cc = CAT_COLOR[e.category] || { bg: '#f3f4f6', text: '#374151' };
                return (
                  <tr key={e.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none', background: e.deleteRequested ? '#fff7ed' : 'white' }}>
                    <td style={{ padding: '10px 12px', color: '#6b7280', fontSize: '12px' }}>{fmtDate(e.date)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: cc.bg, color: cc.text, padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>{CAT[e.category] || e.category}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{e.subcategory}</td>
                    <td style={{ padding: '10px 12px', fontWeight: '600', color: '#dc2626' }}>{e.amount?.toLocaleString('ar-SA')} ر.س</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: e.paidBy === 'owner' ? '#fef3c7' : '#dbeafe', color: e.paidBy === 'owner' ? '#92400e' : '#1e40af', padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>
                        {e.paidBy === 'owner' ? 'المالك' : 'المسؤول'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#6b7280', fontSize: '12px' }}>{e.paymentMethod === 'transfer' ? 'تحويل' : 'كاش'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {e.deleteRequested ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '11px', color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: '6px' }}>
                            🔴 طلب حذف
                          </span>
                          {canDelete && (
                            <button onClick={() => handleDeleteOwner(e.id)}
                              style={{ padding: '3px 8px', border: '1px solid #fca5a5', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', color: '#dc2626' }}>
                              تأكيد الحذف
                            </button>
                          )}
                        </div>
                      ) : canDelete ? (
                        <button onClick={() => handleDeleteOwner(e.id)}
                          style={{ padding: '3px 8px', border: '1px solid #fca5a5', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', color: '#dc2626' }}>
                          حذف
                        </button>
                      ) : (
                        <button onClick={() => setDeleteTarget(e)}
                          style={{ padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', color: '#6b7280' }}>
                          🔒 طلب حذف
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                  <td colSpan={3} style={{ padding: '10px 12px', fontWeight: '600', color: '#374151' }}>الإجمالي</td>
                  <td style={{ padding: '10px 12px', fontWeight: '700', color: '#dc2626' }}>{total.toLocaleString('ar-SA')} ر.س</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal إضافة مصروف */}
      {showModal && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', color: '#1B4F72' }}>تسجيل مصروف جديد</h2>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={lbl}>الفئة</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inp}>
                  {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>التاريخ</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>البيان</label>
                <input value={form.subcategory} placeholder="مثال: فاتورة كهرباء مارس" onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>المبلغ (ر.س)</label>
                <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>دُفع بواسطة</label>
                <select value={form.paidBy} onChange={e => setForm(f => ({ ...f, paidBy: e.target.value }))} style={inp}>
                  <option value="manager">مسؤول العقار</option>
                  <option value="owner">المالك</option>
                </select>
              </div>
              <div>
                <label style={lbl}>طريقة الدفع</label>
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
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={saveExpense} disabled={saving} style={btnPrimary}>{saving ? 'جارٍ الحفظ...' : 'حفظ المصروف'}</button>
              <button onClick={() => setShowModal(false)} style={btnOutline}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal طلب الحذف — لغير المالك */}
      {deleteTarget && !canDelete && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 8px', color: '#1B4F72', fontSize: '16px' }}>🔒 طلب حذف مصروف</h3>
            <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '16px' }}>
              سيتم إرسال طلب للمالك للموافقة على حذف هذا المصروف
            </p>
            <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
              <div><strong>البيان:</strong> {deleteTarget.subcategory}</div>
              <div><strong>المبلغ:</strong> {deleteTarget.amount?.toLocaleString('ar-SA')} ر.س</div>
              <div><strong>التاريخ:</strong> {fmtDate(deleteTarget.date)}</div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '6px', fontWeight: '500' }}>سبب طلب الحذف</label>
              <textarea value={deleteReason} onChange={e => setDeleteReason(e.target.value)}
                placeholder="اذكر سبب طلب الحذف..."
                rows={3}
                style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px', fontSize: '13px', resize: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={sendDeleteRequest} disabled={saving}
                style={{ flex: 1, padding: '11px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                {saving ? 'جارٍ الإرسال...' : 'إرسال طلب الحذف'}
              </button>
              <button onClick={() => { setDeleteTarget(null); setDeleteReason(''); }}
                style={{ padding: '11px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' };
const inp: React.CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box', background: '#fff' };
const btnPrimary: React.CSSProperties = { padding: '9px 20px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontFamily: 'sans-serif' };
const btnOutline: React.CSSProperties = { padding: '9px 20px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontFamily: 'sans-serif' };
