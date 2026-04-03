// types/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// جميع أنواع البيانات للنظام — مشتقة من PRD
// ─────────────────────────────────────────────────────────────────────────────

import { Timestamp } from 'firebase/firestore';

// ─── صلاحيات المستخدمين ──────────────────────────────────────────────────────
export type UserRole = 'owner' | 'manager' | 'accountant' | 'maintenance';

export interface AppUser {
  uid:          string;
  name:         string;
  email:        string;
  phone:        string;
  role:         UserRole;
  propertyIds:  string[];   // العقارات المصرح بها
  isActive:     boolean;
  createdAt:    Timestamp;
}

// ─── العقار ──────────────────────────────────────────────────────────────────
export interface Property {
  id:           string;
  name:         string;       // مثال: عقار جدة
  address:      string;
  city:         string;
  totalUnits:   number;
  ownerId:      string;
  managerId:    string;
  imageUrl?:    string;
  createdAt:    Timestamp;
}

// ─── الوحدة (الشقة) ──────────────────────────────────────────────────────────
export type UnitType   = 'monthly' | 'furnished' | 'owner';
export type UnitStatus = 'occupied' | 'vacant' | 'maintenance';

export interface Unit {
  id:           string;
  propertyId:   string;
  unitNumber:   string;
  type:         UnitType;
  floor:        number;
  rooms:        number;
  areaSqm?:     number;
  status:       UnitStatus;
  basePrice:    number;       // الإيجار الأساسي
  notes?:       string;
  createdAt:    Timestamp;
}

// ─── المستأجر الشهري ─────────────────────────────────────────────────────────
export type PaymentCycle  = 'monthly' | 'quarterly' | 'semi' | 'annual';
export type TenantStatus  = 'active' | 'expired' | 'terminated';

export interface Tenant {
  id:              string;
  propertyId:      string;
  unitId:          string;
  unitNumber:      string;   // نسخة مخزنة للعرض السريع
  name:            string;
  phone:           string;
  idNumber:        string;
  contractNumber:  string;
  contractStart:   Timestamp;
  contractEnd:     Timestamp;
  paymentCycle:    PaymentCycle;
  rentAmount:      number;
  ejarLinked:      boolean;
  status:          TenantStatus;
  notes?:          string;
  createdAt:       Timestamp;
}

// ─── دفعة إيجار ──────────────────────────────────────────────────────────────
export type PaymentMethod = 'transfer' | 'cash' | 'ejar' | 'stc_pay';

export interface RentPayment {
  id:              string;
  propertyId:      string;
  tenantId:        string;
  unitId:          string;
  unitNumber:      string;
  tenantName:      string;
  dueDate:         Timestamp;
  paidDate?:       Timestamp;
  amountDue:       number;
  amountPaid:      number;
  balance:         number;   // محسوب: amountDue - amountPaid
  paymentMethod:   PaymentMethod;
  referenceNumber?: string;
  notes?:          string;
  receivedBy:      string;   // uid
  createdAt:       Timestamp;
}

// ─── حجز مفروش ───────────────────────────────────────────────────────────────
export type BookingChannel = 'airbnb' | 'gathern' | 'booking' | 'direct' | 'other';
export type BookingStatus  = 'confirmed' | 'checkedin' | 'checkedout' | 'cancelled';
export type DepositStatus  = 'held' | 'returned' | 'deducted';

export interface Booking {
  id:                  string;
  propertyId:          string;
  unitId:              string;
  unitNumber:          string;
  guestName:           string;
  guestPhone:          string;
  guestId?:            string;
  channel:             BookingChannel;
  checkinDate:         Timestamp;
  checkoutDate:        Timestamp;
  nights:              number;       // محسوب
  nightlyRate:         number;
  totalRevenue:        number;
  platformFee:         number;
  netRevenue:          number;       // totalRevenue - platformFee
  depositAmount:       number;
  depositStatus:       DepositStatus;
  depositReturnDate?:  Timestamp;
  status:              BookingStatus;
  cancellationPolicy?: string;
  refundAmount?:       number;
  notes?:              string;
  createdAt:           Timestamp;
}

// ─── المصروف ─────────────────────────────────────────────────────────────────
export type ExpenseCategory = 'electricity' | 'water' | 'maintenance' | 'salary' | 'cleaning' | 'other';
export type PaidBy = 'owner' | 'manager';

export interface Expense {
  id:             string;
  propertyId:     string;
  unitId?:        string;    // اختياري — إن كان مصروف شقة بعينها
  unitNumber?:    string;
  category:       ExpenseCategory;
  subcategory:    string;    // مثال: "عداد شقق 1-6"
  amount:         number;
  date:           Timestamp;
  paidBy:         PaidBy;
  paymentMethod:  PaymentMethod;
  receiptUrl?:    string;    // رابط الإيصال من Firebase Storage
  notes?:         string;
  recordedBy:     string;    // uid
  createdAt:      Timestamp;
}

// ─── عداد الكهرباء ────────────────────────────────────────────────────────────
export interface ElectricMeter {
  id:           string;
  propertyId:   string;
  meterNumber:  string;
  meterLabel:   string;     // "عداد شقق 1-6"
  linkedUnits:  string[];   // unitIds
  createdAt:    Timestamp;
}

export interface MeterReading {
  id:           string;
  meterId:      string;
  propertyId:   string;
  month:        string;     // "2026-03"
  previousRead: number;
  currentRead:  number;
  consumption:  number;     // محسوب
  amount:       number;
  createdAt:    Timestamp;
}

// ─── التحويل المالي ────────────────────────────────────────────────────────────
export type TransferType = 'owner_transfer' | 'manager_expense';

export interface Transfer {
  id:            string;
  propertyId:    string;
  type:          TransferType;
  amount:        number;
  date:          Timestamp;
  fromUser:      string;
  toUser:        string;
  paymentMethod: PaymentMethod;
  notes?:        string;
  createdAt:     Timestamp;
}

// ─── واجهة التصفية والبحث ─────────────────────────────────────────────────────
export interface DateRange {
  from: Date;
  to:   Date;
}

export interface ReportFilters {
  propertyId?: string;
  month?:      string;    // "2026-03"
  year?:       string;    // "2026"
  unitId?:     string;
}
