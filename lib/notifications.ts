// lib/notifications.ts
// نظام الإشعارات الداخلية + البريد الإلكتروني

import {
  collection, addDoc, serverTimestamp,
  getDocs, query, where, updateDoc, doc,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Types ────────────────────────────────────────────────────────────────────
export type NotifType =
  | 'tenant_add' | 'tenant_edit' | 'tenant_delete'
  | 'payment_add' | 'payment_edit' | 'payment_delete'
  | 'booking_add' | 'booking_edit' | 'booking_delete'
  | 'expense_add' | 'expense_delete'
  | 'revenue_add' | 'revenue_edit' | 'revenue_delete';

export interface NotifPayload {
  type: NotifType;
  propertyId: string;
  propertyName?: string;
  title: string;        // عنوان قصير
  body: string;         // تفاصيل
  by: string;           // اسم المستخدم الذي فعل الحدث
  byRole?: string;
  amount?: number;      // للدفعات والمصاريف والإيرادات
  unitNumber?: string;  // رقم الشقة
  guestOrTenant?: string; // اسم المستأجر أو الضيف
}

// ─── Icon & Color per type ────────────────────────────────────────────────────
export const NOTIF_META: Record<NotifType, { icon: string; color: string; bg: string }> = {
  tenant_add:     { icon: '👤', color: '#16a34a', bg: '#d1fae5' },
  tenant_edit:    { icon: '✏️', color: '#1e40af', bg: '#dbeafe' },
  tenant_delete:  { icon: '🗑️', color: '#dc2626', bg: '#fee2e2' },
  payment_add:    { icon: '💰', color: '#16a34a', bg: '#d1fae5' },
  payment_edit:   { icon: '✏️', color: '#1e40af', bg: '#dbeafe' },
  payment_delete: { icon: '🗑️', color: '#dc2626', bg: '#fee2e2' },
  booking_add:    { icon: '🏨', color: '#7c3aed', bg: '#ede9fe' },
  booking_edit:   { icon: '✏️', color: '#1e40af', bg: '#dbeafe' },
  booking_delete: { icon: '🗑️', color: '#dc2626', bg: '#fee2e2' },
  expense_add:    { icon: '💳', color: '#dc2626', bg: '#fee2e2' },
  expense_delete: { icon: '🗑️', color: '#dc2626', bg: '#fee2e2' },
  revenue_add:    { icon: '💵', color: '#16a34a', bg: '#d1fae5' },
  revenue_edit:   { icon: '✏️', color: '#1e40af', bg: '#dbeafe' },
  revenue_delete: { icon: '🗑️', color: '#dc2626', bg: '#fee2e2' },
};

// ─── EmailJS config ───────────────────────────────────────────────────────────
// تحتاج تسجّل في emailjs.com وتضع القيم الصحيحة
const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID';   // ← ضع Service ID من EmailJS
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';  // ← ضع Template ID من EmailJS
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';   // ← ضع Public Key من EmailJS

// إيميلات المالك (ثابتة — يمكن جلبها من Firestore لاحقاً)
const OWNER_EMAILS = ['Ahmad.S.Shehri@gmail.com'];

// ─── Send Email via EmailJS ───────────────────────────────────────────────────
async function sendEmail(payload: NotifPayload) {
  try {
    const meta = NOTIF_META[payload.type];
    const templateParams = {
      to_email:     OWNER_EMAILS.join(','),
      subject:      `${meta.icon} ${payload.title} — كراءك`,
      property:     payload.propertyName || payload.propertyId,
      event_title:  payload.title,
      event_body:   payload.body,
      event_by:     payload.by,
      event_type:   payload.type,
      unit_number:  payload.unitNumber || '—',
      amount:       payload.amount ? payload.amount.toLocaleString('ar-SA') + ' ر.س' : '—',
      person:       payload.guestOrTenant || '—',
      timestamp:    new Date().toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' }),
    };

    // إرسال بدون مكتبة (fetch مباشر)
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:  EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id:     EMAILJS_PUBLIC_KEY,
        template_params: templateParams,
      }),
    });

    if (!response.ok) {
      console.warn('EmailJS send failed:', await response.text());
    }
  } catch (err) {
    // الإيميل اختياري — لا نوقف التطبيق إذا فشل
    console.warn('Email notification failed:', err);
  }
}

// ─── Save notification to Firestore ──────────────────────────────────────────
async function saveNotification(payload: NotifPayload) {
  try {
    await addDoc(collection(db, 'notifications'), {
      ...payload,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Notification save failed:', err);
  }
}

// ─── Main function — call this from any page ─────────────────────────────────
export async function notify(payload: NotifPayload) {
  // حفظ في Firestore (للجرس الداخلي)
  await saveNotification(payload);

  // إرسال إيميل (في الخلفية — لا ينتظر)
  sendEmail(payload).catch(() => {});
}

// ─── Mark notifications as read ──────────────────────────────────────────────
export async function markAllRead(propertyId: string) {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'notifications'),
        where('propertyId', '==', propertyId),
        where('read', '==', false)
      )
    );
    const updates = snap.docs.map(d => updateDoc(doc(db, 'notifications', d.id), { read: true }));
    await Promise.all(updates);
  } catch (err) {
    console.warn('markAllRead failed:', err);
  }
}

// ─── Load notifications ───────────────────────────────────────────────────────
export interface NotifDoc extends NotifPayload {
  id: string;
  read: boolean;
  createdAt: any;
}

export async function loadNotifications(propertyId: string, limitCount = 50): Promise<NotifDoc[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'notifications'), where('propertyId', '==', propertyId))
    );
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as NotifDoc))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, limitCount);
  } catch (err) {
    console.warn('loadNotifications failed:', err);
    return [];
  }
}
