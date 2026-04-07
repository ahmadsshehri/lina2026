'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, AppUserBasic } from '../../lib/userHelpers';

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── الافتراضي — لا تغيّره ────────────────────────────────────────────────────
const DEFAULT_MENU: MenuItem[] = [
  { id:'monthly',   defaultLabel:'الإيجار الشهري',    label:'الإيجار الشهري',    icon:'📋', href:'/monthly',   visible:true,  roles:['owner','manager','accountant'], description:'المستأجرون والدفعات الشهرية' },
  { id:'furnished', defaultLabel:'الشقق المفروشة',    label:'الشقق المفروشة',    icon:'🏨', href:'/furnished', visible:true,  roles:['owner','manager','accountant'], description:'Airbnb · Gathern · Booking' },
  { id:'expenses',  defaultLabel:'المصاريف',          label:'المصاريف',          icon:'💳', href:'/expenses',  visible:true,  roles:['owner','manager','accountant'], description:'كهرباء · رواتب · صيانة' },
  { id:'calendar',  defaultLabel:'تقويم الحجوزات',   label:'تقويم الحجوزات',   icon:'📅', href:'/calendar',  visible:true,  roles:['owner','manager','accountant'], description:'جدول الإشغال الشهري' },
  { id:'reports',   defaultLabel:'التقارير',          label:'التقارير',          icon:'📊', href:'/reports',   visible:true,  roles:['owner','manager','accountant'], description:'إحصاءات ومقارنات ومالية' },
  { id:'cashflow',  defaultLabel:'التدفق المالي',     label:'التدفق المالي',     icon:'💰', href:'/cashflow',  visible:true,  roles:['owner','manager','accountant'], description:'تسويات وتحويلات' },
  { id:'units',     defaultLabel:'الوحدات والعقارات', label:'الوحدات والعقارات', icon:'🏢', href:'/units',     visible:true,  roles:['owner','manager'],             description:'إدارة الشقق والعقارات' },
  { id:'users',     defaultLabel:'المستخدمون',        label:'المستخدمون',        icon:'👥', href:'/users',     visible:true,  roles:['owner'],                       description:'الصلاحيات والأدوار' },
];

const ICONS = ['📋','🏨','💳','📅','📊','💰','🏢','👥','🔑','📁','🏠','📌','📍','🔒','⚙️','📈','📉','🗂️','💼','🔔'];

