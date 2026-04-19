'use client';
import { useEffect, useState, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../../lib/userHelpers';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const CH_LABEL: Record<string,string> = {
  airbnb:'Airbnb', gathern:'Gathern', booking:'Booking.com', direct:'مباشر', other:'أخرى',
};
const CH_COLOR: Record<string,string> = {
  airbnb:'#E74C3C', gathern:'#27AE60', booking:'#2E86C1', direct:'#D4AC0D', other:'#7D3C98',
};
const YEAR_OPTIONS = Array.from({ length:50 }, (_,i) => 2020+i);
const currentYear  = new Date().getFullYear();

// ─── Types ────────────────────────────────────────────────────────────────────
interface TenantRow {
  unitNumber:    string;
  name:          string;
  rentAmount:    number;
  payments:      Record<number, number>;
  totalPaid:     number;
  totalExpected: number;
  balance:       number;
  hasMultiple:   boolean; // شقة فيها أكثر من مستأجر في الفترة
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number)    { return n.toLocaleString('ar-SA'); }
function fmtPct(n: number) { return Math.round(n)+'%'; }
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

// ─── Component ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const router = useRouter();
  const [appUser,    setAppUser]    = useState<AppUserBasic | null>(null);
  const [properties, setProperties] = useState<PropertyBasic[]>([]);
  const [propId,     setPropId]     = useState('');
  const [propName,   setPropName]   = useState('');
  const [yearStr,    setYearStr]    = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState<number>(0);
  const [activeTab,  setActiveTab]  = useState<'financial'|'rent'|'units'|'furnished'>('financial');
  const [loading,    setLoading]    = useState(true);
  const [dataLoading,setDataLoading]= useState(false);

  const [units,    setUnits]    = useState<any[]>([]);
  const [tenants,  setTenants]  = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);

  // ─── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }
      const user = await getCurrentUser(fbUser.uid);
      if (!user)  { router.push('/login'); return; }
      setAppUser(user);
      const props = await loadPropertiesForUser(fbUser.uid, user.role);
      setProperties(props);
      if (props.length > 0) {
        setPropId(props[0].id); setPropName(props[0].name);
        await loadAllData(props[0].id, String(currentYear));
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadAllData = async (pid: string, year: string) => {
    setDataLoading(true);
    const [uS,tS,pS,bS,eS] = await Promise.all([
      getDocs(query(collection(db,'units'),        where('propertyId','==',pid))),
      getDocs(query(collection(db,'tenants'),      where('propertyId','==',pid))),
      getDocs(query(collection(db,'rentPayments'), where('propertyId','==',pid))),
      getDocs(query(collection(db,'bookings'),     where('propertyId','==',pid))),
      getDocs(query(collection(db,'expenses'),     where('propertyId','==',pid))),
    ]);
    setUnits(uS.docs.map(d=>({id:d.id,...d.data()})));
    setTenants(tS.docs.map(d=>({id:d.id,...d.data()})));
    setPayments(pS.docs.map(d=>({id:d.id,...d.data()})));
    setBookings(bS.docs.map(d=>({id:d.id,...d.data()})));
    setExpenses(eS.docs.map(d=>({id:d.id,...d.data()})));
    setDataLoading(false);
  };

  // ─── Date helpers ──────────────────────────────────────────────────────────
  const y = parseInt(yearStr);

  const dateRange = useMemo(() => {
    if (selectedMonth === 0) return { start: new Date(y,0,1), end: new Date(y,11,31,23,59,59) };
    return { start: new Date(y,selectedMonth-1,1), end: new Date(y,selectedMonth,0,23,59,59) };
  }, [y, selectedMonth]);

  const months = selectedMonth === 0 ? [1,2,3,4,5,6,7,8,9,10,11,12] : [selectedMonth];

  // ─── Filtered data ─────────────────────────────────────────────────────────
  const filteredPayments = useMemo(() => payments.filter(p => {
    const d = p.paidDate?.toDate ? p.paidDate.toDate() : null;
    return d && d >= dateRange.start && d <= dateRange.end;
  }), [payments, dateRange]);

  const filteredBookings = useMemo(() => bookings.filter(b => {
    if (b.status === 'cancelled') return false;
    const d = b.checkinDate?.toDate ? b.checkinDate.toDate() : null;
    return d && d >= dateRange.start && d <= dateRange.end;
  }), [bookings, dateRange]);

  const filteredExpenses = useMemo(() => expenses.filter(e => {
    const d = e.date?.toDate ? e.date.toDate() : null;
    return d && d >= dateRange.start && d <= dateRange.end;
  }), [expenses, dateRange]);

  // ─── Monthly reports ────────────────────────────────────────────────────────
  const reports = useMemo(() => Array.from({ length:12 }, (_,i) => {
    const m = i+1;
    const ms = new Date(y,m-1,1), me = new Date(y,m,0,23,59,59);
    const mPay  = payments.filter(p=>{ const d=p.paidDate?.toDate?p.paidDate.toDate():null; return d&&d>=ms&&d<=me; });
    const mBook = bookings.filter(b=>{ if(b.status==='cancelled')return false; const d=b.checkinDate?.toDate?b.checkinDate.toDate():null; return d&&d>=ms&&d<=me; });
    const mExp  = expenses.filter(e=>{ const d=e.date?.toDate?e.date.toDate():null; return d&&d>=ms&&d<=me; });
    const rent  = mPay.reduce((s:number,p:any)=>s+(p.amountPaid||0),0);
    const furn  = mBook.reduce((s:number,b:any)=>s+(b.netRevenue||0),0);
    const exp   = mExp.reduce((s:number,e:any)=>s+(e.amount||0),0);
    return { month:m, monthlyRevenue:rent, furnishedRevenue:furn, totalRevenue:rent+furn, totalExpenses:exp, netProfit:rent+furn-exp };
  }), [payments, bookings, expenses, y]);

  const filteredReports = useMemo(() =>
    selectedMonth === 0 ? reports : reports.filter(r => r.month === selectedMonth)
  , [reports, selectedMonth]);

  const yearTotals = useMemo(() => ({
    revenue:  filteredReports.reduce((s,r)=>s+r.totalRevenue,0),
    expenses: filteredReports.reduce((s,r)=>s+r.totalExpenses,0),
    profit:   filteredReports.reduce((s,r)=>s+r.netProfit,0),
  }), [filteredReports]);

  // ─── ✅ Rent Table — الإصلاح الكامل لمشكلة تعدد المستأجرين ────────────────
  const rentTable = useMemo((): TenantRow[] => {
    return units
      .filter(u => u.type === 'monthly' || u.type === 'owner')
      .sort((a, b) => a.unitNumber?.localeCompare(b.unitNumber, undefined, { numeric: true }))
      .map(u => {

        // ✅ نجمع كل المستأجرين لهذه الشقة (حاليين وسابقين)
        const unitTenants = tenants.filter(t => t.unitId === u.id);

        // ✅ نحسب الدفعات لكل شهر من كل المستأجرين
        const monthPays: Record<number, number> = {};
        let totalPaid = 0;

        months.forEach(m => {
          const ms = new Date(y, m-1, 1);
          const me = new Date(y, m, 0, 23, 59, 59);

          // نجمع دفعات كل المستأجرين في هذا الشهر لهذه الشقة
          const monthAmount = unitTenants.reduce((unitSum, tenant) => {
            const paid = payments
              .filter(p => {
                if (p.tenantId !== tenant.id) return false;
                const d = p.paidDate?.toDate ? p.paidDate.toDate() : null;
                return d && d >= ms && d <= me;
              })
              .reduce((s: number, p: any) => s + (p.amountPaid || 0), 0);
            return unitSum + paid;
          }, 0);

          monthPays[m] = monthAmount;
          totalPaid += monthAmount;
        });

        // ✅ نحسب المبلغ المتوقع بناءً على من كان ساكناً فعلاً في كل شهر
        let totalExpected = 0;
        months.forEach(m => {
          const ms = new Date(y, m-1, 1);
          const me = new Date(y, m, 0, 23, 59, 59);

          // المستأجر الذي كان ساكناً في هذا الشهر (عقده يتقاطع مع الشهر)
          const tenantInMonth = unitTenants.find(t => {
            const start = t.contractStart?.toDate ? t.contractStart.toDate() : null;
            const end   = t.contractEnd?.toDate   ? t.contractEnd.toDate()   : null;
            if (!start || !end) return false;
            return start <= me && end >= ms;
          });

          if (tenantInMonth) {
            totalExpected += tenantInMonth.rentAmount || 0;
          }
        });

        // ✅ المستأجر الحالي للعرض (أو الأخير)
        const activeTenant = unitTenants.find(t => t.status === 'active');
        const latestTenant = unitTenants.sort((a,b) =>
          (b.contractStart?.seconds||0) - (a.contractStart?.seconds||0)
        )[0];
        const displayTenant = activeTenant || latestTenant;

        // ✅ تحديد من كان ساكناً في الفترة المختارة
        const tenantsInPeriod = unitTenants.filter(t => {
          const start = t.contractStart?.toDate ? t.contractStart.toDate() : null;
          const end   = t.contractEnd?.toDate   ? t.contractEnd.toDate()   : null;
          if (!start || !end) return false;
          return start <= dateRange.end && end >= dateRange.start;
        });

        // ✅ اسم العرض
        let displayName: string;
        if (unitTenants.length === 0) {
          displayName = u.status === 'vacant' ? 'شاغرة' : '—';
        } else if (tenantsInPeriod.length > 1) {
          // عدة مستأجرين في الفترة → نعرضهم بالترتيب الزمني
          displayName = tenantsInPeriod
            .sort((a,b) => (a.contractStart?.seconds||0) - (b.contractStart?.seconds||0))
            .map(t => t.name)
            .join(' · ');
        } else if (tenantsInPeriod.length === 1) {
          displayName = tenantsInPeriod[0].name;
        } else {
          displayName = displayTenant?.name || 'شاغرة';
        }

        return {
          unitNumber:    u.unitNumber,
          name:          displayName,
          rentAmount:    displayTenant?.rentAmount || 0,
          payments:      monthPays,
          totalPaid,
          totalExpected,
          balance:       Math.max(0, totalExpected - totalPaid),
          hasMultiple:   tenantsInPeriod.length > 1,
        };
      });
  }, [units, tenants, payments, y, months, dateRange]);

  // ─── Units report ──────────────────────────────────────────────────────────
  const unitReport = useMemo(() => units.map(u => {
    // ✅ نجمع دفعات كل المستأجرين لهذه الشقة في الفترة
    const unitTenants  = tenants.filter(t => t.unitId === u.id);
    const uPays        = filteredPayments.filter(p => unitTenants.some(t => t.id === p.tenantId));
    const totalPaid    = uPays.reduce((s:number,p:any)=>s+(p.amountPaid||0),0);
    const totalBalance = uPays.reduce((s:number,p:any)=>s+(p.balance||0),0);
    const lastPay      = [...uPays].sort((a:any,b:any)=>(b.paidDate?.seconds||0)-(a.paidDate?.seconds||0))[0];
    const activeTenant = unitTenants.find(t=>t.status==='active');
    let statusLabel='شاغرة', statusColor='#dc2626', statusBg='#fee2e2';
    if (u.status==='occupied'&&activeTenant) {
      if (totalBalance>0) { statusLabel='متأخرة'; statusColor='#d97706'; statusBg='#fef3c7'; }
      else if (totalPaid>0) { statusLabel='مسددة'; statusColor='#16a34a'; statusBg='#d1fae5'; }
      else { statusLabel='لا دفعات'; statusColor='#6b7280'; statusBg='#f3f4f6'; }
    } else if (u.status==='maintenance') { statusLabel='صيانة'; statusColor='#6b7280'; statusBg='#f3f4f6'; }
    return { ...u, tenant:activeTenant, totalPaid, totalBalance, lastPay, statusLabel, statusColor, statusBg };
  }), [units, tenants, filteredPayments]);

  const unitSummary = useMemo(() => ({
    paid:        unitReport.filter(u=>u.statusLabel==='مسددة').length,
    late:        unitReport.filter(u=>u.statusLabel==='متأخرة').length,
    vacant:      unitReport.filter(u=>u.statusLabel==='شاغرة').length,
    noPay:       unitReport.filter(u=>u.statusLabel==='لا دفعات').length,
    maintenance: unitReport.filter(u=>u.statusLabel==='صيانة').length,
    totalArrears:unitReport.reduce((s,u)=>s+(u.totalBalance||0),0),
  }), [unitReport]);

  // ─── Furnished report ──────────────────────────────────────────────────────
  const furnishedUnits = useMemo(() => units.filter(u=>u.type==='furnished'), [units]);

  const furnishedReport = useMemo(() => furnishedUnits.map(u => {
    const uBook = filteredBookings.filter(b=>b.unitId===u.id);
    const uExp  = filteredExpenses.filter(e=>e.unitId===u.id);
    let occ=0, totalDays=0;
    months.forEach(m => {
      const days = daysInMonth(y,m);
      totalDays += days;
      for (let d=1; d<=days; d++) {
        const dayDate = new Date(y,m-1,d);
        if (filteredBookings.some(b=>{
          if(b.unitId!==u.id)return false;
          const ci=b.checkinDate?.toDate?b.checkinDate.toDate():new Date(b.checkinDate);
          const co=b.checkoutDate?.toDate?b.checkoutDate.toDate():new Date(b.checkoutDate);
          return dayDate>=ci&&dayDate<co;
        })) occ++;
      }
    });
    const totalRevenue  = uBook.reduce((s:number,b:any)=>s+(b.netRevenue||0),0);
    const totalExpenses = uExp.reduce((s:number,e:any)=>s+(e.amount||0),0);
    const byChannel: Record<string,{count:number;revenue:number}> = {};
    uBook.forEach((b:any)=>{
      if(!byChannel[b.channel]) byChannel[b.channel]={count:0,revenue:0};
      byChannel[b.channel].count++; byChannel[b.channel].revenue+=b.netRevenue||0;
    });
    return {
      ...u, bookingsCount:uBook.length, totalRevenue, totalExpenses,
      netProfit:totalRevenue-totalExpenses,
      occupancyRate:totalDays>0?Math.round(occ/totalDays*100):0,
      byChannel,
      avgNightlyRate:uBook.length>0?Math.round(totalRevenue/Math.max(1,uBook.reduce((s:number,b:any)=>s+(b.nights||0),0))):0,
    };
  }), [furnishedUnits, filteredBookings, filteredExpenses, months, y]);

  const overallOccupancy = furnishedUnits.length>0
    ? Math.round(furnishedReport.reduce((s,u)=>s+u.occupancyRate,0)/furnishedUnits.length) : 0;

  const globalChannels = useMemo(()=>{
    const acc: Record<string,{count:number;revenue:number}>={};
    filteredBookings.forEach((b:any)=>{ if(!acc[b.channel]) acc[b.channel]={count:0,revenue:0}; acc[b.channel].count++; acc[b.channel].revenue+=b.netRevenue||0; });
    return acc;
  }, [filteredBookings]);

  // ─── Export Excel ───────────────────────────────────────────────────────────
  const exportToExcel = async () => {
    const XLSX = await import('xlsx');
    const header = ['رقم الشقة','اسم المستأجر','الإيجار', ...months.map(m=>MONTHS_AR[m-1]),'المجموع','المتأخرات','النسبة'];
    const rows = rentTable.map(t=>{
      const pct = t.totalExpected>0?`${Math.round(t.totalPaid/t.totalExpected*100)}%`:'—';
      return [t.unitNumber, t.name, t.rentAmount||'', ...months.map(m=>t.payments[m]||''), t.totalPaid||'', t.balance||'', pct];
    });
    const totalRow = ['الإجمالي','',rentTable.reduce((s,t)=>s+t.rentAmount,0),
      ...months.map(m=>rentTable.reduce((s,t)=>s+(t.payments[m]||0),0)),
      rentTable.reduce((s,t)=>s+t.totalPaid,0), rentTable.reduce((s,t)=>s+t.balance,0),''];
    const ws = XLSX.utils.aoa_to_sheet([header,...rows,totalRow]);
    ws['!cols'] = [{wch:10},{wch:30},{wch:14},...months.map(()=>({wch:12})),{wch:16},{wch:14},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'جدول الإيجار');
    XLSX.writeFile(wb, `rent_report_${y}_${selectedMonth||'annual'}.xlsx`);
  };

  // ─── Chart data ─────────────────────────────────────────────────────────────
  const chartData = (selectedMonth===0?reports:filteredReports).map(r=>({
    name: MONTHS_AR[r.month-1].slice(0,3),
    إيرادات:r.totalRevenue, مصاريف:r.totalExpenses, صافي:r.netProfit,
  }));

  const periodLabel = selectedMonth===0 ? `سنة ${y}` : `${MONTHS_AR[selectedMonth-1]} ${y}`;

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh' }}>
      <div style={{ width:'40px', height:'40px', border:'3px solid #1B4F72', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div dir="rtl" style={{ fontFamily:'sans-serif', background:'#f9fafb', minHeight:'100vh' }}>

      {/* ══ Top Bar ══ */}
      <div style={{ background:'#1B4F72', padding:'16px 20px', display:'flex', alignItems:'center', gap:'12px', position:'sticky', top:0, zIndex:50 }}>
        <button onClick={() => router.push('/')} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:'8px', padding:'8px 12px', cursor:'pointer' }}>
          <span style={{ color:'#fff', fontSize:'18px' }}>←</span>
        </button>
        <div style={{ flex:1 }}>
          <h1 style={{ margin:0, fontSize:'17px', fontWeight:'600', color:'#fff' }}>التقارير والإحصاءات</h1>
          <p style={{ margin:0, fontSize:'12px', color:'rgba(255,255,255,0.6)' }}>{propName}</p>
        </div>
      </div>

      <div style={{ padding:'16px', maxWidth:'960px', margin:'0 auto' }}>

        {/* ══ Filters ══ */}
        <div style={{ background:'#fff', borderRadius:'16px', border:'1px solid #e5e7eb', padding:'16px', marginBottom:'16px' }}>
          <div style={{ display:'grid', gridTemplateColumns:properties.length>1?'1fr 1fr 1fr':'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
            {properties.length>1 && (
              <div>
                <label style={flbl}>العقار</label>
                <select value={propId} onChange={e=>{const p=properties.find(x=>x.id===e.target.value);setPropId(e.target.value);setPropName(p?.name||'');loadAllData(e.target.value,yearStr);}} style={fsel}>
                  {properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={flbl}>السنة</label>
              <select value={yearStr} onChange={e=>{setYearStr(e.target.value);loadAllData(propId,e.target.value);}} style={fsel}>
                {YEAR_OPTIONS.map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label style={flbl}>الشهر</label>
              <select value={selectedMonth} onChange={e=>setSelectedMonth(Number(e.target.value))} style={fsel}>
                <option value={0}>📅 سنوي (كل الأشهر)</option>
                {MONTHS_AR.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 12px', background:'#eff6ff', borderRadius:'8px', border:'1px solid #bfdbfe' }}>
            <span style={{ fontSize:'14px' }}>📅</span>
            <span style={{ fontSize:'13px', color:'#1e40af', fontWeight:'600' }}>عرض بيانات: {periodLabel}</span>
            {selectedMonth!==0 && (
              <button onClick={() => setSelectedMonth(0)}
                style={{ marginRight:'auto', fontSize:'11px', color:'#6b7280', background:'none', border:'1px solid #e5e7eb', borderRadius:'6px', padding:'3px 10px', cursor:'pointer', fontFamily:'sans-serif' }}>
                عرض السنة كاملة
              </button>
            )}
          </div>
        </div>

        {/* ══ Tabs ══ */}
        <div style={{ display:'flex', background:'#fff', borderRadius:'12px', padding:'4px', marginBottom:'16px', border:'1px solid #e5e7eb', gap:'2px' }}>
          {([['financial','📊 المالي'],['rent','📋 جدول الإيجار'],['units','🏠 الوحدات'],['furnished','🏨 المفروشة']] as const).map(([id,label])=>(
            <button key={id} onClick={()=>setActiveTab(id)}
              style={{ flex:1, padding:'9px 4px', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'12px', fontWeight:activeTab===id?'600':'400', background:activeTab===id?'#1B4F72':'transparent', color:activeTab===id?'#fff':'#6b7280', transition:'all 0.15s', fontFamily:'sans-serif' }}>
              {label}
            </button>
          ))}
        </div>

        {properties.length===0 ? (
          <div style={{ background:'#fff', borderRadius:'16px', padding:'40px', textAlign:'center', border:'1px solid #e5e7eb' }}>
            <div style={{ fontSize:'48px', marginBottom:'12px' }}>📊</div>
            <p style={{ color:'#6b7280' }}>لا توجد عقارات مرتبطة بحسابك</p>
          </div>
        ) : dataLoading ? (
          <div style={{ textAlign:'center', padding:'60px', color:'#6b7280' }}>
            <div style={{ width:'36px', height:'36px', border:'3px solid #1B4F72', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }}/>
            جارٍ تحميل البيانات...
          </div>
        ) : (
          <>

            {/* ══ TAB: المالي ══ */}
            {activeTab==='financial' && (
              <div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px', marginBottom:'16px' }}>
                  {[
                    { label:`إجمالي الإيرادات — ${periodLabel}`, val:fmt(yearTotals.revenue)+' ر.س', sub:selectedMonth===0?`متوسط: ${fmt(Math.round(yearTotals.revenue/12))} شهرياً`:'', color:'#2E86C1', border:'#2E86C1' },
                    { label:`إجمالي المصاريف — ${periodLabel}`,  val:fmt(yearTotals.expenses)+' ر.س', sub:'', color:'#dc2626', border:'#dc2626' },
                    { label:`صافي الربح — ${periodLabel}`,       val:fmt(yearTotals.profit)+' ر.س', sub:yearTotals.revenue>0?`هامش: ${fmtPct(yearTotals.profit/yearTotals.revenue*100)}`:'', color:yearTotals.profit>=0?'#16a34a':'#dc2626', border:'#16a34a' },
                  ].map(k=>(
                    <div key={k.label} style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e5e7eb', borderTop:`3px solid ${k.border}`, padding:'16px' }}>
                      <div style={{ fontSize:'11px', color:'#6b7280', marginBottom:'6px' }}>{k.label}</div>
                      <div style={{ fontSize:'18px', fontWeight:'700', color:k.color }}>{k.val}</div>
                      {k.sub && <div style={{ fontSize:'11px', color:'#9ca3af', marginTop:'4px' }}>{k.sub}</div>}
                    </div>
                  ))}
                </div>

                {selectedMonth===0 && (
                  <>
                    <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e5e7eb', padding:'16px', marginBottom:'14px' }}>
                      <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151', marginBottom:'12px' }}>الإيرادات مقابل المصاريف</div>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={chartData} margin={{ top:5, right:10, bottom:5, left:10 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                          <XAxis dataKey="name" tick={{ fontSize:11 }}/>
                          <YAxis tickFormatter={v=>`${(v/1000).toFixed(0)}k`} tick={{ fontSize:11 }}/>
                          <Tooltip formatter={(v:number)=>`${fmt(v)} ر.س`}/>
                          <Legend/>
                          <Bar dataKey="إيرادات" fill="#2E86C1" radius={[3,3,0,0]}/>
                          <Bar dataKey="مصاريف"  fill="#E74C3C" radius={[3,3,0,0]}/>
                          <Bar dataKey="صافي"    fill="#1E8449" radius={[3,3,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e5e7eb', padding:'16px', marginBottom:'14px' }}>
                      <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151', marginBottom:'12px' }}>اتجاه صافي الربح</div>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                          <XAxis dataKey="name" tick={{ fontSize:11 }}/>
                          <YAxis tickFormatter={v=>`${(v/1000).toFixed(0)}k`} tick={{ fontSize:11 }}/>
                          <Tooltip formatter={(v:number)=>`${fmt(v)} ر.س`}/>
                          <Line type="monotone" dataKey="صافي" stroke="#1E8449" strokeWidth={2} dot={{ r:3 }}/>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}

                {selectedMonth!==0 && (
                  <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e5e7eb', padding:'16px', marginBottom:'14px' }}>
                    <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151', marginBottom:'12px' }}>تفاصيل {MONTHS_AR[selectedMonth-1]} {y}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px' }}>
                      {[
                        { label:'إيجار شهري', val:filteredReports[0]?.monthlyRevenue||0, color:'#1e40af', bg:'#dbeafe' },
                        { label:'مفروشة',      val:filteredReports[0]?.furnishedRevenue||0, color:'#065f46', bg:'#d1fae5' },
                        { label:'مصاريف',      val:filteredReports[0]?.totalExpenses||0, color:'#dc2626', bg:'#fee2e2' },
                      ].map(k=>(
                        <div key={k.label} style={{ background:k.bg, borderRadius:'10px', padding:'12px', textAlign:'center' }}>
                          <div style={{ fontSize:'16px', fontWeight:'700', color:k.color }}>{fmt(k.val)} ر.س</div>
                          <div style={{ fontSize:'11px', color:'#6b7280', marginTop:'3px' }}>{k.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e5e7eb', overflow:'hidden' }}>
                  <div style={{ padding:'14px 16px', borderBottom:'1px solid #e5e7eb', fontSize:'13px', fontWeight:'600', color:'#374151' }}>
                    التقرير التفصيلي — {periodLabel}
                  </div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                      <thead style={{ background:'#f9fafb' }}>
                        <tr>{['الشهر','إيجار شهري','مفروش','إجمالي','مصاريف','صافي','هامش'].map(h=>(
                          <th key={h} style={{ padding:'9px 12px', textAlign:'right', color:'#6b7280', fontWeight:'500', borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {filteredReports.map((r,i)=>(
                          <tr key={i} style={{ borderBottom:'1px solid #f3f4f6' }}>
                            <td style={{ padding:'9px 12px', fontWeight:'600', color:'#374151' }}>{MONTHS_AR[r.month-1]}</td>
                            <td style={{ padding:'9px 12px' }}>{r.monthlyRevenue>0?fmt(r.monthlyRevenue):'—'}</td>
                            <td style={{ padding:'9px 12px' }}>{r.furnishedRevenue>0?fmt(r.furnishedRevenue):'—'}</td>
                            <td style={{ padding:'9px 12px', fontWeight:'600' }}>{r.totalRevenue>0?fmt(r.totalRevenue):'—'}</td>
                            <td style={{ padding:'9px 12px', color:'#dc2626' }}>{r.totalExpenses>0?fmt(r.totalExpenses):'—'}</td>
                            <td style={{ padding:'9px 12px', fontWeight:'600' }}>
                              {r.netProfit!==0?<span style={{ color:r.netProfit>=0?'#16a34a':'#dc2626' }}>{fmt(r.netProfit)}</span>:'—'}
                            </td>
                            <td style={{ padding:'9px 12px' }}>
                              {r.totalRevenue>0?(
                                <span style={{ padding:'2px 8px', borderRadius:'8px', fontSize:'11px', fontWeight:'600', background:r.netProfit/r.totalRevenue>=0.5?'#d1fae5':r.netProfit/r.totalRevenue>=0.3?'#fef3c7':'#fee2e2', color:r.netProfit/r.totalRevenue>=0.5?'#065f46':r.netProfit/r.totalRevenue>=0.3?'#92400e':'#991b1b' }}>
                                  {fmtPct(r.netProfit/r.totalRevenue*100)}
                                </span>
                              ):'—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background:'#1B4F72' }}>
                          {['المجموع',fmt(filteredReports.reduce((s,r)=>s+r.monthlyRevenue,0)),fmt(filteredReports.reduce((s,r)=>s+r.furnishedRevenue,0)),fmt(yearTotals.revenue),fmt(yearTotals.expenses),fmt(yearTotals.profit),yearTotals.revenue>0?fmtPct(yearTotals.profit/yearTotals.revenue*100):'—'].map((v,i)=>(
                            <td key={i} style={{ padding:'10px 12px', color:i===4?'#fca5a5':i===5?'#6ee7b7':'#fff', fontWeight:'600' }}>{v}</td>
                          ))}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ══ TAB: جدول الإيجار ══ */}
            {activeTab==='rent' && (
              <div>
                {/* تنبيه شقق متعددة مستأجرين */}
                {rentTable.some(t=>t.hasMultiple) && (
                  <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'10px', padding:'10px 14px', marginBottom:'14px', fontSize:'12px', color:'#1e40af', display:'flex', gap:'8px' }}>
                    <span>ℹ️</span>
                    <span>الشقق المميزة بـ <strong>👥</strong> كان فيها أكثر من مستأجر في هذه الفترة — المبالغ تشمل دفعات جميع المستأجرين</span>
                  </div>
                )}

                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px', marginBottom:'16px' }}>
                  {[
                    { label:'إجمالي الوحدات',   val:rentTable.length,                                              color:'#1B4F72', bg:'#dbeafe' },
                    { label:'إجمالي المحصّل',   val:fmt(rentTable.reduce((s,t)=>s+t.totalPaid,0))+' ر.س',          color:'#16a34a', bg:'#d1fae5' },
                    { label:'إجمالي المتأخرات', val:fmt(rentTable.reduce((s,t)=>s+t.balance,0))+' ر.س',            color:'#dc2626', bg:'#fee2e2' },
                    { label:'نسبة التحصيل',     val:fmtPct(rentTable.reduce((s,t)=>s+t.totalPaid,0)/Math.max(1,rentTable.reduce((s,t)=>s+t.totalExpected,0))*100), color:'#7c3aed', bg:'#ede9fe' },
                  ].map(k=>(
                    <div key={k.label} style={{ background:k.bg, borderRadius:'12px', padding:'14px 10px', textAlign:'center' }}>
                      <div style={{ fontSize:'16px', fontWeight:'700', color:k.color }}>{k.val}</div>
                      <div style={{ fontSize:'11px', color:'#6b7280', marginTop:'3px' }}>{k.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
                  <span style={{ fontSize:'13px', color:'#6b7280' }}>البيانات: <strong style={{ color:'#1B4F72' }}>{periodLabel}</strong></span>
                  <button onClick={exportToExcel}
                    style={{ padding:'10px 20px', background:'#1E8449', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'13px', fontWeight:'600', fontFamily:'sans-serif', display:'flex', alignItems:'center', gap:'8px' }}>
                    ⬇ تصدير Excel
                  </button>
                </div>

                <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e5e7eb', overflow:'hidden' }}>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px', minWidth:'800px' }}>
                      <thead>
                        <tr style={{ background:'#1B4F72' }}>
                          <th style={{ ...th, width:'70px' }}>رقم الشقة</th>
                          <th style={{ ...th, width:'200px', textAlign:'right', paddingRight:'12px' }}>اسم المستأجر</th>
                          <th style={{ ...th, width:'100px' }}>الإيجار</th>
                          {months.map(m=><th key={m} style={{ ...th, width:'90px' }}>{MONTHS_AR[m-1]}</th>)}
                          <th style={{ ...th, width:'110px', background:'#154360' }}>المجموع</th>
                          <th style={{ ...th, width:'90px', background:'#154360' }}>المتأخر</th>
                          <th style={{ ...th, width:'80px', background:'#154360' }}>النسبة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rentTable.map((t,i)=>{
                          const isVacant = !t.rentAmount && !t.totalPaid;
                          const pct = t.totalExpected>0 ? Math.round(t.totalPaid/t.totalExpected*100) : null;
                          return (
                            <tr key={i} style={{ borderBottom:'1px solid #f3f4f6', background:i%2===0?'#fafafa':'#fff' }}>
                              <td style={{ ...td, textAlign:'center', fontWeight:'700', color:'#1B4F72' }}>{t.unitNumber}</td>
                              <td style={{ ...td, textAlign:'right', paddingRight:'12px' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                                  {t.hasMultiple && <span title="أكثر من مستأجر في هذه الفترة">👥</span>}
                                  <span style={{ color:isVacant?'#9ca3af':'#111827', fontStyle:isVacant?'italic':'normal' }}>{t.name}</span>
                                </div>
                              </td>
                              <td style={{ ...td, textAlign:'center', color:'#1e40af', fontWeight:'600' }}>{t.rentAmount?fmt(t.rentAmount):''}</td>
                              {months.map(m=>{
                                const paid     = t.payments[m]||0;
                                const expected = (() => {
                                  // نتحقق من وجود مستأجر في هذا الشهر
                                  const ms = new Date(y,m-1,1), me = new Date(y,m,0,23,59,59);
                                  const ten = tenants.filter(ten => ten.unitId === units.find(u=>u.unitNumber===t.unitNumber)?.id).find(ten => {
                                    const s = ten.contractStart?.toDate?ten.contractStart.toDate():null;
                                    const e = ten.contractEnd?.toDate?ten.contractEnd.toDate():null;
                                    return s&&e&&s<=me&&e>=ms;
                                  });
                                  return ten?.rentAmount || 0;
                                })();
                                let bg='transparent', color='#374151', fw:'normal'|'600'|'700'='normal';
                                if (!expected && !paid) { bg='#f3f4f6'; color='#9ca3af'; }
                                else if (paid>0&&paid>=expected) { bg='#d1fae5'; color='#065f46'; fw='700'; }
                                else if (paid>0&&paid<expected)  { bg='#fef3c7'; color='#92400e'; fw='600'; }
                                else if (expected>0)             { bg='#fee2e2'; color='#dc2626'; }
                                return (
                                  <td key={m} style={{ ...td, textAlign:'center', background:bg, color, fontWeight:fw }}>
                                    {paid?fmt(paid):(expected?'✗':'')}
                                  </td>
                                );
                              })}
                              <td style={{ ...td, textAlign:'center', background:'#dbeafe', fontWeight:'700', color:'#1e40af' }}>{t.totalPaid?fmt(t.totalPaid):'—'}</td>
                              <td style={{ ...td, textAlign:'center', background:t.balance>0?'#fee2e2':'transparent', color:t.balance>0?'#dc2626':'#16a34a', fontWeight:'600' }}>
                                {t.balance>0?fmt(t.balance):'✓'}
                              </td>
                              <td style={{ ...td, textAlign:'center' }}>
                                {pct!==null?(
                                  <span style={{ padding:'2px 8px', borderRadius:'8px', fontSize:'11px', fontWeight:'600', background:pct>=100?'#d1fae5':pct>=50?'#fef3c7':'#fee2e2', color:pct>=100?'#065f46':pct>=50?'#92400e':'#991b1b' }}>
                                    {pct}%
                                  </span>
                                ):'—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background:'#1B4F72' }}>
                          <td style={{ ...td, color:'#fff', fontWeight:'700', textAlign:'center' }}>الإجمالي</td>
                          <td style={{ ...td, color:'#fff' }}></td>
                          <td style={{ ...td, color:'#D4AC0D', fontWeight:'700', textAlign:'center' }}>{fmt(rentTable.reduce((s,t)=>s+t.rentAmount,0))}</td>
                          {months.map(m=>(
                            <td key={m} style={{ ...td, color:'#D4AC0D', fontWeight:'700', textAlign:'center' }}>
                              {fmt(rentTable.reduce((s,t)=>s+(t.payments[m]||0),0))}
                            </td>
                          ))}
                          <td style={{ ...td, color:'#6ee7b7', fontWeight:'700', textAlign:'center' }}>{fmt(rentTable.reduce((s,t)=>s+t.totalPaid,0))}</td>
                          <td style={{ ...td, color:'#fca5a5', fontWeight:'700', textAlign:'center' }}>{fmt(rentTable.reduce((s,t)=>s+t.balance,0))}</td>
                          <td style={{ ...td, color:'#fff', fontWeight:'700', textAlign:'center' }}>
                            {fmtPct(rentTable.reduce((s,t)=>s+t.totalPaid,0)/Math.max(1,rentTable.reduce((s,t)=>s+t.totalExpected,0))*100)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', marginTop:'12px', fontSize:'11px', color:'#6b7280' }}>
                  {[['#d1fae5','#065f46','مدفوع بالكامل'],['#fef3c7','#92400e','دفع جزئي'],['#fee2e2','#dc2626','لم يُدفع'],['#f3f4f6','#9ca3af','لا مستأجر']].map(([bg,color,label])=>(
                    <div key={label as string} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                      <div style={{ width:'14px', height:'14px', borderRadius:'3px', background:bg as string }}/>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ══ TAB: الوحدات ══ */}
            {activeTab==='units' && (
              <div>
                <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'10px', padding:'9px 14px', marginBottom:'14px', fontSize:'12px', color:'#1e40af', display:'flex', gap:'6px' }}>
                  <span>📅</span><span>حالة الدفع مبنية على بيانات <strong>{periodLabel}</strong></span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'10px', marginBottom:'16px' }}>
                  {[
                    { label:'مسددة',           val:unitSummary.paid,        color:'#16a34a', bg:'#d1fae5' },
                    { label:'متأخرة',          val:unitSummary.late,        color:'#d97706', bg:'#fef3c7' },
                    { label:'لا دفعات',        val:unitSummary.noPay,       color:'#6b7280', bg:'#f3f4f6' },
                    { label:'شاغرة',           val:unitSummary.vacant,      color:'#dc2626', bg:'#fee2e2' },
                    { label:'إجمالي المتأخرات',val:fmt(unitSummary.totalArrears)+' ر.س', color:'#dc2626', bg:'#fee2e2' },
                  ].map(k=>(
                    <div key={k.label} style={{ background:k.bg, borderRadius:'12px', padding:'14px 10px', textAlign:'center' }}>
                      <div style={{ fontSize:'18px', fontWeight:'700', color:k.color }}>{k.val}</div>
                      <div style={{ fontSize:'11px', color:'#6b7280', marginTop:'3px' }}>{k.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'16px' }}>
                  <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e5e7eb', padding:'16px' }}>
                    <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151', marginBottom:'12px' }}>توزيع حالة الدفع</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={[{name:'مسددة',value:unitSummary.paid},{name:'متأخرة',value:unitSummary.late},{name:'لا دفعات',value:unitSummary.noPay},{name:'شاغرة',value:unitSummary.vacant},{name:'صيانة',value:unitSummary.maintenance}].filter(d=>d.value>0)}
                          cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({name,value})=>`${name}: ${value}`} labelLine={false}>
                          {['#16a34a','#d97706','#6b7280','#dc2626','#9ca3af'].map((c,i)=><Cell key={i} fill={c}/>)}
                        </Pie><Tooltip/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e5e7eb', padding:'16px' }}>
                    <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151', marginBottom:'12px' }}>توزيع أنواع الوحدات</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={[{name:'شهري',value:units.filter(u=>u.type==='monthly').length},{name:'مفروش',value:units.filter(u=>u.type==='furnished').length},{name:'خاصة',value:units.filter(u=>u.type==='owner').length}].filter(d=>d.value>0)}
                          cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({name,value})=>`${name}: ${value}`} labelLine={false}>
                          {['#1B4F72','#D4AC0D','#7D3C98'].map((c,i)=><Cell key={i} fill={c}/>)}
                        </Pie><Tooltip/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e5e7eb', overflow:'hidden' }}>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                      <thead style={{ background:'#f9fafb' }}>
                        <tr>{['الشقة','النوع','المستأجر','الإيجار','مدفوع في الفترة','المتأخر','آخر دفعة','الحالة'].map(h=>(
                          <th key={h} style={{ padding:'9px 12px', textAlign:'right', color:'#6b7280', fontWeight:'500', borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {unitReport.sort((a,b)=>a.unitNumber?.localeCompare(b.unitNumber,undefined,{numeric:true})).map((u,i)=>(
                          <tr key={u.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                            <td style={{ padding:'9px 12px', fontWeight:'700', color:'#1B4F72' }}>{u.unitNumber}</td>
                            <td style={{ padding:'9px 12px' }}>
                              <span style={{ background:u.type==='monthly'?'#dbeafe':u.type==='furnished'?'#d1fae5':'#fef3c7', color:u.type==='monthly'?'#1e40af':u.type==='furnished'?'#065f46':'#92400e', padding:'2px 8px', borderRadius:'8px', fontSize:'11px' }}>
                                {u.type==='monthly'?'شهري':u.type==='furnished'?'مفروش':'خاصة'}
                              </span>
                            </td>
                            <td style={{ padding:'9px 12px', color:'#374151' }}>{u.tenant?.name||'—'}</td>
                            <td style={{ padding:'9px 12px' }}>{u.tenant?fmt(u.tenant.rentAmount)+' ر.س':'—'}</td>
                            <td style={{ padding:'9px 12px', color:'#16a34a', fontWeight:'600' }}>{u.totalPaid>0?fmt(u.totalPaid)+' ر.س':'—'}</td>
                            <td style={{ padding:'9px 12px', color:u.totalBalance>0?'#dc2626':'#6b7280', fontWeight:u.totalBalance>0?'600':'400' }}>{u.totalBalance>0?fmt(u.totalBalance)+' ر.س':'✓'}</td>
                            <td style={{ padding:'9px 12px', color:'#9ca3af', fontSize:'11px' }}>
                              {u.lastPay?(()=>{ const d=u.lastPay.paidDate?.toDate?u.lastPay.paidDate.toDate():null; return d?`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`:'—'; })():'—'}
                            </td>
                            <td style={{ padding:'9px 12px' }}>
                              <span style={{ background:u.statusBg, color:u.statusColor, padding:'2px 8px', borderRadius:'8px', fontSize:'11px', fontWeight:'600' }}>{u.statusLabel}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ══ TAB: المفروشة ══ */}
            {activeTab==='furnished' && (
              furnishedUnits.length===0 ? (
                <div style={{ background:'#fff', borderRadius:'16px', padding:'40px', textAlign:'center', border:'1px solid #e5e7eb' }}>
                  <div style={{ fontSize:'48px', marginBottom:'12px' }}>🏨</div>
                  <p style={{ color:'#6b7280' }}>لا توجد وحدات مفروشة</p>
                </div>
              ) : (
                <div>
                  <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'10px', padding:'9px 14px', marginBottom:'14px', fontSize:'12px', color:'#1e40af', display:'flex', gap:'6px' }}>
                    <span>📅</span><span>الحجوزات والإيرادات للفترة: <strong>{periodLabel}</strong></span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px', marginBottom:'16px' }}>
                    {[
                      { label:'نسبة الإشغال', val:fmtPct(overallOccupancy), color:overallOccupancy>=70?'#16a34a':overallOccupancy>=50?'#d97706':'#dc2626', bg:overallOccupancy>=70?'#d1fae5':overallOccupancy>=50?'#fef3c7':'#fee2e2' },
                      { label:'إجمالي الإيرادات', val:fmt(furnishedReport.reduce((s,u)=>s+u.totalRevenue,0))+' ر.س', color:'#16a34a', bg:'#d1fae5' },
                      { label:'إجمالي الحجوزات', val:furnishedReport.reduce((s,u)=>s+u.bookingsCount,0)+' حجز', color:'#1e40af', bg:'#dbeafe' },
                      { label:'صافي الربح', val:fmt(furnishedReport.reduce((s,u)=>s+u.netProfit,0))+' ر.س', color:'#7c3aed', bg:'#ede9fe' },
                    ].map(k=>(
                      <div key={k.label} style={{ background:k.bg, borderRadius:'12px', padding:'14px 10px', textAlign:'center' }}>
                        <div style={{ fontSize:'16px', fontWeight:'700', color:k.color }}>{k.val}</div>
                        <div style={{ fontSize:'11px', color:'#6b7280', marginTop:'3px' }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                  {Object.keys(globalChannels).length>0 && (
                    <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e5e7eb', padding:'16px', marginBottom:'16px' }}>
                      <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151', marginBottom:'12px' }}>توزيع المنصات — {periodLabel}</div>
                      <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
                        {Object.entries(globalChannels).map(([ch,data])=>(
                          <div key={ch} style={{ background:'#f9fafb', borderRadius:'10px', padding:'10px 14px', border:'1px solid #e5e7eb', textAlign:'center', minWidth:'90px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'5px', marginBottom:'3px', justifyContent:'center' }}>
                              <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:CH_COLOR[ch]||'#888', display:'inline-block' }}/>
                              <span style={{ fontSize:'11px', fontWeight:'600', color:'#374151' }}>{CH_LABEL[ch]||ch}</span>
                            </div>
                            <div style={{ fontSize:'13px', fontWeight:'700', color:'#1B4F72' }}>{data.count} حجز</div>
                            <div style={{ fontSize:'10px', color:'#16a34a' }}>{fmt(data.revenue)} ر.س</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                    {furnishedReport.map(u=>(
                      <div key={u.id} style={{ background:'#fff', borderRadius:'16px', border:'1px solid #e5e7eb', overflow:'hidden' }}>
                        <div style={{ padding:'14px 16px', background:'#1B4F72', display:'flex', alignItems:'center', gap:'12px' }}>
                          <div style={{ background:'#fff', borderRadius:'8px', padding:'6px 12px', fontSize:'16px', fontWeight:'700', color:'#1B4F72' }}>{u.unitNumber}</div>
                          <div style={{ flex:1 }}>
                            <div style={{ color:'#fff', fontWeight:'600' }}>شقة {u.unitNumber}</div>
                            <div style={{ color:'rgba(255,255,255,0.6)', fontSize:'12px' }}>{u.bookingsCount} حجز · {u.occupancyRate}% إشغال</div>
                          </div>
                          <div style={{ textAlign:'left' }}>
                            <div style={{ fontSize:'22px', fontWeight:'700', color:u.occupancyRate>=70?'#6ee7b7':u.occupancyRate>=50?'#fde68a':'#fca5a5' }}>{u.occupancyRate}%</div>
                            <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.5)' }}>إشغال</div>
                          </div>
                        </div>
                        <div style={{ padding:'16px' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px', marginBottom:'14px' }}>
                            {[
                              { label:'إجمالي الإيرادات', val:fmt(u.totalRevenue)+' ر.س', color:'#16a34a', bg:'#d1fae5' },
                              { label:'إجمالي المصاريف', val:fmt(u.totalExpenses)+' ر.س', color:'#dc2626', bg:'#fee2e2' },
                              { label:'صافي الربح',       val:fmt(u.netProfit)+' ر.س',    color:'#1e40af', bg:'#dbeafe' },
                              { label:'معدل الليلة',      val:u.avgNightlyRate>0?fmt(u.avgNightlyRate)+' ر.س':'—', color:'#7c3aed', bg:'#ede9fe' },
                            ].map(k=>(
                              <div key={k.label} style={{ background:k.bg, borderRadius:'10px', padding:'10px', textAlign:'center' }}>
                                <div style={{ fontSize:'14px', fontWeight:'700', color:k.color }}>{k.val}</div>
                                <div style={{ fontSize:'10px', color:'#6b7280', marginTop:'2px' }}>{k.label}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ marginBottom:'14px' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#6b7280', marginBottom:'4px' }}>
                              <span>نسبة الإشغال — {periodLabel}</span>
                              <span style={{ fontWeight:'600', color:u.occupancyRate>=70?'#16a34a':u.occupancyRate>=50?'#d97706':'#dc2626' }}>{u.occupancyRate}%</span>
                            </div>
                            <div style={{ height:'10px', background:'#f3f4f6', borderRadius:'5px', overflow:'hidden' }}>
                              <div style={{ height:'100%', background:u.occupancyRate>=70?'#16a34a':u.occupancyRate>=50?'#d97706':'#dc2626', width:`${u.occupancyRate}%`, borderRadius:'5px' }}/>
                            </div>
                          </div>
                          {Object.keys(u.byChannel).length>0 && (
                            <div>
                              <div style={{ fontSize:'12px', color:'#6b7280', marginBottom:'8px', fontWeight:'500' }}>الحجوزات حسب المنصة</div>
                              <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                                {Object.entries(u.byChannel).map(([ch,data]:any)=>(
                                  <div key={ch} style={{ background:'#f9fafb', borderRadius:'10px', padding:'8px 12px', border:'1px solid #e5e7eb', textAlign:'center', minWidth:'80px' }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:'5px', marginBottom:'3px', justifyContent:'center' }}>
                                      <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:CH_COLOR[ch]||'#888', display:'inline-block' }}/>
                                      <span style={{ fontSize:'11px', fontWeight:'600', color:'#374151' }}>{CH_LABEL[ch]||ch}</span>
                                    </div>
                                    <div style={{ fontSize:'13px', fontWeight:'700', color:'#1B4F72' }}>{data.count} حجز</div>
                                    <div style={{ fontSize:'10px', color:'#16a34a' }}>{fmt(data.revenue)} ر.س</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const flbl: React.CSSProperties = { display:'block', fontSize:'12px', color:'#6b7280', marginBottom:'5px', fontWeight:'500' };
const fsel: React.CSSProperties = { width:'100%', border:'1.5px solid #e5e7eb', borderRadius:'10px', padding:'9px 12px', fontSize:'13px', background:'#fff', fontFamily:'sans-serif' };
const th:   React.CSSProperties = { padding:'10px 8px', textAlign:'center', color:'#fff', fontWeight:'600', fontSize:'12px', whiteSpace:'nowrap', background:'#1B4F72' };
const td:   React.CSSProperties = { padding:'9px 8px', fontSize:'12px', borderBottom:'1px solid #f3f4f6' };
