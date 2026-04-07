'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../../lib/userHelpers';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Transfer {
  id: string; type: string; amount: number; date: any;
  fromUser: string; toUser: string; paymentMethod: string; notes: string;
}
interface PaymentDetail {
  id: string; tenantName: string; unitNumber: string;
  amountPaid: number; paidDate: any; paymentMethod: string;
  receivedBy: string;
}
interface BookingDetail {
  id: string; guestName: string; unitNumber: string;
  netRevenue: number; checkinDate: any; channel: string;
  receivedBy: string;
}
interface MonthReport {
  rentReceivedByManager: number; rentReceivedByOwner: number;
  furnishedRevenue: number; furnishedByManager: number; furnishedByOwner: number;
  totalRevenue: number;
  expensesByManager: number; expensesByOwner: number;
  totalExpenses: number; netProfit: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}
function toInputDate(ts: any) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
const CH_LABEL: Record<string,string> = {
  airbnb:'Airbnb', gathern:'Gathern', booking:'Booking.com', direct:'مباشر', other:'أخرى',
};

const EMPTY_FORM = {
  type:'owner_transfer', amount:'',
  date: new Date().toISOString().split('T')[0],
  paymentMethod:'transfer', notes:'',
};

// ─── Tooltip Component ────────────────────────────────────────────────────────
interface TooltipItem {
  label: string;
  sub: string;
  amount: number;
  date?: any;
  positive?: boolean;
}
interface TooltipProps {
  items: TooltipItem[];
  total: number;
  title: string;
  color: string;
  bg: string;
  empty: string;
}

