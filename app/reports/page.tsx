// app/reports/page.tsx — التقارير والإحصاءات
'use client';
import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { getMonthlyReport, getBookings, getUnits, calcOccupancy } from '../../lib/db';
import { exportMonthlyExcel } from '../../lib/export';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import type { Unit } from '../../types';

export default function ReportsPage() {
  const { activeProperty, activeMonth, setActivePage } = useStore();
  const [reports,    setReports]    = useState<any[]>([]);
  const [furnUnits,  setFurnUnits]  = useState<Unit[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [yearStr,    setYearStr]    = useState(activeMonth.split('-')[0]);

  useEffect(() => {
    setActivePage('reports');
    if (!activeProperty) return;
    loadReports();
  }, [activeProperty, yearStr]);

  const loadReports = async () => {
    if (!activeProperty) return;
    setLoading(true);
    const year = parseInt(yearStr);

    // تحميل 12 شهر
    const monthlyReports = await Promise.all(
      Array.from({length: 12}, (_, i) => i + 1).map(m =>
        getMonthlyReport(activeProperty.id, year, m)
      )
    );

    // وحدات مفروشة
    const units = await getUnits(activeProperty.id);
    const fUnits = units.filter(u => u.type === 'furnished');
    setFurnUnits(fUnits);
    setReports(monthlyReports);
    setLoading(false);
  };

  const MONTH_LABELS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                        'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  // بيانات الرسوم البيانية
  const chartData = reports.map((r, i) => ({
    name:     MONTH_LABELS[i].slice(0, 3),
    إيرادات:  r.totalRevenue,
    مصاريف:   r.totalExpenses,
    صافي:     r.netProfit,
  }));

  // إجماليات السنة
  const yearTotals = {
    revenue:  reports.reduce((s, r) => s + r.totalRevenue,  0),
    expenses: reports.reduce((s, r) => s + r.totalExpenses, 0),
    profit:   reports.reduce((s, r) => s + r.netProfit,     0),
  };

  const fmt = (n: number) => n.toLocaleString('ar-SA');

  // تصدير Excel
  const handleExportExcel = () => {
    if (!activeProperty) return;
    const [y, m] = activeMonth.split('-').map(Number);
    const r = reports[m - 1];
    if (!r) return;
    exportMonthlyExcel({
      payments: [],
      bookings: r.bookings || [],
      expenses: [],
      summary: [
        { label: 'إيرادات شهرية', value: r.monthlyRevenue },
        { label: 'إيرادات مفروشة', value: r.furnishedRevenue },
        { label: 'إجمالي الإيرادات', value: r.totalRevenue },
        { label: 'إجمالي المصاريف', value: r.totalExpenses },
        { label: 'صافي الربح', value: r.netProfit },
      ],
    }, activeProperty.name, activeMonth);
  };

  if (!activeProperty) return <NoProperty />;

  return (
    <div className="p-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-medium text-gray-800">التقارير والإحصاءات</h1>
          <p className="text-sm text-gray-400">{activeProperty.name}</p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={yearStr}
            onChange={e => setYearStr(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
          >
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={handleExportExcel}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >⬇ Excel</button>
        </div>
      </div>

      {loading ? <PageLoader /> : (
        <>
          {/* Year KPIs */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-white rounded-xl border border-gray-100 p-4 border-t-2 border-t-blue-400">
              <div className="text-xs text-gray-400">إجمالي إيرادات {yearStr}</div>
              <div className="text-xl font-medium text-gray-800 mt-1">{fmt(yearTotals.revenue)} ر.س</div>
              <div className="text-xs text-gray-400 mt-1">
                متوسط شهري: {fmt(Math.round(yearTotals.revenue / 12))} ر.س
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 border-t-2 border-t-red-400">
              <div className="text-xs text-gray-400">إجمالي مصاريف {yearStr}</div>
              <div className="text-xl font-medium text-red-600 mt-1">{fmt(yearTotals.expenses)} ر.س</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 border-t-2 border-t-green-400">
              <div className="text-xs text-gray-400">صافي ربح {yearStr}</div>
              <div className={`text-xl font-medium mt-1 ${yearTotals.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(yearTotals.profit)} ر.س
              </div>
              <div className="text-xs text-gray-400 mt-1">
                هامش: {yearTotals.revenue > 0 ? Math.round(yearTotals.profit / yearTotals.revenue * 100) : 0}%
              </div>
            </div>
          </div>

          {/* Bar Chart — Revenue vs Expenses */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
            <div className="text-sm font-medium text-gray-700 mb-4">الإيرادات مقابل المصاريف — {yearStr}</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="name" tick={{ fontSize: 11 }}/>
                <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }}/>
                <Tooltip formatter={(v: number) => `${v.toLocaleString('ar-SA')} ر.س`}/>
                <Legend/>
                <Bar dataKey="إيرادات" fill="#2E86C1" radius={[3,3,0,0]}/>
                <Bar dataKey="مصاريف" fill="#E74C3C" radius={[3,3,0,0]}/>
                <Bar dataKey="صافي"   fill="#1E8449" radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Line Chart — Net Profit Trend */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
            <div className="text-sm font-medium text-gray-700 mb-4">اتجاه صافي الربح الشهري</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="name" tick={{ fontSize: 11 }}/>
                <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }}/>
                <Tooltip formatter={(v: number) => `${v.toLocaleString('ar-SA')} ر.س`}/>
                <Line type="monotone" dataKey="صافي" stroke="#1E8449" strokeWidth={2} dot={{ r: 3 }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly comparison table */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="text-sm font-medium text-gray-700">التقرير التفصيلي الشهري — {yearStr}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium sticky right-0 bg-gray-50">الشهر</th>
                    <th className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium whitespace-nowrap">إيجار شهري</th>
                    <th className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium whitespace-nowrap">إيجار مفروش</th>
                    <th className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium whitespace-nowrap">إجمالي إيرادات</th>
                    <th className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium whitespace-nowrap">إجمالي مصاريف</th>
                    <th className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium whitespace-nowrap">صافي الربح</th>
                    <th className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium whitespace-nowrap">هامش</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r, i) => (
                    <tr key={i} className={`border-t border-gray-50 hover:bg-gray-50/50 ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                      <td className="px-3 py-2 text-xs font-medium text-gray-700 sticky right-0 bg-white">{MONTH_LABELS[i]}</td>
                      <td className="px-3 py-2 text-xs">{r.monthlyRevenue > 0 ? fmt(r.monthlyRevenue) : '—'}</td>
                      <td className="px-3 py-2 text-xs">{r.furnishedRevenue > 0 ? fmt(r.furnishedRevenue) : '—'}</td>
                      <td className="px-3 py-2 text-xs font-medium">{r.totalRevenue > 0 ? fmt(r.totalRevenue) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-red-500">{r.totalExpenses > 0 ? fmt(r.totalExpenses) : '—'}</td>
                      <td className="px-3 py-2 text-xs font-medium">
                        {r.netProfit !== 0 ? (
                          <span className={r.netProfit >= 0 ? 'text-green-600' : 'text-red-500'}>
                            {fmt(r.netProfit)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.totalRevenue > 0 ? (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium
                            ${r.netProfit/r.totalRevenue >= 0.5 ? 'bg-green-50 text-green-600' :
                              r.netProfit/r.totalRevenue >= 0.3 ? 'bg-yellow-50 text-yellow-600' :
                              'bg-red-50 text-red-500'}`}>
                            {Math.round(r.netProfit/r.totalRevenue*100)}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#1B4F72] text-white">
                  <tr>
                    <td className="px-3 py-2.5 text-xs font-medium">المجموع</td>
                    <td className="px-3 py-2.5 text-xs">{fmt(reports.reduce((s,r)=>s+r.monthlyRevenue,0))}</td>
                    <td className="px-3 py-2.5 text-xs">{fmt(reports.reduce((s,r)=>s+r.furnishedRevenue,0))}</td>
                    <td className="px-3 py-2.5 text-xs font-medium">{fmt(yearTotals.revenue)}</td>
                    <td className="px-3 py-2.5 text-xs">{fmt(yearTotals.expenses)}</td>
                    <td className="px-3 py-2.5 text-xs font-medium">{fmt(yearTotals.profit)}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {yearTotals.revenue > 0 ? `${Math.round(yearTotals.profit/yearTotals.revenue*100)}%` : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PageLoader() {
  return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>;
}
function NoProperty() {
  return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">يرجى اختيار عقار أولاً</div>;
}
