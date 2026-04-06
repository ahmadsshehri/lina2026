'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import {
  collection, getDocs, addDoc, updateDoc,
  doc, query, where, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../../lib/userHelpers';

interface Unit { id: string; unitNumber: string; type: string; }
interface Booking {
  id: string; unitId: string; unitNumber: string; guestName: string;
  guestPhone: string; channel: string; checkinDate: any; checkoutDate: any;
  nights: number; totalRevenue: number; platformFee: number; netRevenue: number;
  depositAmount: number; depositStatus: string; status: string; notes: string;
  receivedBy?: string;
}

const CHANNELS: Record<string, { label: string; color: string; bg: string }> = {
  airbnb:  { label: 'Airbnb',      color: '#991b1b', bg: '#fee2e2' },
  gathern: { label: 'Gathern',     color: '#065f46', bg: '#d1fae5' },
  booking: { label: 'Booking.com', color: '#1e40af', bg: '#dbeafe' },
  direct:  { label: 'مباشر',       color: '#92400e', bg: '#fef3c7' },
  other:   { label: 'أخرى',        color: '#374151', bg: '#f3f4f6' },
};

const STATUS_INFO: Record<string, { label: string; color: string; bg: string }> = {
  confirmed:  { label: '📅 مؤكد (قادم)', color: '#1e40af', bg: '#dbeafe' },
  checkedin:  { label: '✅ وصل',          color: '#065f46', bg: '#d1fae5' },
  checkedout: { label: '🚪 غادر',         color: '#374151', bg: '#f3f4f6' },
  cancelled:  { label: '❌ ملغي',         color: '#991b1b', bg: '#fee2e2' },
};

const DEPOSIT_INFO: Record<string, { label: string; color: string; bg: string }> = {
  held:     { label: 'محتجز',   color: '#92400e', bg: '#fef3c7' },
  returned: { label: '✅ مُعاد', color: '#065f46', bg: '#d1fae5' },
  deducted: { label: '⚠️ مخصوم',color: '#991b1b', bg: '#fee2e2' },
};

function fmtDate(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
}

function isToday(ts: any) {
  if (!ts) return false;
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const t = new Date();
  return d.getDate()===t.getDate() && d.getMonth()===t.getMonth() && d.getFullYear()===t.getFullYear();
}

