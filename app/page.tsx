'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../lib/userHelpers';

const ROLE_LABEL: Record<string, string> = {
  owner:       'مالك',
  manager:     'مدير عقار',
  accountant:  'محاسب',
  maintenance: 'صيانة',
};

const MENU_ALL = [
  { label:'الإيجار الشهري',    sub:'المستأجرون والدفعات',    icon:'📋', href:'/monthly',        roles:['owner','manager','accountant'] },
  { label:'الشقق المفروشة',    sub:'Airbnb · Gathern',        icon:'🏨', href:'/furnished',       roles:['owner','manager','accountant'] },
  { label:'المصاريف',          sub:'كهرباء · رواتب · صيانة', icon:'💳', href:'/expenses',        roles:['owner','manager','accountant'] },
  { label:'تقويم الحجوزات',   sub:'جدول الإشغال',            icon:'📅', href:'/calendar',        roles:['owner','manager','accountant'] },
  { label:'التقارير',          sub:'إحصاءات ومقارنات',        icon:'📊', href:'/reports',         roles:['owner','manager','accountant'] },
  { label:'التدفق المالي',     sub:'تسويات · تحويلات',        icon:'💰', href:'/cashflow',        roles:['owner','manager','accountant'] },
  { label:'الوحدات والعقارات', sub:'إدارة الشقق',             icon:'🏢', href:'/units',           roles:['owner','manager'] },
  { label:'الإيرادات الأخرى', sub:'إيرادات خارج الإيجار',   icon:'💵', href:'/other-revenue',   roles:['owner','manager','accountant'] },
];

