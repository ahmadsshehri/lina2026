// components/layout/AppLayout.tsx
'use client';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../store/useStore';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const navItems = [
  { section: 'رئيسي',        items: [
    { id: 'dashboard',  label: 'لوحة التحكم',        icon: '⬛', href: '/' },
  ]},
  { section: 'الإيجارات',    items: [
    { id: 'monthly',   label: 'الإيجار الشهري',       icon: '📋', href: '/monthly',   badge: 'arrears' },
    { id: 'furnished', label: 'الشقق المفروشة',       icon: '🏨', href: '/furnished' },
    { id: 'calendar',  label: 'تقويم الحجوزات',       icon: '📅', href: '/calendar'  },
  ]},
  { section: 'المالية',      items: [
    { id: 'expenses',  label: 'المصاريف',              icon: '💳', href: '/expenses'  },
    { id: 'cashflow',  label: 'التدفق المالي',         icon: '💰', href: '/cashflow'  },
  ]},
  { section: 'التقارير',     items: [
    { id: 'reports',   label: 'التقارير والإحصاءات',   icon: '📊', href: '/reports'   },
  ]},
  { section: 'الإعدادات',    items: [
    { id: 'units',     label: 'الوحدات والعقارات',     icon: '🏢', href: '/units'     },
    { id: 'users',     label: 'المستخدمون',            icon: '👥', href: '/users'     },
  ]},
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { appUser, loading, logout } = useAuth();
  const { sidebarOpen, toggleSidebar, activePage, activeProperty } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !appUser) router.push('/login');
  }, [appUser, loading]);

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">جارٍ التحميل...</p>
      </div>
    </div>
  );

  if (!appUser) return null;

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden" dir="rtl">

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-0 overflow-hidden'} transition-all duration-200 bg-[#1B4F72] flex flex-col flex-shrink-0`}>

        {/* Logo */}
        <div className="p-4 border-b border-white/10">
          <div className="text-white font-medium text-sm">نظام إدارة العقارات</div>
          <div className="text-white/50 text-xs mt-0.5">
            {activeProperty?.name || 'اختر عقاراً'}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map(section => (
            <div key={section.section}>
              <div className="px-4 py-2 text-white/40 text-[10px] tracking-wide uppercase">
                {section.section}
              </div>
              {section.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => router.push(item.href)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-all
                    border-r-[3px] text-right
                    ${activePage === item.id
                      ? 'bg-white/10 text-white border-[#D4AC0D]'
                      : 'text-white/70 border-transparent hover:bg-white/5 hover:text-white'
                    }`}
                >
                  <span className="text-base w-5 text-center">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-white/10">
          <div className="text-white/80 text-xs">{appUser.name}</div>
          <div className="text-white/40 text-[10px]">
            {appUser.role === 'owner' ? 'مالك' :
             appUser.role === 'manager' ? 'مدير' :
             appUser.role === 'accountant' ? 'محاسب' : 'صيانة'}
          </div>
          <button
            onClick={logout}
            className="mt-2 text-white/40 text-xs hover:text-white/70 transition-colors"
          >
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header className="h-13 bg-white border-b border-gray-200 px-5 flex items-center gap-3 flex-shrink-0">
          <button onClick={toggleSidebar} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="5" width="18" height="2" rx="1"/>
              <rect x="3" y="11" width="18" height="2" rx="1"/>
              <rect x="3" y="17" width="18" height="2" rx="1"/>
            </svg>
          </button>

          <PropertySwitcher />

          <div className="mr-auto flex items-center gap-2">
            <MonthPicker />
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

// ─── Property Switcher ────────────────────────────────────────────────────────
function PropertySwitcher() {
  const { properties, activeProperty, setActiveProperty } = useStore();

  if (properties.length <= 1) return (
    <span className="text-sm font-medium text-gray-700">
      {activeProperty?.name || 'لا توجد عقارات'}
    </span>
  );

  return (
    <select
      value={activeProperty?.id || ''}
      onChange={e => {
        const p = properties.find(p => p.id === e.target.value);
        if (p) setActiveProperty(p);
      }}
      className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {properties.map(p => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}

// ─── Month Picker ─────────────────────────────────────────────────────────────
function MonthPicker() {
  const { activeMonth, setActiveMonth } = useStore();
  const months = [];
  const d = new Date();
  for (let i = 0; i < 12; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const val = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    const label = m.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' });
    months.push({ val, label });
  }

  return (
    <select
      value={activeMonth}
      onChange={e => setActiveMonth(e.target.value)}
      className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-600 focus:outline-none"
    >
      {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
    </select>
  );
}
