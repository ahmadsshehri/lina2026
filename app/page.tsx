'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface Property { id: string; name: string; city: string; totalUnits: number; }
interface AppUser { name: string; role: string; }

const ROLE_LABEL: Record<string,string> = { owner:'مالك', manager:'مدير', accountant:'محاسب', maintenance:'صيانة' };

const MENU = [
  { label:'الإيجار الشهري',    sub:'المستأجرون والدفعات',  icon:'📋', href:'/monthly',   color:'#1e40af', bg:'#dbeafe', dark:'#1e3a8a' },
  { label:'الشقق المفروشة',    sub:'Airbnb · Gathern',      icon:'🏨', href:'/furnished', color:'#065f46', bg:'#d1fae5', dark:'#064e3b' },
  { label:'المصاريف',          sub:'كهرباء · رواتب · صيانة',icon:'💳', href:'/expenses',  color:'#92400e', bg:'#fef3c7', dark:'#78350f' },
  { label:'تقويم الحجوزات',   sub:'جدول الإشغال',          icon:'📅', href:'/calendar',  color:'#be185d', bg:'#fce7f3', dark:'#9d174d' },
  { label:'التقارير',          sub:'إحصاءات ومقارنات',      icon:'📊', href:'/reports',   color:'#5b21b6', bg:'#ede9fe', dark:'#4c1d95' },
  { label:'التدفق المالي',     sub:'تسويات · تحويلات',      icon:'💰', href:'/cashflow',  color:'#065f46', bg:'#ecfdf5', dark:'#064e3b' },
  { label:'الوحدات والعقارات', sub:'إدارة الشقق',           icon:'🏢', href:'/units',     color:'#0c4a6e', bg:'#f0f9ff', dark:'#0a3553' },
  { label:'المستخدمون',        sub:'الصلاحيات والأدوار',    icon:'👥', href:'/users',     color:'#7c2d12', bg:'#fff7ed', dark:'#6c2410' },
];

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AppUser|null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [stats, setStats] = useState({ units:0, tenants:0, bookings:0 });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }
      // Load user doc
      const userSnap = await getDocs(query(collection(db,'users'), where('__name__','==',fbUser.uid)));
      if (!userSnap.empty) setUser(userSnap.docs[0].data() as AppUser);
      // Load properties
      const propSnap = await getDocs(query(collection(db,'properties'), where('ownerId','==',fbUser.uid)));
      const props = propSnap.docs.map(d => ({ id: d.id, ...d.data() } as Property));
      setProperties(props);
      // Load quick stats
      if (props.length > 0) {
        const pid = props[0].id;
        const [uSnap, tSnap, bSnap] = await Promise.all([
          getDocs(query(collection(db,'units'), where('propertyId','==',pid))),
          getDocs(query(collection(db,'tenants'), where('propertyId','==',pid), where('status','==','active'))),
          getDocs(query(collection(db,'bookings'), where('propertyId','==',pid))),
        ]);
        setStats({ units: uSnap.size, tenants: tSnap.size, bookings: bSnap.docs.filter(d=>(d.data() as any).status==='confirmed'||(d.data() as any).status==='checkedin').length });
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',background:'#f9fafb'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:'44px',height:'44px',border:'4px solid #1B4F72',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 16px'}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{color:'#6b7280',fontFamily:'sans-serif',fontSize:'15px',margin:0}}>جارٍ التحميل...</p>
      </div>
    </div>
  );

  return (
    <div dir="rtl" style={{fontFamily:'sans-serif',background:'#f9fafb',minHeight:'100vh'}}>

      {/* Header */}
      <div style={{background:'linear-gradient(135deg, #1B4F72 0%, #2E86C1 100%)',padding:'24px 20px 32px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'20px'}}>
          <div>
            <div style={{fontSize:'13px',color:'rgba(255,255,255,0.6)',marginBottom:'4px'}}>مرحباً،</div>
            <div style={{fontSize:'22px',fontWeight:'700',color:'#fff',marginBottom:'2px'}}>{user?.name || 'المستخدم'}</div>
            <div style={{fontSize:'13px',color:'rgba(255,255,255,0.7)'}}>
              <span style={{background:'rgba(255,255,255,0.15)',padding:'3px 10px',borderRadius:'20px'}}>{ROLE_LABEL[user?.role||''] || user?.role}</span>
            </div>
          </div>
          <button onClick={()=>{auth.signOut();router.push('/login');}}
            style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:'10px',padding:'8px 14px',color:'#fff',cursor:'pointer',fontSize:'13px'}}>
            خروج
          </button>
        </div>

        {/* Property name */}
        {properties.length > 0 && (
          <div style={{background:'rgba(255,255,255,0.1)',borderRadius:'12px',padding:'12px 16px',display:'flex',alignItems:'center',gap:'10px'}}>
            <span style={{fontSize:'20px'}}>🏢</span>
            <div>
              <div style={{color:'#fff',fontSize:'15px',fontWeight:'600'}}>{properties[0].name}</div>
              <div style={{color:'rgba(255,255,255,0.6)',fontSize:'12px'}}>{properties[0].city} · {properties[0].totalUnits} وحدة</div>
            </div>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px',padding:'0 16px',marginTop:'-20px',marginBottom:'20px',position:'relative',zIndex:10}}>
        {[
          ['الوحدات', stats.units, '🏠'],
          ['المستأجرون', stats.tenants, '👤'],
          ['حجوزات نشطة', stats.bookings, '📅'],
        ].map(([l,v,icon])=>(
          <div key={String(l)} style={{background:'#fff',borderRadius:'14px',padding:'14px 12px',textAlign:'center',boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}}>
            <div style={{fontSize:'22px',marginBottom:'4px'}}>{icon}</div>
            <div style={{fontSize:'22px',fontWeight:'700',color:'#1B4F72',lineHeight:'1'}}>{v}</div>
            <div style={{fontSize:'11px',color:'#6b7280',marginTop:'4px'}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Menu grid */}
      <div style={{padding:'0 16px 24px'}}>
        <div style={{fontSize:'13px',color:'#9ca3af',marginBottom:'12px',fontWeight:'500'}}>القائمة الرئيسية</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
          {MENU.map(item=>(
            <a key={item.href} href={item.href}
              style={{background:'#fff',borderRadius:'16px',padding:'18px 16px',textDecoration:'none',display:'block',border:'1px solid #f3f4f6',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',transition:'transform 0.15s',position:'relative',overflow:'hidden'}}
              onMouseOver={e=>(e.currentTarget.style.transform='translateY(-2px)')}
              onMouseOut={e=>(e.currentTarget.style.transform='translateY(0)')}>
              <div style={{position:'absolute',top:0,right:0,width:'4px',height:'100%',background:item.color,borderRadius:'0 16px 16px 0'}}/>
              <div style={{fontSize:'28px',marginBottom:'10px'}}>{item.icon}</div>
              <div style={{fontSize:'14px',fontWeight:'700',color:'#111827',marginBottom:'3px'}}>{item.label}</div>
              <div style={{fontSize:'11px',color:'#9ca3af'}}>{item.sub}</div>
            </a>
          ))}
        </div>
      </div>

    </div>
  );
}