function DetailTooltip({ items, total, title, color, bg, empty }: TooltipProps) {
  const [visible, setVisible]   = useState(false);
  const [pos,     setPos]       = useState<{ top: number; left: number; placement: 'top'|'bottom' }>({ top:0, left:0, placement:'bottom' });
  const triggerRef              = useRef<HTMLButtonElement>(null);
  const tooltipRef              = useRef<HTMLDivElement>(null);
  const timerRef                = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback(() => {
    clearTimeout(timerRef.current);
    if (!triggerRef.current) return;
    const rect   = triggerRef.current.getBoundingClientRect();
    const spaceB = window.innerHeight - rect.bottom;
    const spaceT = rect.top;
    const placement = spaceB < 280 && spaceT > spaceB ? 'top' : 'bottom';
    setPos({
      top:  placement === 'bottom' ? rect.bottom + 8 : rect.top - 8,
      left: Math.min(Math.max(rect.left + rect.width/2, 160), window.innerWidth - 160),
      placement,
    });
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(false), 150);
  }, []);

  const keepOpen = useCallback(() => {
    clearTimeout(timerRef.current);
  }, []);

  return (
    <>
      {/* Trigger — lens icon */}
      <button
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '2px 4px', borderRadius: '6px',
          display: 'inline-flex', alignItems: 'center',
          color: '#9ca3af', fontSize: '15px',
          transition: 'color 0.15s, background 0.15s',
          verticalAlign: 'middle',
        }}
        onMouseOver={e => { e.currentTarget.style.color = color; e.currentTarget.style.background = bg; }}
        onMouseOut={e  => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'none'; }}
        aria-label="عرض التفاصيل"
        title="عرض التفاصيل"
      >
        🔍
      </button>

      {/* Tooltip Portal-like fixed div */}
      {visible && (
        <div
          ref={tooltipRef}
          onMouseEnter={keepOpen}
          onMouseLeave={hide}
          style={{
            position:    'fixed',
            top:         pos.placement === 'bottom' ? pos.top  : 'auto',
            bottom:      pos.placement === 'top'    ? window.innerHeight - pos.top : 'auto',
            left:        pos.left,
            transform:   'translateX(-50%)',
            zIndex:      9999,
            width:       '300px',
            background:  '#fff',
            borderRadius: '14px',
            border:      `1.5px solid ${color}40`,
            boxShadow:   '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
            padding:     '0',
            overflow:    'hidden',
            animation:   'tooltipIn 0.18s cubic-bezier(0.34,1.4,0.64,1) both',
          }}
        >
          <style>{`
            @keyframes tooltipIn {
              from { opacity:0; transform:translateX(-50%) scale(0.92); }
              to   { opacity:1; transform:translateX(-50%) scale(1); }
            }
            /* Arrow */
            .tt-arrow {
              position: absolute;
              left: 50%; transform: translateX(-50%);
              width: 0; height: 0;
            }
            .tt-arrow-bottom {
              top: -7px;
              border-left: 7px solid transparent;
              border-right: 7px solid transparent;
              border-bottom: 7px solid ${color}40;
            }
            .tt-arrow-top {
              bottom: -7px;
              border-left: 7px solid transparent;
              border-right: 7px solid transparent;
              border-top: 7px solid ${color}40;
            }
          `}</style>

          {/* Arrow */}
          <div className={`tt-arrow ${pos.placement==='bottom'?'tt-arrow-bottom':'tt-arrow-top'}`}/>

          {/* Header */}
          <div style={{ background: bg, padding: '10px 14px', borderBottom: `1px solid ${color}20`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'13px', fontWeight:'700', color: color }}>{title}</span>
            <span style={{ fontSize:'14px', fontWeight:'800', color: color }}>
              {total.toLocaleString('ar-SA')} ر.س
            </span>
          </div>

          {/* Items */}
          <div style={{ maxHeight:'220px', overflowY:'auto', direction:'rtl' }}>
            {items.length === 0 ? (
              <div style={{ padding:'20px', textAlign:'center', color:'#9ca3af', fontSize:'13px' }}>
                {empty}
              </div>
            ) : (
              items.map((item, i) => (
                <div key={i} style={{ padding:'9px 14px', borderBottom: i<items.length-1 ? '1px solid #f3f4f6':'none', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'12px', fontWeight:'600', color:'#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.label}</div>
                    <div style={{ fontSize:'11px', color:'#9ca3af', marginTop:'1px' }}>{item.sub}</div>
                  </div>
                  <div style={{ textAlign:'left', flexShrink:0 }}>
                    <div style={{ fontSize:'13px', fontWeight:'700', color: item.positive===false ? '#dc2626' : '#16a34a' }}>
                      {item.positive===false ? '−' : '+'} {item.amount.toLocaleString('ar-SA')}
                    </div>
                    {item.date && (
                      <div style={{ fontSize:'10px', color:'#9ca3af' }}>{fmtDate(item.date)}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer total */}
          {items.length > 0 && (
            <div style={{ padding:'8px 14px', background:'#f9fafb', borderTop:`1px solid ${color}20`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:'12px', color:'#6b7280' }}>{items.length} معاملة</span>
              <span style={{ fontSize:'13px', fontWeight:'700', color: color }}>
                {total.toLocaleString('ar-SA')} ر.س
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CashflowPage() {
  const router = useRouter();
  const [appUser,        setAppUser]        = useState<AppUserBasic | null>(null);
  const [properties,     setProperties]     = useState<PropertyBasic[]>([]);
  const [propId,         setPropId]         = useState('');
  const [transfers,      setTransfers]      = useState<Transfer[]>([]);
  const [report,         setReport]         = useState<MonthReport | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [showModal,      setShowModal]      = useState(false);
  const [editTransfer,   setEditTransfer]   = useState<Transfer | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [selectedMonth,  setSelectedMonth]  = useState(currentMonthStr());
  const [form,           setForm]           = useState(EMPTY_FORM);
  const [deleteConfirm,  setDeleteConfirm]  = useState<Transfer | null>(null);

  // ── Detailed items for tooltips ──────────────────────────────────────────
  const [managerRentItems,     setManagerRentItems]     = useState<TooltipItem[]>([]);
  const [ownerRentItems,       setOwnerRentItems]       = useState<TooltipItem[]>([]);
  const [managerFurnItems,     setManagerFurnItems]     = useState<TooltipItem[]>([]);
  const [ownerFurnItems,       setOwnerFurnItems]       = useState<TooltipItem[]>([]);
  const [managerExpItems,      setManagerExpItems]      = useState<TooltipItem[]>([]);
  const [ownerExpItems,        setOwnerExpItems]        = useState<TooltipItem[]>([]);

  const canEdit = appUser?.role === 'owner' || appUser?.role === 'manager';

  // ─── Auth & Load ──────────────────────────────────────────────────────────
  // نحتفظ بـ propId و selectedMonth في ref حتى يصلهما listener
  const propIdRef        = useRef('');
  const selectedMonthRef = useRef(currentMonthStr());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }
      const user = await getCurrentUser(fbUser.uid);
      if (!user)  { router.push('/login'); return; }
      setAppUser(user);
      const props = await loadPropertiesForUser(fbUser.uid, user.role);
      setProperties(props);
      if (props.length > 0) {
        setPropId(props[0].id);
        propIdRef.current = props[0].id;
        await loadData(props[0].id, currentMonthStr());
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // ✅ إعادة التحميل التلقائية عند العودة للصفحة (بعد حذف دفعة في صفحة أخرى)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && propIdRef.current) {
        loadData(propIdRef.current, selectedMonthRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // ✅ تزامن الـ refs مع الـ state
  useEffect(() => { propIdRef.current = propId; },        [propId]);
  useEffect(() => { selectedMonthRef.current = selectedMonth; }, [selectedMonth]);

  const loadData = async (pid: string, month: string) => {
    const [y, m] = month.split('-').map(Number);
    const start  = new Date(y, m-1, 1);
    const end    = new Date(y, m, 0, 23, 59, 59);

    const [tSnap, paySnap, bookSnap, expSnap] = await Promise.all([
      getDocs(query(collection(db,'transfers'),    where('propertyId','==',pid))),
      getDocs(query(collection(db,'rentPayments'), where('propertyId','==',pid))),
      getDocs(query(collection(db,'bookings'),     where('propertyId','==',pid))),
      getDocs(query(collection(db,'expenses'),     where('propertyId','==',pid))),
    ]);

    // ── Transfers ──────────────────────────────────────────────────────────
    const monthTransfers = tSnap.docs
      .map(d => ({ id:d.id, ...d.data() } as Transfer))
      .filter(t => { const d = t.date?.toDate?t.date.toDate():new Date(t.date); return d>=start&&d<=end; })
      .sort((a,b) => (b.date?.seconds||0)-(a.date?.seconds||0));
    setTransfers(monthTransfers);

    // ── Rent Payments ──────────────────────────────────────────────────────
    const monthPay = paySnap.docs.map(d=>d.data() as any)
      .filter(p => { const d=p.paidDate?.toDate?p.paidDate.toDate():null; return d&&d>=start&&d<=end; });

    const mgrRentPays = monthPay.filter(p => p.receivedBy !== 'owner');
    const ownRentPays = monthPay.filter(p => p.receivedBy === 'owner');

    setManagerRentItems(mgrRentPays.map(p => ({
      label: p.tenantName  || '—',
      sub:   `شقة ${p.unitNumber||'—'} · ${p.paymentMethod==='transfer'?'تحويل':p.paymentMethod==='cash'?'كاش':'إيجار'}`,
      amount: p.amountPaid || 0,
      date:   p.paidDate,
      positive: true,
    })));
    setOwnerRentItems(ownRentPays.map(p => ({
      label: p.tenantName || '—',
      sub:   `شقة ${p.unitNumber||'—'} · ${p.paymentMethod==='transfer'?'تحويل':p.paymentMethod==='cash'?'كاش':'إيجار'}`,
      amount: p.amountPaid || 0,
      date:   p.paidDate,
      positive: true,
    })));

    // ── Bookings ───────────────────────────────────────────────────────────
    const monthBook = bookSnap.docs.map(d=>d.data() as any)
      .filter(b => { if(b.status==='cancelled')return false; const d=b.checkinDate?.toDate?b.checkinDate.toDate():null; return d&&d>=start&&d<=end; });

    const mgrBookings = monthBook.filter(b => b.receivedBy !== 'owner');
    const ownBookings = monthBook.filter(b => b.receivedBy === 'owner');

    setManagerFurnItems(mgrBookings.map(b => ({
      label: b.guestName  || '—',
      sub:   `شقة ${b.unitNumber||'—'} · ${CH_LABEL[b.channel]||b.channel||'—'}`,
      amount: b.netRevenue || 0,
      date:   b.checkinDate,
      positive: true,
    })));
    setOwnerFurnItems(ownBookings.map(b => ({
      label: b.guestName || '—',
      sub:   `شقة ${b.unitNumber||'—'} · ${CH_LABEL[b.channel]||b.channel||'—'}`,
      amount: b.netRevenue || 0,
      date:   b.checkinDate,
      positive: true,
    })));

    // ── Expenses ───────────────────────────────────────────────────────────
    const monthExp = expSnap.docs.map(d=>d.data() as any)
      .filter(e => { const d=e.date?.toDate?e.date.toDate():null; return d&&d>=start&&d<=end; });

    const mgrExps = monthExp.filter(e => e.paidBy !== 'owner');
    const ownExps = monthExp.filter(e => e.paidBy === 'owner');

    const CAT: Record<string,string> = { electricity:'كهرباء', water:'مياه', maintenance:'صيانة', salary:'راتب', cleaning:'نظافة', other:'أخرى' };

    setManagerExpItems(mgrExps.map(e => ({
      label: e.subcategory || CAT[e.category] || '—',
      sub:   `${CAT[e.category]||e.category} · ${e.paymentMethod==='transfer'?'تحويل':'كاش'}`,
      amount: e.amount || 0,
      date:   e.date,
      positive: false,
    })));
    setOwnerExpItems(ownExps.map(e => ({
      label: e.subcategory || CAT[e.category] || '—',
      sub:   `${CAT[e.category]||e.category} · ${e.paymentMethod==='transfer'?'تحويل':'كاش'}`,
      amount: e.amount || 0,
      date:   e.date,
      positive: false,
    })));

    // ── Report ─────────────────────────────────────────────────────────────
    const rentReceivedByManager = mgrRentPays.reduce((s:number,p:any)=>s+(p.amountPaid||0),0);
    const rentReceivedByOwner   = ownRentPays.reduce((s:number,p:any)=>s+(p.amountPaid||0),0);
    const furnishedByManager    = mgrBookings.reduce((s:number,b:any)=>s+(b.netRevenue||0),0);
    const furnishedByOwner      = ownBookings.reduce((s:number,b:any)=>s+(b.netRevenue||0),0);
    const furnishedRevenue      = furnishedByManager + furnishedByOwner;
    const expensesByManager     = mgrExps.reduce((s:number,e:any)=>s+(e.amount||0),0);
    const expensesByOwner       = ownExps.reduce((s:number,e:any)=>s+(e.amount||0),0);
    const totalRevenue          = rentReceivedByManager+rentReceivedByOwner+furnishedRevenue;
    const totalExpenses         = expensesByManager+expensesByOwner;

    setReport({ rentReceivedByManager, rentReceivedByOwner, furnishedRevenue, furnishedByManager, furnishedByOwner, totalRevenue, expensesByManager, expensesByOwner, totalExpenses, netProfit:totalRevenue-totalExpenses });
  };

  const openAdd = () => { setEditTransfer(null); setForm(EMPTY_FORM); setShowModal(true); };

  const openEdit = (t: Transfer) => {
    setEditTransfer(t);
    setForm({ type:t.type, amount:String(t.amount), date:toInputDate(t.date), paymentMethod:t.paymentMethod, notes:t.notes||'' });
    setShowModal(true);
  };

  const saveTransfer = async () => {
    if (!form.amount || !propId) return;
    setSaving(true);
    try {
      const data = {
        propertyId:    propId,
        type:          form.type,
        amount:        Number(form.amount),
        date:          Timestamp.fromDate(new Date(form.date)),
        fromUser:      form.type==='owner_transfer' ? 'مسؤول العقار' : 'المالك',
        toUser:        form.type==='owner_transfer' ? 'المالك'        : 'مسؤول العقار',
        paymentMethod: form.paymentMethod,
        notes:         form.notes,
      };
      if (editTransfer) {
        await updateDoc(doc(db,'transfers',editTransfer.id), data);
      } else {
        await addDoc(collection(db,'transfers'), { ...data, createdAt:serverTimestamp() });
      }
      await loadData(propId, selectedMonth);
      setShowModal(false); setEditTransfer(null); setForm(EMPTY_FORM);
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const deleteTransfer = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db,'transfers',deleteConfirm.id));
      await loadData(propId, selectedMonth);
      setDeleteConfirm(null);
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const totalTransferredToOwner = transfers.filter(t=>t.type==='owner_transfer').reduce((s,t)=>s+t.amount,0);
  const dueToOwner   = (report?.rentReceivedByManager||0)+(report?.furnishedByManager||0)-(report?.expensesByManager||0);
  const remaining    = dueToOwner - totalTransferredToOwner;

  const monthOptions = Array.from({ length:12 }, (_,i) => {
    const d = new Date(); d.setMonth(d.getMonth()-i);
    return { val:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label:d.toLocaleDateString('ar-SA',{year:'numeric',month:'long'}) };
  });

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh' }}>
      <div style={{ width:'40px', height:'40px', border:'3px solid #1B4F72', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" style={{ fontFamily:'sans-serif', background:'#f9fafb', minHeight:'100vh' }}>

      {/* ══ Top Bar ══ */}
      <div style={{ background:'#1B4F72', padding:'16px 20px', display:'flex', alignItems:'center', gap:'12px', position:'sticky', top:0, zIndex:50 }}>
        <button onClick={() => router.push('/')} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:'8px', padding:'8px 12px', cursor:'pointer' }}>
          <span style={{ color:'#fff', fontSize:'18px' }}>←</span>
        </button>
        <div style={{ flex:1 }}>
          <h1 style={{ margin:0, fontSize:'17px', fontWeight:'600', color:'#fff' }}>التدفق النقدي</h1>
          <p style={{ margin:0, fontSize:'12px', color:'rgba(255,255,255,0.6)' }}>التسويات والتحويلات</p>
        </div>
        {canEdit && (
          <button onClick={openAdd} style={{ background:'#D4AC0D', border:'none', borderRadius:'10px', padding:'10px 14px', cursor:'pointer', color:'#fff', fontSize:'13px', fontWeight:'600', fontFamily:'sans-serif' }}>
            + تحويل
          </button>
        )}
        {/* زر تحديث يدوي */}
        <button
          onClick={() => propId && loadData(propId, selectedMonth)}
          title="تحديث البيانات"
          style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:'8px', padding:'8px 10px', cursor:'pointer', color:'#fff', fontSize:'16px' }}
        >
          🔄
        </button>
      </div>

      <div style={{ padding:'16px', maxWidth:'700px', margin:'0 auto' }}>

        {/* Filters */}
        <div style={{ display:'grid', gridTemplateColumns:properties.length>1?'1fr 1fr':'1fr', gap:'10px', marginBottom:'16px' }}>
          {properties.length>1 && (
            <select value={propId} onChange={e=>{setPropId(e.target.value);loadData(e.target.value,selectedMonth);}} style={selStyle}>
              {properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <select value={selectedMonth} onChange={e=>{setSelectedMonth(e.target.value);loadData(propId,e.target.value);}} style={selStyle}>
            {monthOptions.map(m=><option key={m.val} value={m.val}>{m.label}</option>)}
          </select>
        </div>

        {/* ══ Cash Flow Report Card ══ */}
        <div style={{ background:'#fff', borderRadius:'16px', border:'1px solid #e5e7eb', padding:'20px', marginBottom:'16px' }}>
          <div style={{ fontSize:'15px', fontWeight:'700', color:'#1B4F72', marginBottom:'16px' }}>
            قائمة التدفق النقدي — {monthOptions.find(m=>m.val===selectedMonth)?.label}
          </div>

          {/* ── إيرادات ── */}
          <SectionTitle label="الإيرادات" bg="#d1fae5" color="#065f46"/>

          {/* إيجار مسؤول */}
          <RowWithTooltip
            label="إيجار استلمه مسؤول العقار"
            value={report?.rentReceivedByManager||0}
            positive
            tag="مسؤول" tagColor="#1e40af" tagBg="#dbeafe"
            tooltip={
              <DetailTooltip
                title="إيجار — المسؤول"
                items={managerRentItems}
                total={report?.rentReceivedByManager||0}
                color="#1e40af" bg="#dbeafe"
                empty="لا توجد دفعات إيجار استلمها المسؤول"
              />
            }
          />

          {/* إيجار مالك */}
          <RowWithTooltip
            label="إيجار استلمه المالك مباشرة"
            value={report?.rentReceivedByOwner||0}
            positive
            tag="مالك" tagColor="#7c3aed" tagBg="#ede9fe"
            tooltip={
              <DetailTooltip
                title="إيجار — المالك"
                items={ownerRentItems}
                total={report?.rentReceivedByOwner||0}
                color="#7c3aed" bg="#ede9fe"
                empty="لا توجد دفعات إيجار استلمها المالك مباشرة"
              />
            }
          />

          {/* مفروش مسؤول */}
          <RowWithTooltip
            label="إيرادات مفروشة — مسؤول العقار"
            value={report?.furnishedByManager||0}
            positive
            tag="مسؤول" tagColor="#065f46" tagBg="#d1fae5"
            tooltip={
              <DetailTooltip
                title="مفروشة — المسؤول"
                items={managerFurnItems}
                total={report?.furnishedByManager||0}
                color="#065f46" bg="#d1fae5"
                empty="لا توجد إيرادات مفروشة استلمها المسؤول"
              />
            }
          />

          {/* مفروش مالك */}
          <RowWithTooltip
            label="إيرادات مفروشة — المالك"
            value={report?.furnishedByOwner||0}
            positive
            tag="مالك" tagColor="#7c3aed" tagBg="#ede9fe"
            tooltip={
              <DetailTooltip
                title="مفروشة — المالك"
                items={ownerFurnItems}
                total={report?.furnishedByOwner||0}
                color="#7c3aed" bg="#ede9fe"
                empty="لا توجد إيرادات مفروشة استلمها المالك"
              />
            }
          />

          <Total label="إجمالي الإيرادات" value={report?.totalRevenue||0} positive/>

          {/* ── مصاريف ── */}
          <div style={{ height:'10px' }}/>
          <SectionTitle label="المصاريف" bg="#fee2e2" color="#991b1b"/>

          {/* مصاريف مسؤول */}
          <RowWithTooltip
            label="مصاريف دفعها مسؤول العقار"
            value={report?.expensesByManager||0}
            positive={false}
            tag="مسؤول" tagColor="#1e40af" tagBg="#dbeafe"
            tooltip={
              <DetailTooltip
                title="مصاريف — المسؤول"
                items={managerExpItems}
                total={report?.expensesByManager||0}
                color="#1e40af" bg="#dbeafe"
                empty="لا توجد مصاريف دفعها المسؤول"
              />
            }
          />

          {/* مصاريف مالك */}
          <RowWithTooltip
            label="مصاريف دفعها المالك مباشرة"
            value={report?.expensesByOwner||0}
            positive={false}
            tag="مالك" tagColor="#7c3aed" tagBg="#ede9fe"
            tooltip={
              <DetailTooltip
                title="مصاريف — المالك"
                items={ownerExpItems}
                total={report?.expensesByOwner||0}
                color="#7c3aed" bg="#ede9fe"
                empty="لا توجد مصاريف دفعها المالك مباشرة"
              />
            }
          />

          <Total label="إجمالي المصاريف" value={report?.totalExpenses||0} positive={false}/>

          {/* ── صافي ── */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px', background:(report?.netProfit||0)>=0?'#f0fdf4':'#fef2f2', borderRadius:'12px', margin:'12px 0' }}>
            <span style={{ fontSize:'14px', fontWeight:'700', color:'#374151' }}>صافي الشهر</span>
            <span style={{ fontSize:'22px', fontWeight:'700', color:(report?.netProfit||0)>=0?'#16a34a':'#dc2626' }}>
              {(report?.netProfit||0).toLocaleString('ar-SA')} ر.س
            </span>
          </div>

          {/* ── تسوية مع المسؤول ── */}
          <div style={{ background:'#f8fafc', borderRadius:'12px', padding:'14px', border:'1px solid #e2e8f0' }}>
            <div style={{ fontSize:'12px', fontWeight:'700', color:'#374151', marginBottom:'10px' }}>تسوية مع مسؤول العقار</div>
            {[
              { l:'إيجار استلمه المسؤول',   v:report?.rentReceivedByManager||0,  pos:true },
              { l:'مفروشة استلمها المسؤول', v:report?.furnishedByManager||0,     pos:true },
              { l:'مصاريف دفعها المسؤول',   v:report?.expensesByManager||0,      pos:false },
            ].map(({ l,v,pos }) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px', fontSize:'13px' }}>
                <span style={{ color:'#6b7280' }}>{l}</span>
                <span style={{ color:pos?'#16a34a':'#dc2626', fontWeight:'600' }}>{pos?'+':'−'} {v.toLocaleString('ar-SA')} ر.س</span>
              </div>
            ))}
            <div style={{ height:'1px', background:'#e5e7eb', margin:'10px 0' }}/>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px', fontSize:'13px' }}>
              <span style={{ color:'#374151', fontWeight:'600' }}>المستحق للمالك من المسؤول</span>
              <span style={{ color:'#1e40af', fontWeight:'700' }}>{dueToOwner.toLocaleString('ar-SA')} ر.س</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px', fontSize:'13px' }}>
              <span style={{ color:'#6b7280' }}>محوّل للمالك هذا الشهر</span>
              <span style={{ color:'#374151', fontWeight:'600' }}>− {totalTransferredToOwner.toLocaleString('ar-SA')} ر.س</span>
            </div>
            {remaining !== 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 14px', background:remaining>0?'#fef3c7':'#fee2e2', borderRadius:'10px' }}>
                <span style={{ fontSize:'13px', color:remaining>0?'#92400e':'#991b1b', fontWeight:'600' }}>
                  {remaining>0?'⏳ متبقي للتحويل':'⚠️ تم تحويل أكثر من المستحق'}
                </span>
                <span style={{ fontSize:'15px', fontWeight:'700', color:remaining>0?'#d97706':'#dc2626' }}>
                  {Math.abs(remaining).toLocaleString('ar-SA')} ر.س
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ══ KPI Cards ══ */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'16px' }}>
          {[
            { l:'إيرادات المسؤول', v:((report?.rentReceivedByManager||0)+(report?.furnishedByManager||0)).toLocaleString('ar-SA')+' ر.س', c:'#1e40af', bg:'#dbeafe' },
            { l:'إيرادات المالك',  v:((report?.rentReceivedByOwner||0)+(report?.furnishedByOwner||0)).toLocaleString('ar-SA')+' ر.س',    c:'#7c3aed', bg:'#ede9fe' },
            { l:'محوّل للمالك',   v:totalTransferredToOwner.toLocaleString('ar-SA')+' ر.س', c:'#16a34a', bg:'#d1fae5' },
          ].map(k=>(
            <div key={k.l} style={{ background:k.bg, borderRadius:'14px', padding:'12px', textAlign:'center' }}>
              <div style={{ fontSize:'10px', color:'#6b7280', marginBottom:'4px' }}>{k.l}</div>
              <div style={{ fontSize:'13px', fontWeight:'700', color:k.c }}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* ══ Transfers List ══ */}
        <div style={{ fontSize:'14px', fontWeight:'600', color:'#374151', marginBottom:'10px' }}>
          سجل التحويلات ({transfers.length})
        </div>

        {transfers.length===0 ? (
          <div style={{ background:'#fff', borderRadius:'16px', padding:'32px', textAlign:'center', border:'1px solid #e5e7eb' }}>
            <div style={{ fontSize:'40px', marginBottom:'10px' }}>💸</div>
            <p style={{ color:'#9ca3af', fontSize:'14px', margin:'0 0 16px' }}>لا توجد تحويلات هذا الشهر</p>
            {canEdit && <button onClick={openAdd} style={{ padding:'10px 20px', background:'#1B4F72', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'14px', fontFamily:'sans-serif' }}>+ تسجيل تحويل</button>}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {transfers.map(t=>(
              <div key={t.id} style={{ background:'#fff', borderRadius:'14px', padding:'14px 16px', border:'1px solid #e5e7eb', display:'flex', alignItems:'center', gap:'12px' }}>
                <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:t.type==='owner_transfer'?'#d1fae5':'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', flexShrink:0 }}>
                  {t.type==='owner_transfer'?'↑':'↓'}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'14px', fontWeight:'600', color:'#111827' }}>
                    {t.type==='owner_transfer'?'تحويل للمالك':'مصروف مسؤول'}
                  </div>
                  <div style={{ fontSize:'12px', color:'#9ca3af' }}>
                    {fmtDate(t.date)} · {t.paymentMethod==='transfer'?'تحويل بنكي':'كاش'}
                    {t.notes?` · ${t.notes}`:''}
                  </div>
                </div>
                <div style={{ fontSize:'16px', fontWeight:'700', color:t.type==='owner_transfer'?'#16a34a':'#dc2626' }}>
                  {t.amount?.toLocaleString('ar-SA')} ر.س
                </div>
                {canEdit && (
                  <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
                    <button onClick={()=>openEdit(t)} style={{ padding:'5px 10px', border:'1px solid #d1d5db', borderRadius:'8px', background:'#fff', cursor:'pointer', fontSize:'12px', fontFamily:'sans-serif' }}>✏️</button>
                    <button onClick={()=>setDeleteConfirm(t)} style={{ padding:'5px 10px', border:'1px solid #fca5a5', borderRadius:'8px', background:'#fff', cursor:'pointer', fontSize:'12px', color:'#dc2626', fontFamily:'sans-serif' }}>🗑️</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ Modal: إضافة/تعديل تحويل ══ */}
      {showModal && (
        <div style={{ position:'fixed', inset:'0', background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }}
          onClick={() => setShowModal(false)}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'24px', width:'100%', maxWidth:'500px' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ margin:0, fontSize:'17px', color:'#1B4F72', fontWeight:'600' }}>
                {editTransfer?'تعديل التحويل':'تسجيل تحويل مالي'}
              </h2>
              <button onClick={()=>setShowModal(false)} style={{ border:'none', background:'#f3f4f6', borderRadius:'50%', width:'32px', height:'32px', cursor:'pointer', fontSize:'16px' }}>✕</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              {/* نوع */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                {[['owner_transfer','تحويل للمالك','↑','#d1fae5','#065f46'],['manager_expense','مصروف مسؤول','↓','#fee2e2','#991b1b']].map(([v,l,icon,bg,color])=>(
                  <button key={v} onClick={()=>setForm(f=>({...f,type:v}))}
                    style={{ padding:'12px', border:`2px solid ${form.type===v?color:'#e5e7eb'}`, borderRadius:'12px', background:form.type===v?bg:'#fff', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', fontFamily:'sans-serif' }}>
                    <span style={{ fontSize:'20px', color }}>{icon}</span>
                    <span style={{ fontSize:'12px', fontWeight:'600', color }}>{l}</span>
                  </button>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div><label style={lbl}>المبلغ (ر.س)</label><input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={inp}/></div>
                <div><label style={lbl}>التاريخ</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp}/></div>
              </div>
              <div>
                <label style={lbl}>طريقة التحويل</label>
                <select value={form.paymentMethod} onChange={e=>setForm(f=>({...f,paymentMethod:e.target.value}))} style={inp}>
                  <option value="transfer">تحويل بنكي</option>
                  <option value="cash">كاش</option>
                </select>
              </div>
              <div><label style={lbl}>ملاحظات</label><input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={inp}/></div>
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'24px' }}>
              <button onClick={saveTransfer} disabled={saving}
                style={{ flex:1, padding:'13px', background:saving?'#9ca3af':'#1B4F72', color:'#fff', border:'none', borderRadius:'12px', cursor:saving?'not-allowed':'pointer', fontSize:'15px', fontWeight:'600', fontFamily:'sans-serif' }}>
                {saving?'جارٍ الحفظ...':editTransfer?'حفظ التعديلات':'حفظ التحويل'}
              </button>
              <button onClick={()=>setShowModal(false)} style={{ padding:'13px 20px', background:'#f3f4f6', color:'#374151', border:'none', borderRadius:'12px', cursor:'pointer', fontSize:'15px', fontFamily:'sans-serif' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: تأكيد الحذف ══ */}
      {deleteConfirm && (
        <div style={{ position:'fixed', inset:'0', background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'#fff', borderRadius:'16px', padding:'24px', width:'360px', maxWidth:'95vw', textAlign:'center' }}>
            <div style={{ fontSize:'48px', marginBottom:'12px' }}>🗑️</div>
            <h3 style={{ margin:'0 0 8px', color:'#1B4F72' }}>حذف التحويل</h3>
            <p style={{ color:'#111827', fontSize:'18px', fontWeight:'700', marginBottom:'20px' }}>
              {deleteConfirm.amount?.toLocaleString('ar-SA')} ر.س
            </p>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={deleteTransfer} disabled={saving}
                style={{ flex:1, padding:'12px', background:'#dc2626', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'14px', fontWeight:'600', fontFamily:'sans-serif' }}>
                {saving?'جارٍ الحذف...':'تأكيد الحذف'}
              </button>
              <button onClick={()=>setDeleteConfirm(null)} style={{ padding:'12px 20px', background:'#f3f4f6', color:'#374151', border:'none', borderRadius:'10px', cursor:'pointer', fontFamily:'sans-serif' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionTitle({ label, bg, color }: { label:string; bg:string; color:string }) {
  return (
    <div style={{ fontSize:'12px', fontWeight:'700', color, background:bg, padding:'6px 10px', borderRadius:'8px', marginBottom:'8px' }}>
      {label}
    </div>
  );
}

interface RowWithTooltipProps {
  label: string; value: number; positive: boolean;
  tag: string; tagColor: string; tagBg: string;
  tooltip: React.ReactNode;
}
function RowWithTooltip({ label, value, positive, tag, tagColor, tagBg, tooltip }: RowWithTooltipProps) {
  if (!value) return null;
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #f3f4f6' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
        <span style={{ background:tagBg, color:tagColor, fontSize:'10px', fontWeight:'600', padding:'2px 8px', borderRadius:'8px' }}>{tag}</span>
        <span style={{ fontSize:'12px', color:'#6b7280' }}>{label}</span>
        {/* Tooltip trigger injected here */}
        {tooltip}
      </div>
      <span style={{ fontSize:'13px', fontWeight:'600', color:positive?'#16a34a':'#dc2626' }}>
        {positive?'+':'−'} {value.toLocaleString('ar-SA')} ر.س
      </span>
    </div>
  );
}

function Total({ label, value, positive }: { label:string; value:number; positive:boolean }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'10px', background:positive?'#f0fdf4':'#fef2f2', borderRadius:'10px', marginTop:'6px' }}>
      <span style={{ fontSize:'13px', fontWeight:'700', color:'#374151' }}>{label}</span>
      <span style={{ fontSize:'16px', fontWeight:'700', color:positive?'#16a34a':'#dc2626' }}>
        {positive?'+':'−'} {value.toLocaleString('ar-SA')} ر.س
      </span>
    </div>
  );
}

const lbl: React.CSSProperties = { display:'block', fontSize:'13px', color:'#374151', marginBottom:'6px', fontWeight:'500' };
const inp: React.CSSProperties = { width:'100%', border:'1.5px solid #e5e7eb', borderRadius:'10px', padding:'11px 14px', fontSize:'14px', boxSizing:'border-box', background:'#fff', fontFamily:'sans-serif' };
const selStyle: React.CSSProperties = { border:'1.5px solid #e5e7eb', borderRadius:'12px', padding:'12px 16px', fontSize:'14px', background:'#fff', width:'100%', fontFamily:'sans-serif' };