// ─── Component ────────────────────────────────────────────────────────────────
export default function OwnerDashboardSettings() {
  const router = useRouter();
  const [appUser,        setAppUser]        = useState<AppUserBasic | null>(null);
  const [menu,           setMenu]           = useState<MenuItem[]>(DEFAULT_MENU);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [saveStatus,     setSaveStatus]     = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [dragOver,       setDragOver]       = useState<string | null>(null);
  const [draggingId,     setDraggingId]     = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState<string | null>(null);
  const [previewRole,    setPreviewRole]    = useState<'owner'|'manager'|'accountant'>('owner');

  // ─── Load settings from Firestore on mount ────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }

      const user = await getCurrentUser(fbUser.uid);
      if (!user || user.role !== 'owner') { router.push('/'); return; }
      setAppUser(user);

      try {
        // ✅ جلب الإعدادات المحفوظة من Firestore
        const snap = await getDoc(doc(db, 'settings', 'dashboard'));
        if (snap.exists()) {
          const savedMenu = snap.data().menu as { id:string; label:string; icon:string; visible:boolean; order?:number }[];

          // دمج المحفوظ مع الافتراضي مع الحفاظ على الترتيب المحفوظ
          const savedMap = new Map(savedMenu.map(s => [s.id, s]));
          const merged: MenuItem[] = [];

          // أولاً: العناصر التي لها ترتيب محفوظ (مرتبة)
          const orderedSaved = savedMenu
            .map(s => DEFAULT_MENU.find(d => d.id === s.id))
            .filter(Boolean) as MenuItem[];

          // ثانياً: أي عناصر جديدة في الافتراضي غير موجودة في المحفوظ
          const savedIds = new Set(savedMenu.map(s => s.id));
          const newItems = DEFAULT_MENU.filter(d => !savedIds.has(d.id));

          // دمج مع تطبيق قيم label/icon/visible المحفوظة
          const finalMenu = [...orderedSaved, ...newItems].map(item => {
            const saved = savedMap.get(item.id);
            if (saved) {
              return {
                ...item,
                label:   saved.label   ?? item.label,
                icon:    saved.icon    ?? item.icon,
                visible: saved.visible ?? item.visible,
              };
            }
            return item;
          });

          setMenu(finalMenu);
        }
        // إذا لا يوجد document محفوظ → استخدم الافتراضي (setMenu لم يتغير)
      } catch (e) {
        console.error('Error loading dashboard settings:', e);
        // في حالة الخطأ → استمر بالافتراضي
      }

      setLoading(false);
    });
    return unsub;
  }, []);

  // ─── Save to Firestore ────────────────────────────────────────────────────
  const saveSettings = async () => {
    setSaveStatus('saving');
    try {
      // ✅ حفظ الترتيب + label + icon + visible لكل عنصر
      await setDoc(doc(db, 'settings', 'dashboard'), {
        menu: menu.map((m, index) => ({
          id:      m.id,
          label:   m.label,
          icon:    m.icon,
          visible: m.visible,
          order:   index,        // ✅ حفظ الترتيب صراحةً
        })),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid,
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      console.error('Save error:', e);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const resetToDefault = () => {
    if (!confirm('هل تريد إعادة جميع الإعدادات للافتراضية؟')) return;
    setMenu(DEFAULT_MENU.map(m => ({ ...m })));
    setSaveStatus('idle');
  };

  // ─── Menu Helpers ─────────────────────────────────────────────────────────
  const toggle = (id: string) =>
    setMenu(m => m.map(x => x.id===id ? { ...x, visible:!x.visible } : x));

  const updateLabel = (id: string, label: string) =>
    setMenu(m => m.map(x => x.id===id ? { ...x, label } : x));

  const updateIcon = (id: string, icon: string) => {
    setMenu(m => m.map(x => x.id===id ? { ...x, icon } : x));
    setShowIconPicker(null);
  };

  // ─── Drag & Drop ──────────────────────────────────────────────────────────
  const handleDragStart = (id: string) => setDraggingId(id);

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOver(id);
  };

  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId===targetId) {
      setDragOver(null); setDraggingId(null); return;
    }
    const from = menu.findIndex(x => x.id===draggingId);
    const to   = menu.findIndex(x => x.id===targetId);
    const newMenu = [...menu];
    const [moved] = newMenu.splice(from, 1);
    newMenu.splice(to, 0, moved);
    setMenu(newMenu);
    setDragOver(null); setDraggingId(null);
  };

  const handleDragEnd = () => { setDragOver(null); setDraggingId(null); };

  // ─── Preview ──────────────────────────────────────────────────────────────
  const previewMenu = menu.filter(m => m.visible && m.roles.includes(previewRole));

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh' }}>
      <div style={{ width:'40px', height:'40px', border:'3px solid #1B4F72', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" style={{ fontFamily:'sans-serif', background:'#f9fafb', minHeight:'100vh' }}>

      {/* ══ Top Bar ══ */}
      <div style={{ background:'#1B4F72', padding:'16px 20px', display:'flex', alignItems:'center', gap:'12px', position:'sticky', top:0, zIndex:50, boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
        <button onClick={() => router.push('/')} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:'8px', padding:'8px 12px', cursor:'pointer' }}>
          <span style={{ color:'#fff', fontSize:'18px' }}>←</span>
        </button>
        <div style={{ flex:1 }}>
          <h1 style={{ margin:0, fontSize:'17px', fontWeight:'600', color:'#fff' }}>إعدادات لوحة التحكم</h1>
          <p style={{ margin:0, fontSize:'12px', color:'rgba(255,255,255,0.6)' }}>تحكم في الصفحات والمسميات والأيقونات</p>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={resetToDefault}
            style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:'8px', padding:'8px 14px', cursor:'pointer', color:'rgba(255,255,255,0.8)', fontSize:'13px', fontFamily:'sans-serif' }}>
            إعادة تعيين
          </button>
          <button onClick={saveSettings} disabled={saveStatus==='saving'}
            style={{ background:saveStatus==='saved'?'#16a34a':saveStatus==='error'?'#dc2626':'#D4AC0D', border:'none', borderRadius:'10px', padding:'10px 20px', cursor:saveStatus==='saving'?'not-allowed':'pointer', color:'#fff', fontSize:'13px', fontWeight:'600', transition:'background 0.3s', fontFamily:'sans-serif' }}>
            {saveStatus==='saving' ? '⏳ جارٍ الحفظ...' : saveStatus==='saved' ? '✅ تم الحفظ!' : saveStatus==='error' ? '❌ خطأ في الحفظ' : 'حفظ الإعدادات'}
          </button>
        </div>
      </div>

      <div style={{ padding:'20px', maxWidth:'1100px', margin:'0 auto' }}>

        {/* Info Banner */}
        <div style={{ background:'#dbeafe', borderRadius:'12px', padding:'12px 16px', marginBottom:'20px', display:'flex', gap:'10px', alignItems:'center', border:'1px solid #93c5fd' }}>
          <span style={{ fontSize:'18px' }}>💡</span>
          <div style={{ fontSize:'13px', color:'#1e40af', lineHeight:'1.6' }}>
            <strong>اسحب</strong> البطاقات لإعادة الترتيب ·
            <strong> انقر</strong> على الاسم لتعديله ·
            <strong> انقر</strong> على الأيقونة لتغييرها ·
            <strong> المفتاح</strong> لإخفاء/إظهار الصفحة ·
            بعد التعديل اضغط <strong>حفظ الإعدادات</strong>
          </div>
        </div>

        {/* ✅ تنبيه: التعديلات لم تُحفظ بعد */}
        {saveStatus === 'idle' && (
          <div style={{ background:'#fef3c7', borderRadius:'10px', padding:'10px 14px', marginBottom:'16px', fontSize:'12px', color:'#92400e', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span>💾 لا تنس الضغط على "حفظ الإعدادات" حتى تطبّق التغييرات على الموقع</span>
            <button onClick={saveSettings}
              style={{ background:'#D4AC0D', color:'#fff', border:'none', borderRadius:'8px', padding:'6px 14px', cursor:'pointer', fontSize:'12px', fontWeight:'600', fontFamily:'sans-serif' }}>
              حفظ الآن
            </button>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:'20px', alignItems:'start' }}>

          {/* ══ Left Column: Menu Items ══ */}
          <div>
            <div style={{ fontSize:'14px', fontWeight:'600', color:'#374151', marginBottom:'12px', display:'flex', alignItems:'center', gap:'8px' }}>
              <span>الصفحات والإعدادات</span>
              <span style={{ background:'#e5e7eb', color:'#6b7280', padding:'2px 8px', borderRadius:'10px', fontSize:'12px' }}>
                {menu.filter(m => m.visible).length} مرئي
              </span>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {menu.map((item, idx) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(item.id)}
                  onDragOver={e => handleDragOver(e, item.id)}
                  onDrop={() => handleDrop(item.id)}
                  onDragEnd={handleDragEnd}
                  style={{
                    background: '#fff',
                    borderRadius: '14px',
                    border: `2px solid ${dragOver===item.id?'#1B4F72':draggingId===item.id?'#93c5fd':item.visible?'#e5e7eb':'#f3f4f6'}`,
                    padding: '14px 16px',
                    cursor: 'grab',
                    opacity: item.visible ? 1 : 0.55,
                    transition: 'all 0.15s',
                    boxShadow: draggingId===item.id ? '0 4px 16px rgba(0,0,0,0.12)' : 'none',
                  }}
                >
                  <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>

                    {/* Order */}
                    <div style={{ width:'22px', height:'22px', background:'#f3f4f6', borderRadius:'6px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', color:'#9ca3af', fontWeight:'600', flexShrink:0 }}>
                      {idx+1}
                    </div>

                    {/* Icon Button */}
                    <button
                      onClick={() => setShowIconPicker(showIconPicker===item.id?null:item.id)}
                      title="انقر لتغيير الأيقونة"
                      style={{ width:'44px', height:'44px', borderRadius:'12px', border:'2px dashed #e5e7eb', background:item.visible?'#f8fafc':'#f3f4f6', cursor:'pointer', fontSize:'22px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
                    >
                      {item.icon}
                    </button>

                    {/* Label */}
                    <div style={{ flex:1 }}>
                      {editingId===item.id ? (
                        <input
                          autoFocus
                          value={item.label}
                          onChange={e => updateLabel(item.id, e.target.value)}
                          onBlur={() => setEditingId(null)}
                          onKeyDown={e => e.key==='Enter' && setEditingId(null)}
                          style={{ width:'100%', border:'1.5px solid #1B4F72', borderRadius:'8px', padding:'6px 10px', fontSize:'15px', fontWeight:'600', color:'#111827', background:'#f0f9ff', outline:'none', boxSizing:'border-box', fontFamily:'sans-serif' }}
                        />
                      ) : (
                        <div>
                          <div onClick={() => setEditingId(item.id)}
                            style={{ fontSize:'15px', fontWeight:'600', color:item.visible?'#111827':'#9ca3af', cursor:'text', display:'flex', alignItems:'center', gap:'6px' }}>
                            {item.label}
                            <span style={{ fontSize:'11px', color:'#cbd5e1' }}>✏️</span>
                          </div>
                          <div style={{ fontSize:'12px', color:'#9ca3af', marginTop:'2px' }}>{item.description}</div>
                          {item.label!==item.defaultLabel && (
                            <div style={{ fontSize:'10px', color:'#d97706', marginTop:'2px', display:'flex', alignItems:'center', gap:'4px' }}>
                              <span>تم التعديل · الأصل:</span>
                              <span style={{ background:'#fef3c7', padding:'1px 6px', borderRadius:'4px' }}>{item.defaultLabel}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Role Badges */}
                    <div style={{ display:'flex', gap:'4px', flexShrink:0 }}>
                      {item.roles.map(r => (
                        <span key={r} style={{ padding:'2px 7px', borderRadius:'8px', fontSize:'10px', fontWeight:'600', background:r==='owner'?'#ede9fe':r==='manager'?'#dbeafe':'#d1fae5', color:r==='owner'?'#7c3aed':r==='manager'?'#1e40af':'#065f46' }}>
                          {r==='owner'?'مالك':r==='manager'?'مدير':'محاسب'}
                        </span>
                      ))}
                    </div>

                    {/* Toggle */}
                    <button onClick={() => toggle(item.id)} title={item.visible?'إخفاء':'إظهار'}
                      style={{ width:'48px', height:'26px', borderRadius:'13px', border:'none', cursor:'pointer', background:item.visible?'#1B4F72':'#d1d5db', position:'relative', flexShrink:0, transition:'background 0.2s' }}>
                      <div style={{ width:'20px', height:'20px', borderRadius:'50%', background:'#fff', position:'absolute', top:'3px', transition:'right 0.2s', right:item.visible?'3px':'25px' }} />
                    </button>

                    {/* Drag Handle */}
                    <div style={{ color:'#d1d5db', fontSize:'18px', cursor:'grab', flexShrink:0, userSelect:'none' }}>⠿</div>
                  </div>

                  {/* Icon Picker */}
                  {showIconPicker===item.id && (
                    <div style={{ marginTop:'12px', padding:'12px', background:'#f8fafc', borderRadius:'10px', border:'1px solid #e5e7eb' }}>
                      <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'8px' }}>اختر أيقونة:</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                        {ICONS.map(icon => (
                          <button key={icon} onClick={() => updateIcon(item.id, icon)}
                            style={{ width:'36px', height:'36px', borderRadius:'8px', border:item.icon===icon?'2px solid #1B4F72':'1px solid #e5e7eb', background:item.icon===icon?'#dbeafe':'#fff', cursor:'pointer', fontSize:'18px' }}>
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

          {/* ══ Right Column: Preview ══ */}
          <div style={{ position:'sticky', top:'80px' }}>

            <div style={{ background:'#fff', borderRadius:'16px', border:'1px solid #e5e7eb', overflow:'hidden', marginBottom:'16px' }}>
              <div style={{ padding:'14px 16px', background:'#f8fafc', borderBottom:'1px solid #e5e7eb' }}>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151', marginBottom:'10px' }}>معاينة القائمة</div>
                <div style={{ display:'flex', gap:'4px' }}>
                  {(['owner','manager','accountant'] as const).map(r => (
                    <button key={r} onClick={() => setPreviewRole(r)}
                      style={{ flex:1, padding:'6px 4px', fontSize:'11px', fontWeight:'600', border:'none', borderRadius:'8px', cursor:'pointer', background:previewRole===r?'#1B4F72':'#f3f4f6', color:previewRole===r?'#fff':'#6b7280', transition:'all 0.15s', fontFamily:'sans-serif' }}>
                      {r==='owner'?'مالك':r==='manager'?'مدير':'محاسب'}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ padding:'16px' }}>
                <div style={{ background:'linear-gradient(135deg,#1B4F72,#2E86C1)', borderRadius:'12px', padding:'14px', marginBottom:'12px' }}>
                  <div style={{ color:'rgba(255,255,255,0.6)', fontSize:'11px', marginBottom:'4px' }}>مرحباً،</div>
                  <div style={{ color:'#fff', fontWeight:'700', fontSize:'14px' }}>{appUser?.name}</div>
                  <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:'6px', padding:'3px 8px', fontSize:'10px', color:'rgba(255,255,255,0.8)', display:'inline-block', marginTop:'4px' }}>
                    {previewRole==='owner'?'مالك':previewRole==='manager'?'مدير عقار':'محاسب'}
                  </div>
                </div>

                {previewMenu.length===0 ? (
                  <div style={{ textAlign:'center', padding:'20px', color:'#9ca3af', fontSize:'13px' }}>
                    لا توجد صفحات مرئية لهذا الدور
                  </div>
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                    {previewMenu.map(item => (
                      <div key={item.id} style={{ background:'#f9fafb', borderRadius:'10px', padding:'10px', border:'1px solid #f3f4f6' }}>
                        <div style={{ fontSize:'18px', marginBottom:'5px' }}>{item.icon}</div>
                        <div style={{ fontSize:'12px', fontWeight:'600', color:'#111827', lineHeight:'1.3' }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Summary */}
            <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e5e7eb', padding:'16px' }}>
              <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151', marginBottom:'12px' }}>ملخص الإعدادات</div>
              {[
                { label:'صفحات مرئية', val:menu.filter(m=>m.visible).length,                   color:'#16a34a', bg:'#d1fae5' },
                { label:'صفحات مخفية', val:menu.filter(m=>!m.visible).length,                  color:'#dc2626', bg:'#fee2e2' },
                { label:'أسماء معدّلة',val:menu.filter(m=>m.label!==m.defaultLabel).length,   color:'#d97706', bg:'#fef3c7' },
              ].map(k => (
                <div key={k.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #f3f4f6' }}>
                  <span style={{ fontSize:'13px', color:'#6b7280' }}>{k.label}</span>
                  <span style={{ background:k.bg, color:k.color, padding:'2px 10px', borderRadius:'8px', fontSize:'13px', fontWeight:'700' }}>{k.val}</span>
                </div>
              ))}

              {menu.filter(m=>!m.visible).length>0 && (
                <div style={{ marginTop:'12px' }}>
                  <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'6px' }}>الصفحات المخفية:</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                    {menu.filter(m=>!m.visible).map(m => (
                      <span key={m.id} onClick={() => toggle(m.id)}
                        style={{ background:'#f3f4f6', color:'#6b7280', padding:'3px 10px', borderRadius:'8px', fontSize:'11px', cursor:'pointer' }}>
                        {m.icon} {m.label} +
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Save Button at bottom too */}
              <button onClick={saveSettings} disabled={saveStatus==='saving'}
                style={{ width:'100%', marginTop:'16px', padding:'12px', background:saveStatus==='saved'?'#16a34a':'#1B4F72', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'14px', fontWeight:'600', fontFamily:'sans-serif', transition:'background 0.3s' }}>
                {saveStatus==='saving'?'⏳ جارٍ الحفظ...':saveStatus==='saved'?'✅ تم الحفظ!':'💾 حفظ الإعدادات'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
