'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface Property { id: string; name: string; }
interface Unit { id: string; unitNumber: string; type: string; }
interface Booking {
  id: string; unitId: string; unitNumber: string; guestName: string;
  guestPhone: string; channel: string; checkinDate: any; checkoutDate: any;
  nights: number; totalRevenue: number; platformFee: number; netRevenue: number;
  depositAmount: number; depositStatus: string; status: string; notes: string;
}

const CHANNELS: Record<string,{label:string,color:string,bg:string}> = {
  airbnb:  { label:'Airbnb',       color:'#991b1b', bg:'#fee2e2' },
  gathern: { label:'Gathern',      color:'#065f46', bg:'#d1fae5' },
  booking: { label:'Booking.com',  color:'#1e40af', bg:'#dbeafe' },
  direct:  { label:'مباشر',        color:'#92400e', bg:'#fef3c7' },
  other:   { label:'أخرى',         color:'#374151', bg:'#f3f4f6' },
};
const STATUS: Record<string,{label:string,color:string,bg:string}> = {
  confirmed:  { label:'مؤكد',  color:'#1e40af', bg:'#dbeafe' },
  checkedin:  { label:'وصل',   color:'#065f46', bg:'#d1fae5' },
  checkedout: { label:'غادر',  color:'#374151', bg:'#f3f4f6' },
  cancelled:  { label:'ملغي',  color:'#991b1b', bg:'#fee2e2' },
};
const DEPOSIT: Record<string,{label:string,color:string,bg:string}> = {
  held:     { label:'محتجز', color:'#92400e', bg:'#fef3c7' },
  returned: { label:'مُعاد',  color:'#065f46', bg:'#d1fae5' },
  deducted: { label:'مخصوم', color:'#991b1b', bg:'#fee2e2' },
};

function fmtDate(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
}

