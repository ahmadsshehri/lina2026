// lib/userHelpers.ts
// دالة مشتركة لتحميل العقارات والمستخدم — تُستخدم في جميع الصفحات
import { auth, db } from './firebase';
import {
  collection, getDocs, query, where, doc, getDoc
} from 'firebase/firestore';

export interface AppUserBasic {
  uid: string;
  name: string;
  role: string;
  propertyIds: string[];
  isActive: boolean;
}

export interface PropertyBasic {
  id: string;
  name: string;
  city?: string;
  totalUnits?: number;
}

/**
 * تحميل بيانات المستخدم الحالي من Firestore
 */
export async function getCurrentUser(uid: string): Promise<AppUserBasic | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  return {
    uid: snap.id,
    name: data.name || '',
    role: data.role || '',
    propertyIds: Array.isArray(data.propertyIds) ? data.propertyIds : [],
    isActive: data.isActive !== false,
  };
}

/**
 * تحميل العقارات المتاحة للمستخدم حسب دوره
 * - المالك: يرى كل العقارات التي أنشأها (ownerId == uid)
 * - غيره: يرى العقارات الموجودة في propertyIds فقط
 */
export async function loadPropertiesForUser(uid: string, role: string): Promise<PropertyBasic[]> {
  try {
    if (role === 'owner') {
      const snap = await getDocs(
        query(collection(db, 'properties'), where('ownerId', '==', uid))
      );
      return snap.docs.map(d => ({
        id: d.id,
        name: (d.data() as any).name || '',
        city: (d.data() as any).city || '',
        totalUnits: (d.data() as any).totalUnits || 0,
      }));
    }

    // غير المالك: نقرأ propertyIds من مستنده أولاً
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (!userSnap.exists()) return [];

    const userData = userSnap.data() as any;
    const ids: string[] = Array.isArray(userData.propertyIds) ? userData.propertyIds : [];

    if (ids.length === 0) return [];

    // نجلب العقارات على دفعات (Firestore يسمح بـ 10 فقط في `in`)
    const results: PropertyBasic[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      const snap = await getDocs(
        query(collection(db, 'properties'), where('__name__', 'in', chunk))
      );
      snap.docs.forEach(d => results.push({
        id: d.id,
        name: (d.data() as any).name || '',
        city: (d.data() as any).city || '',
        totalUnits: (d.data() as any).totalUnits || 0,
      }));
    }
    return results;

  } catch (err) {
    console.error('loadPropertiesForUser error:', err);
    return [];
  }
}

/**
 * التحقق من صلاحية المستخدم للوصول لصفحة معينة
 * يُستخدم في كل صفحة عند التحميل
 */
export function canAccess(role: string, page: string): boolean {
  const rules: Record<string, string[]> = {
    owner:       ['all'],
    manager:     ['monthly', 'furnished', 'calendar', 'expenses', 'cashflow', 'reports', 'units'],
    accountant:  ['monthly', 'furnished', 'calendar', 'expenses', 'cashflow', 'reports'],
    maintenance: ['maintenance'],
  };
  const allowed = rules[role] || [];
  return allowed.includes('all') || allowed.includes(page);
}
