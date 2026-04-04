'use client';
import { useEffect, useState } from 'react';
import { AuthProvider } from '../context/AuthContext';
import AppLayout from '../components/layout/AppLayout';
import { useStore } from '../store/useStore';
import { getMonthlyReport, getArrearsReport } from '../lib/db';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { Toaster } from 'react-hot-toast';

const CHANNEL_COLORS: Record<string, string> = {
  airbnb: '#E74C3C', gathern: '#27AE60',
  booking: '#2E86C1', direct: '#D4AC0D', other: '#7D3C98',
};

function DashboardContent() {
  const { activeProperty, activeMonth, setActivePage } = useStore();
  const [report, setReport]   = useState<any>(null);
  const [arrears, setArrears] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setActivePage('dashboard');
    if (!activeProperty) return;
    const [y, m] = activeMonth.split('-').map(Number);
    Promise.all([
      getMonthlyReport(activeProperty.id, y, m),
      getArrearsReport(activeProperty.id),
    ]).then(([r, a]) => {
      setReport(r);
      setArrears(a);
    }).finally(() => setLoading(false));
  }, [activeProperty, activeMonth]);

  if (!activeProperty) return (
    <div className="flex items-center justify-center h-full text-gray-400">
      <div className="text-center">
        <div className="text-5xl mb-4">🏢</div>
        <p className="text-lg font-medium text-gray-600">لا يوجد عقار مختار</p>
        <p className="text-sm text-gray-400 mt-1">يرجى إضافة عقار من صفحة الوحدات</p>
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  const r = report;
  const fmt = (n: number) => n?.toLocaleString('ar-SA') || '0';

  const expData = r ? Object.entries(r.expenseByCategory).map(([k, v]) => ({
    name: ({electricity:'كهرباء',water:'مياه',maintenance:'صيانة',
            salary:'رواتب',cleaning:'نظافة',other:'أخرى'} as any)[k] || k,
    value: v as number,
  })) : [];

  const channelData = r ? Object.entries(
    r.bookings.reduce((acc: any, b: any) => {
      if (b.status !== 'cancelled') acc[b.channel] = (acc[b.channel] || 0) + b.netRevenue;
      return acc;
    }, {})
  ).map(([k, v]) => ({ name: k, value: v as number })) : [];

  return (
    <div className="p-5" dir="rtl">
      <div className="mb-5">
        <h1 className="text-lg font-medium text-gray-800">لوحة التحكم</h1>
        <p className="text-sm text-gray-400">{activeProperty.name} — {activeMonth}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard label="صافي الربح" value={`${fmt(r?.netProfit)} ر.س`}
          sub={r?.netProfit > 0 ? '▲ إيجابي' : '▼ سالب'}
          subColor={r?.netProfit > 0 ? 'text-green-600' : 'text-red-500'} accent="#1E8449"/>
        <KpiCard label="إجمالي الإيرادات" value={`${fmt(r?.totalRevenue)} ر.س`}
          sub={`شهري ${fmt(r?.monthlyRevenue)} + مفروش ${fmt(r?.furnishedRevenue)}`} accent="#2E86C1"/>
        <KpiCard label="إجمالي المصاريف" value={`${fmt(r?.totalExpenses)} ر.س`}
          sub="كهرباء + رواتب + صيانة" accent="#E74C3C"/>
        <KpiCard label="متأخرات معلقة" value={`${arrears.length} مستأجر`}
          sub={`${fmt(arrears.reduce((s, a) => s + a.totalDue, 0))} ر.س إجمالاً`}
          accent={arrears.length > 0 ? '#D4AC0D' : '#1E8449'}/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-sm font-medium text-gray-700 mb-3">توزيع المصاريف</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={expData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {expData.map((_, i) => (
                  <Cell key={i} fill={['#CA6F1E','#1B4F72','#7D3C98','#1E8449','#2E86C1','#D4AC0D'][i % 6]}/>
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `${v.toLocaleString('ar-SA')} ر.س`}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-sm font-medium text-gray-700 mb-3">إيرادات المفروشة حسب المنصة</div>
          {channelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={channelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false}/>
                <XAxis type="number" tickFormatter={v => `${(v/1000).toFixed(0)}k`}/>
                <YAxis type="category" dataKey="name" width={70}
                  tickFormatter={(k:string) => ({airbnb:'Airbnb',gathern:'Gathern',booking:'Booking',direct:'مباشر',other:'أخرى'}[k]||k)}/>
                <Tooltip formatter={(v: number) => `${v.toLocaleString('ar-SA')} ر.س`}/>
                <Bar dataKey="value" radius={[0,4,4,0]}>
                  {channelData.map((d, i) => <Cell key={i} fill={CHANNEL_COLORS[d.name] || '#888'}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">لا توجد حجوزات هذا الشهر</div>
          )}
        </div>
      </div>

      {arrears.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700">⚠️ المتأخرات المعلقة</div>
            <span className="bg-red-50 text-red-600 text-xs px-2 py-0.5 rounded-full">{arrears.length} مستأجر</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>{['الشقة','المستأجر','الجوال','المبلغ المتأخر','أيام التأخر','إجراء'].map(h=>(
                <th key={h} className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {arrears.map((a, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-medium text-blue-700">{a.tenant.unitNumber}</td>
                  <td className="px-4 py-2.5">{a.tenant.name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{a.tenant.phone}</td>
                  <td className="px-4 py-2.5 font-medium text-red-600">{fmt(a.totalDue)} ر.س</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.daysSince > 30 ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>
                      {a.daysSince > 900 ? 'لم يدفع' : `${a.daysSince} يوم`}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <button className="text-xs text-blue-600 hover:underline">تسجيل دفعة</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, subColor = 'text-gray-400', accent }: {
  label: string; value: string; sub: string; subColor?: string; accent: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-1 h-full rounded-r-xl" style={{ background: accent }}/>
      <div className="text-xs text-gray-400 mb-1.5 pr-2">{label}</div>
      <div className="text-xl font-medium text-gray-800 pr-2">{value}</div>
      <div className={`text-xs mt-1 pr-2 ${subColor}`}>{sub}</div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <Toaster position="top-center" toastOptions={{ duration: 3000, style: { direction: 'rtl' } }}/>
      <AuthProvider>
        <AppLayout>
          <DashboardContent />
        </AppLayout>
      </AuthProvider>
    </>
  );
}
