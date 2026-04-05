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

// ─── ثوابت ───────────────────────────────────────────
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const CH_LABEL: Record<string,string> = { airbnb:'Airbnb', gathern:'Gathern', booking:'Booking.com', direct:'مباشر', other:'أخرى' };
const CH_COLOR: Record<string,string> = { airbnb:'#E74C3C', gathern:'#27AE60', booking:'#2E86C1', direct:'#D4AC0D', other:'#7D3C98' };

function fmt(n: number) { return n.toLocaleString('ar-SA'); }
function fmtPct(n: number) { return Math.round(n) + '%'; }
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

// ─── أعوام: من 2020 حتى +2 سنة قادمة (قابل للتوسع حتى 50) ───
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 50 }, (_, i) => 2020 + i); // 2020 → 2069

// ─── Types ───────────────────────────────────────────
interface TenantRow {
  unitNumber: string; name: string; rentAmount: number;
  payments: Record<number, number>; // month→amount
  totalPaid: number; totalExpected: number; balance: number;
}

export default function ReportsPage() {
  const router = useRouter();
  const [appUser, setAppUser] = useState<AppUserBasic | null>(null);
  const [properties, setProperties] = useState<PropertyBasic[]>([]);
  const [propId, setPropId] = useState('');
  const [propName, setPropName] = useState('');
  const [yearStr, setYearStr] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState<number>(0); // 0 = سنوي
  const [activeTab, setActiveTab] = useState<'financial'|'rent'|'units'|'furnished'>('financial');
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  // Raw data
  const [reports, setReports] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }
      const user = await getCurrentUser(fbUser.uid);
      if (!user) { router.push('/login'); return; }
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
    const y = parseInt(year);
    const [uS, tS, pS, bS, eS] = await Promise.all([
      getDocs(query(collection(db,'units'), where('propertyId','==',pid))),
      getDocs(query(collection(db,'tenants'), where('propertyId','==',pid))),
      getDocs(query(collection(db,'rentPayments'), where('propertyId','==',pid))),
      getDocs(query(collection(db,'bookings'), where('propertyId','==',pid))),
      getDocs(query(collection(db,'expenses'), where('propertyId','==',pid))),
    ]);
    const allUnits    = uS.docs.map(d => ({ id:d.id, ...d.data() })) as any[];
    const allTenants  = tS.docs.map(d => ({ id:d.id, ...d.data() })) as any[];
    const allPayments = pS.docs.map(d => ({ id:d.id, ...d.data() })) as any[];
    const allBookings = bS.docs.map(d => ({ id:d.id, ...d.data() })) as any[];
    const allExpenses = eS.docs.map(d => ({ id:d.id, ...d.data() })) as any[];

    setUnits(allUnits); setTenants(allTenants); setPayments(allPayments);
    setBookings(allBookings); setExpenses(allExpenses);

    // التقارير الشهرية
    const reps = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const start = new Date(y, m-1, 1);
      const end   = new Date(y, m, 0, 23, 59, 59);
      const monthPay = allPayments.filter(p => {
        const d = p.paidDate?.toDate ? p.paidDate.toDate() : null;
        return d && d >= start && d <= end;
      });
      const monthBook = allBookings.filter(b => {
        if (b.status === 'cancelled') return false;
        const d = b.checkinDate?.toDate ? b.checkinDate.toDate() : null;
        return d && d >= start && d <= end;
      });
      const monthExp = allExpenses.filter(e => {
        const d = e.date?.toDate ? e.date.toDate() : null;
        return d && d >= start && d <= end;
      });
      const monthlyRevenue  = monthPay.reduce((s:number, p:any) => s+(p.amountPaid||0), 0);
      const furnishedRevenue= monthBook.reduce((s:number, b:any) => s+(b.netRevenue||0), 0);
      const totalExpenses   = monthExp.reduce((s:number, e:any) => s+(e.amount||0), 0);
      return { month:m, monthlyRevenue, furnishedRevenue, totalRevenue:monthlyRevenue+furnishedRevenue, totalExpenses, netProfit:monthlyRevenue+furnishedRevenue-totalExpenses };
    });
    setReports(reps);
    setDataLoading(false);
  };

  // ─── جدول الإيجار (تقرير الوحدات الشهري/السنوي) ───
  const rentTable = useMemo((): TenantRow[] => {
    const y = parseInt(yearStr);
    const months = selectedMonth === 0 ? [1,2,3,4,5,6,7,8,9,10,11,12] : [selectedMonth];

    return units
      .filter(u => u.type === 'monthly' || u.type === 'owner')
      .sort((a,b) => a.unitNumber?.localeCompare(b.unitNumber, undefined, {numeric:true}))
      .map(u => {
        const tenant = tenants.find(t => t.unitId === u.id || t.unitNumber === u.unitNumber);
        const monthPays: Record<number, number> = {};
        let totalPaid = 0;

        months.forEach(m => {
          const start = new Date(y, m-1, 1);
          const end   = new Date(y, m, 0, 23, 59, 59);
          const paid = tenant
            ? payments.filter(p =>
                p.tenantId === tenant.id &&
                (() => { const d = p.paidDate?.toDate ? p.paidDate.toDate() : null; return d && d >= start && d <= end; })()
              ).reduce((s:number, p:any) => s+(p.amountPaid||0), 0)
            : 0;
          monthPays[m] = paid;
          totalPaid += paid;
        });

        const rent = tenant?.rentAmount || 0;
        const totalExpected = rent * months.length;
        return {
          unitNumber: u.unitNumber,
          name: tenant?.name || (u.status === 'vacant' ? 'شاغرة' : '—'),
          rentAmount: rent,
          payments: monthPays,
          totalPaid,
          totalExpected,
          balance: Math.max(0, totalExpected - totalPaid),
        };
      });
  }, [units, tenants, payments, yearStr, selectedMonth]);

  // ─── تصدير Excel ───
  const exportToExcel = async () => {
    // استيراد SheetJS ديناميكياً
    const XLSX = await import('xlsx');
    const y = parseInt(yearStr);
    const months = selectedMonth === 0 ? [1,2,3,4,5,6,7,8,9,10,11,12] : [selectedMonth];
    const title = selectedMonth === 0
      ? `تقرير الإيجار السنوي — ${y}`
      : `تقرير الإيجار — ${MONTHS_AR[selectedMonth-1]} ${y}`;

    // بناء الصفوف
    const header1 = [title, '', '', ...months.map(m => MONTHS_AR[m-1]), 'المجموع المدفوع', 'المتأخرات', 'نسبة السداد'];
    const header2 = ['رقم الشقة', 'اسم المستأجر', 'مبلغ الإيجار', ...months.map(m => MONTHS_AR[m-1]), 'المجموع المدفوع', 'المتأخرات', 'نسبة السداد'];

    const rows = rentTable.map(t => {
      const monthVals = months.map(m => t.payments[m] || (t.rentAmount > 0 ? 0 : ''));
      const pct = t.totalExpected > 0 ? `${Math.round(t.totalPaid/t.totalExpected*100)}%` : '—';
      return [t.unitNumber, t.name, t.rentAmount||'', ...monthVals, t.totalPaid||'', t.balance||'', pct];
    });

    // صف الإجماليات
    const totalRow = [
      'الإجمالي', '', rentTable.reduce((s,t)=>s+t.rentAmount,0),
      ...months.map(m => rentTable.reduce((s,t)=>s+(t.payments[m]||0),0)),
      rentTable.reduce((s,t)=>s+t.totalPaid,0),
      rentTable.reduce((s,t)=>s+t.balance,0),
      '',
    ];

    const ws = XLSX.utils.aoa_to_sheet([header2, ...rows, totalRow]);

    // عرض الأعمدة
    ws['!cols'] = [
      { wch: 10 }, { wch: 26 }, { wch: 14 },
      ...months.map(() => ({ wch: 12 })),
      { wch: 16 }, { wch: 14 }, { wch: 12 },
    ];

    // ورقة ملخص
    const summary = [
      ['ملخص إحصائي', ''],
      ['العقار', propName],
      ['السنة', y],
      ['الفترة', selectedMonth === 0 ? 'سنوي' : MONTHS_AR[selectedMonth-1]],
      ['', ''],
      ['إجمالي الوحدات', rentTable.length],
      ['وحدات مشغولة', rentTable.filter(t=>t.rentAmount>0).length],
      ['وحدات شاغرة', rentTable.filter(t=>!t.rentAmount).length],
      ['', ''],
      ['إجمالي الإيجار الشهري', rentTable.reduce((s,t)=>s+t.rentAmount,0)],
      ['إجمالي المطلوب للفترة', rentTable.reduce((s,t)=>s+t.totalExpected,0)],
      ['إجمالي المحصّل', rentTable.reduce((s,t)=>s+t.totalPaid,0)],
      ['إجمالي المتأخرات', rentTable.reduce((s,t)=>s+t.balance,0)],
      ['نسبة التحصيل', `${Math.round(rentTable.reduce((s,t)=>s+t.totalPaid,0)/Math.max(1,rentTable.reduce((s,t)=>s+t.totalExpected,0))*100)}%`],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(summary);
    ws2['!cols'] = [{ wch: 26 }, { wch: 20 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'جدول الإيجار');
    XLSX.utils.book_append_sheet(wb, ws2, 'ملخص إحصائي');

    XLSX.writeFile(wb, `rent_report_${y}_${selectedMonth||'annual'}.xlsx`);
  };

  // ─── مشتقات ───
  const yearTotals = {
    revenue: reports.reduce((s,r)=>s+r.totalRevenue,0),
    expenses: reports.reduce((s,r)=>s+r.totalExpenses,0),
    profit: reports.reduce((s,r)=>s+r.netProfit,0),
  };
  const chartData = reports.map((r,i) => ({
    name: MONTHS_AR[i].slice(0,3), إيرادات:r.totalRevenue, مصاريف:r.totalExpenses, صافي:r.netProfit,
  }));
  const furnishedUnits = units.filter(u=>u.type==='furnished');
  const unitReport = units.map(u => {
    const tenant = tenants.find(t=>t.unitId===u.id||t.unitNumber===u.unitNumber);
    const uPays = tenant ? payments.filter(p=>p.tenantId===tenant.id) : [];
    const totalPaid = uPays.reduce((s:number,p:any)=>s+(p.amountPaid||0),0);
    const totalBalance = uPays.reduce((s:number,p:any)=>s+(p.balance||0),0);
    const lastPay = uPays.sort((a:any,b:any)=>(b.paidDate?.seconds||0)-(a.paidDate?.seconds||0))[0];
    let statusLabel='شاغرة', statusColor='#dc2626', statusBg='#fee2e2';
    if (u.status==='occupied'&&tenant) {
      if (totalBalance>0) { statusLabel='متأخرة'; statusColor='#d97706'; statusBg='#fef3c7'; }
      else { statusLabel='مسددة'; statusColor='#16a34a'; statusBg='#d1fae5'; }
    } else if (u.status==='maintenance') { statusLabel='صيانة'; statusColor='#6b7280'; statusBg='#f3f4f6'; }
    return { ...u, tenant, totalPaid, totalBalance, lastPay, statusLabel, statusColor, statusBg };
  });
  const unitSummary = {
    paid: unitReport.filter(u=>u.statusLabel==='مسددة').length,
    late: unitReport.filter(u=>u.statusLabel==='متأخرة').length,
    vacant: unitReport.filter(u=>u.statusLabel==='شاغرة').length,
    maintenance: unitReport.filter(u=>u.statusLabel==='صيانة').length,
    totalArrears: unitReport.reduce((s,u)=>s+(u.totalBalance||0),0),
  };
  const y = parseInt(yearStr);
  const furnishedReport = furnishedUnits.map(u => {
    const uBook = bookings.filter(b=>b.unitId===u.id&&b.status!=='cancelled');
    const uExp  = expenses.filter(e=>e.unitId===u.id);
    let occ = 0, totalDays = 0;
    for (let m=1;m<=12;m++) {
      const days = daysInMonth(y,m);
      totalDays += days;
      const start=new Date(y,m-1,1), end=new Date(y,m-1,days);
      for (let d=new Date(start);d<=end;d.setDate(d.getDate()+1)) {
        if (uBook.some(b=>{
          const ci=b.checkinDate?.toDate?b.checkinDate.toDate():new Date(b.checkinDate);
          const co=b.checkoutDate?.toDate?b.checkoutDate.toDate():new Date(b.checkoutDate);
          return new Date(d)>=ci&&new Date(d)<co;
        })) occ++;
      }
    }
    const totalRevenue  = uBook.reduce((s:number,b:any)=>s+(b.netRevenue||0),0);
    const totalExpenses = uExp.reduce((s:number,e:any)=>s+(e.amount||0),0);
    const byChannel: Record<string,{count:number;revenue:number}> = {};
    uBook.forEach((b:any)=>{ if(!byChannel[b.channel])byChannel[b.channel]={count:0,revenue:0}; byChannel[b.channel].count++; byChannel[b.channel].revenue+=b.netRevenue||0; });
    return { ...u, bookingsCount:uBook.length, totalRevenue, totalExpenses, netProfit:totalRevenue-totalExpenses, occupancyRate:totalDays>0?Math.round(occ/totalDays*100):0, byChannel, avgNightlyRate:uBook.length>0?Math.round(totalRevenue/Math.max(1,uBook.reduce((s:number,b:any)=>s+(b.nights||0),0))):0 };
  });
  const overallOccupancy = furnishedUnits.length>0
    ? Math.round(furnishedReport.reduce((s,u)=>s+u.occupancyRate,0)/furnishedUnits.length) : 0;
  const globalChannels: Record<string,{count:number;revenue:number}> = {};
  bookings.filter(b=>b.status!=='cancelled').forEach((b:any)=>{ if(!globalChannels[b.channel])globalChannels[b.channel]={count:0,revenue:0}; globalChannels[b.channel].count++; globalChannels[b.channel].revenue+=b.netRevenue||0; });

  const months = selectedMonth === 0 ? [1,2,3,4,5,6,7,8,9,10,11,12] : [selectedMonth];

  if (loading) return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}>
      <div style={{width:'40px',height:'40px',border:'3px solid #1B4F72',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div dir="rtl" style={{fontFamily:'sans-serif',background:'#f9fafb',minHeight:'100vh'}}>

      {/* Top bar */}
      <div style={{background:'#1B4F72',padding:'16px 20px',display:'flex',alignItems:'center',gap:'12px',position:'sticky',top:0,zIndex:50}}>
        <button onClick={()=>router.push('/')} style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:'8px',padding:'8px 12px',cursor:'pointer'}}>
          <span style={{color:'#fff',fontSize:'18px'}}>←</span>
        </button>
        <div style={{flex:1}}>
          <h1 style={{margin:0,fontSize:'17px',fontWeight:'600',color:'#fff'}}>التقارير والإحصاءات</h1>
          <p style={{margin:0,fontSize:'12px',color:'rgba(255,255,255,0.6)'}}>{propName}</p>
        </div>
      </div>

      <div style={{padding:'16px',maxWidth:'960px',margin:'0 auto'}}>

        {/* Filters */}
        <div style={{display:'grid',gridTemplateColumns:properties.length>1?'1fr 1fr 1fr':'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
          {properties.length>1&&(
            <select value={propId} onChange={e=>{const p=properties.find(x=>x.id===e.target.value);setPropId(e.target.value);setPropName(p?.name||'');loadAllData(e.target.value,yearStr);}} style={sel}>
              {properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <select value={yearStr} onChange={e=>{setYearStr(e.target.value);loadAllData(propId,e.target.value);}} style={sel}>
            {YEAR_OPTIONS.map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <select value={selectedMonth} onChange={e=>setSelectedMonth(Number(e.target.value))} style={sel}>
            <option value={0}>📅 سنوي (كل الأشهر)</option>
            {MONTHS_AR.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',background:'#fff',borderRadius:'12px',padding:'4px',marginBottom:'16px',border:'1px solid #e5e7eb',gap:'2px'}}>
          {([['financial','📊 المالي'],['rent','📋 جدول الإيجار'],['units','🏠 الوحدات'],['furnished','🏨 المفروشة']] as const).map(([id,label])=>(
            <button key={id} onClick={()=>setActiveTab(id as any)}
              style={{flex:1,padding:'9px 4px',border:'none',borderRadius:'10px',cursor:'pointer',fontSize:'12px',fontWeight:activeTab===id?'600':'400',background:activeTab===id?'#1B4F72':'transparent',color:activeTab===id?'#fff':'#6b7280',transition:'all 0.15s'}}>
              {label}
            </button>
          ))}
        </div>

        {properties.length===0?(
          <div style={{background:'#fff',borderRadius:'16px',padding:'40px',textAlign:'center',border:'1px solid #e5e7eb'}}>
            <div style={{fontSize:'48px',marginBottom:'12px'}}>📊</div>
            <p style={{color:'#6b7280'}}>لا توجد عقارات مرتبطة بحسابك</p>
          </div>
        ):dataLoading?(
          <div style={{textAlign:'center',padding:'60px',color:'#6b7280'}}>
            <div style={{width:'36px',height:'36px',border:'3px solid #1B4F72',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/>
            جارٍ تحميل البيانات...
          </div>
        ):(
          <>
            {/* ══════ TAB: المالي ══════ */}
            {activeTab==='financial'&&(
              <div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',marginBottom:'16px'}}>
                  {[
                    {label:`إجمالي الإيرادات ${yearStr}`,val:fmt(yearTotals.revenue)+' ر.س',sub:`متوسط: ${fmt(Math.round(yearTotals.revenue/12))} شهرياً`,color:'#2E86C1',border:'#2E86C1'},
                    {label:`إجمالي المصاريف ${yearStr}`,val:fmt(yearTotals.expenses)+' ر.س',sub:'',color:'#dc2626',border:'#dc2626'},
                    {label:`صافي الربح ${yearStr}`,val:fmt(yearTotals.profit)+' ر.س',sub:yearTotals.revenue>0?`هامش: ${fmtPct(yearTotals.profit/yearTotals.revenue*100)}`:'',color:yearTotals.profit>=0?'#16a34a':'#dc2626',border:'#16a34a'},
                  ].map(k=>(
                    <div key={k.label} style={{background:'#fff',borderRadius:'14px',border:'1px solid #e5e7eb',borderTop:`3px solid ${k.border}`,padding:'16px'}}>
                      <div style={{fontSize:'11px',color:'#6b7280',marginBottom:'6px'}}>{k.label}</div>
                      <div style={{fontSize:'18px',fontWeight:'700',color:k.color}}>{k.val}</div>
                      {k.sub&&<div style={{fontSize:'11px',color:'#9ca3af',marginTop:'4px'}}>{k.sub}</div>}
                    </div>
                  ))}
                </div>
                <div style={{background:'#fff',borderRadius:'14px',border:'1px solid #e5e7eb',padding:'16px',marginBottom:'14px'}}>
                  <div style={{fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'12px'}}>الإيرادات مقابل المصاريف</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{top:5,right:10,bottom:5,left:10}}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="name" tick={{fontSize:11}}/>
                      <YAxis tickFormatter={v=>`${(v/1000).toFixed(0)}k`} tick={{fontSize:11}}/>
                      <Tooltip formatter={(v:number)=>`${fmt(v)} ر.س`}/>
                      <Legend/>
                      <Bar dataKey="إيرادات" fill="#2E86C1" radius={[3,3,0,0]}/>
                      <Bar dataKey="مصاريف" fill="#E74C3C" radius={[3,3,0,0]}/>
                      <Bar dataKey="صافي" fill="#1E8449" radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{background:'#fff',borderRadius:'14px',border:'1px solid #e5e7eb',padding:'16px',marginBottom:'14px'}}>
                  <div style={{fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'12px'}}>اتجاه صافي الربح</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="name" tick={{fontSize:11}}/>
                      <YAxis tickFormatter={v=>`${(v/1000).toFixed(0)}k`} tick={{fontSize:11}}/>
                      <Tooltip formatter={(v:number)=>`${fmt(v)} ر.س`}/>
                      <Line type="monotone" dataKey="صافي" stroke="#1E8449" strokeWidth={2} dot={{r:3}}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={{background:'#fff',borderRadius:'14px',border:'1px solid #e5e7eb',overflow:'hidden'}}>
                  <div style={{padding:'14px 16px',borderBottom:'1px solid #e5e7eb',fontSize:'13px',fontWeight:'600',color:'#374151'}}>التقرير الشهري التفصيلي — {yearStr}</div>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                      <thead style={{background:'#f9fafb'}}>
                        <tr>{['الشهر','إيجار شهري','مفروش','إجمالي','مصاريف','صافي','هامش'].map(h=>(
                          <th key={h} style={{padding:'9px 12px',textAlign:'right',color:'#6b7280',fontWeight:'500',borderBottom:'1px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {reports.map((r,i)=>(
                          <tr key={i} style={{borderBottom:'1px solid #f3f4f6'}}>
                            <td style={{padding:'9px 12px',fontWeight:'600',color:'#374151',whiteSpace:'nowrap'}}>{MONTHS_AR[i]}</td>
                            <td style={{padding:'9px 12px'}}>{r.monthlyRevenue>0?fmt(r.monthlyRevenue):'—'}</td>
                            <td style={{padding:'9px 12px'}}>{r.furnishedRevenue>0?fmt(r.furnishedRevenue):'—'}</td>
                            <td style={{padding:'9px 12px',fontWeight:'600'}}>{r.totalRevenue>0?fmt(r.totalRevenue):'—'}</td>
                            <td style={{padding:'9px 12px',color:'#dc2626'}}>{r.totalExpenses>0?fmt(r.totalExpenses):'—'}</td>
                            <td style={{padding:'9px 12px',fontWeight:'600'}}>{r.netProfit!==0?<span style={{color:r.netProfit>=0?'#16a34a':'#dc2626'}}>{fmt(r.netProfit)}</span>:'—'}</td>
                            <td style={{padding:'9px 12px'}}>{r.totalRevenue>0?<span style={{padding:'2px 8px',borderRadius:'8px',fontSize:'11px',fontWeight:'600',background:r.netProfit/r.totalRevenue>=0.5?'#d1fae5':r.netProfit/r.totalRevenue>=0.3?'#fef3c7':'#fee2e2',color:r.netProfit/r.totalRevenue>=0.5?'#065f46':r.netProfit/r.totalRevenue>=0.3?'#92400e':'#991b1b'}}>{fmtPct(r.netProfit/r.totalRevenue*100)}</span>:'—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{background:'#1B4F72'}}>
                          {['المجموع',fmt(reports.reduce((s,r)=>s+r.monthlyRevenue,0)),fmt(reports.reduce((s,r)=>s+r.furnishedRevenue,0)),fmt(yearTotals.revenue),fmt(yearTotals.expenses),fmt(yearTotals.profit),yearTotals.revenue>0?fmtPct(yearTotals.profit/yearTotals.revenue*100):'—'].map((v,i)=>(
                            <td key={i} style={{padding:'10px 12px',color:i===4?'#fca5a5':i===5?'#6ee7b7':'#fff',fontWeight:'600'}}>{v}</td>
                          ))}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ══════ TAB: جدول الإيجار ══════ */}
            {activeTab==='rent'&&(
              <div>
                {/* كروت ملخص */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'16px'}}>
                  {[
                    {label:'إجمالي الوحدات',val:rentTable.length,color:'#1B4F72',bg:'#dbeafe'},
                    {label:'إجمالي المحصّل',val:fmt(rentTable.reduce((s,t)=>s+t.totalPaid,0))+' ر.س',color:'#16a34a',bg:'#d1fae5'},
                    {label:'إجمالي المتأخرات',val:fmt(rentTable.reduce((s,t)=>s+t.balance,0))+' ر.س',color:'#dc2626',bg:'#fee2e2'},
                    {label:'نسبة التحصيل',val:fmtPct(rentTable.reduce((s,t)=>s+t.totalPaid,0)/Math.max(1,rentTable.reduce((s,t)=>s+t.totalExpected,0))*100),color:'#7c3aed',bg:'#ede9fe'},
                  ].map(k=>(
                    <div key={k.label} style={{background:k.bg,borderRadius:'12px',padding:'14px 10px',textAlign:'center'}}>
                      <div style={{fontSize:'16px',fontWeight:'700',color:k.color}}>{k.val}</div>
                      <div style={{fontSize:'11px',color:'#6b7280',marginTop:'3px'}}>{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* زر التصدير */}
                <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'12px'}}>
                  <button onClick={exportToExcel}
                    style={{padding:'10px 20px',background:'#1E8449',color:'#fff',border:'none',borderRadius:'10px',cursor:'pointer',fontSize:'13px',fontWeight:'600',display:'flex',alignItems:'center',gap:'8px'}}>
                    <span>⬇</span> تصدير Excel
                  </button>
                </div>

                {/* الجدول */}
                <div style={{background:'#fff',borderRadius:'14px',border:'1px solid #e5e7eb',overflow:'hidden'}}>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px',minWidth:'800px'}}>
                      <thead>
                        <tr style={{background:'#1B4F72'}}>
                          <th style={{...th,width:'70px'}}>رقم الشقة</th>
                          <th style={{...th,width:'180px',textAlign:'right',paddingRight:'12px'}}>اسم المستأجر</th>
                          <th style={{...th,width:'100px'}}>الإيجار</th>
                          {months.map(m=><th key={m} style={{...th,width:'90px'}}>{MONTHS_AR[m-1]}</th>)}
                          <th style={{...th,width:'110px',background:'#154360'}}>المجموع</th>
                          <th style={{...th,width:'90px',background:'#154360'}}>المتأخر</th>
                          <th style={{...th,width:'80px',background:'#154360'}}>النسبة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rentTable.map((t,i)=>{
                          const isVacant = !t.rentAmount;
                          const pct = t.totalExpected>0 ? Math.round(t.totalPaid/t.totalExpected*100) : null;
                          return (
                            <tr key={i} style={{borderBottom:'1px solid #f3f4f6',background:i%2===0?'#fafafa':'#fff'}}>
                              <td style={{...td,textAlign:'center',fontWeight:'700',color:'#1B4F72'}}>{t.unitNumber}</td>
                              <td style={{...td,textAlign:'right',paddingRight:'12px',color:isVacant?'#9ca3af':'#111827',fontStyle:isVacant?'italic':'normal'}}>{t.name}</td>
                              <td style={{...td,textAlign:'center',color:'#1e40af',fontWeight:'600'}}>{t.rentAmount?fmt(t.rentAmount)+'':''}</td>
                              {months.map(m=>{
                                const paid = t.payments[m] || 0;
                                const expected = t.rentAmount || 0;
                                let bg='transparent',color='#374151',fw:'normal'|'600'|'700'='normal';
                                if (isVacant) { bg='#f3f4f6'; color='#9ca3af'; }
                                else if (paid>0 && paid>=expected) { bg='#d1fae5'; color='#065f46'; fw='700'; }
                                else if (paid>0 && paid<expected) { bg='#fef3c7'; color='#92400e'; fw='600'; }
                                else if (expected>0) { bg='#fee2e2'; color='#dc2626'; }
                                return (
                                  <td key={m} style={{...td,textAlign:'center',background:bg,color,fontWeight:fw}}>
                                    {isVacant?'':paid?fmt(paid):(expected?'✗':'')}
                                  </td>
                                );
                              })}
                              {/* المجموع */}
                              <td style={{...td,textAlign:'center',background:'#dbeafe',fontWeight:'700',color:'#1e40af'}}>
                                {t.totalPaid?fmt(t.totalPaid):'—'}
                              </td>
                              {/* المتأخر */}
                              <td style={{...td,textAlign:'center',background:t.balance>0?'#fee2e2':'transparent',color:t.balance>0?'#dc2626':'#16a34a',fontWeight:'600'}}>
                                {t.balance>0?fmt(t.balance):'✓'}
                              </td>
                              {/* النسبة */}
                              <td style={{...td,textAlign:'center'}}>
                                {pct!==null?(
                                  <span style={{padding:'2px 8px',borderRadius:'8px',fontSize:'11px',fontWeight:'600',background:pct>=100?'#d1fae5':pct>=50?'#fef3c7':'#fee2e2',color:pct>=100?'#065f46':pct>=50?'#92400e':'#991b1b'}}>
                                    {pct}%
                                  </span>
                                ):'—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {/* صف الإجمالي */}
                      <tfoot>
                        <tr style={{background:'#1B4F72'}}>
                          <td style={{...td,color:'#fff',fontWeight:'700',textAlign:'center'}}>الإجمالي</td>
                          <td style={{...td,color:'#fff'}}></td>
                          <td style={{...td,color:'#D4AC0D',fontWeight:'700',textAlign:'center'}}>
                            {fmt(rentTable.reduce((s,t)=>s+t.rentAmount,0))}
                          </td>
                          {months.map(m=>(
                            <td key={m} style={{...td,color:'#D4AC0D',fontWeight:'700',textAlign:'center'}}>
                              {fmt(rentTable.reduce((s,t)=>s+(t.payments[m]||0),0))}
                            </td>
                          ))}
                          <td style={{...td,color:'#6ee7b7',fontWeight:'700',textAlign:'center'}}>
                            {fmt(rentTable.reduce((s,t)=>s+t.totalPaid,0))}
                          </td>
                          <td style={{...td,color:'#fca5a5',fontWeight:'700',textAlign:'center'}}>
                            {fmt(rentTable.reduce((s,t)=>s+t.balance,0))}
                          </td>
                          <td style={{...td,color:'#fff',fontWeight:'700',textAlign:'center'}}>
                            {fmtPct(rentTable.reduce((s,t)=>s+t.totalPaid,0)/Math.max(1,rentTable.reduce((s,t)=>s+t.totalExpected,0))*100)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* مفتاح الألوان */}
                <div style={{display:'flex',gap:'12px',flexWrap:'wrap',marginTop:'12px',fontSize:'11px',color:'#6b7280'}}>
                  {[['#d1fae5','#065f46','مدفوع بالكامل'],['#fef3c7','#92400e','دفع جزئي'],['#fee2e2','#dc2626','لم يُدفع'],['#f3f4f6','#9ca3af','شاغرة']].map(([bg,color,label])=>(
                    <div key={label as string} style={{display:'flex',alignItems:'center',gap:'5px'}}>
                      <div style={{width:'14px',height:'14px',borderRadius:'3px',background:bg as string,border:`1px solid ${color as string}30`}}/>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ══════ TAB: الوحدات ══════ */}
            {activeTab==='units'&&(
              <div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'10px',marginBottom:'16px'}}>
                  {[
                    {label:'مسددة',val:unitSummary.paid,color:'#16a34a',bg:'#d1fae5'},
                    {label:'متأخرة',val:unitSummary.late,color:'#d97706',bg:'#fef3c7'},
                    {label:'شاغرة',val:unitSummary.vacant,color:'#dc2626',bg:'#fee2e2'},
                    {label:'صيانة',val:unitSummary.maintenance,color:'#6b7280',bg:'#f3f4f6'},
                    {label:'إجمالي المتأخرات',val:fmt(unitSummary.totalArrears)+' ر.س',color:'#dc2626',bg:'#fee2e2'},
                  ].map(k=>(
                    <div key={k.label} style={{background:k.bg,borderRadius:'12px',padding:'14px 10px',textAlign:'center'}}>
                      <div style={{fontSize:'18px',fontWeight:'700',color:k.color}}>{k.val}</div>
                      <div style={{fontSize:'11px',color:'#6b7280',marginTop:'3px'}}>{k.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'16px'}}>
                  <div style={{background:'#fff',borderRadius:'14px',border:'1px solid #e5e7eb',padding:'16px'}}>
                    <div style={{fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'12px'}}>توزيع حالة الوحدات</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={[{name:'مسددة',value:unitSummary.paid},{name:'متأخرة',value:unitSummary.late},{name:'شاغرة',value:unitSummary.vacant},{name:'صيانة',value:unitSummary.maintenance}].filter(d=>d.value>0)}
                          cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({name,value})=>`${name}: ${value}`} labelLine={false}>
                          {['#16a34a','#d97706','#dc2626','#6b7280'].map((c,i)=><Cell key={i} fill={c}/>)}
                        </Pie><Tooltip/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{background:'#fff',borderRadius:'14px',border:'1px solid #e5e7eb',padding:'16px'}}>
                    <div style={{fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'12px'}}>توزيع أنواع الوحدات</div>
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
                <div style={{background:'#fff',borderRadius:'14px',border:'1px solid #e5e7eb',overflow:'hidden'}}>
                  <div style={{padding:'14px 16px',borderBottom:'1px solid #e5e7eb',fontSize:'13px',fontWeight:'600',color:'#374151'}}>تفصيل كل وحدة</div>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                      <thead style={{background:'#f9fafb'}}>
                        <tr>{['الشقة','النوع','الحالة','المستأجر','الإيجار','إجمالي مدفوع','المتأخر','آخر دفعة'].map(h=>(
                          <th key={h} style={{padding:'9px 12px',textAlign:'right',color:'#6b7280',fontWeight:'500',borderBottom:'1px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {unitReport.sort((a,b)=>a.unitNumber?.localeCompare(b.unitNumber,undefined,{numeric:true})).map((u,i)=>(
                          <tr key={u.id} style={{borderBottom:'1px solid #f3f4f6'}}>
                            <td style={{padding:'9px 12px',fontWeight:'700',color:'#1B4F72'}}>{u.unitNumber}</td>
                            <td style={{padding:'9px 12px'}}><span style={{background:u.type==='monthly'?'#dbeafe':u.type==='furnished'?'#d1fae5':'#fef3c7',color:u.type==='monthly'?'#1e40af':u.type==='furnished'?'#065f46':'#92400e',padding:'2px 8px',borderRadius:'8px',fontSize:'11px'}}>{u.type==='monthly'?'شهري':u.type==='furnished'?'مفروش':'خاصة'}</span></td>
                            <td style={{padding:'9px 12px'}}><span style={{background:u.statusBg,color:u.statusColor,padding:'2px 8px',borderRadius:'8px',fontSize:'11px',fontWeight:'600'}}>{u.statusLabel}</span></td>
                            <td style={{padding:'9px 12px',color:'#374151'}}>{u.tenant?.name||'—'}</td>
                            <td style={{padding:'9px 12px'}}>{u.tenant?fmt(u.tenant.rentAmount)+' ر.س':'—'}</td>
                            <td style={{padding:'9px 12px',color:'#16a34a',fontWeight:'600'}}>{u.totalPaid>0?fmt(u.totalPaid)+' ر.س':'—'}</td>
                            <td style={{padding:'9px 12px',color:u.totalBalance>0?'#dc2626':'#6b7280',fontWeight:u.totalBalance>0?'600':'400'}}>{u.totalBalance>0?fmt(u.totalBalance)+' ر.س':'✓'}</td>
                            <td style={{padding:'9px 12px',color:'#9ca3af',fontSize:'11px'}}>
                              {u.lastPay?((d=>(d?`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`:'—'))(u.lastPay.paidDate?.toDate?u.lastPay.paidDate.toDate():null)):'—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ══════ TAB: المفروشة ══════ */}
            {activeTab==='furnished'&&(
              furnishedUnits.length===0?(
                <div style={{background:'#fff',borderRadius:'16px',padding:'40px',textAlign:'center',border:'1px solid #e5e7eb'}}>
                  <div style={{fontSize:'48px',marginBottom:'12px'}}>🏨</div>
                  <p style={{color:'#6b7280'}}>لا توجد وحدات مفروشة</p>
                </div>
              ):(
                <div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'16px'}}>
                    {[
                      {label:'نسبة الإشغال العامة',val:fmtPct(overallOccupancy),color:overallOccupancy>=70?'#16a34a':overallOccupancy>=50?'#d97706':'#dc2626',bg:overallOccupancy>=70?'#d1fae5':overallOccupancy>=50?'#fef3c7':'#fee2e2'},
                      {label:'إجمالي الإيرادات',val:fmt(furnishedReport.reduce((s,u)=>s+u.totalRevenue,0))+' ر.س',color:'#16a34a',bg:'#d1fae5'},
                      {label:'إجمالي الحجوزات',val:furnishedReport.reduce((s,u)=>s+u.bookingsCount,0)+' حجز',color:'#1e40af',bg:'#dbeafe'},
                      {label:'صافي الربح',val:fmt(furnishedReport.reduce((s,u)=>s+u.netProfit,0))+' ر.س',color:'#7c3aed',bg:'#ede9fe'},
                    ].map(k=>(
                      <div key={k.label} style={{background:k.bg,borderRadius:'12px',padding:'14px 10px',textAlign:'center'}}>
                        <div style={{fontSize:'16px',fontWeight:'700',color:k.color}}>{k.val}</div>
                        <div style={{fontSize:'11px',color:'#6b7280',marginTop:'3px'}}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
                    {furnishedReport.map(u=>(
                      <div key={u.id} style={{background:'#fff',borderRadius:'16px',border:'1px solid #e5e7eb',overflow:'hidden'}}>
                        <div style={{padding:'14px 16px',background:'#1B4F72',display:'flex',alignItems:'center',gap:'12px'}}>
                          <div style={{background:'#fff',borderRadius:'8px',padding:'6px 12px',fontSize:'16px',fontWeight:'700',color:'#1B4F72'}}>{u.unitNumber}</div>
                          <div style={{flex:1}}>
                            <div style={{color:'#fff',fontWeight:'600'}}>شقة {u.unitNumber}</div>
                            <div style={{color:'rgba(255,255,255,0.6)',fontSize:'12px'}}>{u.bookingsCount} حجز · {u.occupancyRate}% إشغال</div>
                          </div>
                          <div style={{textAlign:'left'}}>
                            <div style={{fontSize:'22px',fontWeight:'700',color:u.occupancyRate>=70?'#6ee7b7':u.occupancyRate>=50?'#fde68a':'#fca5a5'}}>{u.occupancyRate}%</div>
                            <div style={{fontSize:'11px',color:'rgba(255,255,255,0.5)'}}>إشغال</div>
                          </div>
                        </div>
                        <div style={{padding:'16px'}}>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'14px'}}>
                            {[
                              {label:'إجمالي الإيرادات',val:fmt(u.totalRevenue)+' ر.س',color:'#16a34a',bg:'#d1fae5'},
                              {label:'إجمالي المصاريف',val:fmt(u.totalExpenses)+' ر.س',color:'#dc2626',bg:'#fee2e2'},
                              {label:'صافي الربح',val:fmt(u.netProfit)+' ر.س',color:'#1e40af',bg:'#dbeafe'},
                              {label:'معدل الليلة',val:u.avgNightlyRate>0?fmt(u.avgNightlyRate)+' ر.س':'—',color:'#7c3aed',bg:'#ede9fe'},
                            ].map(k=>(
                              <div key={k.label} style={{background:k.bg,borderRadius:'10px',padding:'10px',textAlign:'center'}}>
                                <div style={{fontSize:'14px',fontWeight:'700',color:k.color}}>{k.val}</div>
                                <div style={{fontSize:'10px',color:'#6b7280',marginTop:'2px'}}>{k.label}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{marginBottom:'14px'}}>
                            <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>
                              <span>نسبة الإشغال السنوية</span>
                              <span style={{fontWeight:'600',color:u.occupancyRate>=70?'#16a34a':u.occupancyRate>=50?'#d97706':'#dc2626'}}>{u.occupancyRate}%</span>
                            </div>
                            <div style={{height:'10px',background:'#f3f4f6',borderRadius:'5px',overflow:'hidden'}}>
                              <div style={{height:'100%',background:u.occupancyRate>=70?'#16a34a':u.occupancyRate>=50?'#d97706':'#dc2626',width:`${u.occupancyRate}%`,borderRadius:'5px',transition:'width 0.5s'}}/>
                            </div>
                          </div>
                          {Object.keys(u.byChannel).length>0&&(
                            <div>
                              <div style={{fontSize:'12px',color:'#6b7280',marginBottom:'8px',fontWeight:'500'}}>الحجوزات حسب المنصة</div>
                              <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                                {Object.entries(u.byChannel).map(([ch,data]:any)=>(
                                  <div key={ch} style={{background:'#f9fafb',borderRadius:'10px',padding:'8px 12px',border:'1px solid #e5e7eb',textAlign:'center',minWidth:'80px'}}>
                                    <div style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'3px',justifyContent:'center'}}>
                                      <span style={{width:'8px',height:'8px',borderRadius:'50%',background:CH_COLOR[ch]||'#888',display:'inline-block'}}/>
                                      <span style={{fontSize:'11px',fontWeight:'600',color:'#374151'}}>{CH_LABEL[ch]||ch}</span>
                                    </div>
                                    <div style={{fontSize:'13px',fontWeight:'700',color:'#1B4F72'}}>{data.count} حجز</div>
                                    <div style={{fontSize:'10px',color:'#16a34a'}}>{fmt(data.revenue)} ر.س</div>
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

const sel: React.CSSProperties = {border:'1.5px solid #e5e7eb',borderRadius:'12px',padding:'12px 16px',fontSize:'14px',background:'#fff',width:'100%'};
const th: React.CSSProperties = {padding:'10px 8px',textAlign:'center',color:'#fff',fontWeight:'600',fontSize:'12px',whiteSpace:'nowrap',background:'#1B4F72'};
const td: React.CSSProperties = {padding:'9px 8px',fontSize:'12px',borderBottom:'1px solid #f3f4f6'};