export default function FurnishedPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [propId, setPropId] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editBooking, setEditBooking] = useState<Booking|null>(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({ unitId:'', guestName:'', guestPhone:'', channel:'airbnb', checkinDate:'', checkoutDate:'', totalRevenue:'', platformFee:'0', depositAmount:'0', depositStatus:'held', status:'confirmed', notes:'' });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return; }
      const snap = await getDocs(query(collection(db,'properties'), where('ownerId','==',user.uid)));
      const props = snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name }));
      setProperties(props);
      if (props.length > 0) {
        setPropId(props[0].id);
        await loadData(props[0].id);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadData = async (pid: string) => {
    const [uSnap, bSnap] = await Promise.all([
      getDocs(query(collection(db,'units'), where('propertyId','==',pid), where('type','==','furnished'))),
      getDocs(query(collection(db,'bookings'), where('propertyId','==',pid))),
    ]);
    const u = uSnap.docs.map(d => ({ id: d.id, ...d.data() } as Unit));
    setUnits(u);
    setBookings(bSnap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)).sort((a,b)=>(b.checkinDate?.seconds||0)-(a.checkinDate?.seconds||0)));
    if (u.length > 0 && !form.unitId) setForm(f => ({ ...f, unitId: u[0].id }));
  };

  const calcNights = () => {
    if (!form.checkinDate || !form.checkoutDate) return 0;
    return Math.max(0, Math.ceil((new Date(form.checkoutDate).getTime() - new Date(form.checkinDate).getTime()) / 86400000));
  };

  const saveBooking = async () => {
    if (!form.unitId || !form.guestName || !form.checkinDate || !form.checkoutDate) return;
    setSaving(true);
    try {
      const unit = units.find(u => u.id === form.unitId);
      const nights = calcNights();
      const totalRevenue = Number(form.totalRevenue);
      const platformFee = Number(form.platformFee);
      const data = {
        ...form, propertyId: propId,
        unitNumber: unit?.unitNumber || '',
        nights, totalRevenue, platformFee,
        netRevenue: totalRevenue - platformFee,
        nightlyRate: nights > 0 ? totalRevenue / nights : 0,
        depositAmount: Number(form.depositAmount),
        checkinDate: Timestamp.fromDate(new Date(form.checkinDate)),
        checkoutDate: Timestamp.fromDate(new Date(form.checkoutDate)),
      };
      if (editBooking) {
        await updateDoc(doc(db,'bookings',editBooking.id), data);
      } else {
        await addDoc(collection(db,'bookings'), { ...data, createdAt: serverTimestamp() });
      }
      await loadData(propId);
      setShowModal(false);
      setEditBooking(null);
    } catch(e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const returnDeposit = async (b: Booking) => {
    if (!confirm('تأكيد إعادة التأمين؟')) return;
    await updateDoc(doc(db,'bookings',b.id), { depositStatus:'returned' });
    await loadData(propId);
  };

  const changeStatus = async (b: Booking, status: string) => {
    await updateDoc(doc(db,'bookings',b.id), { status });
    await loadData(propId);
  };

  const filtered = filterStatus === 'all' ? bookings : bookings.filter(b => b.status === filterStatus);
  const activeBookings = bookings.filter(b => b.status !== 'cancelled');
  const totalRevenue = activeBookings.reduce((s,b) => s+b.netRevenue, 0);
  const pendingDeposit = bookings.filter(b => b.depositStatus==='held' && b.status==='checkedout').length;
  const nights = calcNights();

  if (loading) return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',background:'#f9fafb'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:'40px',height:'40px',border:'3px solid #1B4F72',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{color:'#6b7280',fontFamily:'sans-serif',fontSize:'14px'}}>جارٍ التحميل...</p>
      </div>
    </div>
  );

  return (
    <div dir="rtl" style={{fontFamily:'sans-serif',background:'#f9fafb',minHeight:'100vh'}}>
      {/* Top bar */}
      <div style={{background:'#1B4F72',padding:'16px 20px',display:'flex',alignItems:'center',gap:'12px',position:'sticky',top:0,zIndex:50}}>
        <button onClick={()=>router.push('/')} style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:'8px',padding:'8px',cursor:'pointer'}}>
          <span style={{color:'#fff',fontSize:'18px'}}>←</span>
        </button>
        <div style={{flex:1}}>
          <h1 style={{margin:0,fontSize:'17px',fontWeight:'600',color:'#fff'}}>الشقق المفروشة</h1>
          <p style={{margin:0,fontSize:'12px',color:'rgba(255,255,255,0.6)'}}>{activeBookings.length} حجز نشط</p>
        </div>
        <button onClick={()=>{setEditBooking(null);setForm({unitId:units[0]?.id||'',guestName:'',guestPhone:'',channel:'airbnb',checkinDate:'',checkoutDate:'',totalRevenue:'',platformFee:'0',depositAmount:'0',depositStatus:'held',status:'confirmed',notes:''});setShowModal(true);}}
          style={{background:'#D4AC0D',border:'none',borderRadius:'10px',padding:'10px 16px',cursor:'pointer',color:'#fff',fontSize:'13px',fontWeight:'600'}}>
          + حجز
        </button>
      </div>

      <div style={{padding:'16px',maxWidth:'700px',margin:'0 auto'}}>

        {/* Property selector */}
        {properties.length > 1 && (
          <div style={{marginBottom:'14px'}}>
            <select value={propId} onChange={e=>{setPropId(e.target.value);loadData(e.target.value);}}
              style={{width:'100%',border:'1.5px solid #e5e7eb',borderRadius:'12px',padding:'12px 16px',fontSize:'14px',background:'#fff',appearance:'none'}}>
              {properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        {/* KPI cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px',marginBottom:'16px'}}>
          {[
            ['صافي الإيرادات', totalRevenue.toLocaleString('ar-SA')+'\nر.س', '#16a34a', '#d1fae5'],
            ['الحجوزات', activeBookings.length+'\nحجز نشط', '#1e40af', '#dbeafe'],
            ['تأمين معلق', pendingDeposit+'\nحجز', pendingDeposit>0?'#dc2626':'#16a34a', pendingDeposit>0?'#fee2e2':'#d1fae5'],
          ].map(([l,v,c,bg])=>(
            <div key={String(l)} style={{background:String(bg),borderRadius:'14px',padding:'14px 12px',textAlign:'center',border:`1px solid ${String(c)}30`}}>
              <div style={{fontSize:'12px',color:'#6b7280',marginBottom:'6px'}}>{l}</div>
              {String(v).split('\n').map((line,i)=>(
                <div key={i} style={{fontSize:i===0?'20px':'11px',fontWeight:i===0?'700':'400',color:i===0?String(c):'#6b7280',lineHeight:'1.2'}}>{line}</div>
              ))}
            </div>
          ))}
        </div>

        {/* Occupancy per unit */}
        {units.length > 0 && (
          <div style={{background:'#fff',borderRadius:'16px',border:'1px solid #e5e7eb',padding:'16px',marginBottom:'16px'}}>
            <div style={{fontSize:'14px',fontWeight:'600',color:'#374151',marginBottom:'12px'}}>إشغال الوحدات</div>
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              {units.map(u => {
                const uBookings = activeBookings.filter(b => b.unitId === u.id);
                const rev = uBookings.reduce((s,b) => s+b.netRevenue, 0);
                return (
                  <div key={u.id} style={{display:'flex',alignItems:'center',gap:'12px'}}>
                    <div style={{background:'#1B4F72',borderRadius:'8px',padding:'6px 10px',color:'#fff',fontSize:'13px',fontWeight:'600',minWidth:'44px',textAlign:'center'}}>
                      {u.unitNumber}
                    </div>
                    <div style={{flex:1,fontSize:'12px',color:'#6b7280'}}>{uBookings.length} حجز</div>
                    <div style={{fontSize:'13px',fontWeight:'600',color:'#16a34a'}}>{rev.toLocaleString('ar-SA')} ر.س</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter chips */}
        <div style={{display:'flex',gap:'8px',marginBottom:'12px',overflowX:'auto',paddingBottom:'4px'}}>
        {[['all','الكل'],['confirmed','مؤكد'],['checkedin','وصل'],['checkedout','غادر'],['cancelled','ملغي']].map(([v,l])=>(
  <button key={v} onClick={()=>setFilterStatus(v)}
    style={{padding:'7px 14px',borderRadius:'20px',cursor:'pointer',fontSize:'12px',fontWeight:'500',whiteSpace:'nowrap',background:filterStatus===v?'#1B4F72':'#fff',color:filterStatus===v?'#fff':'#374151',border:filterStatus===v?'none':'1px solid #e5e7eb'}}>}>
              {l}
            </button>
          ))}
        </div>

        {/* Bookings list */}
        {filtered.length === 0 ? (
          <div style={{background:'#fff',borderRadius:'16px',padding:'40px',textAlign:'center',border:'1px solid #e5e7eb'}}>
            <div style={{fontSize:'48px',marginBottom:'12px'}}>🏨</div>
            <p style={{color:'#6b7280',fontSize:'14px',margin:0}}>لا توجد حجوزات</p>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
            {filtered.map(b => {
              const ch = CHANNELS[b.channel] || CHANNELS.other;
              const st = STATUS[b.status] || STATUS.confirmed;
              const dp = DEPOSIT[b.depositStatus] || DEPOSIT.held;
              return (
                <div key={b.id} style={{background:'#fff',borderRadius:'16px',border:'1px solid #e5e7eb',overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
                  {/* Card header */}
                  <div style={{padding:'14px 16px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',gap:'10px'}}>
                    <div style={{width:'8px',height:'8px',borderRadius:'50%',background:ch.color,flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'15px',fontWeight:'600',color:'#111827'}}>{b.guestName}</div>
                      <div style={{fontSize:'12px',color:'#6b7280'}}>{b.guestPhone}</div>
                    </div>
                    <span style={{background:ch.bg,color:ch.color,padding:'4px 10px',borderRadius:'20px',fontSize:'11px',fontWeight:'600'}}>{ch.label}</span>
                  </div>
                  {/* Card body */}
                  <div style={{padding:'12px 16px'}}>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',marginBottom:'12px'}}>
                      <div style={{textAlign:'center'}}>
                        <div style={{fontSize:'11px',color:'#9ca3af',marginBottom:'2px'}}>الشقة</div>
                        <div style={{fontSize:'16px',fontWeight:'700',color:'#1B4F72'}}>{b.unitNumber}</div>
                      </div>
                      <div style={{textAlign:'center'}}>
                        <div style={{fontSize:'11px',color:'#9ca3af',marginBottom:'2px'}}>المدة</div>
                        <div style={{fontSize:'13px',fontWeight:'600',color:'#374151'}}>{fmtDate(b.checkinDate)} → {fmtDate(b.checkoutDate)}</div>
                        <div style={{fontSize:'11px',color:'#6b7280'}}>{b.nights} ليلة</div>
                      </div>
                      <div style={{textAlign:'center'}}>
                        <div style={{fontSize:'11px',color:'#9ca3af',marginBottom:'2px'}}>الصافي</div>
                        <div style={{fontSize:'15px',fontWeight:'700',color:'#16a34a'}}>{b.netRevenue?.toLocaleString('ar-SA')}</div>
                        <div style={{fontSize:'11px',color:'#6b7280'}}>ر.س</div>
                      </div>
                    </div>
                    {/* Badges row */}
                    <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'12px'}}>
                      <span style={{background:st.bg,color:st.color,padding:'3px 10px',borderRadius:'10px',fontSize:'11px'}}>{st.label}</span>
                      {b.depositAmount > 0 && (
                        <button onClick={()=>b.depositStatus==='held'&&b.status==='checkedout'?returnDeposit(b):null}
                          style={{background:dp.bg,color:dp.color,padding:'3px 10px',borderRadius:'10px',fontSize:'11px',border:'none',cursor:b.depositStatus==='held'?'pointer':'default'}}>
                          تأمين: {dp.label} ({b.depositAmount?.toLocaleString()})
                        </button>
                      )}
                    </div>
                    {/* Action buttons */}
                    <div style={{display:'flex',gap:'8px'}}>
                      {b.status === 'confirmed' && (
                        <button onClick={()=>changeStatus(b,'checkedin')} style={{flex:1,padding:'8px',background:'#d1fae5',color:'#065f46',border:'none',borderRadius:'8px',cursor:'pointer',fontSize:'12px',fontWeight:'600'}}>
                          ✓ وصل
                        </button>
                      )}
                      {b.status === 'checkedin' && (
                        <button onClick={()=>changeStatus(b,'checkedout')} style={{flex:1,padding:'8px',background:'#f3f4f6',color:'#374151',border:'none',borderRadius:'8px',cursor:'pointer',fontSize:'12px',fontWeight:'600'}}>
                          ✓ غادر
                        </button>
                      )}
                      <button onClick={()=>{setEditBooking(b);setForm({unitId:b.unitId,guestName:b.guestName,guestPhone:b.guestPhone||'',channel:b.channel,checkinDate:'',checkoutDate:'',totalRevenue:String(b.totalRevenue),platformFee:String(b.platformFee||0),depositAmount:String(b.depositAmount||0),depositStatus:b.depositStatus,status:b.status,notes:b.notes||''});setShowModal(true);}}
                        style={{padding:'8px 14px',background:'#fff',border:'1px solid #e5e7eb',borderRadius:'8px',cursor:'pointer',fontSize:'12px'}}>
                        تعديل
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Booking Modal */}
      {showModal && (
        <div style={{position:'fixed',inset:'0',background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:1000}} onClick={()=>setShowModal(false)}>
          <div style={{background:'#fff',borderRadius:'20px 20px 0 0',padding:'24px',width:'100%',maxWidth:'500px',maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
              <h2 style={{margin:0,fontSize:'17px',color:'#1B4F72',fontWeight:'600'}}>{editBooking?'تعديل حجز':'حجز جديد'}</h2>
              <button onClick={()=>setShowModal(false)} style={{border:'none',background:'#f3f4f6',borderRadius:'50%',width:'32px',height:'32px',cursor:'pointer',fontSize:'16px'}}>✕</button>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
              <div>
                <label style={labelStyle}>الشقة</label>
                <select value={form.unitId} onChange={e=>setForm(f=>({...f,unitId:e.target.value}))} style={inputStyle}>
                  {units.map(u=><option key={u.id} value={u.id}>شقة {u.unitNumber}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>المنصة</label>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px'}}>
                  {Object.entries(CHANNELS).map(([k,v])=>(
                    <button key={k} onClick={()=>setForm(f=>({...f,channel:k}))}
                      style={{padding:'8px 4px',border:`2px solid ${form.channel===k?v.color:'#e5e7eb'}`,borderRadius:'10px',background:form.channel===k?v.bg:'#fff',cursor:'pointer',fontSize:'12px',fontWeight:'600',color:v.color}}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                <div>
                  <label style={labelStyle}>اسم الضيف</label>
                  <input value={form.guestName} onChange={e=>setForm(f=>({...f,guestName:e.target.value}))} style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>رقم الجوال</label>
                  <input value={form.guestPhone} onChange={e=>setForm(f=>({...f,guestPhone:e.target.value}))} style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>تاريخ الوصول</label>
                  <input type="date" value={form.checkinDate} onChange={e=>setForm(f=>({...f,checkinDate:e.target.value}))} style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>تاريخ المغادرة</label>
                  <input type="date" value={form.checkoutDate} onChange={e=>setForm(f=>({...f,checkoutDate:e.target.value}))} style={inputStyle}/>
                </div>
              </div>
              {nights > 0 && (
                <div style={{background:'#dbeafe',borderRadius:'10px',padding:'10px 14px',fontSize:'13px',color:'#1e40af',fontWeight:'600',textAlign:'center'}}>
                  {nights} ليلة
                </div>
              )}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                <div>
                  <label style={labelStyle}>الإيراد الإجمالي (ر.س)</label>
                  <input type="number" value={form.totalRevenue} onChange={e=>setForm(f=>({...f,totalRevenue:e.target.value}))} style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>عمولة المنصة (ر.س)</label>
                  <input type="number" value={form.platformFee} onChange={e=>setForm(f=>({...f,platformFee:e.target.value}))} style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>مبلغ التأمين (ر.س)</label>
                  <input type="number" value={form.depositAmount} onChange={e=>setForm(f=>({...f,depositAmount:e.target.value}))} style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>حالة التأمين</label>
                  <select value={form.depositStatus} onChange={e=>setForm(f=>({...f,depositStatus:e.target.value}))} style={inputStyle}>
                    <option value="held">محتجز</option><option value="returned">مُعاد</option><option value="deducted">مخصوم</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>حالة الحجز</label>
                <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={inputStyle}>
                  <option value="confirmed">مؤكد</option><option value="checkedin">وصل</option><option value="checkedout">غادر</option><option value="cancelled">ملغي</option>
                </select>
              </div>
            </div>

            <div style={{display:'flex',gap:'10px',marginTop:'24px'}}>
              <button onClick={saveBooking} disabled={saving}
                style={{flex:1,padding:'13px',background:'#1B4F72',color:'#fff',border:'none',borderRadius:'12px',cursor:'pointer',fontSize:'15px',fontWeight:'600',opacity:saving?0.7:1}}>
                {saving?'جارٍ الحفظ...':editBooking?'حفظ التعديلات':'حفظ الحجز'}
              </button>
              <button onClick={()=>setShowModal(false)} style={{padding:'13px 20px',background:'#f3f4f6',color:'#374151',border:'none',borderRadius:'12px',cursor:'pointer',fontSize:'15px'}}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {display:'block',fontSize:'13px',color:'#374151',marginBottom:'6px',fontWeight:'500'};
const inputStyle: React.CSSProperties = {width:'100%',border:'1.5px solid #e5e7eb',borderRadius:'10px',padding:'11px 14px',fontSize:'14px',boxSizing:'border-box',outline:'none',background:'#fff',fontFamily:'sans-serif'};
