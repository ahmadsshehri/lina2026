// app/users/page.tsx — المستخدمون والصلاحيات
'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useStore } from '../../store/useStore';
import { getAllUsers, createUserDoc } from '../../lib/db-users';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { updateDoc as fbUpdateDoc, doc as fbDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import type { AppUser } from '../../types';

const ROLE_CONFIG: Record<string, { label: string; bg: string; text: string; desc: string }> = {
  owner:       { label: 'مالك',       bg: 'bg-purple-50', text: 'text-purple-700', desc: 'صلاحيات كاملة على جميع العقارات' },
  manager:     { label: 'مدير',       bg: 'bg-blue-50',   text: 'text-blue-700',   desc: 'إدارة الإيجارات والمصاريف والحجوزات' },
  accountant:  { label: 'محاسب',      bg: 'bg-green-50',  text: 'text-green-700',  desc: 'عرض التقارير وتسجيل الدفعات' },
  maintenance: { label: 'صيانة',      bg: 'bg-orange-50', text: 'text-orange-700', desc: 'طلبات الصيانة فقط' },
};

export default function UsersPage() {
  const { activeProperty, properties, setActivePage } = useStore();
  const { appUser } = useAuth();
  const [users,     setUsers]     = useState<AppUser[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    const u = await getAllUsers(activeProperty?.id);
    setUsers(u);
    setLoading(false);
  };

  useEffect(() => { setActivePage('users'); load(); }, [activeProperty]);

  // فقط المالك يمكنه إدارة المستخدمين
  if (appUser?.role !== 'owner') {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <div className="text-center text-gray-400">
          <div className="text-4xl mb-3">🔒</div>
          <p className="text-sm">هذه الصفحة للمالك فقط</p>
        </div>
      </div>
    );
  }

  const toggleUserStatus = async (user: AppUser) => {
    await fbUpdateDoc(fbDoc(db, 'users', user.uid), { isActive: !user.isActive });
    toast.success(user.isActive ? 'تم تعطيل المستخدم' : 'تم تفعيل المستخدم');
    load();
  };

  return (
    <div className="p-5" dir="rtl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-medium text-gray-800">المستخدمون والصلاحيات</h1>
          <p className="text-sm text-gray-400">{users.length} مستخدم مسجل</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="bg-[#1B4F72] text-white text-sm rounded-lg px-4 py-1.5 hover:bg-[#2E86C1] transition-colors">
          + مستخدم جديد
        </button>
      </div>

      {/* Role Reference */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {Object.entries(ROLE_CONFIG).map(([k, v]) => (
          <div key={k} className={`${v.bg} rounded-xl p-3 border border-transparent`}>
            <div className={`text-xs font-medium ${v.text} mb-1`}>{v.label}</div>
            <div className="text-xs text-gray-500">{v.desc}</div>
          </div>
        ))}
      </div>

      {loading ? <PageLoader /> : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['المستخدم','الدور','الجوال','العقارات المصرح بها','الحالة',''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const rc = ROLE_CONFIG[u.role];
                return (
                  <tr key={u.uid} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1B4F72] flex items-center justify-center text-white text-xs font-medium">
                          {u.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-800">{u.name}</div>
                          <div className="text-xs text-gray-400">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rc?.bg} ${rc?.text}`}>
                        {rc?.label || u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{u.phone || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {u.role === 'owner'
                        ? 'جميع العقارات'
                        : u.propertyIds.length > 0
                          ? properties.filter(p => u.propertyIds.includes(p.id)).map(p => p.name).join('، ')
                          : '—'
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.isActive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                        {u.isActive ? 'نشط' : 'معطل'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.uid !== appUser?.uid && (
                        <button onClick={() => toggleUserStatus(u)}
                          className={`text-xs px-3 py-1 rounded-lg border transition-colors
                            ${u.isActive
                              ? 'border-red-200 text-red-500 hover:bg-red-50'
                              : 'border-green-200 text-green-500 hover:bg-green-50'}`}>
                          {u.isActive ? 'تعطيل' : 'تفعيل'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <UserModal
          properties={properties}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ─── User Modal ───────────────────────────────────────────────────────────────
function UserModal({ properties, onClose, onSaved }: {
  properties: any[]; onClose: () => void; onSaved: () => void;
}) {
  const { register, handleSubmit, watch } = useForm<any>({
    defaultValues: { role: 'manager', isActive: true }
  });
  const [saving, setSaving] = useState(false);
  const role = watch('role');

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      // إنشاء حساب Firebase Auth
      const { user } = await createUserWithEmailAndPassword(auth, data.email, data.password);

      // إنشاء وثيقة المستخدم في Firestore
      await createUserDoc(user.uid, {
        name:        data.name,
        email:       data.email,
        phone:       data.phone || '',
        role:        data.role,
        propertyIds: data.role === 'owner' ? [] : (data.propertyIds || []),
        isActive:    true,
      });

      toast.success('تم إنشاء المستخدم بنجاح');
      onSaved(); onClose();
    } catch (e: any) {
      const msg = e.code === 'auth/email-already-in-use' ? 'البريد الإلكتروني مستخدم بالفعل' : 'حدث خطأ';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-800">إضافة مستخدم جديد</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">الاسم الكامل</label>
              <input {...register('name', {required:true})} className={inputCls}/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">البريد الإلكتروني</label>
              <input {...register('email', {required:true})} type="email" className={inputCls} dir="ltr"/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">كلمة المرور</label>
              <input {...register('password', {required:true, minLength:6})} type="password" className={inputCls}/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">رقم الجوال</label>
              <input {...register('phone')} className={inputCls}/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">الدور</label>
              <select {...register('role')} className={inputCls}>
                {Object.entries(ROLE_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {/* Property access (for non-owners) */}
          {role !== 'owner' && properties.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-2">العقارات المصرح بها</label>
              <div className="space-y-1.5">
                {properties.map(p => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" value={p.id} {...register('propertyIds')}
                      className="rounded border-gray-300"/>
                    <span className="text-sm text-gray-700">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-600">
            <strong>ملاحظة:</strong> سيتلقى المستخدم بيانات دخوله على البريد الإلكتروني. يمكنه تغيير كلمة المرور لاحقاً.
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'جارٍ الإنشاء...' : 'إنشاء المستخدم'}
            </button>
            <button type="button" onClick={onClose} className={btnSecondary}>إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls     = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
const btnPrimary   = 'bg-[#1B4F72] text-white text-sm rounded-lg px-5 py-2 hover:bg-[#2E86C1] transition-colors disabled:opacity-60';
const btnSecondary = 'border border-gray-200 text-gray-600 text-sm rounded-lg px-5 py-2 hover:bg-gray-50';
function PageLoader() { return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>; }
