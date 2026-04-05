'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { createUserWithEmailAndPassword, initializeAuth } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { auth, db } from '../../lib/firebase';
import {
  collection, getDocs, setDoc, updateDoc,
  doc, query, where, serverTimestamp, getDoc
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../../lib/userHelpers';

const ROLES = {
  manager:     { label: 'مدير عقار', color: '#1e40af', bg: '#dbeafe', desc: 'إضافة وتعديل — بدون حذف' },
  accountant:  { label: 'محاسب',     color: '#065f46', bg: '#d1fae5', desc: 'البيانات المالية — بدون حذف' },
  maintenance: { label: 'صيانة',     color: '#92400e', bg: '#fef3c7', desc: 'طلبات الصيانة فقط' },
};

interface UserDoc {
  uid: string; name: string; email: string; phone: string;
  role: string; isActive: boolean; propertyIds: string[];
}

export default function UsersPage() {
  const router = useRouter();
  const [appUser, setAppUser] = useState<AppUserBasic | null>(null);
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [properties, setProperties] = useState<PropertyBasic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '',
    role: 'manager', propertyIds: [] as string[],
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }

      const user = await getCurrentUser(fbUser.uid);

      // هذه الصفحة للمالك فقط
      if (!user || user.role !== 'owner') {
        router.push('/');
        return;
      }
      setAppUser(user);

      const [usersSnap, props] = await Promise.all([
        getDocs(collection(db, 'users')),
        loadPropertiesForUser(fbUser.uid, 'owner'),
      ]);

      setUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserDoc)));
      setProperties(props);
      setLoading(false);
    });
    return unsub;
  }, []);

  const createUser = async () => {
    setError('');
    if (!form.name || !form.email || !form.password) {
      setError('يرجى ملء جميع الحقول'); return;
    }
    if (form.password.length < 6) {
      setError('كلمة المرور 6 أحرف على الأقل'); return;
    }
    if (form.propertyIds.length === 0) {
      setError('يرجى تحديد عقار واحد على الأقل'); return;
    }
    setSaving(true);

    try {
      // Firebase App ثانوي لإنشاء المستخدم دون تغيير session المالك
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
      const { user: newUser } = await createUserWithEmailAndPassword(
        secondaryAuth, form.email.trim(), form.password
      );

      // حفظ بيانات المستخدم في Firestore بنفس الـ UID
      await setDoc(doc(db, 'users', newUser.uid), {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        role: form.role,
        propertyIds: form.propertyIds,  // ← المصفوفة بـ IDs العقارات
        isActive: true,
        createdAt: serverTimestamp(),
      });

      // نغلق الـ session الثانوي
      await secondaryAuth.signOut();

      // تحديث القائمة المحلية
      const newDoc: UserDoc = {
        uid: newUser.uid,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role: form.role,
        propertyIds: form.propertyIds,
        isActive: true,
      };
      setUsers(prev => [...prev, newDoc]);
      setSuccess(`✅ تم إنشاء حساب "${form.name}" بنجاح`);
      setShowModal(false);
      setForm({ name: '', email: '', phone: '', password: '', role: 'manager', propertyIds: [] });

    } catch (e: any) {
      const msgs: Record<string, string> = {
        'auth/email-already-in-use': 'البريد مستخدم بالفعل',
        'auth/invalid-email': 'البريد غير صحيح',
        'auth/weak-password': 'كلمة المرور ضعيفة',
      };
      setError(msgs[e.code] || ('خطأ: ' + e.message));
    }
    setSaving(false);
  };

  const toggleActive = async (u: UserDoc) => {
    if (!confirm(`${u.isActive ? 'تعطيل' : 'تفعيل'} حساب "${u.name}"؟`)) return;
    await updateDoc(doc(db, 'users', u.uid), { isActive: !u.isActive });
    setUsers(prev => prev.map(x => x.uid === u.uid ? { ...x, isActive: !u.isActive } : x));
  };

  const updateProps = async (u: UserDoc, newIds: string[]) => {
    await updateDoc(doc(db, 'users', u.uid), { propertyIds: newIds });
    setUsers(prev => prev.map(x => x.uid === u.uid ? { ...x, propertyIds: newIds } : x));
  };

  const toggleProp = (pid: string) =>
    setForm(f => ({
      ...f,
      propertyIds: f.propertyIds.includes(pid)
        ? f.propertyIds.filter(x => x !== pid)
        : [...f.propertyIds, pid],
    }));

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div style={{ width: '40px', height: '40px', border: '3px solid #1B4F72', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // فصل المستخدمين: المالك / البقية
  const nonOwners = users.filter(u => u.role !== 'owner');
  const owners = users.filter(u => u.role === 'owner');

  return (
    <div dir="rtl" style={{ fontFamily: 'sans-serif', background: '#f9fafb', minHeight: '100vh' }}>

      {/* Top bar */}
      <div style={{ background: '#1B4F72', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => router.push('/')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}>
          <span style={{ color: '#fff', fontSize: '18px' }}>←</span>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: '600', color: '#fff' }}>المستخدمون والصلاحيات</h1>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>{nonOwners.length} مستخدم · {properties.length} عقار</p>
        </div>
        <button onClick={() => { setError(''); setSuccess(''); setShowModal(true); }}
          style={{ background: '#D4AC0D', border: 'none', borderRadius: '10px', padding: '10px 16px', cursor: 'pointer', color: '#fff', fontSize: '13px', fontWeight: '600' }}>
          + إضافة مستخدم
        </button>
      </div>

      <div style={{ padding: '16px', maxWidth: '680px', margin: '0 auto' }}>

        {success && (
          <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', fontSize: '14px', color: '#065f46', display: 'flex', justifyContent: 'space-between' }}>
            {success}
            <button onClick={() => setSuccess('')} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px' }}>✕</button>
          </div>
        )}

        {/* جدول الصلاحيات */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>📋 جدول الصلاحيات</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['الإجراء', 'مالك', 'مدير', 'محاسب', 'صيانة'].map(h => (
                    <th key={h} style={{ padding: '8px', textAlign: 'center', color: '#6b7280', fontWeight: '500', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['إنشاء / حذف عقار', '✅', '❌', '❌', '❌'],
                  ['إضافة وحدات',       '✅', '✅', '❌', '❌'],
                  ['حذف وحدات',         '✅', '❌', '❌', '❌'],
                  ['إضافة مستأجرين',    '✅', '✅', '❌', '❌'],
                  ['تسجيل دفعات',       '✅', '✅', '✅', '❌'],
                  ['حذف أي بيانات',     '✅', '❌', '❌', '❌'],
                  ['عرض التقارير',      '✅', '✅', '✅', '❌'],
                  ['إدارة المستخدمين',  '✅', '❌', '❌', '❌'],
                ].map(([action, ...checks]) => (
                  <tr key={String(action)} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '7px 8px', color: '#374151', fontWeight: '500' }}>{action}</td>
                    {checks.map((c, i) => (
                      <td key={i} style={{ padding: '7px 8px', textAlign: 'center' }}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* قائمة المستخدمين — المالكون */}
        {owners.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px', fontWeight: '600' }}>المالكون</div>
            {owners.map(u => (
              <div key={u.uid} style={{ background: '#ede9fe', borderRadius: '12px', padding: '14px 16px', border: '1px solid #c4b5fd', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#5b21b6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: '16px', fontWeight: '700' }}>{u.name?.charAt(0)}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{u.name}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>{u.email}</div>
                </div>
                <span style={{ background: '#5b21b6', color: '#fff', padding: '3px 10px', borderRadius: '20px', fontSize: '11px' }}>مالك</span>
              </div>
            ))}
          </div>
        )}

        {/* قائمة المستخدمين — غير المالكين */}
        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px', fontWeight: '600' }}>المستخدمون المضافون</div>
        {nonOwners.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
            <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>لم تضف أي مستخدمين بعد</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {nonOwners.map(u => {
              const roleInfo = ROLES[u.role as keyof typeof ROLES] || { label: u.role, color: '#374151', bg: '#f3f4f6', desc: '' };
              const userProps = properties.filter(p => (u.propertyIds || []).includes(p.id));
              const missingProps = (u.propertyIds || []).length === 0;

              return (
                <div key={u.uid} style={{ background: '#fff', borderRadius: '16px', border: `1px solid ${missingProps ? '#fca5a5' : '#e5e7eb'}`, overflow: 'hidden', opacity: u.isActive ? 1 : 0.6 }}>

                  {/* Header */}
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: roleInfo.bg, border: `2px solid ${roleInfo.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: roleInfo.color, fontSize: '16px', fontWeight: '700' }}>{u.name?.charAt(0)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>{u.name}</span>
                        {!u.isActive && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: '8px', fontSize: '10px' }}>معطّل</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>{u.email}</div>
                      {u.phone && <div style={{ fontSize: '11px', color: '#9ca3af' }}>📞 {u.phone}</div>}
                    </div>
                    <span style={{ background: roleInfo.bg, color: roleInfo.color, padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', flexShrink: 0 }}>
                      {roleInfo.label}
                    </span>
                  </div>

                  {/* العقارات */}
                  <div style={{ padding: '10px 16px', borderTop: '1px solid #f3f4f6', background: '#fafafa' }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>العقارات المصرح بها:</div>

                    {missingProps ? (
                      <div style={{ background: '#fee2e2', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#dc2626' }}>⚠️ لا يوجد عقار — هذا المستخدم لن يرى أي بيانات</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        {userProps.map(p => (
                          <span key={p.id} style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 10px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            🏢 {p.name}
                            <button onClick={() => updateProps(u, u.propertyIds.filter(id => id !== p.id))}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '14px', padding: '0', lineHeight: '1' }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* إضافة عقار إضافي */}
                    {properties.filter(p => !(u.propertyIds || []).includes(p.id)).length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {properties.filter(p => !(u.propertyIds || []).includes(p.id)).map(p => (
                          <button key={p.id} onClick={() => updateProps(u, [...(u.propertyIds || []), p.id])}
                            style={{ fontSize: '11px', padding: '3px 10px', background: '#fff', color: '#6b7280', border: '1px dashed #d1d5db', borderRadius: '8px', cursor: 'pointer' }}>
                            + {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ padding: '10px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => toggleActive(u)}
                      style={{ padding: '7px 16px', border: `1px solid ${u.isActive ? '#fca5a5' : '#6ee7b7'}`, borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '12px', color: u.isActive ? '#dc2626' : '#16a34a', fontWeight: '500' }}>
                      {u.isActive ? '🔴 تعطيل الحساب' : '🟢 تفعيل الحساب'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal إضافة مستخدم */}
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
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px' }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {[
                ['الاسم الكامل', 'name', 'text', 'rtl'],
                ['البريد الإلكتروني', 'email', 'email', 'ltr'],
                ['رقم الجوال', 'phone', 'tel', 'ltr'],
                ['كلمة المرور', 'password', 'password', 'ltr'],
              ].map(([label, key, type, dir]) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '6px', fontWeight: '500' }}>{label}</label>
                  <input
                    type={type} dir={dir as any}
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>
              ))}

              {/* الدور */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '8px', fontWeight: '500' }}>الدور</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                  {Object.entries(ROLES).map(([k, v]) => (
                    <button key={k} onClick={() => setForm(f => ({ ...f, role: k }))}
                      style={{ padding: '10px 6px', border: `2px solid ${form.role === k ? v.color : '#e5e7eb'}`, borderRadius: '10px', background: form.role === k ? v.bg : '#fff', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: v.color }}>{v.label}</div>
                      <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>{v.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* العقارات — مطلوبة */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '8px', fontWeight: '500' }}>
                  العقارات المصرح بها <span style={{ color: '#dc2626' }}>*</span>
                </label>
                {properties.length === 0 ? (
                  <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '8px', fontSize: '12px', color: '#92400e' }}>
                    لا توجد عقارات — أضف عقاراً أولاً من صفحة الوحدات
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {properties.map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', border: `1.5px solid ${form.propertyIds.includes(p.id) ? '#1B4F72' : '#e5e7eb'}`, borderRadius: '10px', cursor: 'pointer', background: form.propertyIds.includes(p.id) ? '#f0f9ff' : '#fff' }}>
                        <input type="checkbox" checked={form.propertyIds.includes(p.id)} onChange={() => toggleProp(p.id)}
                          style={{ width: '18px', height: '18px', accentColor: '#1B4F72', flexShrink: 0 }} />
                        <span style={{ fontSize: '14px', color: '#374151' }}>🏢 {p.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
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
          </div>
        </div>
      )}
    </div>
  );
}
