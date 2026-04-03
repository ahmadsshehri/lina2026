// lib/export.ts
// ─────────────────────────────────────────────────────────────────────────────
// تصدير التقارير PDF و Excel
// ─────────────────────────────────────────────────────────────────────────────

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { RentPayment, Booking, Expense, Tenant } from '../types';
import { tsToDate } from './db';

const fmt  = (n: number) => n.toLocaleString('ar-SA');
const fmtD = (d: any)    => d ? format(tsToDate(d), 'dd/MM/yyyy') : '—';

// ─── PDF مشترك ───────────────────────────────────────────────────────────────
function createPDF(title: string, subtitle: string) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.setFont('helvetica');
  pdf.setFontSize(16);
  pdf.text(title, pdf.internal.pageSize.width / 2, 15, { align: 'center' });
  pdf.setFontSize(10);
  pdf.text(subtitle, pdf.internal.pageSize.width / 2, 22, { align: 'center' });
  pdf.text(`تاريخ الطباعة: ${format(new Date(), 'dd/MM/yyyy')}`, 15, 22);
  return pdf;
}

// ─── تقرير المتأخرات ─────────────────────────────────────────────────────────
export function exportArrearsPDF(
  arrears: { tenant: Tenant; totalDue: number; daysSince: number }[],
  propertyName: string,
  month: string
) {
  const pdf = createPDF(
    `تقرير المتأخرات — ${propertyName}`,
    `شهر ${month}`
  );
  autoTable(pdf, {
    startY: 28,
    head: [['رقم الشقة','المستأجر','رقم الجوال','المبلغ المتأخر','أيام التأخر','آخر دفعة']],
    body: arrears.map(a => [
      a.tenant.unitNumber,
      a.tenant.name,
      a.tenant.phone,
      `${fmt(a.totalDue)} ر.س`,
      a.daysSince > 900 ? 'لا يوجد' : `${a.daysSince} يوم`,
      '—',
    ]),
    styles:        { font: 'helvetica', halign: 'right', fontSize: 9 },
    headStyles:    { fillColor: [27, 79, 114] },
    alternateRowStyles: { fillColor: [214, 234, 248] },
  });
  pdf.save(`arrears_${month}.pdf`);
}

// ─── تقرير الدفعات ───────────────────────────────────────────────────────────
export function exportPaymentsPDF(
  payments: RentPayment[],
  propertyName: string,
  month: string
) {
  const pdf = createPDF(`تقرير الدفعات — ${propertyName}`, `شهر ${month}`);
  const total = payments.reduce((s, p) => s + p.amountPaid, 0);

  autoTable(pdf, {
    startY: 28,
    head: [['تاريخ الدفع','الشقة','المستأجر','المطلوب','المدفوع','الرصيد','طريقة الدفع','مرجع']],
    body: [
      ...payments.map(p => [
        fmtD(p.paidDate),
        p.unitNumber,
        p.tenantName,
        `${fmt(p.amountDue)} ر.س`,
        `${fmt(p.amountPaid)} ر.س`,
        `${fmt(p.balance)} ر.س`,
        p.paymentMethod,
        p.referenceNumber || '—',
      ]),
      ['', '', 'الإجمالي', '', `${fmt(total)} ر.س`, '', '', ''],
    ],
    styles:     { font: 'helvetica', halign: 'right', fontSize: 8 },
    headStyles: { fillColor: [27, 79, 114] },
    alternateRowStyles: { fillColor: [214, 234, 248] },
  });
  pdf.save(`payments_${month}.pdf`);
}

// ─── تقرير الحجوزات ──────────────────────────────────────────────────────────
export function exportBookingsPDF(
  bookings: Booking[],
  propertyName: string,
  month: string
) {
  const pdf = createPDF(`تقرير الحجوزات المفروشة — ${propertyName}`, `شهر ${month}`);
  const totalNet = bookings.filter(b => b.status !== 'cancelled').reduce((s, b) => s + b.netRevenue, 0);

  const channelLabel: Record<string, string> = {
    airbnb: 'Airbnb', gathern: 'Gathern', booking: 'Booking.com',
    direct: 'مباشر', other: 'أخرى',
  };
  autoTable(pdf, {
    startY: 28,
    head: [['الشقة','الضيف','المنصة','الوصول','المغادرة','ليالي','الإيراد','صافي','التأمين','الحالة']],
    body: [
      ...bookings.map(b => [
        b.unitNumber,
        b.guestName,
        channelLabel[b.channel] || b.channel,
        fmtD(b.checkinDate),
        fmtD(b.checkoutDate),
        b.nights,
        `${fmt(b.totalRevenue)} ر.س`,
        `${fmt(b.netRevenue)} ر.س`,
        `${fmt(b.depositAmount)} ر.س`,
        b.status,
      ]),
      ['', '', '', '', '', '', '', `${fmt(totalNet)} ر.س`, '', ''],
    ],
    styles:     { font: 'helvetica', halign: 'right', fontSize: 8 },
    headStyles: { fillColor: [27, 79, 114] },
    alternateRowStyles: { fillColor: [214, 234, 248] },
  });
  pdf.save(`bookings_${month}.pdf`);
}