export default function HomePage() {
  const router = useRouter();
  const [loading,    setLoading]    = useState(true);
  const [appUser,    setAppUser]    = useState<AppUserBasic | null>(null);
  const [properties, setProperties] = useState<PropertyBasic[]>([]);
  const [activeProp, setActiveProp] = useState<PropertyBasic | null>(null);
const [showPropPicker, setShowPropPicker] = useState(false);
  const [stats,      setStats]      = useState({ units:0, tenants:0, bookings:0 });
  const [error,      setError]      = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }
      try {
        const user = await getCurrentUser(fbUser.uid);
        if (!user) { setError('لم يتم العثور على بيانات المستخدم.'); setLoading(false); return; }
        setAppUser(user);
        const props = await loadPropertiesForUser(fbUser.uid, user.role);
        setProperties(props);
        if (props.length > 0) {
          setActiveProp(props[0]);
          await loadStats(props[0].id);
        }
      } catch (err: any) {
        setError('حدث خطأ: ' + err.message);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadStats = async (pid: string) => {
    const [uSnap, tSnap, bSnap] = await Promise.all([
      getDocs(query(collection(db,'units'),    where('propertyId','==',pid))),
      getDocs(query(collection(db,'tenants'),  where('propertyId','==',pid), where('status','==','active'))),
      getDocs(query(collection(db,'bookings'), where('propertyId','==',pid))),
    ]);
    setStats({
      units:    uSnap.size,
      tenants:  tSnap.size,
      bookings: bSnap.docs.filter(d => {
        const s = (d.data() as any).status;
        return s === 'confirmed' || s === 'checkedin';
      }).length,
    });
  };

  const switchProperty = async (prop: PropertyBasic) => {
    setActiveProp(prop);
    setShowPropPicker(false);
    await loadStats(prop.id);
  };

  const menu = MENU_ALL.filter(m => m.roles.includes(appUser?.role || ''));

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
      <div style={{ background:'linear-gradient(135deg, #1B4F72 0%, #2E86C1 100%)', padding:'20px 20px 32px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
          <div>
            <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.6)', marginBottom:'4px' }}>مرحباً،</div>
            <div style={{ fontSize:'20px', fontWeight:'700', color:'#fff', marginBottom:'6px' }}>{appUser?.name}</div>
            <span style={{ background:'rgba(255,255,255,0.15)', padding:'3px 12px', borderRadius:'20px', fontSize:'12px', color:'rgba(255,255,255,0.9)' }}>
              {ROLE_LABEL[appUser?.role || ''] || appUser?.role}
            </span>
          </div>
          <button onClick={() => auth.signOut().then(() => router.push('/login'))}
            style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:'10px', padding:'8px 14px', color:'#fff', cursor:'pointer', fontSize:'13px', fontFamily:'sans-serif' }}>
            خروج
          </button>
        </div>

        {/* العقار الحالي */}
        {activeProp && (
          <button
            onClick={() => properties.length > 1 && setShowPropPicker(true)}
            style={{ width:'100%', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'12px', padding:'12px 16px', display:'flex', alignItems:'center', gap:'10px', cursor: properties.length > 1 ? 'pointer' : 'default', textAlign:'right' }}>
            <span style={{ fontSize:'20px' }}>🏢</span>
            <div style={{ flex:1 }}>
              <div style={{ color:'#fff', fontSize:'15px', fontWeight:'600' }}>{activeProp.name}</div>
              <div style={{ color:'rgba(255,255,255,0.6)', fontSize:'12px' }}>
                {activeProp.city && `${activeProp.city} · `}{activeProp.totalUnits} وحدة
              </div>
            </div>
            {properties.length > 1 && (
              <span style={{ color:'rgba(255,255,255,0.6)', fontSize:'13px' }}>تغيير ↓</span>
            )}
          </button>
        )}

        {/* لا توجد عقارات */}
        {properties.length === 0 && (
          <div style={{ background:'rgba(255,200,0,0.15)', borderRadius:'12px', padding:'12px 16px', border:'1px solid rgba(255,200,0,0.3)' }}>
            <p style={{ color:'#fef9c3', fontSize:'13px', margin:0 }}>⚠️ لا توجد عقارات مرتبطة بحسابك</p>
          </div>
        )}
      </div>

      {/* Stats */}
      {activeProp && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', padding:'0 16px', marginTop:'-20px', marginBottom:'20px', position:'relative', zIndex:10 }}>
          {[
            { label:'الوحدات',      value:stats.units,    icon:'🏠' },
            { label:'المستأجرون',   value:stats.tenants,  icon:'👤' },
            { label:'حجوزات نشطة', value:stats.bookings, icon:'📅' },
          ].map(s => (
            <div key={s.label} style={{ background:'#fff', borderRadius:'14px', padding:'14px 12px', textAlign:'center', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize:'22px', marginBottom:'4px' }}>{s.icon}</div>
              <div style={{ fontSize:'22px', fontWeight:'700', color:'#1B4F72', lineHeight:'1' }}>{s.value}</div>
              <div style={{ fontSize:'11px', color:'#6b7280', marginTop:'4px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* القائمة */}
      <div style={{ padding:'0 16px 32px' }}>
        <div style={{ fontSize:'13px', color:'#9ca3af', marginBottom:'12px', fontWeight:'500' }}>القائمة الرئيسية</div>

        {menu.length === 0 ? (
          <div style={{ background:'#fff', borderRadius:'16px', padding:'32px', textAlign:'center', border:'1px solid #e5e7eb', color:'#9ca3af' }}>
            لا توجد صفحات متاحة لدورك
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            {menu.map(item => (
              <a key={item.href} href={item.href}
                style={{ background:'#fff', borderRadius:'16px', padding:'18px 16px', textDecoration:'none', display:'block', border:'1px solid #f3f4f6', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:'28px', marginBottom:'10px' }}>{item.icon}</div>
                <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'3px' }}>{item.label}</div>
                <div style={{ fontSize:'11px', color:'#9ca3af' }}>{item.sub}</div>
              </a>
            ))}
          </div>
        )}

        {/* إعدادات المالك */}
        {appUser?.role === 'owner' && (
          <div style={{ marginTop:'24px' }}>
            <div style={{ fontSize:'13px', color:'#9ca3af', marginBottom:'12px', fontWeight:'500' }}>إعدادات المالك</div>
            <a href="/dashboard-settings"
              style={{ display:'flex', alignItems:'center', gap:'14px', background:'#fff', borderRadius:'16px', padding:'16px', textDecoration:'none', border:'1px solid #e5e7eb', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', marginBottom:'10px' }}>
              <div style={{ width:'48px', height:'48px', background:'linear-gradient(135deg, #1B4F72, #2E86C1)', borderRadius:'14px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px', flexShrink:0 }}>⚙️</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827' }}>إعدادات لوحة التحكم</div>
                <div style={{ fontSize:'11px', color:'#9ca3af', marginTop:'3px' }}>تخصيص القائمة والصفحات والأيقونات</div>
              </div>
              <div style={{ color:'#9ca3af', fontSize:'20px' }}>←</div>
            </a>
            <a href="/users"
              style={{ display:'flex', alignItems:'center', gap:'14px', background:'#fff', borderRadius:'16px', padding:'16px', textDecoration:'none', border:'1px solid #e5e7eb', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ width:'48px', height:'48px', background:'linear-gradient(135deg, #5b21b6, #7c3aed)', borderRadius:'14px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px', flexShrink:0 }}>👥</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'14px', fontWeight:'700', color:'#111827' }}>إدارة المستخدمين</div>
                <div style={{ fontSize:'11px', color:'#9ca3af', marginTop:'3px' }}>الصلاحيات · ربط المدراء · كود الدعوة</div>
              </div>
              <div style={{ color:'#9ca3af', fontSize:'20px' }}>←</div>
            </a>
          </div>
        )}
      </div>

      {/* Popup اختيار العقار */}
      {showPropPicker && (
        <div style={{ position:'fixed', inset:'0', background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:100 }}
          onClick={() => setShowPropPicker(false)}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'24px', width:'100%', maxWidth:'500px' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
              <h3 style={{ margin:0, fontSize:'16px', color:'#1B4F72', fontWeight:'700' }}>اختر العقار</h3>
              <button onClick={() => setShowPropPicker(false)} style={{ border:'none', background:'#f3f4f6', borderRadius:'50%', width:'32px', height:'32px', cursor:'pointer', fontSize:'16px' }}>✕</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {properties.map(prop => (
                <button key={prop.id} onClick={() => switchProperty(prop)}
                  style={{ background: activeProp?.id===prop.id ? '#eff6ff' : '#fff', border:`2px solid ${activeProp?.id===prop.id ? '#1B4F72' : '#e5e7eb'}`, borderRadius:'14px', padding:'16px', display:'flex', alignItems:'center', gap:'14px', cursor:'pointer', textAlign:'right', width:'100%' }}>
                  <div style={{ width:'44px', height:'44px', borderRadius:'12px', background:'linear-gradient(135deg, #1B4F72, #2E86C1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', flexShrink:0 }}>🏢</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'15px', fontWeight:'700', color:'#111827' }}>{prop.name}</div>
                    <div style={{ fontSize:'12px', color:'#6b7280' }}>
                      {prop.city && `📍 ${prop.city} · `}🏠 {prop.totalUnits} وحدة
                    </div>
                  </div>
                  {activeProp?.id===prop.id && <span style={{ color:'#1B4F72', fontSize:'18px' }}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
