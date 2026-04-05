'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface Unit {
  id: string; unitNumber: string;
  type: 'monthly' | 'furnished' | 'owner';
  status: 'occupied' | 'vacant' | 'maintenance';
  floor: number; rooms: number; basePrice: number; propertyId: string;
}
interface Property { id: string; name: string; }

const TYPE_LABEL: Record<string, string> = { monthly: 'شهري', furnished: 'مفروش', owner: 'خاصة' };
const STATUS_LABEL: Record<string, string> = { occupied: 'مشغول', vacant: 'شاغر', maintenance: 'صيانة' };
const TYPE_COLOR: Record<string, string> = { monthly: '#dbeafe', furnished: '#d1fae5', owner: '#fef3c7' };
const STATUS_DOT: Record<string, string> = { occupied: '#16a34a', vacant: '#dc2626', maintenance: '#d97706' };

async function loadPropertiesForUser(uid: string, role: string) {
  if (role === 'owner') {
    const snap = await getDocs(query(collection(db, 'properties'), where('ownerId', '==', uid)));
    return snap.docs.map((d: any) => ({ id: d.id, name: d.data().name }));
  }
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) return [];
  const ids: string[] = (userSnap.data() as any).propertyIds || [];
  if (ids.length === 0) return [];
  const results: any[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const snap = await getDocs(query(collection(db, 'properties'), where('__name__', 'in', chunk)));
    snap.docs.forEach((d: any) => results.push({ id: d.id, name: d.data().name }));
  }
  return results;
}

