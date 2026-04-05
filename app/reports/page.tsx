'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../../lib/userHelpers';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';

const MONTH_LABELS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                      'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const CH_LABEL: Record<string,string> = { airbnb:'Airbnb', gathern:'Gathern', booking:'Booking.com', direct:'مباشر', other:'أخرى' };
const CH_COLOR: Record<string,string> = { airbnb:'#E74C3C', gathern:'#27AE60', booking:'#2E86C1', direct:'#D4AC0D', other:'#7D3C98' };
const PIE_COLORS = ['#1B4F72','#2E86C1','#D4AC0D','#1E8449','#7D3C98','#E74C3C','#F39C12'];

function fmt(n: number) { return n.toLocaleString('ar-SA'); }
function fmtPct(n: number) { return Math.round(n) + '%'; }

// عدد أيام الشهر
function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

// حساب نسبة إشغال وحدة مفروشة
function calcOccupancy(bookings: any[], unitId: string, year: number, month: number) {
  const days = daysInMonth(year, month);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month - 1, days);
  let occupied = 0;
  const ub = bookings.filter(b => b.unitId === unitId && b.status !== 'cancelled');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const isOcc = ub.some(b => {
      const ci = b.checkinDate?.toDate ? b.checkinDate.toDate() : new Date(b.checkinDate);
      const co = b.checkoutDate?.toDate ? b.checkoutDate.toDate() : new Date(b.checkoutDate);
      return d >= ci && d < co;
    });
    if (isOcc) occupied++;
  }
  return Math.round((occupied / days) * 100);
}