// ─── تقرير المصاريف ──────────────────────────────────────────────────────────
export function exportExpensesPDF(
  expenses: Expense[],
  propertyName: string,
  month: string
) {
  const pdf = createPDF(`تقرير المصاريف — ${propertyName}`, `شهر ${month}`);
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const catLabel: Record<string, string> = {
    electricity: 'كهرباء', water: 'مياه', maintenance: 'صيانة',
    salary: 'راتب', cleaning: 'نظافة', other: 'أخرى',
  };
  autoTable(pdf, {
    startY: 28,
    head: [['التاريخ','الفئة','البيان','المبلغ','دُفع بواسطة','طريقة الدفع']],
    body: [
      ...expenses.map(e => [
        fmtD(e.date),
        catLabel[e.category] || e.category,
        e.subcategory,
        `${fmt(e.amount)} ر.س`,
        e.paidBy === 'owner' ? 'المالك' : 'المسؤول',
        e.paymentMethod,
      ]),
      ['', '', 'الإجمالي', `${fmt(total)} ر.س`, '', ''],
    ],
    styles:     { font: 'helvetica', halign: 'right', fontSize: 9 },
    headStyles: { fillColor: [27, 79, 114] },
    alternateRowStyles: { fillColor: [214, 234, 248] },
  });
  pdf.save(`expenses_${month}.pdf`);
}

// ─── تقرير شامل Excel ────────────────────────────────────────────────────────
export function exportMonthlyExcel(
  data: {
    payments:  RentPayment[];
    bookings:  Booking[];
    expenses:  Expense[];
    summary:   { label: string; value: number }[];
  },
  propertyName: string,
  month: string
) {
  const wb = XLSX.utils.book_new();

  // ورقة الملخص
  const summarySheet = XLSX.utils.aoa_to_sheet([
    [`التقرير الشهري — ${propertyName} — ${month}`],
    [],
    ['البند', 'القيمة (ر.س)'],
    ...data.summary.map(s => [s.label, s.value]),
  ]);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'ملخص الشهر');

  // ورقة الدفعات
  const paySheet = XLSX.utils.aoa_to_sheet([
    ['تاريخ الدفع','الشقة','المستأجر','المطلوب','المدفوع','الرصيد','الطريقة','مرجع'],
    ...data.payments.map(p => [
      fmtD(p.paidDate), p.unitNumber, p.tenantName,
      p.amountDue, p.amountPaid, p.balance, p.paymentMethod, p.referenceNumber || '',
    ]),
  ]);
  XLSX.utils.book_append_sheet(wb, paySheet, 'الدفعات الشهرية');

  // ورقة الحجوزات
  const bkSheet = XLSX.utils.aoa_to_sheet([
    ['الشقة','الضيف','المنصة','الوصول','المغادرة','ليالي','الإيراد','صافي','تأمين','حالة تأمين'],
    ...data.bookings.map(b => [
      b.unitNumber, b.guestName, b.channel,
      fmtD(b.checkinDate), fmtD(b.checkoutDate),
      b.nights, b.totalRevenue, b.netRevenue, b.depositAmount, b.depositStatus,
    ]),
  ]);
  XLSX.utils.book_append_sheet(wb, bkSheet, 'الحجوزات المفروشة');

  // ورقة المصاريف
  const expSheet = XLSX.utils.aoa_to_sheet([
    ['التاريخ','الفئة','البيان','المبلغ','دُفع بواسطة','الطريقة'],
    ...data.expenses.map(e => [
      fmtD(e.date), e.category, e.subcategory, e.amount, e.paidBy, e.paymentMethod,
    ]),
  ]);
  XLSX.utils.book_append_sheet(wb, expSheet, 'المصاريف');

  XLSX.writeFile(wb, `property_report_${month}.xlsx`);
}
