'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, AppUserBasic } from '../../lib/userHelpers';

interface MenuItem {
  id: string;
  defaultLabel: string;
  label: string;
  icon: string;
  href: string;
  visible: boolean;
  roles: string[];
  description: string;
}

const DEFAULT_MENU: MenuItem[] = [
  { id: 'monthly',   defaultLabel: 'الإيجار الشهري',    label: 'الإيجار الشهري',    icon: '📋', href: '/monthly',   visible: true,  roles: ['owner','manager','accountant'], description: 'المستأجرون والدفعات الشهرية' },
  { id: 'furnished', defaultLabel: 'الشقق المفروشة',    label: 'الشقق المفروشة',    icon: '🏨', href: '/furnished', visible: true,  roles: ['owner','manager','accountant'], description: 'Airbnb · Gathern · Booking' },
  { id: 'expenses',  defaultLabel: 'المصاريف',          label: 'المصاريف',          icon: '💳', href: '/expenses',  visible: true,  roles: ['owner','manager','accountant'], description: 'كهرباء · رواتب · صيانة' },
  { id: 'calendar',  defaultLabel: 'تقويم الحجوزات',   label: 'تقويم الحجوزات',   icon: '📅', href: '/calendar',  visible: true,  roles: ['owner','manager','accountant'], description: 'جدول الإشغال الشهري' },
  { id: 'reports',   defaultLabel: 'التقارير',          label: 'التقارير',          icon: '📊', href: '/reports',   visible: true,  roles: ['owner','manager','accountant'], description: 'إحصاءات ومقارنات ومالية' },
  { id: 'cashflow',  defaultLabel: 'التدفق المالي',     label: 'التدفق المالي',     icon: '💰', href: '/cashflow',  visible: true,  roles: ['owner','manager','accountant'], description: 'تسويات وتحويلات' },
  { id: 'units',     defaultLabel: 'الوحدات والعقارات', label: 'الوحدات والعقارات', icon: '🏢', href: '/units',     visible: true,  roles: ['owner','manager'],             description: 'إدارة الشقق والعقارات' },
  { id: 'users',     defaultLabel: 'المستخدمون',        label: 'المستخدمون',        icon: '👥', href: '/users',     visible: true,  roles: ['owner'],                       description: 'الصلاحيات والأدوار' },
];

const ICONS = ['📋','🏨','💳','📅','📊','💰','🏢','👥','🔑','📁','🏠','📌','📍','🔒','⚙️','📈','📉','🗂️','💼','🔔'];

