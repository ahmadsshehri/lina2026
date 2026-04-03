// lib/firebase.ts
// ─────────────────────────────────────────────────────────────────────────────
// استبدل هذه القيم بمعلومات مشروعك على Firebase Console
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  enableIndexedDbPersistence,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// تهيئة Firebase مرة واحدة فقط (Next.js hot-reload safe)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);

// تفعيل الحفظ المحلي (يعمل offline)
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch(() => {});
}

export default app;
