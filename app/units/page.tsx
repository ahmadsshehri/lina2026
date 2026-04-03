// app/units/page.tsx — الوحدات والعقارات
'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useStore } from '../../store/useStore';
import {
  getUnits, createUnit, updateUnit, deleteUnit,
  getProperties, createProperty,
} from '../../lib/db';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import type { Unit, Property } from '../../types';

const TYPE_CONFIG: Record<string, { label: string; bg: string; border: string; text: string }> = {
  monthly:   { label: 'شهري',   bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700' },
  furnished: { label: 'مفروش',  bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700'  },
  owner:     { label: 'خاصة',   bg: 'bg-yellow-50', border: 'border-yellow-200',text: 'text-yellow-700'},
};
const STATUS_CONFIG: Record<string, { dot: string }> = {
  occupied:    { dot: '#1E8449' },
  vacant:      { dot: '#E74C3C' },
  maintenance: { dot: '#D4AC0D' },
};

export default function UnitsPage() {
  const { activeProperty, setActiveProperty, properties, setProperties, setActivePage } = useStore();
  const { appUser } = useAuth();
  const [units,        setUnits]        = useState<Unit[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showUnitModal,setShowUnitModal] = useState(false);
  const [showPropModal,setShowPropModal] = useState(false);
  const [editUnit,     setEditUnit]     = useState<Unit | null>(null);
  const [viewMode,     setViewMode]     = useState<'grid'|'list'>('grid');
  const [typeFilter,   setTypeFilter]   = useState<string>('all');

  const load = async () => {
    if (!activeProperty) return;
    setLoading(true);
    const u = await getUnits(activeProperty.id);
    setUnits(u);
    setLoading(false);
  };

  const loadProps = async () => {
    if (!appUser) return;
    const ps = await getProperties(appUser.uid);
    setProperties(ps);
    if (ps.length > 0 && !activeProperty) setActiveProperty(ps[0]);
  };

  useEffect(() => { setActivePage('units'); loadProps(); }, [appUser]);
  useEffect(() => { load(); }, [activeProperty]);

  const filtered = typeFilter === 'all' ? units : units.filter(u => u.type === typeFilter);

  const stats = {
    total:     units.length,
    occupied:  units.filter(u => u.status === 'occupied').length,
    vacant:    units.filter(u => u.status === 'vacant').length,
    monthly:   units.filter(u => u.type === 'monthly').length,
    furnished: units.filter(u => u.type === 'furnished').length,
  };

  const handleDeleteUnit = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه الوحدة؟')) return;
    await deleteUnit(id);
    toast.success('تم الحذف');
    load();
  };

  return (
    <div className="p-5" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-medium text-gray-800">الوحدات والعقارات</h1>
          <p className="text-sm text-gray-400">{activeProperty?.name || 'لا يوجد عقار'} — {units.length} وحدة</p>
        </div>
        <div className="flex gap-2">
          {appUser?.role === 'owner' && (
            <button onClick={() => setShowPropModal(true)}
              className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
              + عقار جديد
            </button>
          )}
          <button onClick={() => { setEditUnit(null); setShowUnitModal(true); }}
            className="bg-[#1B4F72] text-white text-sm rounded-lg px-4 py-1.5 hover:bg-[#2E86C1] transition-colors">
            + وحدة جديدة
          </button>
        </div>
      </div>

      {/* Properties switcher */}
      {properties.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {properties.map(p => (
            <button
              key={p.id}
              onClick={() => setActiveProperty(p)}
              className={`px-4 py-2 text-sm rounded-lg border transition-all
                ${activeProperty?.id === p.id
                  ? 'bg-[#1B4F72] text-white border-[#1B4F72]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#1B4F72]'}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-5 gap-2 mb-5">
        {[
          { label: 'إجمالي الوحدات', val: stats.total,     color: 'text-gray-800' },
          { label: 'مشغولة',         val: stats.occupied,   color: 'text-green-600' },
          { label: 'شاغرة',          val: stats.vacant,     color: 'text-red-500' },
          { label: 'شهري',           val: stats.monthly,    color: 'text-blue-600' },
          { label: 'مفروش',          val: stats.furnished,  color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className={`text-xl font-medium ${s.color}`}>{s.val}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters + View toggle */}
      <div className="flex gap-2 mb-3 items-center">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none">
          <option value="all">جميع الأنواع</option>
          <option value="monthly">شهري</option>
          <option value="furnished">مفروش</option>
          <option value="owner">خاصة</option>
        </select>
        <div className="mr-auto flex border border-gray-200 rounded-lg overflow-hidden">
          {(['grid','list'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 text-xs transition-colors
                ${viewMode === m ? 'bg-[#1B4F72] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {m === 'grid' ? '⊞ شبكة' : '≡ قائمة'}
            </button>
          ))}
        </div>
      </div>

      {loading ? <PageLoader /> : (
        <>
          {/* GRID VIEW */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
              {filtered.map(u => {
                const tc = TYPE_CONFIG[u.type];
                return (
                  <div
                    key={u.id}
                    className={`${tc.bg} ${tc.border} border rounded-xl p-2.5 text-center cursor-pointer
                      hover:shadow-md transition-all group relative`}
                    onClick={() => { setEditUnit(u); setShowUnitModal(true); }}
                  >
                    <div className="flex justify-center mb-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: STATUS_CONFIG[u.status]?.dot }}/>
                    </div>
                    <div className={`text-sm font-medium ${tc.text}`}>{u.unitNumber}</div>
                    <div className={`text-[9px] mt-0.5 ${tc.text} opacity-70`}>{tc.label}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* LIST VIEW */}
          {viewMode === 'list' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['رقم الوحدة','النوع','الطابق','الغرف','المساحة','السعر الأساسي','الحالة',''].map(h => (
                      <th key={h} className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => {
                    const tc = TYPE_CONFIG[u.type];
                    return (
                      <tr key={u.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                        <td className="px-3 py-2.5 font-medium text-[#1B4F72]">{u.unitNumber}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${tc.bg} ${tc.text} font-medium`}>{tc.label}</span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{u.floor || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{u.rooms || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{u.areaSqm ? `${u.areaSqm} م²` : '—'}</td>
                        <td className="px-3 py-2.5 font-medium">{u.basePrice?.toLocaleString('ar-SA') || '—'} ر.س</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ background: STATUS_CONFIG[u.status]?.dot }}/>
                            <span className="text-xs text-gray-600">
                              {u.status === 'occupied' ? 'مشغول' : u.status === 'vacant' ? 'شاغر' : 'صيانة'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            <button onClick={() => { setEditUnit(u); setShowUnitModal(true); }}
                              className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">تعديل</button>
                            {appUser?.role === 'owner' && (
                              <button onClick={() => handleDeleteUnit(u.id)}
                                className="text-xs text-red-400 hover:text-red-600 px-2 py-1">حذف</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="flex gap-4 mt-3">
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5 text-xs text-gray-400">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: v.dot }}/>
                {k === 'occupied' ? 'مشغول' : k === 'vacant' ? 'شاغر' : 'صيانة'}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modals */}
      {showUnitModal && activeProperty && (
        <UnitModal
          unit={editUnit}
          propertyId={activeProperty.id}
          onClose={() => { setShowUnitModal(false); setEditUnit(null); }}
          onSaved={load}
        />
      )}
      {showPropModal && appUser && (
        <PropertyModal
          ownerId={appUser.uid}
          onClose={() => setShowPropModal(false)}
          onSaved={loadProps}
        />
      )}
    </div>
  );
}

// ─── Unit Modal ───────────────────────────────────────────────────────────────
function UnitModal({ unit, propertyId, onClose, onSaved }: {
  unit: Unit | null; propertyId: string; onClose: () => void; onSaved: () => void;
}) {
  const { register, handleSubmit } = useForm<any>({ defaultValues: unit || { type: 'monthly', status: 'vacant' } });
  const [saving, setSaving] = useState(false);

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      const payload = { ...data, propertyId, basePrice: Number(data.basePrice || 0), floor: Number(data.floor || 0), rooms: Number(data.rooms || 0), areaSqm: Number(data.areaSqm || 0) };
      if (unit?.id) { await updateUnit(unit.id, payload); toast.success('تم تحديث الوحدة'); }
      else           { await createUnit(payload);           toast.success('تم إضافة الوحدة'); }
      onSaved(); onClose();
    } catch { toast.error('حدث خطأ'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={unit ? `تعديل شقة ${unit.unitNumber}` : 'إضافة وحدة جديدة'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">رقم الوحدة</label><input {...register('unitNumber', {required:true})} className={inputCls}/></div>
          <div><label className="block text-xs text-gray-500 mb-1">النوع</label>
            <select {...register('type')} className={inputCls}>
              <option value="monthly">شهري</option>
              <option value="furnished">مفروش</option>
              <option value="owner">خاصة (مالك)</option>
            </select>
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">الحالة</label>
            <select {...register('status')} className={inputCls}>
              <option value="vacant">شاغر</option>
              <option value="occupied">مشغول</option>
              <option value="maintenance">صيانة</option>
            </select>
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">الطابق</label><input {...register('floor')} type="number" className={inputCls}/></div>
          <div><label className="block text-xs text-gray-500 mb-1">عدد الغرف</label><input {...register('rooms')} type="number" className={inputCls}/></div>
          <div><label className="block text-xs text-gray-500 mb-1">المساحة (م²)</label><input {...register('areaSqm')} type="number" className={inputCls}/></div>
          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">الإيجار الأساسي (ر.س)</label><input {...register('basePrice')} type="number" className={inputCls}/></div>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'جارٍ الحفظ...' : unit ? 'حفظ التعديلات' : 'إضافة الوحدة'}</button>
          <button type="button" onClick={onClose} className={btnSecondary}>إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Property Modal ───────────────────────────────────────────────────────────
function PropertyModal({ ownerId, onClose, onSaved }: { ownerId: string; onClose: () => void; onSaved: () => void; }) {
  const { register, handleSubmit } = useForm<any>();
  const [saving, setSaving] = useState(false);
  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      await createProperty({ ...data, ownerId, managerId: ownerId, totalUnits: Number(data.totalUnits || 0) });
      toast.success('تم إضافة العقار');
      onSaved(); onClose();
    } catch { toast.error('حدث خطأ'); }
    finally { setSaving(false); }
  };
  return (
    <Modal title="إضافة عقار جديد" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div><label className="block text-xs text-gray-500 mb-1">اسم العقار</label><input {...register('name',{required:true})} className={inputCls} placeholder="مثال: عقار جدة — حي الروضة"/></div>
        <div><label className="block text-xs text-gray-500 mb-1">العنوان</label><input {...register('address')} className={inputCls}/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">المدينة</label><input {...register('city')} className={inputCls} placeholder="جدة"/></div>
          <div><label className="block text-xs text-gray-500 mb-1">إجمالي الوحدات</label><input {...register('totalUnits')} type="number" className={inputCls}/></div>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'جارٍ الحفظ...' : 'إضافة العقار'}</button>
          <button type="button" onClick={onClose} className={btnSecondary}>إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }: any) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
const inputCls     = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
const btnPrimary   = 'bg-[#1B4F72] text-white text-sm rounded-lg px-5 py-2 hover:bg-[#2E86C1] transition-colors disabled:opacity-60';
const btnSecondary = 'border border-gray-200 text-gray-600 text-sm rounded-lg px-5 py-2 hover:bg-gray-50';
function PageLoader() { return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>; }
