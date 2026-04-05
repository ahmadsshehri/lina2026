'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, createUserWithEmailAndPassword, initializeAuth } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { initializeApp, getApps } from 'firebase/app';
import { collection, getDocs, setDoc, updateDoc, doc, query, where, serverTimestamp, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface AppUser {
  uid: string; name: string; email: string; phone: string;
  role: string; isActive: boolean; propertyIds: string[];
}
interface Property { id: string; name: string; }

const ROLES: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  owner:       { label: 'مالك',   color: '#5b21b6', bg: '#ede9fe', desc: 'صلاحيات كاملة' },
  manager:     { label: 'مدير',   color: '#1e40af', bg: '#dbeafe', desc: 'إضافة وتعديل — بدون حذف' },
  accountant:  { label: 'محاسب',  color: '#065f46', bg: '#d1fae5', desc: 'البيانات المالية — بدون حذف' },
  maintenance: { label: 'صيانة',  color: '#92400e', bg: '#fef3c7', desc: 'طلبات الصيانة فقط' },
};

async function loadPropertiesForUser(uid: string) {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) return [];
  const userData = userSnap.data() as any;
  if (userData.role === 'owner') {
    const snap = await getDocs(query(collection(db, 'properties'), where('ownerId', '==', uid)));
    return snap.docs.map((d: any) => ({ id: d.id, name: d.data().name }));
  }
  return [];
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'manager', propertyIds: [] as string[] });
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return; }

      const myDoc = await getDoc(doc(db, 'users', user.uid));
      if (myDoc.exists()) {
        const me = { uid: myDoc.id, ...myDoc.data() } as AppUser;
        setCurrentUser(me);

        // فقط المالك يقدر يدخل هذه الصفحة
        if (me.role !== 'owner') {
          router.push('/');
          return;
        }
      }

      const [usersSnap, props] = await Promise.all([
        getDocs(collection(db, 'users')),
        loadPropertiesForUser(user.uid),
      ]);
      setUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as AppUser)));
      setProperties(props);
      setLoading(false);
    });
    return unsub;
  }, []);

  const createUser = async () => {
    setError('');
    setSuccessMsg('');
    if (!form.name || !form.email || !form.password) { setError('يرجى ملء جميع الحقول المطلوبة'); return; }
    if (form.password.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if (form.role !== 'owner' && form.propertyIds.length === 0) { setError('يرجى تحديد عقار واحد على الأقل'); return; }
    setSaving(true);

    try {
      // ✅ الحل: نستخدم Firebase App ثانوي لإنشاء المستخدم
      // هذا يمنع تغيير session المالك الحالي
      const secondaryApp = getApps().find(a => a.name === 'secondary') ||
        initializeApp({
          apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        }, 'secondary');

      const secondaryAuth = initializeAuth(secondaryApp, {});

      // ننشئ المستخدم في Firebase Auth عبر الـ App الثانوي
      const { user: newFbUser } = await createUserWithEmailAndPassword(
        secondaryAuth,
        form.email.trim(),
        form.password
      );

      // نحفظ مستند المستخدم في Firestore
      await setDoc(doc(db, 'users', newFbUser.uid), {
        name: form.name,
        email: form.email.trim(),
        phone: form.phone,
        role: form.role,
        propertyIds: form.role === 'owner' ? [] : form.propertyIds,
        isActive: true,
        createdAt: serverTimestamp(),
      });

      // نغلق الـ session الثانوي فوراً
      await secondaryAuth.signOut();

      // نحدث القائمة المحلية
      const newUser: AppUser = {
        uid: newFbUser.uid,
        name: form.name,
        email: form.email,
        phone: form.phone,
        role: form.role,
        isActive: true,
        propertyIds: form.role === 'owner' ? [] : form.propertyIds,
      };
      setUsers(u => [...u, newUser]);
      setSuccessMsg(`✅ تم إنشاء حساب "${form.name}" بنجاح`);
      setShowModal(false);
      setForm({ name: '', email: '', phone: '', password: '', role: 'manager', propertyIds: [] });
    } catch (e: any) {
      const msgs: Record<string, string> = {
        'auth/email-already-in-use': 'البريد الإلكتروني مستخدم بالفعل',
        'auth/invalid-email': 'البريد الإلكتروني غير صحيح',
        'auth/weak-password': 'كلمة المرور ضعيفة',
      };
      setError(msgs[e.code] || 'حدث خطأ: ' + e.message);
    }
    setSaving(false);
  };

  const toggleActive = async (u: AppUser) => {
    if (!confirm(`هل تريد ${u.isActive ? 'تعطيل' : 'تفعيل'} حساب "${u.name}"؟`)) return;
    await updateDoc(doc(db, 'users', u.uid), { isActive: !u.isActive });
    setUsers(users.map(x => x.uid === u.uid ? { ...x, isActive: !u.isActive } : x));
  };

  const updateUserProperties = async (u: AppUser, newPropIds: string[]) => {
    await updateDoc(doc(db, 'users', u.uid), { propertyIds: newPropIds });
    setUsers(users.map(x => x.uid === u.uid ? { ...x, propertyIds: newPropIds } : x));
  };

  const toggleProperty = (pid: string) => {
    setForm(f => ({
      ...f,
      propertyIds: f.propertyIds.includes(pid)
        ? f.propertyIds.filter(x => x !== pid)
        : [...f.propertyIds, pid],
    }));
  };

  const getRoleInfo = (role: string) => ROLES[role] || { label: role, color: '#374151', bg: '#f3f4f6', desc: '' };

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
    <div dir="rtl" style={{ fontFamily: 'sans-serif', background: '#f9fafb', minHeight: '100vh' }}>

      {/* Top bar */}
      <div style={{ background: '#1B4F72', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => router.push('/')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}>
          <span style={{ color: '#fff', fontSize: '18px' }}>←</span>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: '600', color: '#fff' }}>المستخدمون والصلاحيات</h1>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>{users.length} مستخدم · {properties.length} عقار</p>
        </div>
        <button onClick={() => { setError(''); setSuccessMsg(''); setShowModal(true); }}
          style={{ background: '#D4AC0D', border: 'none', borderRadius: '10px', padding: '10px 16px', cursor: 'pointer', color: '#fff', fontSize: '13px', fontWeight: '600' }}>
          + إضافة مستخدم
        </button>
      </div>

      <div style={{ padding: '16px', maxWidth: '680px', margin: '0 auto' }}>

        {/* Success message */}
        {successMsg && (
          <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', fontSize: '14px', color: '#065f46', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {successMsg}
            <button onClick={() => setSuccessMsg('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#065f46', fontSize: '18px' }}>✕</button>
          </div>
        )}

        {/* Role reference */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>جدول الصلاحيات</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['الإجراء', 'مالك', 'مدير', 'محاسب', 'صيانة'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'center', color: '#6b7280', fontWeight: '500', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['إنشاء عقار', '✅', '❌', '❌', '❌'],
                  ['إضافة وحدات', '✅', '✅', '❌', '❌'],
                  ['حذف وحدات', '✅', '❌', '❌', '❌'],
                  ['إضافة مستأجرين', '✅', '✅', '❌', '❌'],
                  ['تسجيل دفعات', '✅', '✅', '✅', '❌'],
                  ['حذف أي بيانات', '✅', '❌', '❌', '❌'],
                  ['عرض التقارير', '✅', '✅', '✅', '❌'],
                  ['إدارة المستخدمين', '✅', '❌', '❌', '❌'],
                ].map(([action, ...checks]) => (
                  <tr key={String(action)} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '7px 10px', color: '#374151', fontWeight: '500' }}>{action}</td>
                    {checks.map((c, i) => (
                      <td key={i} style={{ padding: '7px 10px', textAlign: 'center' }}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Users list */}
        {users.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
            <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 16px' }}>لا يوجد مستخدمون بعد</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {users.map(u => {
              const role = getRoleInfo(u.role);
              const userProps = properties.filter(p => u.propertyIds?.includes(p.id));
              return (
                <div key={u.uid} style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden', opacity: u.isActive ? 1 : 0.6 }}>
                  {/* Header */}
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: role.bg, border: `2px solid ${role.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: role.color, fontSize: '16px', fontWeight: '700' }}>{u.name?.charAt(0) || '?'}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>{u.name}</span>
                        {!u.isActive && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '1px 8px', borderRadius: '10px', fontSize: '10px' }}>معطّل</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                      {u.phone && <div style={{ fontSize: '11px', color: '#9ca3af' }}>📞 {u.phone}</div>}
                    </div>
                    <span style={{ background: role.bg, color: role.color, padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', flexShrink: 0 }}>
                      {role.label}
                    </span>
                  </div>

                  {/* Properties assigned */}
                  {u.role !== 'owner' && (
                    <div style={{ padding: '10px 16px', borderTop: '1px solid #f3f4f6', background: '#fafafa' }}>
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>العقارات المصرح بها:</div>
                      {userProps.length === 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', color: '#dc2626', background: '#fee2e2', padding: '3px 10px', borderRadius: '8px' }}>⚠️ لا يوجد عقار محدد — لن يرى بيانات</span>
                          {/* Quick assign buttons */}
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {properties.map(p => (
                              <button key={p.id} onClick={() => updateUserProperties(u, [...(u.propertyIds || []), p.id])}
                                style={{ fontSize: '11px', padding: '3px 8px', background: '#dbeafe', color: '#1e40af', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                                + {p.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {userProps.map(p => (
                            <span key={p.id} style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 10px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              🏢 {p.name}
                              <button onClick={() => updateUserProperties(u, u.propertyIds.filter(id => id !== p.id))}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '12px', padding: '0 2px' }}>×</button>
                            </span>
                          ))}
                          {/* Add more properties */}
                          {properties.filter(p => !u.propertyIds?.includes(p.id)).map(p => (
                            <button key={p.id} onClick={() => updateUserProperties(u, [...(u.propertyIds || []), p.id])}
                              style={{ fontSize: '11px', padding: '3px 8px', background: '#f3f4f6', color: '#6b7280', border: '1px dashed #d1d5db', borderRadius: '6px', cursor: 'pointer' }}>
                              + {p.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {u.role !== 'owner' && (
                    <div style={{ padding: '10px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end' }}>
                      <button onClick={() => toggleActive(u)}
                        style={{ padding: '7px 16px', border: `1px solid ${u.isActive ? '#fca5a5' : '#6ee7b7'}`, borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '12px', color: u.isActive ? '#dc2626' : '#16a34a', fontWeight: '500' }}>
                        {u.isActive ? '🔴 تعطيل الحساب' : '🟢 تفعيل الحساب'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '500px', maxHeight: '92vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '17px', color: '#1B4F72', fontWeight: '600' }}>إضافة مستخدم جديد</h2>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: '#f3f4f6', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            {error && (
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px' }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {[
                ['الاسم الكامل', 'name', 'text', '', 'rtl'],
                ['البريد الإلكتروني', 'email', 'email', 'example@email.com', 'ltr'],
                ['رقم الجوال', 'phone', 'tel', '05xxxxxxxx', 'ltr'],
                ['كلمة المرور', 'password', 'password', '6 أحرف على الأقل', 'ltr'],
              ].map(([l, k, t, p, dir]) => (
                <div key={k}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '6px', fontWeight: '500' }}>{l}</label>
                  <input
                    type={String(t)}
                    value={(form as any)[k]}
                    placeholder={String(p)}
                    dir={String(dir) as any}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>
              ))}

              {/* Role selector */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '8px', fontWeight: '500' }}>الدور</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {Object.entries(ROLES).filter(([k]) => k !== 'owner').map(([k, v]) => (
                    <button key={k} onClick={() => setForm(f => ({ ...f, role: k }))}
                      style={{ padding: '12px', border: `2px solid ${form.role === k ? v.color : '#e5e7eb'}`, borderRadius: '12px', background: form.role === k ? v.bg : '#fff', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: v.color }}>{v.label}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>{v.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Property assignment */}
              {properties.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '8px', fontWeight: '500' }}>
                    العقارات المصرح بها
                    <span style={{ color: '#dc2626' }}> *</span>
                    <span style={{ color: '#9ca3af', fontWeight: '400' }}> (مطلوب)</span>
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {properties.map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', border: `1.5px solid ${form.propertyIds.includes(p.id) ? '#1B4F72' : '#e5e7eb'}`, borderRadius: '10px', cursor: 'pointer', background: form.propertyIds.includes(p.id) ? '#f0f9ff' : '#fff', transition: 'all 0.15s' }}>
                        <input type="checkbox" checked={form.propertyIds.includes(p.id)} onChange={() => toggleProperty(p.id)}
                          style={{ width: '18px', height: '18px', accentColor: '#1B4F72', flexShrink: 0 }} />
                        <span style={{ fontSize: '14px', color: '#374151' }}>🏢 {p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button onClick={createUser} disabled={saving}
                style={{ flex: 1, padding: '13px', background: saving ? '#9ca3af' : '#1B4F72', color: '#fff', border: 'none', borderRadius: '12px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: '600' }}>
                {saving ? '⏳ جارٍ الإنشاء...' : '✅ إنشاء الحساب'}
              </button>
              <button onClick={() => setShowModal(false)}
                style={{ padding: '13px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '15px' }}>
                إلغاء
              </button>
            </div>

            {/* Note */}
            <p style={{ textAlign: 'center', fontSize: '12px', color: '#9ca3af', marginTop: '12px', margin: '12px 0 0' }}>
              💡 سيتم إنشاء الحساب دون تسجيل خروجك
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