export default function OwnerDashboardSettings() {
  const router = useRouter();
  const [appUser, setAppUser] = useState<AppUserBasic | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>(DEFAULT_MENU);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState<string | null>(null);
  const [previewRole, setPreviewRole] = useState<'owner'|'manager'|'accountant'>('owner');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }
      const user = await getCurrentUser(fbUser.uid);
      if (!user || user.role !== 'owner') { router.push('/'); return; }
      setAppUser(user);

      // جلب الإعدادات المحفوظة
      try {
        const snap = await getDoc(doc(db, 'settings', 'dashboard'));
        if (snap.exists()) {
          const saved = snap.data().menu as MenuItem[];
          // دمج مع القائمة الافتراضية (للحفاظ على أي صفحات جديدة)
          const merged = DEFAULT_MENU.map(def => {
            const s = saved.find(x => x.id === def.id);
            return s ? { ...def, label: s.label, icon: s.icon, visible: s.visible } : def;
          });
          setMenu(merged);
        }
      } catch (e) { /* استخدم الافتراضي */ }

      setLoading(false);
    });
    return unsub;
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'dashboard'), {
        menu: menu.map(m => ({ id: m.id, label: m.label, icon: m.icon, visible: m.visible })),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { alert('حدث خطأ في الحفظ'); }
    setSaving(false);
  };

  const resetToDefault = () => {
    if (!confirm('هل تريد إعادة جميع الإعدادات للافتراضية؟')) return;
    setMenu(DEFAULT_MENU.map(m => ({ ...m })));
  };

  const toggle = (id: string) =>
    setMenu(m => m.map(x => x.id === id ? { ...x, visible: !x.visible } : x));

  const updateLabel = (id: string, label: string) =>
    setMenu(m => m.map(x => x.id === id ? { ...x, label } : x));

  const updateIcon = (id: string, icon: string) => {
    setMenu(m => m.map(x => x.id === id ? { ...x, icon } : x));
    setShowIconPicker(null);
  };

  // Drag & drop لإعادة الترتيب
  const handleDragStart = (id: string) => setDraggingId(id);
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOver(id);
  };
  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) { setDragOver(null); setDraggingId(null); return; }
    const from = menu.findIndex(x => x.id === draggingId);
    const to   = menu.findIndex(x => x.id === targetId);
    const newMenu = [...menu];
    const [moved] = newMenu.splice(from, 1);
    newMenu.splice(to, 0, moved);
    setMenu(newMenu);
    setDragOver(null);
    setDraggingId(null);
  };

  // معاينة القائمة حسب الدور
  const previewMenu = menu.filter(m => m.visible && m.roles.includes(previewRole));

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div style={{ width: '40px', height: '40px', border: '3px solid #1B4F72', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div dir="rtl" style={{ fontFamily: 'sans-serif', background: '#f0f2f5', minHeight: '100vh' }}>

      {/* Top bar */}
      <div style={{ background: '#1B4F72', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <button onClick={() => router.push('/')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}>
          <span style={{ color: '#fff', fontSize: '18px' }}>←</span>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#fff' }}>⚙️ إعدادات لوحة التحكم</h1>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>تحكم في الصفحات والمسميات والأيقونات</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={resetToDefault}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontSize: '13px' }}>
            إعادة تعيين
          </button>
          <button onClick={saveSettings} disabled={saving}
            style={{ background: saved ? '#16a34a' : '#D4AC0D', border: 'none', borderRadius: '10px', padding: '10px 20px', cursor: saving ? 'not-allowed' : 'pointer', color: '#fff', fontSize: '13px', fontWeight: '700', transition: 'background 0.3s' }}>
            {saving ? '⏳ جارٍ الحفظ...' : saved ? '✅ تم الحفظ!' : '💾 حفظ الإعدادات'}
          </button>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '1100px', margin: '0 auto' }}>

        {/* شريط معلومات */}
        <div style={{ background: '#dbeafe', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', border: '1px solid #93c5fd' }}>
          <span style={{ fontSize: '20px' }}>💡</span>
          <div style={{ fontSize: '13px', color: '#1e40af', lineHeight: '1.5' }}>
            <strong>اسحب</strong> البطاقات لإعادة الترتيب · <strong>انقر</strong> على الاسم لتعديله · <strong>انقر</strong> على الأيقونة لتغييرها · <strong>المفتاح</strong> لإخفاء/إظهار الصفحة
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', alignItems: 'start' }}>

          {/* ─── العمود الأيسر: قائمة الصفحات ─── */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#374151', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📑 الصفحات والإعدادات</span>
              <span style={{ background: '#e5e7eb', color: '#6b7280', padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '500' }}>{menu.filter(m => m.visible).length} مرئي</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {menu.map((item, idx) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(item.id)}
                  onDragOver={e => handleDragOver(e, item.id)}
                  onDrop={() => handleDrop(item.id)}
                  onDragEnd={() => { setDragOver(null); setDraggingId(null); }}
                  style={{
                    background: '#fff',
                    borderRadius: '14px',
                    border: `2px solid ${dragOver === item.id ? '#1B4F72' : draggingId === item.id ? '#93c5fd' : item.visible ? '#e5e7eb' : '#f3f4f6'}`,
                    padding: '14px 16px',
                    cursor: 'grab',
                    opacity: item.visible ? 1 : 0.55,
                    transition: 'all 0.15s',
                    boxShadow: draggingId === item.id ? '0 4px 16px rgba(0,0,0,0.12)' : 'none',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

                    {/* رقم الترتيب */}
                    <div style={{ width: '22px', height: '22px', background: '#f3f4f6', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#9ca3af', fontWeight: '600', flexShrink: 0 }}>
                      {idx + 1}
                    </div>

                    {/* أيقونة قابلة للتغيير */}
                    <button
                      onClick={() => setShowIconPicker(showIconPicker === item.id ? null : item.id)}
                      title="انقر لتغيير الأيقونة"
                      style={{ width: '44px', height: '44px', borderRadius: '12px', border: '2px dashed #e5e7eb', background: item.visible ? '#f8fafc' : '#f3f4f6', cursor: 'pointer', fontSize: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'border-color 0.15s' }}
                      onMouseOver={e => e.currentTarget.style.borderColor = '#1B4F72'}
                      onMouseOut={e => e.currentTarget.style.borderColor = '#e5e7eb'}
                    >
                      {item.icon}
                    </button>

                    {/* اسم الصفحة */}
                    <div style={{ flex: 1 }}>
                      {editingId === item.id ? (
                        <input
                          autoFocus
                          value={item.label}
                          onChange={e => updateLabel(item.id, e.target.value)}
                          onBlur={() => setEditingId(null)}
                          onKeyDown={e => e.key === 'Enter' && setEditingId(null)}
                          style={{ width: '100%', border: '1.5px solid #1B4F72', borderRadius: '8px', padding: '6px 10px', fontSize: '15px', fontWeight: '600', color: '#111827', background: '#f0f9ff', outline: 'none', boxSizing: 'border-box' }}
                        />
                      ) : (
                        <div>
                          <div
                            onClick={() => setEditingId(item.id)}
                            style={{ fontSize: '15px', fontWeight: '600', color: item.visible ? '#111827' : '#9ca3af', cursor: 'text', display: 'flex', alignItems: 'center', gap: '6px' }}
                          >
                            {item.label}
                            <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: '400' }}>✏️</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{item.description}</div>
                          {item.label !== item.defaultLabel && (
                            <div style={{ fontSize: '10px', color: '#d97706', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>تم التعديل · الاسم الأصلي:</span>
                              <span style={{ background: '#fef3c7', padding: '1px 6px', borderRadius: '4px' }}>{item.defaultLabel}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* بادجات الأدوار */}
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      {item.roles.map(r => (
                        <span key={r} style={{
                          padding: '2px 7px', borderRadius: '8px', fontSize: '10px', fontWeight: '600',
                          background: r === 'owner' ? '#ede9fe' : r === 'manager' ? '#dbeafe' : '#d1fae5',
                          color: r === 'owner' ? '#7c3aed' : r === 'manager' ? '#1e40af' : '#065f46',
                        }}>
                          {r === 'owner' ? 'مالك' : r === 'manager' ? 'مدير' : 'محاسب'}
                        </span>
                      ))}
                    </div>

                    {/* مفتاح التبديل */}
                    <button
                      onClick={() => toggle(item.id)}
                      title={item.visible ? 'إخفاء الصفحة' : 'إظهار الصفحة'}
                      style={{
                        width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer',
                        background: item.visible ? '#1B4F72' : '#d1d5db',
                        position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                      }}
                    >
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                        position: 'absolute', top: '3px', transition: 'right 0.2s',
                        right: item.visible ? '3px' : '25px',
                      }} />
                    </button>

                    {/* مقبض السحب */}
                    <div style={{ color: '#d1d5db', fontSize: '18px', cursor: 'grab', flexShrink: 0, userSelect: 'none' }}>⠿</div>
                  </div>

                  {/* منتقي الأيقونات */}
                  {showIconPicker === item.id && (
                    <div style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px' }}>اختر أيقونة:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {ICONS.map(icon => (
                          <button key={icon} onClick={() => updateIcon(item.id, icon)}
                            style={{ width: '36px', height: '36px', borderRadius: '8px', border: item.icon === icon ? '2px solid #1B4F72' : '1px solid #e5e7eb', background: item.icon === icon ? '#dbeafe' : '#fff', cursor: 'pointer', fontSize: '18px' }}>
                            {icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ─── العمود الأيمن: معاينة ─── */}
          <div style={{ position: 'sticky', top: '80px' }}>

            {/* معاينة حسب الدور */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '16px' }}>
              <div style={{ padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151', marginBottom: '10px' }}>👁️ معاينة القائمة</div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['owner','manager','accountant'] as const).map(r => (
                    <button key={r} onClick={() => setPreviewRole(r)}
                      style={{ flex: 1, padding: '6px 4px', fontSize: '11px', fontWeight: '600', border: 'none', borderRadius: '8px', cursor: 'pointer', background: previewRole === r ? '#1B4F72' : '#f3f4f6', color: previewRole === r ? '#fff' : '#6b7280', transition: 'all 0.15s' }}>
                      {r === 'owner' ? 'مالك' : r === 'manager' ? 'مدير' : 'محاسب'}
                    </button>
                  ))}
                </div>
              </div>

              {/* محاكاة لوحة التحكم */}
              <div style={{ padding: '16px' }}>
                <div style={{ background: 'linear-gradient(135deg, #1B4F72, #2E86C1)', borderRadius: '12px', padding: '14px', marginBottom: '12px' }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', marginBottom: '4px' }}>مرحباً</div>
                  <div style={{ color: '#fff', fontWeight: '700', fontSize: '14px' }}>{appUser?.name}</div>
                  <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '6px', padding: '3px 8px', fontSize: '10px', color: 'rgba(255,255,255,0.8)', display: 'inline-block', marginTop: '4px' }}>
                    {previewRole === 'owner' ? 'مالك' : previewRole === 'manager' ? 'مدير عقار' : 'محاسب'}
                  </div>
                </div>

                {previewMenu.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '13px' }}>
                    لا توجد صفحات مرئية لهذا الدور
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {previewMenu.map(item => (
                      <div key={item.id} style={{ background: '#f9fafb', borderRadius: '10px', padding: '10px', border: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: '18px', marginBottom: '5px' }}>{item.icon}</div>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#111827', lineHeight: '1.3' }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ملخص الإحصاءات */}
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151', marginBottom: '12px' }}>📊 ملخص الإعدادات</div>
              {[
                { label: 'صفحات مرئية', val: menu.filter(m => m.visible).length, color: '#16a34a', bg: '#d1fae5' },
                { label: 'صفحات مخفية', val: menu.filter(m => !m.visible).length, color: '#dc2626', bg: '#fee2e2' },
                { label: 'أسماء معدّلة', val: menu.filter(m => m.label !== m.defaultLabel).length, color: '#d97706', bg: '#fef3c7' },
              ].map(k => (
                <div key={k.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>{k.label}</span>
                  <span style={{ background: k.bg, color: k.color, padding: '2px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: '700' }}>{k.val}</span>
                </div>
              ))}

              {/* الصفحات المخفية */}
              {menu.filter(m => !m.visible).length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>الصفحات المخفية حالياً:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {menu.filter(m => !m.visible).map(m => (
                      <span key={m.id} style={{ background: '#f3f4f6', color: '#6b7280', padding: '3px 10px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer' }}
                        onClick={() => toggle(m.id)}>
                        {m.icon} {m.label} +
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
