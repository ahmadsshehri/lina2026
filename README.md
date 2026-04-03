# نظام إدارة العقارات المتكامل
## دليل الإعداد والنشر الكامل

---

## 📁 هيكل المشروع

```
property-app/
├── app/                    ← صفحات Next.js (App Router)
│   ├── page.tsx            ← لوحة التحكم الرئيسية
│   ├── login/page.tsx      ← صفحة تسجيل الدخول
│   ├── monthly/page.tsx    ← الإيجار الشهري
│   ├── furnished/page.tsx  ← الشقق المفروشة
│   ├── calendar/page.tsx   ← تقويم الحجوزات
│   ├── expenses/page.tsx   ← المصاريف
│   ├── cashflow/page.tsx   ← التدفق المالي
│   ├── reports/page.tsx    ← التقارير
│   ├── units/page.tsx      ← الوحدات والعقارات
│   ├── users/page.tsx      ← المستخدمون
│   └── layout.tsx          ← Layout الرئيسي
│
├── components/
│   └── layout/
│       └── AppLayout.tsx   ← الشريط الجانبي والـ Topbar
│
├── context/
│   └── AuthContext.tsx     ← إدارة المصادقة
│
├── lib/
│   ├── firebase.ts         ← تهيئة Firebase
│   ├── db.ts               ← طبقة Firestore (CRUD كامل)
│   └── export.ts           ← تصدير PDF و Excel
│
├── store/
│   └── useStore.ts         ← الحالة العامة (Zustand)
│
├── types/
│   └── index.ts            ← جميع TypeScript types
│
├── firestore.rules         ← قواعد الأمان (RBAC)
├── firestore.indexes.json  ← فهارس Firestore
├── firebase.json           ← إعدادات Firebase Hosting
└── .env.example            ← متغيرات البيئة
```

---

## 🚀 خطوات الإعداد

### الخطوة 1 — إنشاء مشروع Firebase

1. اذهب إلى [console.firebase.google.com](https://console.firebase.google.com)
2. اضغط **Add project** وأعطه اسماً (مثال: `property-mgmt`)
3. فعّل **Google Analytics** (اختياري)
4. من القائمة الجانبية فعّل:
   - **Authentication** → Sign-in method → Email/Password ✅
   - **Firestore Database** → Create database → Production mode
   - **Storage** → Get started

### الخطوة 2 — إعداد المشروع المحلي

```bash
# نسخ المشروع وتثبيت المكتبات
cd property-app
npm install

# نسخ ملف المتغيرات
cp .env.example .env.local
```

### الخطوة 3 — إضافة بيانات Firebase

افتح Firebase Console → Project Settings → Your Apps → Add App (Web)

انسخ الـ config وضعه في `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

### الخطوة 4 — نشر قواعد Firestore

```bash
# تثبيت Firebase CLI
npm install -g firebase-tools

# تسجيل الدخول
firebase login

# ربط المشروع
firebase use your-project-id

# نشر القواعد والفهارس
firebase deploy --only firestore
```

### الخطوة 5 — إنشاء المستخدم الأول (المالك)

في Firebase Console → Authentication → Add user:
- Email: ahmed@example.com
- Password: أي كلمة مرور قوية

ثم في Firestore → Collection `users` → Add document بمعرف `uid` المستخدم:

```json
{
  "name": "أحمد",
  "email": "ahmed@example.com",
  "phone": "05xxxxxxxx",
  "role": "owner",
  "propertyIds": [],
  "isActive": true
}
```

### الخطوة 6 — تشغيل محلياً

```bash
npm run dev
# افتح http://localhost:3000
```

### الخطوة 7 — البناء والنشر

```bash
# بناء المشروع
npm run build

# نشر على Firebase Hosting
firebase deploy --only hosting
```

---

## 🗄️ هيكل Firestore Collections

| Collection | الوصف |
|---|---|
| `users` | المستخدمون وصلاحياتهم |
| `properties` | العقارات |
| `units` | الوحدات (الشقق) |
| `tenants` | المستأجرون الشهريون |
| `rentPayments` | دفعات الإيجار |
| `bookings` | حجوزات الشقق المفروشة |
| `expenses` | المصاريف |
| `electricMeters` | عدادات الكهرباء |
| `meterReadings` | قراءات العدادات الشهرية |
| `transfers` | التحويلات المالية |

---

## 👥 الأدوار والصلاحيات

| الدور | الصلاحيات |
|---|---|
| `owner` (مالك) | كامل — جميع العقارات |
| `manager` (مدير) | تسجيل الإيجارات والحجوزات والمصاريف — عقاراته فقط |
| `accountant` (محاسب) | قراءة وتصدير التقارير المالية |
| `maintenance` (صيانة) | طلبات الصيانة فقط |

---

## 📱 دعم الموبايل (PWA)

التطبيق يعمل كـ Progressive Web App — يمكن تثبيته على الجوال:
- iOS: افتح في Safari → Share → Add to Home Screen
- Android: افتح في Chrome → ثلاث نقاط → Install App

---

## 🔧 الصفحات المبرمجة

| الصفحة | الملف | الحالة |
|---|---|---|
| لوحة التحكم | `app/page.tsx` | ✅ مكتمل |
| تسجيل الدخول | `app/login/page.tsx` | ✅ مكتمل |
| الإيجار الشهري | `app/monthly/page.tsx` | ✅ مكتمل |
| الشقق المفروشة | `app/furnished/page.tsx` | 🔄 جاهز للبناء |
| تقويم الحجوزات | `app/calendar/page.tsx` | 🔄 جاهز للبناء |
| المصاريف | `app/expenses/page.tsx` | 🔄 جاهز للبناء |
| التدفق المالي | `app/cashflow/page.tsx` | 🔄 جاهز للبناء |
| التقارير | `app/reports/page.tsx` | 🔄 جاهز للبناء |
| الوحدات | `app/units/page.tsx` | 🔄 جاهز للبناء |
| المستخدمون | `app/users/page.tsx` | 🔄 جاهز للبناء |

---

## 📦 المكتبات المستخدمة

| المكتبة | الغرض |
|---|---|
| Next.js 14 | الإطار الأساسي |
| Firebase 10 | قاعدة البيانات + Auth + Storage |
| Zustand | إدارة الحالة |
| React Hook Form | النماذج |
| Recharts | الرسوم البيانية |
| jsPDF + autotable | تصدير PDF |
| SheetJS (xlsx) | تصدير Excel |
| React Hot Toast | الإشعارات |
| date-fns | التواريخ |
| Tailwind CSS | التصميم |

---

## 📞 للمساعدة

تواصل مع فريق التطوير لإضافة الصفحات المتبقية أو أي تخصيصات.