export default function FurnishedPage() {
  const router = useRouter();
  const [appUser, setAppUser] = useState<AppUserBasic | null>(null);
  const [properties, setProperties] = useState<PropertyBasic[]>([]);
  const [propId, setPropId] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [depositConfirm, setDepositConfirm] = useState<{ booking: Booking; action: 'returned' | 'deducted' } | null>(null);

  const canAddBooking    = appUser?.role === 'owner' || appUser?.role === 'manager';
  const canReturnDeposit = appUser?.role === 'owner' || appUser?.role === 'manager' || appUser?.role === 'accountant';
  const canChangeStatus  = appUser?.role === 'owner' || appUser?.role === 'manager';

  const [form, setForm] = useState({
    unitId: '', guestName: '', guestPhone: '', channel: 'airbnb',
    checkinDate: '', checkoutDate: '', totalRevenue: '', platformFee: '0',
    depositAmount: '0', depositStatus: 'held', status: 'confirmed',
    notes: '', receivedBy: 'manager',
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }
      const user = await getCurrentUser(fbUser.uid);
      if (!user) { router.push('/login'); return; }
      setAppUser(user);
      // تعيين المستلم الافتراضي حسب دور المستخدم
      setForm(f => ({ ...f, receivedBy: user.role === 'owner' ? 'owner' : 'manager' }));
      const props = await loadPropertiesForUser(fbUser.uid, user.role);
      setProperties(props);
      if (props.length > 0) { setPropId(props[0].id); await loadData(props[0].id); }
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
    setBookings(bSnap.docs.map(d => ({ id: d.id, ...d.data() } as Booking))
      .sort((a,b) => (b.checkinDate?.seconds||0) - (a.checkinDate?.seconds||0)));
    if (u.length > 0 && !form.unitId) setForm(f => ({ ...f, unitId: u[0].id }));
  };

  const calcNights = () => {
    if (!form.checkinDate || !form.checkoutDate) return 0;
    return Math.max(0, Math.ceil(
      (new Date(form.checkoutDate).getTime() - new Date(form.checkinDate).getTime()) / 86400000
    ));
  };

  const saveBooking = async () => {
    if (!form.unitId || !form.guestName || !form.checkinDate || !form.checkoutDate) return;
    setSaving(true);
    try {
      const unit = units.find(u => u.id === form.unitId);
      const nights = calcNights();
      const totalRevenue = Number(form.totalRevenue);
      const platformFee  = Number(form.platformFee);
      const data = {
        ...form, propertyId: propId, unitNumber: unit?.unitNumber || '',
        nights, totalRevenue, platformFee, netRevenue: totalRevenue - platformFee,
        nightlyRate: nights > 0 ? totalRevenue / nights : 0,
        depositAmount: Number(form.depositAmount),
        checkinDate:  Timestamp.fromDate(new Date(form.checkinDate)),
        checkoutDate: Timestamp.fromDate(new Date(form.checkoutDate)),
        receivedBy: form.receivedBy,
      };
      if (editBooking) {
        await updateDoc(doc(db,'bookings',editBooking.id), data);
      } else {
        await addDoc(collection(db,'bookings'), { ...data, createdAt: serverTimestamp() });
      }
      await loadData(propId);
      setShowModal(false);
      setEditBooking(null);
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const changeStatus = async (b: Booking, status: string) => {
    await updateDoc(doc(db,'bookings',b.id), { status });
    await loadData(propId);
  };

  const handleDeposit = async () => {
    if (!depositConfirm) return;
    setSaving(true);
    try {
      await updateDoc(doc(db,'bookings',depositConfirm.booking.id), {
        depositStatus: depositConfirm.action,
        depositActionDate: serverTimestamp(),
        depositActionBy: auth.currentUser?.uid,
      });
      await loadData(propId);
      setDepositConfirm(null);
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const openAdd = () => {
    setEditBooking(null);
    setForm({
      unitId: units[0]?.id||'', guestName:'', guestPhone:'', channel:'airbnb',
      checkinDate:'', checkoutDate:'', totalRevenue:'', platformFee:'0',
      depositAmount:'0', depositStatus:'held', status:'confirmed', notes:'',
      receivedBy: appUser?.role === 'owner' ? 'owner' : 'manager',
    });
    setShowModal(true);
  };

  const openEdit = (b: Booking) => {
    setEditBooking(b);
    setForm({
      unitId: b.unitId, guestName: b.guestName, guestPhone: b.guestPhone||'',
      channel: b.channel, checkinDate:'', checkoutDate:'',
      totalRevenue: String(b.totalRevenue), platformFee: String(b.platformFee||0),
      depositAmount: String(b.depositAmount||0), depositStatus: b.depositStatus,
      status: b.status, notes: b.notes||'',
      receivedBy: b.receivedBy || 'manager',
    });
    setShowModal(true);
  };

  const activeBookings  = bookings.filter(b => b.status !== 'cancelled');
  const filtered        = filterStatus === 'all' ? bookings : bookings.filter(b => b.status === filterStatus);
  const totalRevenue    = activeBookings.reduce((s,b) => s+(b.netRevenue||0), 0);
  const pendingDeposits = bookings.filter(b => b.depositStatus==='held' && b.depositAmount>0 && b.status==='checkedout').length;
  const nights          = calcNights();

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh' }}>
      <div style={{ width:'40px', height:'40px', border:'3px solid #1B4F72', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div dir="rtl" style={{ fontFamily:'sans-serif', background:'#f9fafb', minHeight:'100vh' }}>

      {/* Top bar */}
      <div style={{ background:'#1B4F72', padding:'16px 20px', display:'flex', alignItems:'center', gap:'12px', position:'sticky', top:0, zIndex:50 }}>
        <button onClick={() => router.push('/')} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:'8px', padding:'8px 12px', cursor:'pointer' }}>
          <span style={{ color:'#fff', fontSize:'18px' }}>←</span>
        </button>
        <div style={{ flex:1 }}>
          <h1 style={{ margin:0, fontSize:'17px', fontWeight:'600', color:'#fff' }}>الشقق المفروشة</h1>
          <p style={{ margin:0, fontSize:'12px', color:'rgba(255,255,255,0.6)' }}>
            {activeBookings.length} حجز نشط{pendingDeposits > 0 && ` · ${pendingDeposits} تأمين معلق`}
          </p>
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
          {properties.length > 1 && (
            <select value={propId} onChange={e => { setPropId(e.target.value); loadData(e.target.value); }}
              style={{ border:'none', borderRadius:'8px', padding:'6px 10px', fontSize:'12px', background:'rgba(255,255,255,0.15)', color:'#fff' }}>
              {properties.map(p => <option key={p.id} value={p.id} style={{ color:'#000' }}>{p.name}</option>)}
            </select>
          )}
          {canAddBooking && (
            <button onClick={openAdd} style={{ background:'#D4AC0D', border:'none', borderRadius:'10px', padding:'10px 16px', cursor:'pointer', color:'#fff', fontSize:'13px', fontWeight:'600' }}>
              + حجز
            </button>
          )}
        </div>
      </div>

      <div style={{ padding:'16px', maxWidth:'720px', margin:'0 auto' }}>

        {/* KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'16px' }}>
          {[
            { label:'صافي الإيرادات', val:fmt(totalRevenue)+' ر.س', color:'#16a34a', bg:'#d1fae5' },
            { label:'حجوزات نشطة',    val:activeBookings.length+' حجز', color:'#1e40af', bg:'#dbeafe' },
            { label:'تأمين معلق',     val:pendingDeposits+' حجز', color:pendingDeposits>0?'#d97706':'#16a34a', bg:pendingDeposits>0?'#fef3c7':'#d1fae5' },
          ].map(k => (
            <div key={k.label} style={{ background:k.bg, borderRadius:'14px', padding:'14px 12px', textAlign:'center' }}>
              <div style={{ fontSize:'20px', fontWeight:'700', color:k.color }}>{k.val}</div>
              <div style={{ fontSize:'11px', color:'#6b7280', marginTop:'3px' }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Filter chips */}
        <div style={{ display:'flex', gap:'8px', marginBottom:'12px', overflowX:'auto', paddingBottom:'4px' }}>
          {[['all','الكل'],['confirmed','مؤكد'],['checkedin','وصل'],['checkedout','غادر'],['cancelled','ملغي']].map(([v,l]) => (
            <button key={v} onClick={() => setFilterStatus(v)}
              style={{ padding:'7px 14px', borderRadius:'20px', cursor:'pointer', fontSize:'12px', fontWeight:'500', whiteSpace:'nowrap', background:filterStatus===v?'#1B4F72':'#fff', color:filterStatus===v?'#fff':'#374151', border:filterStatus===v?'2px solid #1B4F72':'1px solid #e5e7eb' }}>
              {l}
            </button>
          ))}
        </div>

        {/* قائمة الحجوزات */}
        {filtered.length === 0 ? (
          <div style={{ background:'#fff', borderRadius:'16px', padding:'40px', textAlign:'center', border:'1px solid #e5e7eb' }}>
            <div style={{ fontSize:'48px', marginBottom:'12px' }}>🏨</div>
            <p style={{ color:'#6b7280', fontSize:'14px', margin:'0 0 16px' }}>لا توجد حجوزات</p>
            {canAddBooking && <button onClick={openAdd} style={btn1}>+ إضافة حجز</button>}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            {filtered.map(b => {
              const ch = CHANNELS[b.channel] || CHANNELS.other;
              const st = STATUS_INFO[b.status] || STATUS_INFO.confirmed;
              const dp = DEPOSIT_INFO[b.depositStatus] || DEPOSIT_INFO.held;
              const todayCheckin = b.status === 'confirmed' && isToday(b.checkinDate);
              const rcv = b.receivedBy === 'owner'
                ? { label: 'المالك', color: '#7c3aed', bg: '#ede9fe', icon: '👑' }
                : { label: 'المسؤول', color: '#1e40af', bg: '#dbeafe', icon: '👤' };

              return (
                <div key={b.id} style={{ background:'#fff', borderRadius:'16px', border:`1px solid ${todayCheckin?'#fbbf24':'#e5e7eb'}`, overflow:'hidden', boxShadow: todayCheckin?'0 0 0 2px #fbbf2440':'0 1px 3px rgba(0,0,0,0.04)' }}>

                  {todayCheckin && (
                    <div style={{ background:'#fef3c7', padding:'8px 16px', fontSize:'12px', color:'#92400e', fontWeight:'600', borderBottom:'1px solid #fbbf24' }}>
                      ⏰ وصول اليوم — {b.guestName}
                    </div>
                  )}

                  {/* Header */}
                  <div style={{ padding:'14px 16px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:'10px' }}>
                    <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:ch.color, flexShrink:0 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'15px', fontWeight:'600', color:'#111827' }}>{b.guestName}</div>
                      <div style={{ fontSize:'12px', color:'#6b7280' }}>{b.guestPhone || '—'}</div>
                    </div>
                    <span style={{ background:ch.bg, color:ch.color, padding:'4px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'600' }}>{ch.label}</span>
                  </div>

                  {/* Body */}
                  <div style={{ padding:'14px 16px' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px', marginBottom:'12px' }}>
                      <div style={{ textAlign:'center' }}>
                        <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'3px' }}>الشقة</div>
                        <div style={{ fontSize:'20px', fontWeight:'700', color:'#1B4F72' }}>{b.unitNumber}</div>
                      </div>
                      <div style={{ textAlign:'center' }}>
                        <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'3px' }}>المدة</div>
                        <div style={{ fontSize:'12px', fontWeight:'600', color:'#374151' }}>{fmtDate(b.checkinDate)} → {fmtDate(b.checkoutDate)}</div>
                        <div style={{ fontSize:'11px', color:'#6b7280' }}>{b.nights} ليلة</div>
                      </div>
                      <div style={{ textAlign:'center' }}>
                        <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'3px' }}>الصافي</div>
                        <div style={{ fontSize:'16px', fontWeight:'700', color:'#16a34a' }}>{b.netRevenue?.toLocaleString('ar-SA')}</div>
                        <div style={{ fontSize:'11px', color:'#6b7280' }}>ر.س</div>
                      </div>
                    </div>

                    {/* الحالة + مستلم المبلغ + التأمين */}
                    <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'12px', alignItems:'center' }}>
                      <span style={{ background:st.bg, color:st.color, padding:'4px 12px', borderRadius:'10px', fontSize:'12px', fontWeight:'600' }}>{st.label}</span>

                      {/* مستلم المبلغ */}
                      {b.receivedBy && (
                        <span style={{ background:rcv.bg, color:rcv.color, padding:'4px 10px', borderRadius:'10px', fontSize:'11px', fontWeight:'600', display:'flex', alignItems:'center', gap:'4px' }}>
                          {rcv.icon} استلمه {rcv.label}
                        </span>
                      )}

                      {/* التأمين */}
                      {b.depositAmount > 0 && (
                        <div style={{ display:'flex', alignItems:'center', gap:'6px', background:dp.bg, border:`1px solid ${dp.color}30`, borderRadius:'10px', padding:'4px 12px' }}>
                          <span style={{ fontSize:'16px' }}>🔒</span>
                          <div>
                            <div style={{ fontSize:'11px', color:dp.color, fontWeight:'600' }}>تأمين: {dp.label}</div>
                            <div style={{ fontSize:'12px', color:'#374151', fontWeight:'700' }}>{b.depositAmount?.toLocaleString('ar-SA')} ر.س</div>
                          </div>
                          {canReturnDeposit && b.depositStatus === 'held' && b.status === 'checkedout' && (
                            <div style={{ display:'flex', gap:'4px', marginRight:'6px' }}>
                              <button onClick={() => setDepositConfirm({ booking:b, action:'returned' })}
                                style={{ padding:'3px 10px', background:'#d1fae5', color:'#065f46', border:'1px solid #6ee7b7', borderRadius:'6px', cursor:'pointer', fontSize:'11px', fontWeight:'600' }}>
                                ↩️ إعادة
                              </button>
                              <button onClick={() => setDepositConfirm({ booking:b, action:'deducted' })}
                                style={{ padding:'3px 10px', background:'#fee2e2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:'6px', cursor:'pointer', fontSize:'11px', fontWeight:'600' }}>
                                ✂️ خصم
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* أزرار الإجراءات */}
                    {canChangeStatus && (
                      <div style={{ display:'flex', gap:'8px' }}>
                        {b.status === 'confirmed' && todayCheckin && (
                          <>
                            <button onClick={() => changeStatus(b,'checkedin')}
                              style={{ flex:1, padding:'9px', background:'#d1fae5', color:'#065f46', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'600' }}>
                              ✅ سجّل الوصول
                            </button>
                            <button onClick={() => changeStatus(b,'cancelled')}
                              style={{ padding:'9px 14px', background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'600' }}>
                              ❌ إلغاء
                            </button>
                          </>
                        )}
                        {b.status === 'checkedin' && (
                          <button onClick={() => changeStatus(b,'checkedout')}
                            style={{ flex:1, padding:'9px', background:'#f3f4f6', color:'#374151', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'600' }}>
                            🚪 سجّل المغادرة
                          </button>
                        )}
                        <button onClick={() => openEdit(b)}
                          style={{ padding:'9px 16px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:'8px', cursor:'pointer', fontSize:'13px' }}>
                          تعديل
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal إضافة/تعديل حجز */}
      {showModal && (
        <div style={{ position:'fixed', inset:'0', background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }}
          onClick={() => setShowModal(false)}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'24px', width:'100%', maxWidth:'500px', maxHeight:'90vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ margin:0, fontSize:'17px', color:'#1B4F72', fontWeight:'600' }}>{editBooking ? 'تعديل حجز' : 'حجز جديد'}</h2>
              <button onClick={() => setShowModal(false)} style={{ border:'none', background:'#f3f4f6', borderRadius:'50%', width:'32px', height:'32px', cursor:'pointer', fontSize:'16px' }}>✕</button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>

              {/* الشقة */}
              <div>
                <label style={lbl}>الشقة</label>
                <select value={form.unitId} onChange={e => setForm(f => ({ ...f, unitId:e.target.value }))} style={inp}>
                  {units.map(u => <option key={u.id} value={u.id}>شقة {u.unitNumber}</option>)}
                </select>
              </div>

              {/* المنصة */}
              <div>
                <label style={lbl}>المنصة</label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
                  {Object.entries(CHANNELS).map(([k,v]) => (
                    <button key={k} onClick={() => setForm(f => ({ ...f, channel:k }))}
                      style={{ padding:'8px 4px', border:`2px solid ${form.channel===k?v.color:'#e5e7eb'}`, borderRadius:'10px', background:form.channel===k?v.bg:'#fff', cursor:'pointer', fontSize:'12px', fontWeight:'600', color:v.color }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* الضيف */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div>
                  <label style={lbl}>اسم الضيف</label>
                  <input value={form.guestName} onChange={e => setForm(f => ({ ...f, guestName:e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>رقم الجوال</label>
                  <input value={form.guestPhone} onChange={e => setForm(f => ({ ...f, guestPhone:e.target.value }))} style={inp} />
                </div>
              </div>

              {/* التواريخ */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div>
                  <label style={lbl}>تاريخ الوصول</label>
                  <input type="date" value={form.checkinDate} onChange={e => setForm(f => ({ ...f, checkinDate:e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>تاريخ المغادرة</label>
                  <input type="date" value={form.checkoutDate} onChange={e => setForm(f => ({ ...f, checkoutDate:e.target.value }))} style={inp} />
                </div>
              </div>

              {nights > 0 && (
                <div style={{ background:'#dbeafe', borderRadius:'10px', padding:'10px', textAlign:'center', fontSize:'14px', color:'#1e40af', fontWeight:'600' }}>
                  {nights} ليلة
                </div>
              )}

              {/* الإيرادات */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div>
                  <label style={lbl}>الإيراد الإجمالي (ر.س)</label>
                  <input type="number" value={form.totalRevenue} onChange={e => setForm(f => ({ ...f, totalRevenue:e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>عمولة المنصة (ر.س)</label>
                  <input type="number" value={form.platformFee} onChange={e => setForm(f => ({ ...f, platformFee:e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>مبلغ التأمين (ر.س)</label>
                  <input type="number" value={form.depositAmount} onChange={e => setForm(f => ({ ...f, depositAmount:e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>حالة التأمين</label>
                  <select value={form.depositStatus} onChange={e => setForm(f => ({ ...f, depositStatus:e.target.value }))} style={inp}>
                    <option value="held">محتجز</option>
                    <option value="returned">مُعاد</option>
                    <option value="deducted">مخصوم</option>
                  </select>
                </div>
              </div>

              {/* ── مستلم المبلغ ── */}
              <div>
                <label style={{ ...lbl, fontWeight:'600' }}>💰 من استلم المبلغ؟</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                  {[
                    { val:'manager', label:'مسؤول العقار', icon:'👤', color:'#1e40af', bg:'#dbeafe' },
                    { val:'owner',   label:'المالك',        icon:'👑', color:'#7c3aed', bg:'#ede9fe' },
                  ].map(opt => (
                    <button key={opt.val} onClick={() => setForm(f => ({ ...f, receivedBy:opt.val }))}
                      style={{ padding:'12px 8px', border:`2px solid ${form.receivedBy===opt.val?opt.color:'#e5e7eb'}`, borderRadius:'12px', background:form.receivedBy===opt.val?opt.bg:'#fff', cursor:'pointer', textAlign:'center', transition:'all 0.15s' }}>
                      <div style={{ fontSize:'22px', marginBottom:'4px' }}>{opt.icon}</div>
                      <div style={{ fontSize:'13px', fontWeight:'600', color:form.receivedBy===opt.val?opt.color:'#374151' }}>{opt.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* حالة الحجز */}
              <div>
                <label style={lbl}>حالة الحجز</label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'6px' }}>
                  {Object.entries(STATUS_INFO).map(([k,v]) => (
                    <button key={k} onClick={() => setForm(f => ({ ...f, status:k }))}
                      style={{ padding:'8px 4px', border:`2px solid ${form.status===k?v.color:'#e5e7eb'}`, borderRadius:'8px', background:form.status===k?v.bg:'#fff', cursor:'pointer', fontSize:'11px', fontWeight:'600', color:v.color }}>
                      {v.label.replace(/[📅✅🚪❌]/g,'')}
                    </button>
                  ))}
                </div>
              </div>

              {/* ملاحظات */}
              <div>
                <label style={lbl}>ملاحظات</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes:e.target.value }))} rows={2} style={{ ...inp, resize:'none' }} />
              </div>

              {/* صافي محسوب */}
              {form.totalRevenue && (
                <div style={{ background:'#f0fdf4', borderRadius:'10px', padding:'10px 14px', display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontSize:'13px', color:'#6b7280' }}>صافي الإيراد المحسوب</span>
                  <span style={{ fontSize:'14px', fontWeight:'700', color:'#16a34a' }}>
                    {(Number(form.totalRevenue) - Number(form.platformFee)).toLocaleString('ar-SA')} ر.س
                  </span>
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:'10px', marginTop:'24px' }}>
              <button onClick={saveBooking} disabled={saving}
                style={{ flex:1, padding:'13px', background:saving?'#9ca3af':'#1B4F72', color:'#fff', border:'none', borderRadius:'12px', cursor:saving?'not-allowed':'pointer', fontSize:'15px', fontWeight:'600' }}>
                {saving ? 'جارٍ الحفظ...' : editBooking ? 'حفظ التعديلات' : 'حفظ الحجز'}
              </button>
              <button onClick={() => setShowModal(false)}
                style={{ padding:'13px 20px', background:'#f3f4f6', color:'#374151', border:'none', borderRadius:'12px', cursor:'pointer', fontSize:'15px' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal تأكيد التأمين */}
      {depositConfirm && (
        <div style={{ position:'fixed', inset:'0', background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'#fff', borderRadius:'16px', padding:'24px', width:'380px', maxWidth:'95vw', textAlign:'center' }}>
            <div style={{ fontSize:'48px', marginBottom:'12px' }}>
              {depositConfirm.action === 'returned' ? '↩️' : '✂️'}
            </div>
            <h3 style={{ margin:'0 0 8px', color:'#1B4F72' }}>
              {depositConfirm.action === 'returned' ? 'إعادة التأمين' : 'خصم التأمين'}
            </h3>
            <p style={{ color:'#6b7280', fontSize:'13px', marginBottom:'6px' }}>
              الضيف: <strong>{depositConfirm.booking.guestName}</strong>
            </p>
            <p style={{ color:'#374151', fontSize:'16px', fontWeight:'700', marginBottom:'20px' }}>
              {depositConfirm.booking.depositAmount?.toLocaleString('ar-SA')} ر.س
            </p>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={handleDeposit} disabled={saving}
                style={{ flex:1, padding:'12px', background:depositConfirm.action==='returned'?'#16a34a':'#dc2626', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'14px', fontWeight:'600' }}>
                {saving ? 'جارٍ...' : depositConfirm.action==='returned' ? 'تأكيد الإعادة' : 'تأكيد الخصم'}
              </button>
              <button onClick={() => setDepositConfirm(null)}
                style={{ padding:'12px 20px', background:'#f3f4f6', color:'#374151', border:'none', borderRadius:'10px', cursor:'pointer' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(n: number) { return n.toLocaleString('ar-SA'); }
const lbl: React.CSSProperties = { display:'block', fontSize:'13px', color:'#374151', marginBottom:'6px', fontWeight:'500' };
const inp: React.CSSProperties = { width:'100%', border:'1.5px solid #e5e7eb', borderRadius:'10px', padding:'11px 14px', fontSize:'14px', boxSizing:'border-box', background:'#fff' };
const btn1: React.CSSProperties = { padding:'10px 20px', background:'#1B4F72', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'14px' };
