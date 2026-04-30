'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../lib/userHelpers';

const ROLE_LABEL: Record<string, string> = {
  owner:       'مالك العقار',
  manager:     'مدير عقار',
  accountant:  'محاسب',
  maintenance: 'صيانة',
};

const MENU_ALL = [
  {
    label:'الإيجار الشهري', sub:'المستأجرون والدفعات', href:'/monthly',
    roles:['owner','manager','accountant'], grad:'linear-gradient(140deg,#1A5276,#2471A3)', statKey:'tenants',
    bgPath:'<rect x="2" y="5" width="20" height="16" rx="2"/><path d="M16 3v4M8 3v4M2 9h20M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2"/>',
  },
  {
    label:'الشقق المفروشة', sub:'Airbnb · Gathern', href:'/furnished',
    roles:['owner','manager','accountant'], grad:'linear-gradient(140deg,#B7950B,#D4AC0D)', statKey:'bookings',
    bgPath:'<path d="M3 7v10M21 7v10M3 17h18M3 12h18M7 7h10"/><rect x="5" y="3" width="14" height="4" rx="1"/><path d="M7 12v5M17 12v5"/>',
  },
  {
    label:'المصاريف', sub:'كهرباء · رواتب · صيانة', href:'/expenses',
    roles:['owner','manager','accountant'], grad:'linear-gradient(140deg,#C0392B,#E74C3C)', statKey:'none',
    bgPath:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/><path d="M9 3.5A9 9 0 013.5 9"/>',
  },
  {
    label:'تقويم الحجوزات', sub:'جدول الإشغال', href:'/calendar',
    roles:['owner','manager','accountant'], grad:'linear-gradient(140deg,#1E8449,#27AE60)', statKey:'bookings',
    bgPath:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="8" cy="15" r="1.5" fill="white"/><circle cx="12" cy="15" r="1.5" fill="white"/><circle cx="16" cy="15" r="1.5" fill="white"/>',
  },
  {
    label:'التقارير', sub:'إحصاءات ومقارنات', href:'/reports',
    roles:['owner','manager','accountant'], grad:'linear-gradient(140deg,#6C3483,#8E44AD)', statKey:'none',
    bgPath:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 17V13M11 17V9M15 17v-5M19 17V7"/>',
  },
  {
    label:'التدفق المالي', sub:'تسويات · تحويلات', href:'/cashflow',
    roles:['owner','manager','accountant'], grad:'linear-gradient(140deg,#0E6655,#16A085)', statKey:'none',
    bgPath:'<path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
  },
  {
    label:'الوحدات والعقارات', sub:'إدارة الشقق', href:'/units',
    roles:['owner','manager'], grad:'linear-gradient(140deg,#154360,#1F618D)', statKey:'units',
    bgPath:'<path d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M9 21V9h6v12"/>',
  },
  {
    label:'الإيرادات الأخرى', sub:'إيرادات إضافية', href:'/other-revenue',
    roles:['owner','manager','accountant'], grad:'linear-gradient(140deg,#9A7D0A,#F39C12)', statKey:'none',
    bgPath:'<path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  },
];

export default function HomePage() {
  const router = useRouter();
  const [loading,        setLoading]        = useState(true);
  const [appUser,        setAppUser]        = useState<AppUserBasic | null>(null);
  const [properties,     setProperties]     = useState<PropertyBasic[]>([]);
  const [activeProp,     setActiveProp]     = useState<PropertyBasic | null>(null);
  const [showPropPicker, setShowPropPicker] = useState(false);
  const [stats,          setStats]          = useState({ units:0, tenants:0, bookings:0 });
  const [error,          setError]          = useState('');

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
          const savedId  = localStorage.getItem('selectedPropertyId');
          const saved    = props.find(p => p.id === savedId);
          const selected = saved || props[0];
          setActiveProp(selected);
          localStorage.setItem('selectedPropertyId', selected.id);
          await loadStats(selected.id);
        }
      } catch (err: any) { setError('حدث خطأ: ' + err.message); }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadStats = async (pid: string) => {
    const [uSnap, tSnap, bSnap] = await Promise.all([
      getDocs(query(collection(db, 'units'),    where('propertyId', '==', pid))),
      getDocs(query(collection(db, 'tenants'),  where('propertyId', '==', pid), where('status', '==', 'active'))),
      getDocs(query(collection(db, 'bookings'), where('propertyId', '==', pid))),
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
    localStorage.setItem('selectedPropertyId', prop.id);
    await loadStats(prop.id);
  };

  const getStatVal = (key: string) => {
    if (key === 'units')    return stats.units;
    if (key === 'tenants')  return stats.tenants;
    if (key === 'bookings') return stats.bookings;
    return null;
  };

  const menu = MENU_ALL.filter(m => m.roles.includes(appUser?.role || ''));

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', background:'#F5F7FA' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:'44px', height:'44px', border:'4px solid #1B4F72', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color:'#64748b', fontFamily:'sans-serif', fontSize:'15px', margin:0 }}>جارٍ التحميل...</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', background:'#F5F7FA', padding:'20px' }}>
      <div style={{ background:'#fff', borderRadius:'16px', padding:'32px', maxWidth:'400px', textAlign:'center', border:'1px solid #fca5a5' }}>
        <p style={{ color:'#dc2626', fontSize:'14px', marginBottom:'20px', fontFamily:'sans-serif' }}>{error}</p>
        <button onClick={() => auth.signOut().then(() => router.push('/login'))}
          style={{ padding:'10px 24px', background:'#1B4F72', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'14px', fontFamily:'sans-serif' }}>
          تسجيل الخروج
        </button>
      </div>
    </div>
  );

  return (
    <div dir="rtl" style={{ fontFamily:'sans-serif', background:'#F5F7FA', minHeight:'100vh', paddingBottom:'80px' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* HEADER */}
      <div style={{ background:'linear-gradient(145deg,#1B4F72 0%,#2980B9 70%,#5DADE2 100%)', padding:'38px 22px 70px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'-50px', right:'-50px', width:'180px', height:'180px', background:'rgba(255,255,255,0.06)', borderRadius:'50%' }}/>
        <div style={{ position:'absolute', top:'20px', left:'-30px', width:'100px', height:'100px', background:'rgba(212,172,13,0.1)', borderRadius:'50%' }}/>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'18px', position:'relative', zIndex:1 }}>
          <div>
            <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.5)', marginBottom:'2px' }}>صباح الخير،</div>
            <div style={{ fontSize:'23px', fontWeight:'700', color:'#fff', marginBottom:'6px' }}>{appUser?.name}</div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:'5px', background:'rgba(212,172,13,0.2)', border:'1px solid rgba(212,172,13,0.35)', color:'#f5d060', fontSize:'11px', padding:'4px 12px', borderRadius:'20px' }}>
              <div style={{ width:'6px', height:'6px', background:'#f5d060', borderRadius:'50%' }}/>
              {ROLE_LABEL[appUser?.role || ''] || appUser?.role}
            </div>
          </div>
          <button onClick={() => auth.signOut().then(() => router.push('/login'))}
            style={{ background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.2)', color:'rgba(255,255,255,0.75)', fontSize:'11px', padding:'7px 14px', borderRadius:'12px', cursor:'pointer', fontFamily:'sans-serif' }}>
            خروج
          </button>
        </div>
        {activeProp && (
          <div onClick={() => properties.length > 1 && setShowPropPicker(true)}
            style={{ background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.18)', borderRadius:'16px', padding:'11px 14px', display:'flex', alignItems:'center', gap:'10px', position:'relative', zIndex:1, cursor: properties.length > 1 ? 'pointer' : 'default' }}>
            <div style={{ width:'36px', height:'36px', background:'linear-gradient(135deg,#D4AC0D,#f5d060)', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B4F72" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'13px', fontWeight:'700', color:'#fff' }}>{activeProp.name}</div>
              <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.45)', marginTop:'1px' }}>{activeProp.city && `${activeProp.city} · `}{activeProp.totalUnits} وحدة</div>
            </div>
            {properties.length > 1 && <div style={{ fontSize:'10px', color:'#f5d060' }}>تغيير ↓</div>}
          </div>
        )}
        <svg style={{ position:'absolute', bottom:'-2px', left:0, width:'100%' }} viewBox="0 0 100 12" preserveAspectRatio="none">
          <path d="M0,6 C20,12 50,0 100,6 L100,12 L0,12 Z" fill="#F5F7FA"/>
        </svg>
      </div>

      {/* STATS */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', padding:'0 16px', marginTop:'-36px', marginBottom:'24px', position:'relative', zIndex:10 }}>
        {[
          { label:'حجوزات', value:stats.bookings, color:'#D4AC0D', bg:'#FEF9E7', icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4AC0D" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
          { label:'مستأجر',  value:stats.tenants,  color:'#27AE60', bg:'#EAFAF1', icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#27AE60" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
          { label:'الوحدات', value:stats.units,    color:'#1B4F72', bg:'#EBF5FB', icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B4F72" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg> },
        ].map(s => (
          <div key={s.label} style={{ background:'#fff', borderRadius:'18px', padding:'14px 8px 12px', textAlign:'center', boxShadow:'0 8px 24px rgba(27,79,114,0.12)' }}>
            <div style={{ width:'36px', height:'36px', borderRadius:'12px', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 8px' }}>{s.icon}</div>
            <div style={{ fontSize:'21px', fontWeight:'800', color:s.color, lineHeight:'1' }}>{s.value}</div>
            <div style={{ fontSize:'10px', color:'#94a3b8', marginTop:'4px', fontWeight:'500' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* MENU */}
      <div style={{ fontSize:'12px', fontWeight:'700', color:'#64748b', letterSpacing:'0.4px', padding:'0 16px', marginBottom:'12px' }}>القائمة الرئيسية</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'11px', padding:'0 16px', marginBottom:'22px' }}>
        {menu.map(item => {
          const statVal = getStatVal(item.statKey);
          return (
            <a key={item.href} href={item.href}
              style={{ borderRadius:'22px', minHeight:'130px', position:'relative', overflow:'hidden', cursor:'pointer', boxShadow:'0 6px 20px rgba(0,0,0,0.12)', textDecoration:'none', display:'block', background:item.grad }}>
              {/* أيقونة SVG ضخمة شفافة كخلفية */}
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', opacity:0.15, pointerEvents:'none' }}>
                <svg viewBox="0 0 24 24" width="110" height="110" fill="none" stroke="white" strokeWidth="0.8"
                  dangerouslySetInnerHTML={{ __html: item.bgPath }}/>
              </div>
              {/* النص والرقم */}
              <div style={{ position:'relative', zIndex:1, padding:'16px 14px', height:'100%', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:'14px', fontWeight:'700', color:'#fff', marginBottom:'4px' }}>{item.label}</div>
                  <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.7)' }}>{item.sub}</div>
                </div>
                {statVal !== null && (
                  <div style={{ fontSize:'32px', fontWeight:'800', color:'rgba(255,255,255,0.95)', lineHeight:'1', marginTop:'10px' }}>
                    {statVal}
                  </div>
                )}
              </div>
            </a>
          );
        })}
      </div>

      {/* OWNER SETTINGS */}
      {appUser?.role === 'owner' && (
        <div style={{ padding:'0 16px', marginBottom:'16px' }}>
          <div style={{ fontSize:'12px', fontWeight:'700', color:'#64748b', letterSpacing:'0.4px', marginBottom:'10px' }}>إعدادات المالك</div>
          <div style={{ background:'#fff', borderRadius:'20px', overflow:'hidden', boxShadow:'0 4px 16px rgba(27,79,114,0.08)' }}>
            <a href="/dashboard-settings" style={{ display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px', borderBottom:'1px solid #f1f5f9', textDecoration:'none' }}>
              <div style={{ width:'40px', height:'40px', borderRadius:'13px', background:'#EBF5FB', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1B4F72" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#1e293b' }}>إعدادات لوحة التحكم</div>
                <div style={{ fontSize:'10px', color:'#94a3b8', marginTop:'2px' }}>تخصيص القائمة والأيقونات والترتيب</div>
              </div>
              <div style={{ color:'#cbd5e1', fontSize:'20px' }}>‹</div>
            </a>
            <a href="/users" style={{ display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px', textDecoration:'none' }}>
              <div style={{ width:'40px', height:'40px', borderRadius:'13px', background:'#F4ECF7', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8E44AD" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#1e293b' }}>إدارة المستخدمين</div>
                <div style={{ fontSize:'10px', color:'#94a3b8', marginTop:'2px' }}>الصلاحيات · ربط المدراء · الدعوات</div>
              </div>
              <div style={{ color:'#cbd5e1', fontSize:'20px' }}>‹</div>
            </a>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, height:'68px', background:'#fff', borderTop:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-around', paddingBottom:'10px', boxShadow:'0 -4px 20px rgba(0,0,0,0.06)', zIndex:50 }}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', padding:'6px 16px', borderRadius:'14px', background:'#EBF5FB' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1B4F72" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
          <div style={{ fontSize:'9px', color:'#1B4F72', fontWeight:'700' }}>الرئيسية</div>
        </div>
        <div onClick={() => router.push('/reports')} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', padding:'6px 16px', cursor:'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 17V13M11 17V9M15 17v-5"/></svg>
          <div style={{ fontSize:'9px', color:'#94a3b8' }}>التقارير</div>
        </div>
        <div onClick={() => router.push('/calendar')} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', padding:'6px 16px', cursor:'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>
          <div style={{ fontSize:'9px', color:'#94a3b8' }}>التقويم</div>
        </div>
        <div onClick={() => router.push('/users')} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', padding:'6px 16px', cursor:'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          <div style={{ fontSize:'9px', color:'#94a3b8' }}>حسابي</div>
        </div>
      </div>

      {/* PROPERTY PICKER */}
      {showPropPicker && (
        <div style={{ position:'fixed', inset:'0', background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:100 }}
          onClick={() => setShowPropPicker(false)}>
          <div style={{ background:'#fff', borderRadius:'24px 24px 0 0', padding:'24px', width:'100%', maxWidth:'480px' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px' }}>
              <div style={{ fontSize:'17px', fontWeight:'700', color:'#1B4F72' }}>اختر العقار</div>
              <button onClick={() => setShowPropPicker(false)} style={{ border:'none', background:'#f1f5f9', borderRadius:'50%', width:'32px', height:'32px', cursor:'pointer', fontSize:'16px' }}>✕</button>
            </div>
            {properties.map(prop => (
              <button key={prop.id} onClick={() => switchProperty(prop)}
                style={{ width:'100%', background: activeProp?.id===prop.id ? '#EBF5FB' : '#fff', borderRadius:'14px', padding:'14px 16px', display:'flex', alignItems:'center', gap:'14px', cursor:'pointer', textAlign:'right', marginBottom:'10px', border: activeProp?.id===prop.id ? '2px solid #1B4F72' : '2px solid #e2e8f0', fontFamily:'sans-serif' }}>
                <div style={{ width:'44px', height:'44px', borderRadius:'12px', background:'linear-gradient(135deg,#1B4F72,#2E86C1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                </div>
                <div style={{ flex:1, textAlign:'right' }}>
                  <div style={{ fontSize:'15px', fontWeight:'700', color:'#1e293b' }}>{prop.name}</div>
                  <div style={{ fontSize:'12px', color:'#64748b', marginTop:'2px' }}>{prop.city && `📍 ${prop.city} · `}🏠 {prop.totalUnits} وحدة</div>
                </div>
                {activeProp?.id===prop.id && <span style={{ color:'#1B4F72', fontSize:'20px' }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
