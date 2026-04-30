'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../lib/userHelpers';

const ROLE_LABEL: Record<string, string> = {
  owner:       'مالك',
  manager:     'مدير عقار',
  accountant:  'محاسب',
  maintenance: 'صيانة',
};

export default function PropertiesPage() {
  const router = useRouter();
  const [loading,    setLoading]    = useState(true);
  const [appUser,    setAppUser]    = useState<AppUserBasic | null>(null);
  const [properties, setProperties] = useState<PropertyBasic[]>([]);
  const [error,      setError]      = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }
      try {
        const user = await getCurrentUser(fbUser.uid);
        if (!user) {
          setError('لم يتم العثور على بيانات المستخدم. تواصل مع المالك.');
          setLoading(false);
          return;
        }
        setAppUser(user);
        const props = await loadPropertiesForUser(fbUser.uid, user.role);
        setProperties(props);

        // إذا عقار واحد فقط — ادخل مباشرة
        if (props.length === 1) {
          router.push(`/dashboard?propertyId=${props[0].id}`);
          return;
        }
      } catch (err: any) {
        setError('حدث خطأ: ' + err.message);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', background:'#f9fafb' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:'44px', height:'44px', border:'4px solid #1B4F72', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }}/>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{ color:'#6b7280', fontFamily:'sans-serif', fontSize:'15px', margin:0 }}>جارٍ التحميل...</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', background:'#f9fafb', padding:'20px' }}>
      <div style={{ background:'#fff', borderRadius:'16px', padding:'32px', maxWidth:'400px', textAlign:'center', border:'1px solid #fca5a5' }}>
        <div style={{ fontSize:'48px', marginBottom:'16px' }}>⚠️</div>
        <p style={{ color:'#dc2626', fontSize:'14px', marginBottom:'20px', fontFamily:'sans-serif' }}>{error}</p>
        <button onClick={() => auth.signOut().then(() => router.push('/login'))}
          style={{ padding:'10px 24px', background:'#1B4F72', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'14px', fontFamily:'sans-serif' }}>
          تسجيل الخروج
        </button>
      </div>
    </div>
  );

  return (
    <div dir="rtl" style={{ fontFamily:'sans-serif', background:'#f9fafb', minHeight:'100vh' }}>

      {/* Header */}
      <div style={{ background:'linear-gradient(135deg, #1B4F72 0%, #2E86C1 100%)', padding:'32px 20px 40px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.6)', marginBottom:'4px' }}>مرحباً،</div>
            <div style={{ fontSize:'22px', fontWeight:'700', color:'#fff', marginBottom:'6px' }}>{appUser?.name}</div>
            <span style={{ background:'rgba(255,255,255,0.15)', padding:'3px 12px', borderRadius:'20px', fontSize:'12px', color:'rgba(255,255,255,0.9)' }}>
              {ROLE_LABEL[appUser?.role || ''] || appUser?.role}
            </span>
          </div>
          <button onClick={() => auth.signOut().then(() => router.push('/login'))}
            style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:'10px', padding:'8px 14px', color:'#fff', cursor:'pointer', fontSize:'13px', fontFamily:'sans-serif' }}>
            خروج
          </button>
        </div>

        <div style={{ marginTop:'20px', color:'rgba(255,255,255,0.8)', fontSize:'14px' }}>
          اختر العقار للدخول إليه
        </div>
      </div>

      {/* قائمة العقارات */}
      <div style={{ padding:'16px', marginTop:'-20px' }}>

        {properties.length === 0 ? (
          <div style={{ background:'#fff', borderRadius:'16px', padding:'40px', textAlign:'center', border:'1px solid #e5e7eb' }}>
            <div style={{ fontSize:'48px', marginBottom:'16px' }}>🏢</div>
            <p style={{ color:'#6b7280', fontSize:'14px', fontFamily:'sans-serif' }}>
              لا توجد عقارات مرتبطة بحسابك
            </p>
            {appUser?.role === 'owner' && (
              <button onClick={() => router.push('/units')}
                style={{ marginTop:'16px', padding:'10px 24px', background:'#1B4F72', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'14px', fontFamily:'sans-serif' }}>
                + إضافة عقار
              </button>
            )}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            {properties.map((prop, i) => (
              <button key={prop.id}
                onClick={() => router.push(`/dashboard?propertyId=${prop.id}`)}
                style={{ background:'#fff', borderRadius:'16px', padding:'20px', border:'1px solid #e5e7eb', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', cursor:'pointer', textAlign:'right', display:'flex', alignItems:'center', gap:'16px', width:'100%' }}>

                {/* أيقونة رقم */}
                <div style={{ width:'52px', height:'52px', borderRadius:'14px', background:'linear-gradient(135deg, #1B4F72, #2E86C1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:'22px', color:'#fff', fontWeight:'700' }}>🏢</span>
                </div>

                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:'#111827', marginBottom:'4px' }}>
                    {prop.name}
                  </div>
                  <div style={{ fontSize:'12px', color:'#6b7280', display:'flex', gap:'8px', flexWrap:'wrap' }}>
                    {prop.city && <span>📍 {prop.city}</span>}
                    {prop.totalUnits ? <span>🏠 {prop.totalUnits} وحدة</span> : null}
                  </div>
                </div>

                <div style={{ color:'#9ca3af', fontSize:'20px' }}>←</div>
              </button>
            ))}
          </div>
        )}

        {/* زر إضافة عقار للمالك */}
        {appUser?.role === 'owner' && properties.length > 0 && (
          <button onClick={() => router.push('/units')}
            style={{ marginTop:'16px', width:'100%', padding:'14px', background:'transparent', border:'2px dashed #d1d5db', borderRadius:'16px', color:'#6b7280', fontSize:'14px', cursor:'pointer', fontFamily:'sans-serif', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}>
            <span style={{ fontSize:'20px' }}>＋</span> إضافة عقار جديد
          </button>
        )}

      </div>
    </div>
  );
}