export default function ReportsPage() {
  const router = useRouter();
  const [appUser, setAppUser] = useState<AppUserBasic | null>(null);
  const [properties, setProperties] = useState<PropertyBasic[]>([]);
  const [propId, setPropId] = useState('');
  const [propName, setPropName] = useState('');
  const [yearStr, setYearStr] = useState(String(new Date().getFullYear()));
  const [activeTab, setActiveTab] = useState<'financial'|'units'|'furnished'>('financial');
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  // Financial data
  const [reports, setReports] = useState<any[]>([]);
  // Units data
  const [units, setUnits] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  // Furnished data
  const [furnishedUnits, setFurnishedUnits] = useState<any[]>([]);
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
        setPropId(props[0].id);
        setPropName(props[0].name);
        await loadAllData(props[0].id, String(new Date().getFullYear()));
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadAllData = async (pid: string, year: string) => {
    setDataLoading(true);
    const y = parseInt(year);

    const [unitsSnap, tenantsSnap, paymentsSnap, bookingsSnap, expensesSnap] = await Promise.all([
      getDocs(query(collection(db, 'units'), where('propertyId', '==', pid))),
      getDocs(query(collection(db, 'tenants'), where('propertyId', '==', pid))),
      getDocs(query(collection(db, 'rentPayments'), where('propertyId', '==', pid))),
      getDocs(query(collection(db, 'bookings'), where('propertyId', '==', pid))),
      getDocs(query(collection(db, 'expenses'), where('propertyId', '==', pid))),
    ]);

    const allUnits = unitsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    const allTenants = tenantsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    const allPayments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    const allBookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    const allExpenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    setUnits(allUnits);
    setTenants(allTenants);
    setPayments(allPayments);
    setBookings(allBookings);
    setExpenses(allExpenses);
    setFurnishedUnits(allUnits.filter(u => u.type === 'furnished'));

    // حساب التقارير الشهرية
    const monthlyReports = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0, 23, 59, 59);

      const monthPayments = allPayments.filter(p => {
        const d = p.paidDate?.toDate ? p.paidDate.toDate() : null;
        return d && d >= start && d <= end;
      });
      const monthBookings = allBookings.filter(b => {
        if (b.status === 'cancelled') return false;
        const d = b.checkinDate?.toDate ? b.checkinDate.toDate() : null;
        return d && d >= start && d <= end;
      });
      const monthExpenses = allExpenses.filter(e => {
        const d = e.date?.toDate ? e.date.toDate() : null;
        return d && d >= start && d <= end;
      });

      const monthlyRevenue = monthPayments.reduce((s: number, p: any) => s + (p.amountPaid || 0), 0);
      const furnishedRevenue = monthBookings.reduce((s: number, b: any) => s + (b.netRevenue || 0), 0);
      const totalExpenses = monthExpenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);

      return {
        month: m,
        monthlyRevenue,
        furnishedRevenue,
        totalRevenue: monthlyRevenue + furnishedRevenue,
        totalExpenses,
        netProfit: monthlyRevenue + furnishedRevenue - totalExpenses,
      };
    });
    setReports(monthlyReports);
    setDataLoading(false);
  };

  // ─── المشتقات ───
  const yearTotals = {
    revenue: reports.reduce((s, r) => s + r.totalRevenue, 0),
    expenses: reports.reduce((s, r) => s + r.totalExpenses, 0),
    profit: reports.reduce((s, r) => s + r.netProfit, 0),
  };

  const chartData = reports.map((r, i) => ({
    name: MONTH_LABELS[i].slice(0, 3),
    إيرادات: r.totalRevenue,
    مصاريف: r.totalExpenses,
    صافي: r.netProfit,
  }));

  // ─── تقرير الوحدات ───
  const unitReport = units.map(u => {
    const tenant = tenants.find(t => t.unitId === u.id || t.unitNumber === u.unitNumber);
    const unitPayments = tenant ? payments.filter(p => p.tenantId === tenant.id) : [];
    const totalPaid = unitPayments.reduce((s: number, p: any) => s + (p.amountPaid || 0), 0);
    const totalBalance = unitPayments.reduce((s: number, p: any) => s + (p.balance || 0), 0);
    const lastPayment = unitPayments.sort((a: any, b: any) => (b.paidDate?.seconds || 0) - (a.paidDate?.seconds || 0))[0];

    let statusLabel = 'شاغرة';
    let statusColor = '#dc2626';
    let statusBg = '#fee2e2';
    if (u.status === 'occupied' && tenant) {
      if (totalBalance > 0) { statusLabel = 'متأخرة'; statusColor = '#d97706'; statusBg = '#fef3c7'; }
      else { statusLabel = 'مسددة'; statusColor = '#16a34a'; statusBg = '#d1fae5'; }
    } else if (u.status === 'maintenance') {
      statusLabel = 'صيانة'; statusColor = '#6b7280'; statusBg = '#f3f4f6';
    }

    return { ...u, tenant, totalPaid, totalBalance, lastPayment, statusLabel, statusColor, statusBg };
  });

  const unitSummary = {
    paid:        unitReport.filter(u => u.statusLabel === 'مسددة').length,
    late:        unitReport.filter(u => u.statusLabel === 'متأخرة').length,
    vacant:      unitReport.filter(u => u.statusLabel === 'شاغرة').length,
    maintenance: unitReport.filter(u => u.statusLabel === 'صيانة').length,
    totalArrears: unitReport.reduce((s, u) => s + (u.totalBalance || 0), 0),
  };

  // ─── تقرير الشقق المفروشة ───
  const y = parseInt(yearStr);
  const furnishedReport = furnishedUnits.map(u => {
    const uBookings = bookings.filter(b => b.unitId === u.id && b.status !== 'cancelled');
    const uExpenses = expenses.filter(e => e.unitId === u.id);

    // حساب نسبة الإشغال السنوية
    let totalOccupied = 0;
    let totalDays = 0;
    for (let m = 1; m <= 12; m++) {
      const days = daysInMonth(y, m);
      totalDays += days;
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m - 1, days);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const isOcc = uBookings.some(b => {
          const ci = b.checkinDate?.toDate ? b.checkinDate.toDate() : new Date(b.checkinDate);
          const co = b.checkoutDate?.toDate ? b.checkoutDate.toDate() : new Date(b.checkoutDate);
          const dCopy = new Date(d);
          return dCopy >= ci && dCopy < co;
        });
        if (isOcc) totalOccupied++;
      }
    }
    const occupancyRate = totalDays > 0 ? Math.round((totalOccupied / totalDays) * 100) : 0;

    // توزيع حسب المنصة
    const byChannel: Record<string, { count: number; revenue: number }> = {};
    uBookings.forEach(b => {
      if (!byChannel[b.channel]) byChannel[b.channel] = { count: 0, revenue: 0 };
      byChannel[b.channel].count++;
      byChannel[b.channel].revenue += b.netRevenue || 0;
    });

    const totalRevenue = uBookings.reduce((s: number, b: any) => s + (b.netRevenue || 0), 0);
    const totalExpensesUnit = uExpenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);
    const netProfit = totalRevenue - totalExpensesUnit;

    return {
      ...u,
      bookingsCount: uBookings.length,
      totalRevenue,
      totalExpenses: totalExpensesUnit,
      netProfit,
      occupancyRate,
      byChannel,
      avgNightlyRate: uBookings.length > 0
        ? Math.round(totalRevenue / uBookings.reduce((s: number, b: any) => s + (b.nights || 0), 0) || 0)
        : 0,
    };
  });

  // إشغال عام (كل الوحدات المفروشة)
  const totalFurnishedDays = furnishedUnits.length * 365;
  const totalOccupiedDays = furnishedReport.reduce((s, u) => {
    return s + Math.round(u.occupancyRate * 365 / 100);
  }, 0);
  const overallOccupancy = totalFurnishedDays > 0 ? Math.round((totalOccupiedDays / totalFurnishedDays) * 100) : 0;

  // توزيع المنصات الكلي
  const globalChannels: Record<string, { count: number; revenue: number }> = {};
  bookings.filter(b => b.status !== 'cancelled').forEach(b => {
    if (!globalChannels[b.channel]) globalChannels[b.channel] = { count: 0, revenue: 0 };
    globalChannels[b.channel].count++;
    globalChannels[b.channel].revenue += b.netRevenue || 0;
  });
  const totalBookings = Object.values(globalChannels).reduce((s, c) => s + c.count, 0);

  // أعوام متاحة (من 2020 حتى العام القادم)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 2020 + 2 }, (_, i) => 2020 + i);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div style={{ width: '40px', height: '40px', border: '3px solid #1B4F72', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div dir="rtl" style={{ fontFamily: 'sans-serif', background: '#f9fafb', minHeight: '100vh' }}>

      {/* Top bar */}
      <div style={{ background: '#1B4F72', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => router.push('/')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}>
          <span style={{ color: '#fff', fontSize: '18px' }}>←</span>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: '600', color: '#fff' }}>التقارير والإحصاءات</h1>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>{propName}</p>
        </div>
      </div>

      <div style={{ padding: '16px', maxWidth: '960px', margin: '0 auto' }}>

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: properties.length > 1 ? '1fr 1fr' : '1fr', gap: '10px', marginBottom: '14px' }}>
          {properties.length > 1 && (
            <select value={propId} onChange={e => {
              const p = properties.find(x => x.id === e.target.value);
              setPropId(e.target.value); setPropName(p?.name || '');
              loadAllData(e.target.value, yearStr);
            }} style={sel}>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <select value={yearStr} onChange={e => { setYearStr(e.target.value); loadAllData(propId, e.target.value); }} style={sel}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: '#fff', borderRadius: '12px', padding: '4px', marginBottom: '16px', border: '1px solid #e5e7eb' }}>
          {[
            ['financial', '📊 المالي السنوي'],
            ['units',     '🏠 الوحدات والمستأجرون'],
            ['furnished', '🏨 الشقق المفروشة'],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id as any)}
              style={{ flex: 1, padding: '9px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: activeTab === id ? '600' : '400', background: activeTab === id ? '#1B4F72' : 'transparent', color: activeTab === id ? '#fff' : '#6b7280', transition: 'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>

        {properties.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
            <p style={{ color: '#6b7280' }}>لا توجد عقارات مرتبطة بحسابك</p>
          </div>
        ) : dataLoading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
            <div style={{ width: '36px', height: '36px', border: '3px solid #1B4F72', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            جارٍ تحميل البيانات...
          </div>
        ) : (

          <>
            {/* ══════════════ TAB 1: المالي ══════════════ */}
            {activeTab === 'financial' && (
              <div>
                {/* KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '16px' }}>
                  {[
                    { label: `إجمالي الإيرادات`, val: fmt(yearTotals.revenue) + ' ر.س', sub: `متوسط شهري: ${fmt(Math.round(yearTotals.revenue / 12))}`, color: '#2E86C1', border: '#2E86C1' },
                    { label: `إجمالي المصاريف`, val: fmt(yearTotals.expenses) + ' ر.س', sub: '', color: '#dc2626', border: '#dc2626' },
                    { label: `صافي الربح`, val: fmt(yearTotals.profit) + ' ر.س', sub: yearTotals.revenue > 0 ? `هامش: ${fmtPct(yearTotals.profit / yearTotals.revenue * 100)}` : '', color: yearTotals.profit >= 0 ? '#16a34a' : '#dc2626', border: '#16a34a' },
                  ].map(k => (
                    <div key={k.label} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', borderTop: `3px solid ${k.border}`, padding: '16px' }}>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>{k.label} {yearStr}</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: k.color }}>{k.val}</div>
                      {k.sub && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{k.sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Bar Chart */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '16px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>الإيرادات مقابل المصاريف — {yearStr}</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => `${fmt(v)} ر.س`} />
                      <Legend />
                      <Bar dataKey="إيرادات" fill="#2E86C1" radius={[3,3,0,0]} />
                      <Bar dataKey="مصاريف" fill="#E74C3C" radius={[3,3,0,0]} />
                      <Bar dataKey="صافي" fill="#1E8449" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Line Chart */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '16px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>اتجاه صافي الربح</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => `${fmt(v)} ر.س`} />
                      <Line type="monotone" dataKey="صافي" stroke="#1E8449" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Monthly table */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                    التقرير الشهري التفصيلي — {yearStr}
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead style={{ background: '#f9fafb' }}>
                        <tr>
                          {['الشهر','إيجار شهري','مفروش','إجمالي إيرادات','إجمالي مصاريف','صافي','هامش'].map(h => (
                            <th key={h} style={{ padding: '9px 12px', textAlign: 'right', color: '#6b7280', fontWeight: '500', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '9px 12px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>{MONTH_LABELS[i]}</td>
                            <td style={{ padding: '9px 12px' }}>{r.monthlyRevenue > 0 ? fmt(r.monthlyRevenue) : '—'}</td>
                            <td style={{ padding: '9px 12px' }}>{r.furnishedRevenue > 0 ? fmt(r.furnishedRevenue) : '—'}</td>
                            <td style={{ padding: '9px 12px', fontWeight: '600' }}>{r.totalRevenue > 0 ? fmt(r.totalRevenue) : '—'}</td>
                            <td style={{ padding: '9px 12px', color: '#dc2626' }}>{r.totalExpenses > 0 ? fmt(r.totalExpenses) : '—'}</td>
                            <td style={{ padding: '9px 12px', fontWeight: '600' }}>
                              {r.netProfit !== 0 ? <span style={{ color: r.netProfit >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(r.netProfit)}</span> : '—'}
                            </td>
                            <td style={{ padding: '9px 12px' }}>
                              {r.totalRevenue > 0 ? (
                                <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '600',
                                  background: r.netProfit/r.totalRevenue >= 0.5 ? '#d1fae5' : r.netProfit/r.totalRevenue >= 0.3 ? '#fef3c7' : '#fee2e2',
                                  color: r.netProfit/r.totalRevenue >= 0.5 ? '#065f46' : r.netProfit/r.totalRevenue >= 0.3 ? '#92400e' : '#991b1b' }}>
                                  {fmtPct(r.netProfit/r.totalRevenue*100)}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#1B4F72' }}>
                          <td style={{ padding: '10px 12px', color: '#fff', fontWeight: '600' }}>المجموع</td>
                          <td style={{ padding: '10px 12px', color: '#fff' }}>{fmt(reports.reduce((s,r)=>s+r.monthlyRevenue,0))}</td>
                          <td style={{ padding: '10px 12px', color: '#fff' }}>{fmt(reports.reduce((s,r)=>s+r.furnishedRevenue,0))}</td>
                          <td style={{ padding: '10px 12px', color: '#fff', fontWeight: '600' }}>{fmt(yearTotals.revenue)}</td>
                          <td style={{ padding: '10px 12px', color: '#fca5a5' }}>{fmt(yearTotals.expenses)}</td>
                          <td style={{ padding: '10px 12px', color: '#6ee7b7', fontWeight: '600' }}>{fmt(yearTotals.profit)}</td>
                          <td style={{ padding: '10px 12px', color: '#fff' }}>
                            {yearTotals.revenue > 0 ? fmtPct(yearTotals.profit/yearTotals.revenue*100) : '—'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════ TAB 2: الوحدات ══════════════ */}
            {activeTab === 'units' && (
              <div>
                {/* ملخص */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', marginBottom: '16px' }}>
                  {[
                    { label: 'مسددة', val: unitSummary.paid, color: '#16a34a', bg: '#d1fae5' },
                    { label: 'متأخرة', val: unitSummary.late, color: '#d97706', bg: '#fef3c7' },
                    { label: 'شاغرة', val: unitSummary.vacant, color: '#dc2626', bg: '#fee2e2' },
                    { label: 'صيانة', val: unitSummary.maintenance, color: '#6b7280', bg: '#f3f4f6' },
                    { label: 'إجمالي المتأخرات', val: fmt(unitSummary.totalArrears) + ' ر.س', color: '#dc2626', bg: '#fee2e2' },
                  ].map(k => (
                    <div key={k.label} style={{ background: k.bg, borderRadius: '12px', padding: '14px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: k.color }}>{k.val}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* Pie Chart توزيع الوحدات */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>توزيع حالة الوحدات</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={[
                          { name: 'مسددة', value: unitSummary.paid },
                          { name: 'متأخرة', value: unitSummary.late },
                          { name: 'شاغرة', value: unitSummary.vacant },
                          { name: 'صيانة', value: unitSummary.maintenance },
                        ].filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                          {['#16a34a','#d97706','#dc2626','#6b7280'].map((c, i) => <Cell key={i} fill={c} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>توزيع أنواع الوحدات</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={[
                          { name: 'شهري', value: units.filter(u=>u.type==='monthly').length },
                          { name: 'مفروش', value: units.filter(u=>u.type==='furnished').length },
                          { name: 'خاصة', value: units.filter(u=>u.type==='owner').length },
                        ].filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                          {['#1B4F72','#D4AC0D','#7D3C98'].map((c, i) => <Cell key={i} fill={c} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* جدول تفصيلي */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', fontSize: '13px', fontWeight: '600', color: '#374151' }}>تفصيل كل وحدة</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead style={{ background: '#f9fafb' }}>
                        <tr>
                          {['الشقة','النوع','الحالة','المستأجر','الإيجار','إجمالي مدفوع','المتأخر','آخر دفعة'].map(h => (
                            <th key={h} style={{ padding: '9px 12px', textAlign: 'right', color: '#6b7280', fontWeight: '500', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {unitReport.sort((a, b) => a.unitNumber?.localeCompare(b.unitNumber, undefined, { numeric: true })).map((u, i) => (
                          <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '9px 12px', fontWeight: '700', color: '#1B4F72' }}>{u.unitNumber}</td>
                            <td style={{ padding: '9px 12px' }}>
                              <span style={{ background: u.type==='monthly'?'#dbeafe':u.type==='furnished'?'#d1fae5':'#fef3c7', color: u.type==='monthly'?'#1e40af':u.type==='furnished'?'#065f46':'#92400e', padding: '2px 8px', borderRadius: '8px', fontSize: '11px' }}>
                                {u.type==='monthly'?'شهري':u.type==='furnished'?'مفروش':'خاصة'}
                              </span>
                            </td>
                            <td style={{ padding: '9px 12px' }}>
                              <span style={{ background: u.statusBg, color: u.statusColor, padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '600' }}>{u.statusLabel}</span>
                            </td>
                            <td style={{ padding: '9px 12px', color: '#374151' }}>{u.tenant?.name || '—'}</td>
                            <td style={{ padding: '9px 12px' }}>{u.tenant ? fmt(u.tenant.rentAmount) + ' ر.س' : '—'}</td>
                            <td style={{ padding: '9px 12px', color: '#16a34a', fontWeight: '600' }}>{u.totalPaid > 0 ? fmt(u.totalPaid) + ' ر.س' : '—'}</td>
                            <td style={{ padding: '9px 12px', color: u.totalBalance > 0 ? '#dc2626' : '#6b7280', fontWeight: u.totalBalance > 0 ? '600' : '400' }}>
                              {u.totalBalance > 0 ? fmt(u.totalBalance) + ' ر.س' : '✓'}
                            </td>
                            <td style={{ padding: '9px 12px', color: '#9ca3af', fontSize: '11px' }}>
                              {u.lastPayment ? (() => {
                                const d = u.lastPayment.paidDate?.toDate ? u.lastPayment.paidDate.toDate() : null;
                                return d ? `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}` : '—';
                              })() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════ TAB 3: المفروشة ══════════════ */}
            {activeTab === 'furnished' && (
              <div>
                {furnishedUnits.length === 0 ? (
                  <div style={{ background: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏨</div>
                    <p style={{ color: '#6b7280' }}>لا توجد وحدات مفروشة</p>
                  </div>
                ) : (
                  <>
                    {/* KPIs عامة */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '16px' }}>
                      {[
                        { label: 'نسبة الإشغال العامة', val: fmtPct(overallOccupancy), color: overallOccupancy >= 70 ? '#16a34a' : overallOccupancy >= 50 ? '#d97706' : '#dc2626', bg: overallOccupancy >= 70 ? '#d1fae5' : overallOccupancy >= 50 ? '#fef3c7' : '#fee2e2' },
                        { label: 'إجمالي الإيرادات', val: fmt(furnishedReport.reduce((s,u)=>s+u.totalRevenue,0)) + ' ر.س', color: '#16a34a', bg: '#d1fae5' },
                        { label: 'إجمالي الحجوزات', val: furnishedReport.reduce((s,u)=>s+u.bookingsCount,0) + ' حجز', color: '#1e40af', bg: '#dbeafe' },
                        { label: 'صافي الربح', val: fmt(furnishedReport.reduce((s,u)=>s+u.netProfit,0)) + ' ر.س', color: '#7c3aed', bg: '#ede9fe' },
                      ].map(k => (
                        <div key={k.label} style={{ background: k.bg, borderRadius: '12px', padding: '14px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: k.color }}>{k.val}</div>
                          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>{k.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* توزيع المنصات */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>توزيع الحجوزات حسب المنصة</div>
                        <ResponsiveContainer width="100%" height={180}>
                          <PieChart>
                            <Pie data={Object.entries(globalChannels).map(([k, v]) => ({ name: CH_LABEL[k] || k, value: v.count }))}
                              cx="50%" cy="50%" outerRadius={70} dataKey="value"
                              label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                              {Object.keys(globalChannels).map((k, i) => <Cell key={i} fill={CH_COLOR[k] || PIE_COLORS[i % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>الإيرادات حسب المنصة</div>
                        {Object.entries(globalChannels).sort(([,a],[,b]) => b.revenue - a.revenue).map(([ch, data]) => {
                          const totalRev = Object.values(globalChannels).reduce((s, c) => s + c.revenue, 0);
                          const pct = totalRev > 0 ? Math.round(data.revenue / totalRev * 100) : 0;
                          return (
                            <div key={ch} style={{ marginBottom: '10px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: CH_COLOR[ch] || '#888', display: 'inline-block' }} />
                                  {CH_LABEL[ch] || ch} ({data.count} حجز)
                                </span>
                                <span style={{ fontWeight: '600', color: '#374151' }}>{fmt(data.revenue)} ر.س ({pct}%)</span>
                              </div>
                              <div style={{ height: '5px', background: '#f3f4f6', borderRadius: '3px' }}>
                                <div style={{ height: '100%', background: CH_COLOR[ch] || '#888', width: `${pct}%`, borderRadius: '3px' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* بطاقات كل وحدة مفروشة */}
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '10px' }}>تفصيل كل شقة مفروشة</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {furnishedReport.map(u => (
                        <div key={u.id} style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                          {/* Header */}
                          <div style={{ padding: '14px 16px', background: '#1B4F72', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: '#fff', borderRadius: '8px', padding: '6px 12px', fontSize: '16px', fontWeight: '700', color: '#1B4F72' }}>
                              {u.unitNumber}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ color: '#fff', fontWeight: '600' }}>شقة {u.unitNumber}</div>
                              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>{u.bookingsCount} حجز · {u.occupancyRate}% إشغال</div>
                            </div>
                            {/* شريط الإشغال */}
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ fontSize: '22px', fontWeight: '700', color: u.occupancyRate >= 70 ? '#6ee7b7' : u.occupancyRate >= 50 ? '#fde68a' : '#fca5a5' }}>
                                {u.occupancyRate}%
                              </div>
                              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>إشغال</div>
                            </div>
                          </div>

                          <div style={{ padding: '16px' }}>
                            {/* KPIs الوحدة */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '14px' }}>
                              {[
                                { label: 'إجمالي الإيرادات', val: fmt(u.totalRevenue) + ' ر.س', color: '#16a34a', bg: '#d1fae5' },
                                { label: 'إجمالي المصاريف', val: fmt(u.totalExpenses) + ' ر.س', color: '#dc2626', bg: '#fee2e2' },
                                { label: 'صافي الربح', val: fmt(u.netProfit) + ' ر.س', color: '#1e40af', bg: '#dbeafe' },
                                { label: 'معدل الليلة', val: u.avgNightlyRate > 0 ? fmt(u.avgNightlyRate) + ' ر.س' : '—', color: '#7c3aed', bg: '#ede9fe' },
                              ].map(k => (
                                <div key={k.label} style={{ background: k.bg, borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                                  <div style={{ fontSize: '14px', fontWeight: '700', color: k.color }}>{k.val}</div>
                                  <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>{k.label}</div>
                                </div>
                              ))}
                            </div>

                            {/* شريط الإشغال المرئي */}
                            <div style={{ marginBottom: '14px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                                <span>نسبة الإشغال السنوية</span>
                                <span style={{ fontWeight: '600', color: u.occupancyRate >= 70 ? '#16a34a' : u.occupancyRate >= 50 ? '#d97706' : '#dc2626' }}>{u.occupancyRate}%</span>
                              </div>
                              <div style={{ height: '10px', background: '#f3f4f6', borderRadius: '5px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', background: u.occupancyRate >= 70 ? '#16a34a' : u.occupancyRate >= 50 ? '#d97706' : '#dc2626', width: `${u.occupancyRate}%`, borderRadius: '5px', transition: 'width 0.5s' }} />
                              </div>
                            </div>

                            {/* توزيع المنصات */}
                            {Object.keys(u.byChannel).length > 0 && (
                              <div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>الحجوزات حسب المنصة</div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  {Object.entries(u.byChannel).map(([ch, data]: [string, any]) => (
                                    <div key={ch} style={{ background: '#f9fafb', borderRadius: '10px', padding: '8px 12px', border: '1px solid #e5e7eb', textAlign: 'center', minWidth: '80px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px', justifyContent: 'center' }}>
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: CH_COLOR[ch] || '#888', display: 'inline-block' }} />
                                        <span style={{ fontSize: '11px', fontWeight: '600', color: '#374151' }}>{CH_LABEL[ch] || ch}</span>
                                      </div>
                                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#1B4F72' }}>{data.count} حجز</div>
                                      <div style={{ fontSize: '10px', color: '#16a34a' }}>{fmt(data.revenue)} ر.س</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const sel: React.CSSProperties = { border: '1.5px solid #e5e7eb', borderRadius: '12px', padding: '12px 16px', fontSize: '14px', background: '#fff', width: '100%' };