export default function UnitsPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [activePropertyId, setActivePropertyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [showPropModal, setShowPropModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [deleteRequest, setDeleteRequest] = useState<Unit | null>(null);

  const [form, setForm] = useState({ unitNumber: '', type: 'monthly', status: 'vacant', floor: '', rooms: '', basePrice: '', notes: '' });
  const [propForm, setPropForm] = useState({ name: '', address: '', city: 'جدة', totalUnits: '' });

  // صلاحيات مشتقة من الدور
  const canAddUnit = userRole === 'owner' || userRole === 'manager';
  const canDeleteUnit = userRole === 'owner';
  const canAddProperty = userRole === 'owner';

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return; }
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      const role = userSnap.exists() ? (userSnap.data() as any).role : '';
      setUserRole(role);

      // المحاسب وصيانة لا يدخلوا صفحة الوحدات بالكامل
      if (role === 'accountant' || role === 'maintenance') {
        router.push('/');
        return;
      }

      const props = await loadPropertiesForUser(user.uid, role);
      setProperties(props);
      if (props.length > 0) {
        setActivePropertyId(props[0].id);
        await loadUnits(props[0].id);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadUnits = async (propertyId: string) => {
    const snap = await getDocs(query(collection(db, 'units'), where('propertyId', '==', propertyId)));
    setUnits(snap.docs.map(d => ({ id: d.id, ...d.data() } as Unit)));
  };

  const openAdd = () => {
    if (!canAddUnit) return;
    setEditUnit(null);
    setForm({ unitNumber: '', type: 'monthly', status: 'vacant', floor: '', rooms: '', basePrice: '', notes: '' });
    setShowModal(true);
  };

  const openEdit = (u: Unit) => {
    setEditUnit(u);
    setForm({ unitNumber: u.unitNumber, type: u.type, status: u.status, floor: String(u.floor || ''), rooms: String(u.rooms || ''), basePrice: String(u.basePrice || ''), notes: '' });
    setShowModal(true);
  };

  const saveUnit = async () => {
    if (!form.unitNumber || !activePropertyId || !canAddUnit) return;
    setSaving(true);
    try {
      const data = {
        unitNumber: form.unitNumber, type: form.type, status: form.status,
        floor: Number(form.floor) || 0, rooms: Number(form.rooms) || 0,
        basePrice: Number(form.basePrice) || 0, propertyId: activePropertyId,
      };
      if (editUnit) {
        await updateDoc(doc(db, 'units', editUnit.id), data);
      } else {
        await addDoc(collection(db, 'units'), { ...data, createdAt: serverTimestamp() });
      }
      await loadUnits(activePropertyId);
      setShowModal(false);
    } catch (e: any) {
      alert('حدث خطأ: ' + e.message);
    }
    setSaving(false);
  };

  const requestDelete = (u: Unit) => {
    if (!canDeleteUnit) {
      // المدير يشوف رسالة تطلب موافقة المالك
      setDeleteRequest(u);
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف الوحدة ${u.unitNumber}؟`)) return;
    deleteUnitConfirmed(u.id);
  };

  const deleteUnitConfirmed = async (id: string) => {
    await deleteDoc(doc(db, 'units', id));
    await loadUnits(activePropertyId);
    setDeleteRequest(null);
  };

  const saveProperty = async () => {
    if (!propForm.name || !canAddProperty) return;
    setSaving(true);
    try {
      const user = auth.currentUser;
      const ref = await addDoc(collection(db, 'properties'), {
        ...propForm, totalUnits: Number(propForm.totalUnits) || 0,
        ownerId: user?.uid, managerId: user?.uid, createdAt: serverTimestamp(),
      });
      setProperties(p => [...p, { id: ref.id, name: propForm.name }]);
      setActivePropertyId(ref.id);
      setShowPropModal(false);
      setPropForm({ name: '', address: '', city: 'جدة', totalUnits: '' });
    } catch (e: any) { alert('حدث خطأ: ' + e.message); }
    setSaving(false);
  };

  const stats = {
    total: units.length,
    occupied: units.filter(u => u.status === 'occupied').length,
    vacant: units.filter(u => u.status === 'vacant').length,
    monthly: units.filter(u => u.type === 'monthly').length,
    furnished: units.filter(u => u.type === 'furnished').length,
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f9fafb' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #1B4F72', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color: '#6b7280', fontFamily: 'sans-serif', fontSize: '14px' }}>جارٍ التحميل...</p>
      </div>
    </div>
  );

  return (
    <div dir="rtl" style={{ padding: '0', fontFamily: 'sans-serif', background: '#f9fafb', minHeight: '100vh' }}>

      {/* Top bar */}
      <div style={{ background: '#1B4F72', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => router.push('/')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}>
          <span style={{ color: '#fff', fontSize: '18px' }}>←</span>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: '600', color: '#fff' }}>الوحدات والعقارات</h1>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
            {stats.total} وحدة · {stats.occupied} مشغولة · {stats.vacant} شاغرة
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {canAddProperty && (
            <button onClick={() => setShowPropModal(true)}
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', color: '#fff', fontSize: '13px' }}>
              + عقار
            </button>
          )}
          {canAddUnit && (
            <button onClick={openAdd} disabled={!activePropertyId}
              style={{ background: '#D4AC0D', border: 'none', borderRadius: '10px', padding: '10px 14px', cursor: 'pointer', color: '#fff', fontSize: '13px', fontWeight: '600', opacity: activePropertyId ? 1 : 0.5 }}>
              + وحدة
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '16px', maxWidth: '900px', margin: '0 auto' }}>

        {/* Role badge */}
        {userRole === 'manager' && (
          <div style={{ background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#1e40af', display: 'flex', gap: '8px', alignItems: 'center' }}>
            ℹ️ أنت مدير عقار — يمكنك إضافة وتعديل الوحدات. الحذف يتطلب موافقة المالك.
          </div>
        )}

        {/* Property tabs */}
        {properties.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {properties.map(p => (
              <button key={p.id} onClick={() => { setActivePropertyId(p.id); loadUnits(p.id); }}
                style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid', cursor: 'pointer', fontSize: '13px', background: activePropertyId === p.id ? '#1B4F72' : '#fff', color: activePropertyId === p.id ? '#fff' : '#374151', borderColor: activePropertyId === p.id ? '#1B4F72' : '#d1d5db', fontWeight: activePropertyId === p.id ? '600' : '400' }}>
                🏢 {p.name}
              </button>
            ))}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '20px' }}>
          {[['الإجمالي', stats.total, '#374151', '#f9fafb'], ['مشغولة', stats.occupied, '#16a34a', '#d1fae5'], ['شاغرة', stats.vacant, '#dc2626', '#fee2e2'], ['شهري', stats.monthly, '#2563eb', '#dbeafe'], ['مفروش', stats.furnished, '#7c3aed', '#ede9fe']].map(([l, v, c, bg]) => (
            <div key={String(l)} style={{ background: String(bg), borderRadius: '12px', padding: '14px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: String(c) }}>{v}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Units grid */}
        {properties.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af', background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏢</div>
            <p>لا يوجد عقار — أضف عقاراً أولاً</p>
            {canAddProperty && <button onClick={() => setShowPropModal(true)} style={btnPrimary}>+ إضافة عقار</button>}
          </div>
        ) : units.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af', background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚪</div>
            <p>لا توجد وحدات — {canAddUnit ? 'أضف وحدة جديدة' : 'لا توجد وحدات في هذا العقار'}</p>
            {canAddUnit && <button onClick={openAdd} style={btnPrimary}>+ إضافة وحدة</button>}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px', marginBottom: '20px' }}>
            {units.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })).map(u => (
              <div key={u.id} onClick={() => canAddUnit ? openEdit(u) : undefined}
                style={{ background: TYPE_COLOR[u.type] || '#f3f4f6', borderRadius: '12px', padding: '14px 10px', textAlign: 'center', cursor: canAddUnit ? 'pointer' : 'default', border: '1px solid rgba(0,0,0,0.06)', transition: 'transform 0.15s' }}
                onMouseOver={e => canAddUnit && (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseOut={e => (e.currentTarget.style.transform = 'translateY(0)')}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_DOT[u.status] }} />
                </div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#1B4F72' }}>{u.unitNumber}</div>
                <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>{TYPE_LABEL[u.type]}</div>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>{STATUS_LABEL[u.status]}</div>
              </div>
            ))}
          </div>
        )}

        {/* Units table */}
        {units.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['رقم الوحدة', 'النوع', 'الحالة', 'الطابق', 'الغرف', 'الإيجار', canAddUnit ? 'إجراءات' : ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280', fontWeight: '500', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {units.map((u, i) => (
                  <tr key={u.id} style={{ borderBottom: i < units.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                    <td style={{ padding: '10px 14px', fontWeight: '600', color: '#1B4F72' }}>{u.unitNumber}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: TYPE_COLOR[u.type], padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>{TYPE_LABEL[u.type]}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: STATUS_DOT[u.status], display: 'inline-block' }} />
                        {STATUS_LABEL[u.status]}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{u.floor || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{u.rooms || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>{u.basePrice ? u.basePrice.toLocaleString('ar-SA') + ' ر.س' : '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {canAddUnit && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => openEdit(u)}
                            style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '12px' }}>
                            تعديل
                          </button>
                          <button onClick={() => requestDelete(u)}
                            style={{ padding: '4px 10px', border: `1px solid ${canDeleteUnit ? '#fca5a5' : '#d1d5db'}`, borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '12px', color: canDeleteUnit ? '#dc2626' : '#9ca3af' }}>
                            {canDeleteUnit ? 'حذف' : '🔒 حذف'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete request popup (for manager) */}
      {deleteRequest && !canDeleteUnit && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
            <h3 style={{ margin: '0 0 8px', color: '#1B4F72' }}>طلب حذف وحدة {deleteRequest.unitNumber}</h3>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>
              الحذف يتطلب موافقة المالك. يرجى التواصل مع المالك لتنفيذ هذا الإجراء.
            </p>
            <button onClick={() => setDeleteRequest(null)}
              style={{ padding: '10px 24px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px' }}>
              حسناً
            </button>
          </div>
        </div>
      )}

      {/* Unit Modal */}
      {showModal && canAddUnit && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', color: '#1B4F72' }}>{editUnit ? 'تعديل الوحدة' : 'إضافة وحدة جديدة'}</h2>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[['unitNumber', 'رقم الوحدة', 'text'], ['floor', 'الطابق', 'number'], ['rooms', 'عدد الغرف', 'number'], ['basePrice', 'الإيجار الأساسي (ر.س)', 'number']].map(([k, l, t]) => (
                <div key={k}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{l}</label>
                  <input type={t} value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>النوع</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }}>
                  <option value="monthly">شهري</option>
                  <option value="furnished">مفروش</option>
                  <option value="owner">خاصة (مالك)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>الحالة</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }}>
                  <option value="vacant">شاغر</option>
                  <option value="occupied">مشغول</option>
                  <option value="maintenance">صيانة</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={saveUnit} disabled={saving} style={btnPrimary}>
                {saving ? 'جارٍ الحفظ...' : editUnit ? 'حفظ التعديلات' : 'إضافة الوحدة'}
              </button>
              <button onClick={() => setShowModal(false)} style={btnOutline}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Property Modal */}
      {showPropModal && canAddProperty && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowPropModal(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '95vw' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', color: '#1B4F72' }}>إضافة عقار جديد</h2>
              <button onClick={() => setShowPropModal(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[['name', 'اسم العقار', 'عقار جدة — حي الروضة'], ['address', 'العنوان', 'شارع...'], ['city', 'المدينة', 'جدة'], ['totalUnits', 'عدد الوحدات', '36']].map(([k, l, p]) => (
                <div key={k}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{l}</label>
                  <input value={(propForm as any)[k]} placeholder={p} onChange={e => setPropForm(f => ({ ...f, [k]: e.target.value }))}
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={saveProperty} disabled={saving} style={btnPrimary}>
                {saving ? 'جارٍ الحفظ...' : 'إضافة العقار'}
              </button>
              <button onClick={() => setShowPropModal(false)} style={btnOutline}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = { padding: '8px 18px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontFamily: 'sans-serif' };
const btnOutline: React.CSSProperties = { padding: '8px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontFamily: 'sans-serif' };
