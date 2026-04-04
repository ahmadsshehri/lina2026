'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface Unit {
  id: string;
  unitNumber: string;
  type: 'monthly' | 'furnished' | 'owner';
  status: 'occupied' | 'vacant' | 'maintenance';
  floor: number;
  rooms: number;
  basePrice: number;
  propertyId: string;
}

interface Property {
  id: string;
  name: string;
}

const TYPE_LABEL: Record<string, string> = { monthly: 'شهري', furnished: 'مفروش', owner: 'خاصة' };
const STATUS_LABEL: Record<string, string> = { occupied: 'مشغول', vacant: 'شاغر', maintenance: 'صيانة' };
const TYPE_COLOR: Record<string, string> = { monthly: '#dbeafe', furnished: '#d1fae5', owner: '#fef3c7' };
const STATUS_DOT: Record<string, string> = { occupied: '#16a34a', vacant: '#dc2626', maintenance: '#d97706' };


async function getPropertiesForUserLocal(uid: string) {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) return [];
  const userData = userSnap.data() as any;
  if (userData.role === 'owner') {
    const snap = await getDocs(query(collection(db, 'properties'), where('ownerId', '==', uid)));
    return snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name }));
  }
  const ids: string[] = userData.propertyIds || [];
  if (ids.length === 0) return [];
  const results: any[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const snap = await getDocs(query(collection(db, 'properties'), where('__name__', 'in', chunk)));
    snap.docs.forEach(d => results.push({ id: d.id, name: (d.data() as any).name }));
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

  // form state
  const [form, setForm] = useState({ unitNumber: '', type: 'monthly', status: 'vacant', floor: '', rooms: '', basePrice: '', notes: '' });
  const [propForm, setPropForm] = useState({ name: '', address: '', city: 'جدة', totalUnits: '' });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return; }
      await loadProperties(user.uid);
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadProperties = async (uid: string) => {
    const snap = await getDocs(query(collection(db, 'properties'), where('ownerId', '==', uid)));
    const props = snap.docs.map(d => ({ id: d.id, ...d.data() } as Property));
    setProperties(props);
    if (props.length > 0) {
      setActivePropertyId(props[0].id);
      await loadUnits(props[0].id);
    }
  };

  const loadUnits = async (propertyId: string) => {
    const snap = await getDocs(query(collection(db, 'units'), where('propertyId', '==', propertyId)));
    setUnits(snap.docs.map(d => ({ id: d.id, ...d.data() } as Unit)));
  };

  const openAdd = () => {
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
    if (!form.unitNumber || !activePropertyId) return;
    setSaving(true);
    try {
      const data = { unitNumber: form.unitNumber, type: form.type, status: form.status, floor: Number(form.floor) || 0, rooms: Number(form.rooms) || 0, basePrice: Number(form.basePrice) || 0, propertyId: activePropertyId };
      if (editUnit) {
        await updateDoc(doc(db, 'units', editUnit.id), data);
      } else {
        await addDoc(collection(db, 'units'), { ...data, createdAt: serverTimestamp() });
      }
      await loadUnits(activePropertyId);
      setShowModal(false);
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const deleteUnit = async (id: string) => {
    if (!confirm('هل أنت متأكد؟')) return;
    await deleteDoc(doc(db, 'units', id));
    await loadUnits(activePropertyId);
  };

  const saveProperty = async () => {
    if (!propForm.name) return;
    setSaving(true);
    try {
      const user = auth.currentUser;
      const ref = await addDoc(collection(db, 'properties'), { ...propForm, totalUnits: Number(propForm.totalUnits) || 0, ownerId: user?.uid, managerId: user?.uid, createdAt: serverTimestamp() });
      setProperties(p => [...p, { id: ref.id, name: propForm.name }]);
      setActivePropertyId(ref.id);
      setShowPropModal(false);
      setPropForm({ name: '', address: '', city: 'جدة', totalUnits: '' });
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const stats = { total: units.length, occupied: units.filter(u => u.status === 'occupied').length, vacant: units.filter(u => u.status === 'vacant').length, monthly: units.filter(u => u.type === 'monthly').length, furnished: units.filter(u => u.type === 'furnished').length };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><p>جارٍ التحميل...</p></div>;

  return (
    <div dir="rtl" style={{ padding: '20px', fontFamily: 'sans-serif', background: '#f9fafb', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a href="/" style={{ color: '#1B4F72', textDecoration: 'none', fontSize: '13px' }}>← الرئيسية</a>
          <h1 style={{ margin: 0, fontSize: '18px', color: '#1B4F72' }}>الوحدات والعقارات</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowPropModal(true)} style={btnOutline}>+ عقار جديد</button>
          <button onClick={openAdd} disabled={!activePropertyId} style={btnPrimary}>+ وحدة جديدة</button>
        </div>
      </div>

      {/* Property tabs */}
      {properties.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {properties.map(p => (
            <button key={p.id} onClick={() => { setActivePropertyId(p.id); loadUnits(p.id); }}
              style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '13px', background: activePropertyId === p.id ? '#1B4F72' : '#fff', color: activePropertyId === p.id ? '#fff' : '#374151', borderColor: activePropertyId === p.id ? '#1B4F72' : '#d1d5db' }}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {[['الإجمالي', stats.total, '#374151'], ['مشغولة', stats.occupied, '#16a34a'], ['شاغرة', stats.vacant, '#dc2626'], ['شهري', stats.monthly, '#2563eb'], ['مفروش', stats.furnished, '#7c3aed']].map(([l, v, c]) => (
          <div key={String(l)} style={{ background: '#fff', borderRadius: '10px', padding: '14px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '22px', fontWeight: '600', color: String(c) }}>{v}</div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Units grid */}
      {properties.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏢</div>
          <p>لا يوجد عقار — أضف عقاراً أولاً</p>
          <button onClick={() => setShowPropModal(true)} style={{ ...btnPrimary, marginTop: '12px' }}>+ إضافة عقار</button>
        </div>
      ) : units.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚪</div>
          <p>لا توجد وحدات — أضف وحدة جديدة</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px', marginBottom: '20px' }}>
          {units.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })).map(u => (
            <div key={u.id} onClick={() => openEdit(u)} style={{ background: TYPE_COLOR[u.type] || '#f3f4f6', borderRadius: '10px', padding: '14px 10px', textAlign: 'center', cursor: 'pointer', border: '1px solid rgba(0,0,0,0.06)', transition: 'transform 0.15s' }}
              onMouseOver={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseOut={e => (e.currentTarget.style.transform = 'translateY(0)')}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_DOT[u.status] }}/>
              </div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#1B4F72' }}>{u.unitNumber}</div>
              <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>{TYPE_LABEL[u.type]}</div>
              <div style={{ fontSize: '10px', color: '#6b7280' }}>{STATUS_LABEL[u.status]}</div>
            </div>
          ))}
        </div>
      )}

      {/* Units list table */}
      {units.length > 0 && (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['رقم الوحدة', 'النوع', 'الحالة', 'الطابق', 'الغرف', 'الإيجار', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280', fontWeight: '500', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {units.map((u, i) => (
                <tr key={u.id} style={{ borderBottom: i < units.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <td style={{ padding: '10px 14px', fontWeight: '600', color: '#1B4F72' }}>{u.unitNumber}</td>
                  <td style={{ padding: '10px 14px' }}><span style={{ background: TYPE_COLOR[u.type], padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>{TYPE_LABEL[u.type]}</span></td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: STATUS_DOT[u.status], display: 'inline-block' }}/>
                      {STATUS_LABEL[u.status]}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>{u.floor || '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>{u.rooms || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>{u.basePrice ? u.basePrice.toLocaleString('ar-SA') + ' ر.س' : '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => openEdit(u)} style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '12px' }}>تعديل</button>
                      <button onClick={() => deleteUnit(u.id)} style={{ padding: '4px 10px', border: '1px solid #fca5a5', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '12px', color: '#dc2626' }}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', color: '#1B4F72' }}>{editUnit ? 'تعديل الوحدة' : 'إضافة وحدة جديدة'}</h2>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[['unitNumber', 'رقم الوحدة', 'text', '05'], ['floor', 'الطابق', 'number', '1'], ['rooms', 'عدد الغرف', 'number', '3'], ['basePrice', 'الإيجار الأساسي (ر.س)', 'number', '2000']].map(([k, l, t, p]) => (
                <div key={k}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{l}</label>
                  <input type={t} value={(form as any)[k]} placeholder={p} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box' }}/>
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>النوع</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }}>
                  <option value="monthly">شهري</option>
                  <option value="furnished">مفروش</option>
                  <option value="owner">خاصة (مالك)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>الحالة</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }}>
                  <option value="vacant">شاغر</option>
                  <option value="occupied">مشغول</option>
                  <option value="maintenance">صيانة</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={saveUnit} disabled={saving} style={btnPrimary}>{saving ? 'جارٍ الحفظ...' : editUnit ? 'حفظ التعديلات' : 'إضافة الوحدة'}</button>
              <button onClick={() => setShowModal(false)} style={btnOutline}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Property Modal */}
      {showPropModal && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowPropModal(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', color: '#1B4F72' }}>إضافة عقار جديد</h2>
              <button onClick={() => setShowPropModal(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[['name', 'اسم العقار', 'عقار جدة — حي الروضة'], ['address', 'العنوان', 'شارع...'], ['city', 'المدينة', 'جدة'], ['totalUnits', 'عدد الوحدات', '36']].map(([k, l, p]) => (
                <div key={k}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{l}</label>
                  <input value={(propForm as any)[k]} placeholder={p} onChange={e => setPropForm(f => ({ ...f, [k]: e.target.value }))}
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box' }}/>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={saveProperty} disabled={saving} style={btnPrimary}>{saving ? 'جارٍ الحفظ...' : 'إضافة العقار'}</button>
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
