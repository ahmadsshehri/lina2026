'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../../lib/userHelpers';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';

interface MonthReport {
  month: number;
  monthlyRevenue: number;
  furnishedRevenue: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

const MONTH_LABELS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function fmt(n: number) { return n.toLocaleString('ar-SA'); }

async function calcMonthReport(propId: string, year: number, month: number): Promise<MonthReport> {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const [paySnap, bookSnap, expSnap] = await Promise.all([
    getDocs(query(collection(db, 'rentPayments'), where('propertyId', '==', propId))),
    getDocs(query(collection(db, 'bookings'), where('propertyId', '==', propId))),
    getDocs(query(collection(db, 'expenses'), where('propertyId', '==', propId))),
  ]);

  const monthlyRevenue = paySnap.docs
    .map(d => d.data() as any)
    .filter(p => {
      const d = p.paidDate?.toDate ? p.paidDate.toDate() : null;
      return d && d >= start && d <= end;
    })
    .reduce((s, p) => s + (p.amountPaid || 0), 0);

  const furnishedRevenue = bookSnap.docs
    .map(d => d.data() as any)
    .filter(b => {
      if (b.status === 'cancelled') return false;
      const d = b.checkinDate?.toDate ? b.checkinDate.toDate() : null;
      return d && d >= start && d <= end;
    })
    .reduce((s, b) => s + (b.netRevenue || 0), 0);

  const totalExpenses = expSnap.docs
    .map(d => d.data() as any)
    .filter(e => {
      const d = e.date?.toDate ? e.date.toDate() : null;
      return d && d >= start && d <= end;
    })
    .reduce((s, e) => s + (e.amount || 0), 0);

  return {
    month,
    monthlyRevenue,
    furnishedRevenue,
    totalRevenue: monthlyRevenue + furnishedRevenue,
    totalExpenses,
    netProfit: monthlyRevenue + furnishedRevenue - totalExpenses,
  };
}

export default function ReportsPage() {
  const router = useRouter();
  const [appUser, setAppUser] = useState<AppUserBasic | null>(null);
  const [properties, setProperties] = useState<PropertyBasic[]>([]);
  const [propId, setPropId] = useState('');
  const [propName, setPropName] = useState('');
  const [yearStr, setYearStr] = useState(String(new Date().getFullYear()));
  const [reports, setReports] = useState<MonthReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);

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
        await loadReports(props[0].id, String(new Date().getFullYear()));
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadReports = async (pid: string, year: string) => {
    setReportLoading(true);
    const y = parseInt(year);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => calcMonthReport(pid, y, i + 1))
    );
    setReports(results);
    setReportLoading(false);
  };

  const yearTotals = {
    revenue:  reports.reduce((s, r) => s + r.totalRevenue, 0),
    expenses: reports.reduce((s, r) => s + r.totalExpenses, 0),
    profit:   reports.reduce((s, r) => s + r.netProfit, 0),
  };

  const chartData = reports.map((r, i) => ({
    name: MONTH_LABELS[i].slice(0, 3),
    إيرادات: r.totalRevenue,
    مصاريف:  r.totalExpenses,
    صافي:    r.netProfit,
  }));

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

      <div style={{ padding: '16px', maxWidth: '900px', margin: '0 auto' }}>

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: properties.length > 1 ? '1fr 1fr' : '1fr', gap: '10px', marginBottom: '16px' }}>
          {properties.length > 1 && (
            <select value={propId} onChange={e => {
              const p = properties.find(x => x.id === e.target.value);
              setPropId(e.target.value);
              setPropName(p?.name || '');
              loadReports(e.target.value, yearStr);
            }} style={selStyle}>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <select value={yearStr} onChange={e => { setYearStr(e.target.value); loadReports(propId, e.target.value); }} style={selStyle}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {properties.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
            <p style={{ color: '#6b7280' }}>لا توجد عقارات مرتبطة بحسابك</p>
          </div>
        ) : reportLoading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
            <div style={{ width: '36px', height: '36px', border: '3px solid #1B4F72', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            جارٍ تحميل التقارير...
          </div>
        ) : (
          <>
            {/* KPIs السنوية */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '16px' }}>
              {[
                { label: `إجمالي إيرادات ${yearStr}`, val: fmt(yearTotals.revenue) + ' ر.س', sub: `متوسط شهري: ${fmt(Math.round(yearTotals.revenue / 12))} ر.س`, color: '#2E86C1', border: '#2E86C1' },
                { label: `إجمالي مصاريف ${yearStr}`, val: fmt(yearTotals.expenses) + ' ر.س', sub: '', color: '#dc2626', border: '#dc2626' },
                { label: `صافي ربح ${yearStr}`, val: fmt(yearTotals.profit) + ' ر.س', sub: yearTotals.revenue > 0 ? `هامش: ${Math.round(yearTotals.profit / yearTotals.revenue * 100)}%` : '', color: yearTotals.profit >= 0 ? '#16a34a' : '#dc2626', border: '#16a34a' },
              ].map(k => (
                <div key={k.label} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', borderTop: `3px solid ${k.border}`, padding: '16px' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>{k.label}</div>
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
                  <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `${fmt(v)} ر.س`} />
                  <Legend />
                  <Bar dataKey="إيرادات" fill="#2E86C1" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="مصاريف" fill="#E74C3C" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="صافي" fill="#1E8449" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Line Chart */}
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '16px', marginBottom: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>اتجاه صافي الربح الشهري</div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `${fmt(v)} ر.س`} />
                  <Line type="monotone" dataKey="صافي" stroke="#1E8449" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* الجدول التفصيلي */}
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>التقرير التفصيلي الشهري — {yearStr}</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ background: '#f9fafb' }}>
                    <tr>
                      {['الشهر', 'إيجار شهري', 'مفروش', 'إجمالي إيرادات', 'إجمالي مصاريف', 'صافي', 'هامش'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: '500', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '9px 12px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>{MONTH_LABELS[i]}</td>
                        <td style={{ padding: '9px 12px', color: '#374151' }}>{r.monthlyRevenue > 0 ? fmt(r.monthlyRevenue) : '—'}</td>
                        <td style={{ padding: '9px 12px', color: '#374151' }}>{r.furnishedRevenue > 0 ? fmt(r.furnishedRevenue) : '—'}</td>
                        <td style={{ padding: '9px 12px', fontWeight: '600' }}>{r.totalRevenue > 0 ? fmt(r.totalRevenue) : '—'}</td>
                        <td style={{ padding: '9px 12px', color: '#dc2626' }}>{r.totalExpenses > 0 ? fmt(r.totalExpenses) : '—'}</td>
                        <td style={{ padding: '9px 12px', fontWeight: '600' }}>
                          {r.netProfit !== 0 ? (
                            <span style={{ color: r.netProfit >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(r.netProfit)}</span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          {r.totalRevenue > 0 ? (
                            <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '600', background: r.netProfit / r.totalRevenue >= 0.5 ? '#d1fae5' : r.netProfit / r.totalRevenue >= 0.3 ? '#fef3c7' : '#fee2e2', color: r.netProfit / r.totalRevenue >= 0.5 ? '#065f46' : r.netProfit / r.totalRevenue >= 0.3 ? '#92400e' : '#991b1b' }}>
                              {Math.round(r.netProfit / r.totalRevenue * 100)}%
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#1B4F72' }}>
                      <td style={{ padding: '10px 12px', color: '#fff', fontWeight: '600' }}>المجموع</td>
                      <td style={{ padding: '10px 12px', color: '#fff' }}>{fmt(reports.reduce((s, r) => s + r.monthlyRevenue, 0))}</td>
                      <td style={{ padding: '10px 12px', color: '#fff' }}>{fmt(reports.reduce((s, r) => s + r.furnishedRevenue, 0))}</td>
                      <td style={{ padding: '10px 12px', color: '#fff', fontWeight: '600' }}>{fmt(yearTotals.revenue)}</td>
                      <td style={{ padding: '10px 12px', color: '#fca5a5' }}>{fmt(yearTotals.expenses)}</td>
                      <td style={{ padding: '10px 12px', color: '#6ee7b7', fontWeight: '600' }}>{fmt(yearTotals.profit)}</td>
                      <td style={{ padding: '10px 12px', color: '#fff' }}>
                        {yearTotals.revenue > 0 ? `${Math.round(yearTotals.profit / yearTotals.revenue * 100)}%` : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const selStyle: React.CSSProperties = { border: '1.5px solid #e5e7eb', borderRadius: '12px', padding: '12px 16px', fontSize: '14px', background: '#fff', width: '100%' };
