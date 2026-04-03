// lib/db.ts
// ─────────────────────────────────────────────────────────────────────────────
// طبقة الوصول الكاملة لـ Firestore — جميع العمليات
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, orderBy, limit,
  Timestamp, writeBatch, serverTimestamp, onSnapshot,
  QueryConstraint,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import type {
  Property, Unit, Tenant, RentPayment, Booking,
  Expense, ElectricMeter, MeterReading, Transfer, AppUser
} from '../types';

// ─── مساعد: تحويل Timestamp → Date ───────────────────────────────────────────
export const tsToDate = (ts: Timestamp): Date => ts?.toDate?.() ?? new Date();

// ─── مساعد: رفع ملف ─────────────────────────────────────────────────────────
export async function uploadFile(file: File, path: string): Promise<string> {
  const r = ref(storage, path);
  await uploadBytes(r, file);
  return getDownloadURL(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// PROPERTIES — العقارات
// ══════════════════════════════════════════════════════════════════════════════
export const propertiesCol = () => collection(db, 'properties');

export async function getProperties(ownerId: string): Promise<Property[]> {
  const q = query(propertiesCol(), where('ownerId', '==', ownerId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Property));
}

export async function createProperty(data: Omit<Property, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(propertiesCol(), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateProperty(id: string, data: Partial<Property>) {
  await updateDoc(doc(db, 'properties', id), data);
}

// ══════════════════════════════════════════════════════════════════════════════
// UNITS — الوحدات
// ══════════════════════════════════════════════════════════════════════════════
export const unitsCol = () => collection(db, 'units');

export async function getUnits(propertyId: string): Promise<Unit[]> {
  const q = query(unitsCol(), where('propertyId', '==', propertyId), orderBy('unitNumber'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Unit));
}

export async function createUnit(data: Omit<Unit, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(unitsCol(), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateUnit(id: string, data: Partial<Unit>) {
  await updateDoc(doc(db, 'units', id), data);
}

export async function deleteUnit(id: string) {
  await deleteDoc(doc(db, 'units', id));
}

// ══════════════════════════════════════════════════════════════════════════════
// TENANTS — المستأجرون
// ══════════════════════════════════════════════════════════════════════════════
export const tenantsCol = () => collection(db, 'tenants');

export async function getTenants(propertyId: string): Promise<Tenant[]> {
  const q = query(
    tenantsCol(),
    where('propertyId', '==', propertyId),
    orderBy('unitNumber')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Tenant));
}

export async function getActiveTenants(propertyId: string): Promise<Tenant[]> {
  const q = query(
    tenantsCol(),
    where('propertyId', '==', propertyId),
    where('status', '==', 'active')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Tenant));
}

export async function createTenant(data: Omit<Tenant, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(tenantsCol(), { ...data, createdAt: serverTimestamp() });
  // تحديث حالة الوحدة إلى مشغول
  await updateUnit(data.unitId, { status: 'occupied' });
  return ref.id;
}

export async function updateTenant(id: string, data: Partial<Tenant>) {
  await updateDoc(doc(db, 'tenants', id), data);
}

export async function terminateTenant(tenantId: string, unitId: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'tenants', tenantId), { status: 'terminated' });
  batch.update(doc(db, 'units', unitId), { status: 'vacant' });
  await batch.commit();
}

// ══════════════════════════════════════════════════════════════════════════════
// RENT PAYMENTS — دفعات الإيجار
// ══════════════════════════════════════════════════════════════════════════════
export const paymentsCol = () => collection(db, 'rentPayments');

export async function getPayments(propertyId: string, limitN = 100): Promise<RentPayment[]> {
  const q = query(
    paymentsCol(),
    where('propertyId', '==', propertyId),
    orderBy('paidDate', 'desc'),
    limit(limitN)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as RentPayment));
}

export async function getTenantPayments(tenantId: string): Promise<RentPayment[]> {
  const q = query(
    paymentsCol(),
    where('tenantId', '==', tenantId),
    orderBy('dueDate', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as RentPayment));
}

export async function createPayment(data: Omit<RentPayment, 'id' | 'createdAt'>): Promise<string> {
  const balance = data.amountDue - data.amountPaid;
  const ref = await addDoc(paymentsCol(), {
    ...data,
    balance,
    paidDate: data.paidDate ?? serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// حساب المتأخرات
export async function getArrearsReport(propertyId: string) {
  const tenants = await getActiveTenants(propertyId);
  const today = new Date();
  const arrears = [];

  for (const t of tenants) {
    const payments = await getTenantPayments(t.id);
    const lastPayment = payments[0];
    const lastPaidDate = lastPayment?.paidDate ? tsToDate(lastPayment.paidDate as Timestamp) : null;
    const daysSince = lastPaidDate
      ? Math.floor((today.getTime() - lastPaidDate.getTime()) / 86400000)
      : 999;

    const totalDue   = payments.reduce((s, p) => s + (p.balance || 0), 0);
    if (totalDue > 0 || daysSince > 30) {
      arrears.push({ tenant: t, totalDue, daysSince, lastPaidDate });
    }
  }
  return arrears;
}

// ══════════════════════════════════════════════════════════════════════════════
// BOOKINGS — الحجوزات المفروشة
// ══════════════════════════════════════════════════════════════════════════════
export const bookingsCol = () => collection(db, 'bookings');

export async function getBookings(propertyId: string, month?: string): Promise<Booking[]> {
  const constraints: QueryConstraint[] = [
    where('propertyId', '==', propertyId),
    orderBy('checkinDate', 'asc'),
  ];
  const snap = await getDocs(query(bookingsCol(), ...constraints));
  let results = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));

  // تصفية حسب الشهر إن طُلب
  if (month) {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end   = new Date(y, m, 0, 23, 59, 59);
    results = results.filter(b => {
      const d = tsToDate(b.checkinDate);
      return d >= start && d <= end;
    });
  }
  return results;
}

export async function getUnitBookings(unitId: string): Promise<Booking[]> {
  const q = query(bookingsCol(), where('unitId', '==', unitId), orderBy('checkinDate', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
}

export async function createBooking(data: Omit<Booking, 'id' | 'createdAt'>): Promise<string> {
  const checkin  = tsToDate(data.checkinDate as Timestamp);
  const checkout = tsToDate(data.checkoutDate as Timestamp);
  const nights   = Math.ceil((checkout.getTime() - checkin.getTime()) / 86400000);
  const netRevenue = data.totalRevenue - (data.platformFee || 0);

  const ref = await addDoc(bookingsCol(), {
    ...data,
    nights,
    netRevenue,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateBooking(id: string, data: Partial<Booking>) {
  await updateDoc(doc(db, 'bookings', id), data);
}

export async function updateDepositStatus(
  bookingId: string,
  status: 'returned' | 'deducted',
  returnDate?: Date
) {
  await updateDoc(doc(db, 'bookings', bookingId), {
    depositStatus:     status,
    depositReturnDate: returnDate ? Timestamp.fromDate(returnDate) : null,
  });
}

// حساب نسبة الإشغال
export function calcOccupancy(bookings: Booking[], unitId: string, year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month - 1, daysInMonth);

  let occupied = 0;
  const unitBookings = bookings.filter(b => b.unitId === unitId && b.status !== 'cancelled');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const isOccupied = unitBookings.some(b => {
      const ci = tsToDate(b.checkinDate);
      const co = tsToDate(b.checkoutDate);
      return d >= ci && d < co;
    });
    if (isOccupied) occupied++;
  }
  return Math.round((occupied / daysInMonth) * 100);
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPENSES — المصاريف
// ══════════════════════════════════════════════════════════════════════════════
export const expensesCol = () => collection(db, 'expenses');

export async function getExpenses(propertyId: string, month?: string): Promise<Expense[]> {
  const q = query(
    expensesCol(),
    where('propertyId', '==', propertyId),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  let results = snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));

  if (month) {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end   = new Date(y, m, 0, 23, 59, 59);
    results = results.filter(e => {
      const d = tsToDate(e.date);
      return d >= start && d <= end;
    });
  }
  return results;
}

export async function createExpense(
  data: Omit<Expense, 'id' | 'createdAt'>,
  receiptFile?: File
): Promise<string> {
  let receiptUrl: string | undefined;
  if (receiptFile) {
    receiptUrl = await uploadFile(
      receiptFile,
      `receipts/${data.propertyId}/${Date.now()}_${receiptFile.name}`
    );
  }
  const ref = await addDoc(expensesCol(), {
    ...data,
    receiptUrl,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateExpense(id: string, data: Partial<Expense>) {
  await updateDoc(doc(db, 'expenses', id), data);
}

export async function deleteExpense(id: string) {
  await deleteDoc(doc(db, 'expenses', id));
}

// ══════════════════════════════════════════════════════════════════════════════
// ELECTRIC METERS — عدادات الكهرباء
// ══════════════════════════════════════════════════════════════════════════════
export async function getMeters(propertyId: string): Promise<ElectricMeter[]> {
  const q = query(collection(db, 'electricMeters'), where('propertyId', '==', propertyId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ElectricMeter));
}

export async function createMeter(data: Omit<ElectricMeter, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'electricMeters'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function saveMeterReading(data: Omit<MeterReading, 'id' | 'createdAt'>): Promise<string> {
  const consumption = data.currentRead - data.previousRead;
  const ref = await addDoc(collection(db, 'meterReadings'), {
    ...data, consumption, createdAt: serverTimestamp(),
  });
  return ref.id;
}

// ══════════════════════════════════════════════════════════════════════════════
// TRANSFERS — التحويلات المالية
// ══════════════════════════════════════════════════════════════════════════════
export async function getTransfers(propertyId: string): Promise<Transfer[]> {
  const q = query(
    collection(db, 'transfers'),
    where('propertyId', '==', propertyId),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Transfer));
}

export async function createTransfer(data: Omit<Transfer, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'transfers'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

// ══════════════════════════════════════════════════════════════════════════════
// USERS — المستخدمون
// ══════════════════════════════════════════════════════════════════════════════
export async function getUserDoc(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() } as AppUser;
}

export async function createUserDoc(uid: string, data: Omit<AppUser, 'uid' | 'createdAt'>) {
  await setDoc(doc(db, 'users', uid), { ...data, createdAt: serverTimestamp() });
}

export async function getAllUsers(propertyId?: string): Promise<AppUser[]> {
  let q;
  if (propertyId) {
    q = query(collection(db, 'users'), where('propertyIds', 'array-contains', propertyId));
  } else {
    q = query(collection(db, 'users'));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
  const data = d.data() as Omit<AppUser, 'uid'>;
  return { uid: d.id, ...data };
});
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS — التقارير الشاملة
// ══════════════════════════════════════════════════════════════════════════════
export async function getMonthlyReport(propertyId: string, year: number, month: number) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const [expenses, bookings, payments] = await Promise.all([
    getExpenses(propertyId, monthStr),
    getBookings(propertyId, monthStr),
    getPayments(propertyId),
  ]);

  // إيرادات شهرية
  const monthlyRevenue = payments
    .filter(p => {
      const d = p.paidDate ? tsToDate(p.paidDate as Timestamp) : null;
      return d?.getMonth() === month - 1 && d?.getFullYear() === year;
    })
    .reduce((s, p) => s + p.amountPaid, 0);

  // إيرادات مفروشة
  const furnishedRevenue = bookings
    .filter(b => b.status !== 'cancelled')
    .reduce((s, b) => s + b.netRevenue, 0);

  // المصاريف حسب الفئة
  const expenseByCategory: Record<string, number> = {};
  expenses.forEach(e => {
    expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount;
  });
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  return {
    monthStr,
    monthlyRevenue,
    furnishedRevenue,
    totalRevenue: monthlyRevenue + furnishedRevenue,
    totalExpenses,
    netProfit: monthlyRevenue + furnishedRevenue - totalExpenses,
    expenseByCategory,
    bookingsCount: bookings.filter(b => b.status !== 'cancelled').length,
    bookings,
  };
}
