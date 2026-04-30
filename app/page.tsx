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
  { label:'الإيجار الشهري', sub:'المستأجرون والدفعات', href:'/monthly',      roles:['owner','manager','accountant'], grad:'linear-gradient(140deg,#1A5276,#2471A3)',
    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="2" y="5" width="20" height="16" rx="2"/><path d="M16 3v4M8 3v4M2 9h20"/></svg>,
    bgIcon:<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1"><rect x="2" y="5" width="20" height="16" rx="2"/><path d="M16 3v4M8 3v4M2 9h20M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2"/></svg> },
  { label:'الشقق المفروشة', sub:'Airbnb · Gathern',    href:'/furnished',    roles:['owner','manager','accountant'], grad:'linear-gradient(140deg,#B7950B,#D4AC0D)',
    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M3 12h18M3 17h18"/><rect x="5" y="3" width="14" height="6" rx="1"/></svg>,
    bgIcon:<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1"><path d="M3 7v10M21 7v10M3 17h18"/><rect x="5" y="3" width="14" height="4" rx="1"/></svg> },
  { label:'المصاريف',       sub:'كهرباء · رواتب · صيانة', href:'/expenses',  roles:['owner','manager','accountant'], grad:'linear-gradient(140deg,#C0392B,#E74C3C)',
    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
    bgIcon:<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg> },
  { label:'تقويم الحجوزات', sub:'جدول الإشغال',       href:'/calendar',     roles:['owner','manager','accountant'], grad:'linear-gradient(140deg,#1E8449,#27AE60)',
    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>,
    bgIcon:<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { label:'التقارير',       sub:'إحصاءات ومقارنات',   href:'/reports',      roles:['owner','manager','accountant'], grad:'linear-gradient(140deg,#6C3483,#8E44AD)',
    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M7 17V13M11 17V9M15 17v-5"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
    bgIcon:<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 17V13M11 17V9M15 17v-5M19 17V7"/></svg> },
  { label:'التدفق المالي',  sub:'تسويات · تحويلات',   href:'/cashflow',     roles:['owner','manager','accountant'], grad:'linear-gradient(140deg,#0E6655,#16A085)',
    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M2 12h20M12 2l8 10-8 10"/></svg>,
    bgIcon:<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> },
  { label:'الوحدات والعقارات', sub:'إدارة الشقق',     href:'/units',        roles:['owner','manager'],             grad:'linear-gradient(140deg,#154360,#1F618D)',
    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M3 21h18M3 7l9-4 9 4M20 21V7M4 21V7"/></svg>,
    bgIcon:<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1"><path d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M9 21V9h6v12"/></svg> },
  { label:'الإيرادات الأخرى', sub:'إيرادات إضافية',  href:'/other-revenue', roles:['owner','manager','accountant'], grad:'linear-gradient(140deg,#9A7D0A,#F39C12)',
    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>,
    bgIcon:<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1"><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="2"/></svg> },
];

export default function HomePage() {
  const router = useRouter();
  const [loading,         setLoading]         = useState(true);
  const [appUser,         setAppUser]         = useState<AppUserBasic | null>(null);
  const [properties,      setProperties]      = useState<PropertyBasic[]>([]);
  const [activeProp,      setActiveProp]      = useState<PropertyBasic | null>(null);
  const [showPropPicker,  setShowPropPicker]  = useState(false);
  const [stats,           setStats]           = useState({ units:0, tenants:0, bookings:0 });
  const [error,           setError]           = useState('');

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
          const savedId = localStorage.getItem('selectedPropertyId');
          const saved   = props.find(p => p.id === savedId);
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
      getDocs(query(collection(db,'units'),    where('propertyId','==',pid))),
      getDocs(query(collection(db,'tenants'),  where('propertyId','==',pid), where('status','==','active'))),
      getDocs(query(collection(db,'bookings'), where('propertyId','==',pid))),
    ]);
    setStats({
      units:    uSnap.size,
      tenants:  tSnap.size,
      bookings: bSnap.docs.filter(d => { const s=(d.data() as any).status; return s==='confirmed'||s==='checkedin'; }).length,
    });
  };

  const switchProperty = async (prop: PropertyBasic) => {
    setActiveProp(prop);
    setShowPropPicker(false);
    localStorage.setItem('selectedPropertyId', prop.id);
    await loadStats(prop.id);
  };

  const menu = MENU_ALL.filter(m => m.roles.includes(appUser?.role || ''));

  const S: Record<string, React.CSSProperties> = {
    screen:   { fontFamily:'sans-serif', background:'#F5F7FA', minHeight:'100vh', direction:'rtl', paddingBottom:'80px' },
    hdr:      { background:'linear-gradient(145deg,#1B4F72 0%,#2980B9 70%,#5DADE2 100%)', padding:'38px 22px 70px', position:'relative', overflow:'hidden' },
    blob1:    { position:'absolute', top:'-50px', right:'-50px', width:'180px', height:'180px', background:'rgba(255,255,255,0.06)', borderRadius:'50%' },
    blob2:    { position:'absolute', top:'20px',  left:'-30px',  width:'100px', height:'100px', background:'rgba(212,172,13,0.1)',   borderRadius:'50%' },
    hi:       { fontSize:'12px', color:'rgba(255,255,255,0.5)', marginBottom:'2px' },
    name:     { fontSize:'23px', fontWeight:'700', color:'#fff', marginBottom:'6px' },
    badge:    { display:'inline-flex', alignItems:'center', gap:'5px', background:'rgba(212,172,13,0.2)', border:'1px solid rgba(212,172,13,0.35)', color:'#f5d060', fontSize:'11px', padding:'4px 12px', borderRadius:'20px' },
    badgeDot: { width:'6px', height:'6px', background:'#f5d060', borderRadius:'50%' },
    exitBtn:  { background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.2)', color:'rgba(255,255,255,0.75)', fontSize:'11px', padding:'7px 14px', borderRadius:'12px', cursor:'pointer', fontFamily:'sans-serif' },
    propPill: { background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.18)', borderRadius:'16px', padding:'11px 14px', display:'flex', alignItems:'center', gap:'10px', marginTop:'14px', position:'relative', zIndex:1 },
    propIco:  { width:'36px', height:'36px', background:'linear-gradient(135deg,#D4AC0D,#f5d060)', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
    propName: { fontSize:'13px', fontWeight:'700', color:'#fff' },
    propMeta: { fontSize:'10px', color:'rgba(255,255,255,0.45)', marginTop:'1px' },
    propChg:  { marginRight:'auto', fontSize:'10px', color:'#f5d060', cursor:'pointer' },
    stats:    { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', padding:'0 16px', marginTop:'-36px', marginBottom:'24px', position:'relative', zIndex:10 },
    sf:       { background:'#fff', borderRadius:'18px', padding:'14px 8px 12px', textAlign:'center', boxShadow:'0 8px 24px rgba(27,79,114,0.12)' },
    sfC:      { width:'36px', height:'36px', borderRadius:'12px', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 8px' },
    sfV:      { fontSize:'21px', fontWeight:'800' as any, lineHeight:'1' },
    sfL:      { fontSize:'10px', color:'#94a3b8', marginTop:'4px', fontWeight:'500' as any },
    secHdr:   { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 16px', marginBottom:'12px' },
    secT:     { fontSize:'12px', fontWeight:'700' as any, color:'#64748b', letterSpacing:'0.4px' },
    grid:     { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'11px', padding:'0 16px', marginBottom:'22px' },
    mc:       { borderRadius:'22px', minHeight:'118px', position:'relative', overflow:'hidden', cursor:'pointer', boxShadow:'0 6px 20px rgba(0,0,0,0.1)', textDecoration:'none', display:'block' },
    mcBg:     { position:'absolute', bottom:'-14px', left:'-14px', opacity:0.13, pointerEvents:'none' },
    mcBgSvg:  { width:'88px', height:'88px' },
    mcTop:    { position:'relative', zIndex:1, padding:'15px 14px 0' },
    mcIb:     { width:'36px', height:'36px', background:'rgba(255,255,255,0.22)', borderRadius:'11px', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'10px' },
    mcT:      { fontSize:'13px', fontWeight:'700' as any, color:'#fff', lineHeight:'1.2', marginBottom:'2px' },
    mcS:      { fontSize:'10px', color:'rgba(255,255,255,0.6)' },
    mcBot:    { position:'relative', zIndex:1, padding:'8px 14px 14px', display:'flex', justifyContent:'space-between', alignItems:'flex-end' },
    mcA:      { width:'26px', height:'26px', background:'rgba(255,255,255,0.18)', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center' },
    ownWrap:  { padding:'0 16px', marginBottom:'16px' },
    ownLbl:   { fontSize:'12px', fontWeight:'700' as any, color:'#64748b', letterSpacing:'0.4px', marginBottom:'10px' },
    ownCard:  { background:'#fff', borderRadius:'20px', overflow:'hidden', boxShadow:'0 4px 16px rgba(27,79,114,0.08)' },
    ownRow:   { display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px', borderBottom:'1px solid #f1f5f9' },
    ownRowL:  { display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px' },
    ownIco:   { width:'40px', height:'40px', borderRadius:'13px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
    ownT:     { fontSize:'13px', fontWeight:'600' as any, color:'#1e293b' },
    ownS:     { fontSize:'10px', color:'#94a3b8', marginTop:'2px' },
    ownArr:   { color:'#cbd5e1', fontSize:'20px' },
    bnav:     { position:'fixed', bottom:0, left:0, right:0, height:'68px', background:'#fff', borderTop:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-around', paddingBottom:'10px', boxShadow:'0 -4px 20px rgba(0,0,0,0.06)', zIndex:50 },
    nb:       { display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', padding:'6px 16px', borderRadius:'14px', cursor:'pointer' },
    nbOn:     { display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', padding:'6px 16px', borderRadius:'14px', cursor:'pointer', background:'#EBF5FB' },
    nbL:      { fontSize:'9px', color:'#94a3b8', fontWeight:'500' as any },
    nbLon:    { fontSize:'9px', color:'#1B4F72', fontWeight:'700' as any },
    overlay:  { position:'fixed', inset:'0', background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:100 },
    picker:   { background:'#fff', borderRadius:'24px 24px 0 0', padding:'24px', width:'100%', maxWidth:'480px' },
    pickerH:  { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px' },
    pickerT:  { fontSize:'17px', fontWeight:'700' as any, color:'#1B4F72' },
    pickerX:  { border:'none', background:'#f1f5f9', borderRadius:'50%', width:'32px', height:'32px', cursor:'pointer', fontSize:'16px' },
    propBtn:  { width:'100%', background:'#fff', borderRadius:'14px', padding:'14px 16px', display:'flex', alignItems:'center', gap:'14px', cursor:'pointer', textAlign:'right', marginBottom:'10px', border:'2px solid #e2e8f0' },
    propBtnA: { width:'100%', background:'#EBF5FB', borderRadius:'14px', padding:'14px 16px', display:'flex', alignItems:'center', gap:'14px', cursor:'pointer', textAlign:'right', marginBottom:'10px', border:'2px solid #1B4F72' },
  };

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
    <div style={S.screen}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── HEADER ── */}
      <div style={S.hdr}>
        <div style={S.blob1}/>
        <div style={S.blob2}/>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'18px', position:'relative', zIndex:1 }}>
          <div>
            <div style={S.hi}>صباح الخير،</div>
            <div style={S.name}>{appUser?.name}</div>
            <div style={S.badge}>
              <div style={S.badgeDot}/>
              {ROLE_LABEL[appUser?.role||''] || appUser?.role}
            </div>
          </div>
          <button style={S.exitBtn} onClick={() => auth.signOut().then(() => router.push('/login'))}>
            خروج
          </button>
        </div>

        {activeProp && (
          <div style={S.propPill} onClick={() => properties.length > 1 && setShowPropPicker(true)}>
            <div style={S.propIco}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B4F72" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
            </div>
            <div style={{ flex:1 }}>
              <div style={S.propName}>{activeProp.name}</div>
              <div style={S.propMeta}>{activeProp.city && `${activeProp.city} · `}{activeProp.totalUnits} وحدة</div>
            </div>
            {properties.length > 1 && <div style={S.propChg}>تغيير ↓</div>}
          </div>
        )}

        <svg style={{ position:'absolute', bottom:'-2px', left:0, right:0, width:'100%' }} viewBox="0 0 380 40" preserveAspectRatio="none">
          <path d="M0,20 C80,40 200,0 380,20 L380,40 L0,40 Z" fill="#F5F7FA"/>
        </svg>
      </div>

      {/* ── STATS ── */}
      <div style={S.stats}>
        <div style={S.sf}>
          <div style={{ ...S.sfC, background:'#EBF5FB' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B4F72" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          </div>
          <div style={{ ...S.sfV, color:'#1B4F72' }}>{stats.units}</div>
          <div style={S.sfL}>الوحدات</div>
        </div>
        <div style={S.sf}>
          <div style={{ ...S.sfC, background:'#EAFAF1' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#27AE60" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          </div>
          <div style={{ ...S.sfV, color:'#27AE60' }}>{stats.tenants}</div>
          <div style={S.sfL}>مستأجر</div>
        </div>
        <div style={S.sf}>
          <div style={{ ...S.sfC, background:'#FEF9E7' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4AC0D" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div style={{ ...S.sfV, color:'#D4AC0D' }}>{stats.bookings}</div>
          <div style={S.sfL}>حجز نشط</div>
        </div>
      </div>

      {/* ── MENU ── */}
      <div style={S.secHdr}>
        <div style={S.secT}>الخدمات الرئيسية</div>
      </div>
      <div style={S.grid}>
        {menu.map(item => (
          <a key={item.href} href={item.href} style={{ ...S.mc, background: item.grad }}>
            <div style={S.mcBg}>
              <div style={S.mcBgSvg}>{item.bgIcon}</div>
            </div>
            <div style={S.mcTop}>
              <div style={S.mcIb}>{item.icon}</div>
              <div style={S.mcT}>{item.label}</div>
              <div style={S.mcS}>{item.sub}</div>
            </div>
            <div style={S.mcBot}>
              <div/>
              <div style={S.mcA}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><polyline points="15,18 9,12 15,6"/></svg>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* ── OWNER SETTINGS ── */}
      {appUser?.role === 'owner' && (
        <div style={S.ownWrap}>
          <div style={S.ownLbl}>إعدادات المالك</div>
          <div style={S.ownCard}>
            <a href="/dashboard-settings" style={{ ...S.ownRow, textDecoration:'none' }}>
              <div style={{ ...S.ownIco, background:'#EBF5FB' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1B4F72" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              </div>
              <div style={{ flex:1 }}>
                <div style={S.ownT}>إعدادات لوحة التحكم</div>
                <div style={S.ownS}>تخصيص القائمة والأيقونات والترتيب</div>
              </div>
              <div style={S.ownArr}>‹</div>
            </a>
            <a href="/users" style={{ ...S.ownRowL, textDecoration:'none' }}>
              <div style={{ ...S.ownIco, background:'#F4ECF7' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8E44AD" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              </div>
              <div style={{ flex:1 }}>
                <div style={S.ownT}>إدارة المستخدمين</div>
                <div style={S.ownS}>الصلاحيات · ربط المدراء · الدعوات</div>
              </div>
              <div style={S.ownArr}>‹</div>
            </a>
          </div>
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <div style={S.bnav}>
        <div style={S.nbOn}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1B4F72" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
          <div style={S.nbLon}>الرئيسية</div>
        </div>
        <div style={S.nb} onClick={() => router.push('/reports')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 17V13M11 17V9M15 17v-5"/></svg>
          <div style={S.nbL}>التقارير</div>
        </div>
        <div style={S.nb} onClick={() => router.push('/calendar')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>
          <div style={S.nbL}>التقويم</div>
        </div>
        <div style={S.nb} onClick={() => router.push('/users')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          <div style={S.nbL}>حسابي</div>
        </div>
      </div>

      {/* ── PROPERTY PICKER ── */}
      {showPropPicker && (
        <div style={S.overlay} onClick={() => setShowPropPicker(false)}>
          <div style={S.picker} onClick={e => e.stopPropagation()}>
            <div style={S.pickerH}>
              <div style={S.pickerT}>اختر العقار</div>
              <button style={S.pickerX} onClick={() => setShowPropPicker(false)}>✕</button>
            </div>
            {properties.map(prop => (
              <button key={prop.id} onClick={() => switchProperty(prop)}
                style={activeProp?.id === prop.id ? S.propBtnA : S.propBtn}>
                <div style={{ width:'44px', height:'44px', borderRadius:'12px', background:'linear-gradient(135deg,#1B4F72,#2E86C1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                </div>
                <div style={{ flex:1, textAlign:'right' }}>
                  <div style={{ fontSize:'15px', fontWeight:'700', color:'#1e293b' }}>{prop.name}</div>
                  <div style={{ fontSize:'12px', color:'#64748b', marginTop:'2px' }}>
                    {prop.city && `📍 ${prop.city} · `}🏠 {prop.totalUnits} وحدة
                  </div>
                </div>
                {activeProp?.id === prop.id && <span style={{ color:'#1B4F72', fontSize:'20px' }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
