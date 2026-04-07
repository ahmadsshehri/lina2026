'use client';
import { useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  doc, setDoc, getDoc, collection, getDocs,
  query, where, serverTimestamp, updateDoc, arrayUnion,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab   = 'login' | 'register' | 'reset';
type Role  = 'owner' | 'manager';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const FIREBASE_ERRORS: Record<string, string> = {
  'auth/invalid-credential':    'البريد أو كلمة المرور غير صحيحة',
  'auth/wrong-password':        'كلمة المرور غير صحيحة',
  'auth/user-not-found':        'المستخدم غير موجود',
  'auth/invalid-email':         'البريد الإلكتروني غير صحيح',
  'auth/too-many-requests':     'محاولات كثيرة — انتظر قليلاً',
  'auth/email-already-in-use':  'البريد مستخدم بالفعل',
  'auth/weak-password':         'كلمة المرور ضعيفة (6 أحرف على الأقل)',
  'auth/network-request-failed':'مشكلة في الاتصال بالإنترنت',
};
function firebaseMsg(code: string) {
  return FIREBASE_ERRORS[code] || `خطأ: ${code}`;
}

// ─── Generate invite code ─────────────────────────────────────────────────────
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter();

  const [tab,          setTab]          = useState<Tab>('login');
  const [role,         setRole]         = useState<Role>('owner');
  const [linkMethod,   setLinkMethod]   = useState<'code' | 'email'>('code');

  // Form fields
  const [name,         setName]         = useState('');
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [confirmPwd,   setConfirmPwd]   = useState('');
  const [linkCode,     setLinkCode]     = useState('');
  const [resetEmail,   setResetEmail]   = useState('');

  // UI state
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');
  const [showPwd,      setShowPwd]      = useState(false);
  const [mounted,      setMounted]      = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setError(''); setSuccess(''); }, [tab, role]);

  // ─── LOGIN ─────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('يرجى ملء جميع الحقول'); return; }
    setLoading(true); setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push('/');
    } catch (err: any) {
      setError(firebaseMsg(err.code));
    } finally { setLoading(false); }
  };

  // ─── REGISTER ──────────────────────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name || !email || !password) { setError('يرجى ملء جميع الحقول'); return; }
    if (password !== confirmPwd)       { setError('كلمة المرور غير متطابقة'); return; }
    if (password.length < 6)           { setError('كلمة المرور 6 أحرف على الأقل'); return; }

    // Manager must provide link code or email method
    if (role === 'manager' && linkMethod === 'code' && !linkCode.trim()) {
      setError('يرجى إدخال كود الربط أو اختر طريقة الدعوة بالإيميل'); return;
    }

    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);

      if (role === 'owner') {
        // Owner: create user doc with a generated invite code
        await setDoc(doc(db, 'users', user.uid), {
          name:        name.trim(),
          email:       email.trim().toLowerCase(),
          role:        'owner',
          propertyIds: [],
          isActive:    true,
          inviteCode:  genCode(),
          createdAt:   serverTimestamp(),
        });
        router.push('/');

      } else {
        // Manager: try to link via code
        let linkedPropertyIds: string[] = [];

        if (linkMethod === 'code' && linkCode.trim()) {
          // Find owner by invite code
          const ownerSnap = await getDocs(
            query(collection(db, 'users'), where('inviteCode', '==', linkCode.trim().toUpperCase()))
          );
          if (ownerSnap.empty) {
            setError('كود الربط غير صحيح — تحقق من الكود وأعد المحاولة');
            setLoading(false);
            return;
          }
          const ownerDoc = ownerSnap.docs[0];
          linkedPropertyIds = ownerDoc.data().propertyIds || [];

          // Mark code as used (optional: invalidate after one use)
          await updateDoc(doc(db, 'users', ownerDoc.id), {
            usedCodes: arrayUnion(linkCode.trim().toUpperCase()),
          });
        }

        await setDoc(doc(db, 'users', user.uid), {
          name:        name.trim(),
          email:       email.trim().toLowerCase(),
          role:        'manager',
          propertyIds: linkedPropertyIds,
          isActive:    true,
          linkCode:    linkCode.trim().toUpperCase() || null,
          createdAt:   serverTimestamp(),
        });
        router.push('/');
      }
    } catch (err: any) {
      setError(firebaseMsg(err.code));
    } finally { setLoading(false); }
  };

  // ─── RESET PASSWORD ────────────────────────────────────────────────────────
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) { setError('يرجى إدخال بريدك الإلكتروني'); return; }
    setLoading(true); setError('');
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setSuccess('تم إرسال رابط إعادة التعيين — تحقق من بريدك الإلكتروني');
    } catch (err: any) {
      setError(firebaseMsg(err.code));
    } finally { setLoading(false); }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&display=swap');

        body { font-family: 'Tajawal', 'Segoe UI', sans-serif; }

        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          background: #0f1923;
          position: relative;
          overflow: hidden;
          font-family: 'Tajawal', 'Segoe UI', sans-serif;
        }

        /* Geometric background */
        .bg-geo {
          position: absolute; inset: 0; overflow: hidden; pointer-events: none;
        }
        .bg-geo::before {
          content: '';
          position: absolute;
          top: -30%; right: -20%;
          width: 700px; height: 700px;
          background: radial-gradient(circle, rgba(27,79,114,0.35) 0%, transparent 65%);
          border-radius: 50%;
        }
        .bg-geo::after {
          content: '';
          position: absolute;
          bottom: -20%; left: -15%;
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(212,172,13,0.12) 0%, transparent 65%);
          border-radius: 50%;
        }
        .bg-lines {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 48px 48px;
        }

        /* Card */
        .card {
          width: 100%; max-width: 440px;
          background: rgba(255,255,255,0.97);
          border-radius: 20px;
          overflow: hidden;
          position: relative;
          z-index: 10;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.1),
            0 32px 80px rgba(0,0,0,0.5),
            0 8px 24px rgba(0,0,0,0.3);
          animation: cardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(32px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Card header */
        .card-header {
          background: linear-gradient(135deg, #1B4F72 0%, #154360 60%, #0d2d40 100%);
          padding: 32px 28px 28px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .card-header::after {
          content: '';
          position: absolute;
          bottom: -1px; left: 0; right: 0;
          height: 20px;
          background: rgba(255,255,255,0.97);
          border-radius: 20px 20px 0 0;
        }
        .card-header-pattern {
          position: absolute; inset: 0; opacity: 0.06;
          background-image: repeating-linear-gradient(
            45deg,
            #fff 0, #fff 1px,
            transparent 0, transparent 50%
          );
          background-size: 16px 16px;
        }
        .logo-wrap {
          width: 64px; height: 64px;
          background: rgba(255,255,255,0.15);
          border: 2px solid rgba(255,255,255,0.25);
          border-radius: 18px;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 14px;
          position: relative; z-index: 1;
        }
        .logo-wrap svg { width: 32px; height: 32px; }
        .card-title {
          font-size: 20px; font-weight: 800;
          color: #fff; margin-bottom: 4px;
          position: relative; z-index: 1;
        }
        .card-subtitle {
          font-size: 13px; color: rgba(255,255,255,0.55);
          position: relative; z-index: 1;
        }

        /* Tabs */
        .tabs {
          display: flex; gap: 0;
          border-bottom: 1.5px solid #e5e7eb;
          background: #f8fafc;
        }
        .tab-btn {
          flex: 1; padding: 14px 8px;
          font-size: 14px; font-weight: 500;
          font-family: 'Tajawal', sans-serif;
          border: none; background: transparent;
          color: #9ca3af; cursor: pointer;
          border-bottom: 2.5px solid transparent;
          margin-bottom: -1.5px;
          transition: all 0.2s;
        }
        .tab-btn.active {
          color: #1B4F72; font-weight: 700;
          border-bottom-color: #1B4F72;
          background: #fff;
        }
        .tab-btn:hover:not(.active) { color: #374151; background: #f1f5f9; }

        /* Body */
        .card-body { padding: 28px; }

        /* Role selector */
        .role-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 10px; margin-bottom: 20px;
        }
        .role-card {
          border: 2px solid #e5e7eb;
          border-radius: 14px; padding: 16px 12px;
          cursor: pointer; text-align: center;
          transition: all 0.2s; background: #fff;
          font-family: 'Tajawal', sans-serif;
        }
        .role-card:hover { border-color: #93c5fd; background: #f0f9ff; }
        .role-card.selected-owner {
          border-color: #1B4F72; background: #eff6ff;
          box-shadow: 0 0 0 3px rgba(27,79,114,0.1);
        }
        .role-card.selected-manager {
          border-color: #D4AC0D; background: #fffbeb;
          box-shadow: 0 0 0 3px rgba(212,172,13,0.12);
        }
        .role-icon { font-size: 28px; margin-bottom: 8px; display: block; }
        .role-name { font-size: 14px; font-weight: 700; color: #111827; }
        .role-desc { font-size: 11px; color: #6b7280; margin-top: 3px; line-height: 1.4; }

        /* Link method */
        .link-method-tabs {
          display: flex; gap: 6px; margin-bottom: 14px;
        }
        .link-method-btn {
          flex: 1; padding: 9px 8px;
          font-size: 12px; font-weight: 600;
          font-family: 'Tajawal', sans-serif;
          border-radius: 10px;
          border: 1.5px solid #e5e7eb;
          background: #f9fafb; color: #6b7280;
          cursor: pointer; transition: all 0.2s;
        }
        .link-method-btn.active {
          border-color: #1B4F72; background: #eff6ff; color: #1B4F72;
        }

        /* Manager notice */
        .manager-notice {
          background: #fffbeb;
          border: 1.5px solid #fcd34d;
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 18px;
          font-size: 12px; color: #92400e;
          line-height: 1.6;
          display: flex; gap: 10px; align-items: flex-start;
        }
        .manager-notice-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }

        /* Field */
        .field { margin-bottom: 16px; }
        .field-label {
          display: block;
          font-size: 13px; font-weight: 600;
          color: #374151; margin-bottom: 6px;
        }
        .field-input-wrap { position: relative; }
        .field-input {
          width: 100%;
          border: 1.5px solid #e5e7eb;
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 14px;
          font-family: 'Tajawal', sans-serif;
          color: #111827;
          background: #fff;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .field-input:focus {
          border-color: #1B4F72;
          box-shadow: 0 0 0 3px rgba(27,79,114,0.1);
        }
        .field-input::placeholder { color: #9ca3af; }
        .field-input.ltr { direction: ltr; text-align: left; }
        .pwd-toggle {
          position: absolute;
          left: 12px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none;
          cursor: pointer; color: #9ca3af;
          font-size: 16px; padding: 4px;
          transition: color 0.15s;
        }
        .pwd-toggle:hover { color: #1B4F72; }
        .field-hint {
          font-size: 11px; color: #9ca3af;
          margin-top: 5px; display: block;
        }

        /* Code input special */
        .code-input {
          font-size: 20px; font-weight: 700;
          letter-spacing: 4px; text-align: center;
          text-transform: uppercase;
          font-family: 'Courier New', monospace;
        }

        /* Submit button */
        .btn-primary {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #1B4F72, #2E86C1);
          color: #fff;
          border: none; border-radius: 12px;
          font-size: 15px; font-weight: 700;
          font-family: 'Tajawal', sans-serif;
          cursor: pointer;
          transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          margin-top: 4px;
        }
        .btn-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #154360, #1B6CA8);
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(27,79,114,0.35);
        }
        .btn-primary:active:not(:disabled) { transform: translateY(0); }
        .btn-primary:disabled { opacity: 0.65; cursor: not-allowed; }

        /* Spinner */
        .spinner {
          width: 18px; height: 18px;
          border: 2.5px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Divider */
        .divider {
          display: flex; align-items: center; gap: 12px;
          margin: 18px 0; color: #9ca3af; font-size: 12px;
        }
        .divider::before, .divider::after {
          content: ''; flex: 1; height: 1px; background: #e5e7eb;
        }

        /* Link button */
        .link-btn {
          background: none; border: none;
          font-family: 'Tajawal', sans-serif;
          font-size: 13px; font-weight: 600;
          color: #1B4F72; cursor: pointer;
          text-decoration: underline; text-underline-offset: 3px;
          transition: color 0.15s;
        }
        .link-btn:hover { color: #2E86C1; }

        /* Footer links */
        .footer-row {
          display: flex; align-items: center;
          justify-content: center; gap: 6px;
          margin-top: 16px; flex-wrap: wrap;
        }
        .footer-text { font-size: 13px; color: #6b7280; }

        /* Alert */
        .alert {
          border-radius: 10px; padding: 11px 14px;
          font-size: 13px; margin-bottom: 16px;
          display: flex; align-items: flex-start; gap: 8px;
          line-height: 1.5; animation: alertIn 0.25s ease both;
        }
        @keyframes alertIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .alert-error {
          background: #fef2f2; border: 1px solid #fecaca; color: #dc2626;
        }
        .alert-success {
          background: #f0fdf4; border: 1px solid #bbf7d0; color: #16a34a;
        }

        /* Card footer branding */
        .card-footer {
          padding: 14px 28px 20px;
          text-align: center;
          border-top: 1px solid #f3f4f6;
        }
        .brand-line {
          font-size: 11px; color: #9ca3af;
          display: flex; align-items: center;
          justify-content: center; gap: 6px;
        }
        .brand-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: #D4AC0D; display: inline-block;
        }

        /* Slide animation between tabs */
        .tab-content {
          animation: fadeSlide 0.2s ease both;
        }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        /* Responsive */
        @media (max-width: 480px) {
          .card-body { padding: 20px; }
          .role-grid { gap: 8px; }
        }
      `}</style>

      <div className="login-page" dir="rtl">
        <div className="bg-geo">
          <div className="bg-lines" />
        </div>

        <div className="card">

          {/* ── Header ── */}
          <div className="card-header">
            <div className="card-header-pattern" />
            <div className="logo-wrap">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 3L2 12V29H12V20H20V29H30V12L16 3Z" fill="rgba(255,255,255,0.9)" />
                <rect x="13" y="20" width="6" height="9" fill="rgba(27,79,114,0.6)" />
                <path d="M16 3L2 12" stroke="rgba(212,172,13,0.8)" strokeWidth="1.5" />
                <path d="M16 3L30 12" stroke="rgba(212,172,13,0.8)" strokeWidth="1.5" />
              </svg>
            </div>
            <h1 className="card-title">نظام إدارة العقارات</h1>
            <p className="card-subtitle">Property Management System</p>
          </div>

          {/* ── Tabs ── */}
          <div className="tabs">
            <button
              className={`tab-btn ${tab === 'login' ? 'active' : ''}`}
              onClick={() => setTab('login')}
            >
              تسجيل الدخول
            </button>
            <button
              className={`tab-btn ${tab === 'register' ? 'active' : ''}`}
              onClick={() => setTab('register')}
            >
              إنشاء حساب
            </button>
          </div>

          {/* ── Body ── */}
          <div className="card-body">

            {/* ── Alerts ── */}
            {error && (
              <div className="alert alert-error">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="alert alert-success">
                <span>✅</span>
                <span>{success}</span>
              </div>
            )}

            {/* ════ LOGIN ════ */}
            {tab === 'login' && (
              <div className="tab-content">
                <form onSubmit={handleLogin}>
                  <div className="field">
                    <label className="field-label">البريد الإلكتروني</label>
                    <input
                      type="email"
                      className="field-input ltr"
                      placeholder="example@mail.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>

                  <div className="field">
                    <label className="field-label">كلمة المرور</label>
                    <div className="field-input-wrap">
                      <input
                        type={showPwd ? 'text' : 'password'}
                        className="field-input ltr"
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete="current-password"
                        style={{ paddingLeft: '40px' }}
                        required
                      />
                      <button
                        type="button"
                        className="pwd-toggle"
                        onClick={() => setShowPwd(v => !v)}
                        tabIndex={-1}
                      >
                        {showPwd ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>

                  <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? <><span className="spinner" /> جارٍ الدخول...</> : 'دخول'}
                  </button>
                </form>

                <div className="footer-row" style={{ marginTop: '14px' }}>
                  <span className="footer-text">نسيت كلمة المرور؟</span>
                  <button className="link-btn" onClick={() => setTab('reset')}>
                    إعادة التعيين
                  </button>
                </div>
              </div>
            )}

            {/* ════ REGISTER ════ */}
            {tab === 'register' && (
              <div className="tab-content">
                <form onSubmit={handleRegister}>

                  {/* Role Selector */}
                  <div style={{ marginBottom: '20px' }}>
                    <label className="field-label" style={{ marginBottom: '10px' }}>
                      نوع الحساب
                    </label>
                    <div className="role-grid">
                      <div
                        className={`role-card ${role === 'owner' ? 'selected-owner' : ''}`}
                        onClick={() => setRole('owner')}
                      >
                        <span className="role-icon">🏠</span>
                        <div className="role-name">مالك عقار</div>
                        <div className="role-desc">أمتلك عقارات وأريد إدارتها</div>
                      </div>
                      <div
                        className={`role-card ${role === 'manager' ? 'selected-manager' : ''}`}
                        onClick={() => setRole('manager')}
                      >
                        <span className="role-icon">👤</span>
                        <div className="role-name">مدير عقار</div>
                        <div className="role-desc">مُكلَّف بإدارة عقار بدعوة</div>
                      </div>
                    </div>
                  </div>

                  {/* Common fields */}
                  <div className="field">
                    <label className="field-label">الاسم الكامل</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="أدخل اسمك الكامل"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="field">
                    <label className="field-label">البريد الإلكتروني</label>
                    <input
                      type="email"
                      className="field-input ltr"
                      placeholder="example@mail.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>

                  <div className="field">
                    <label className="field-label">كلمة المرور</label>
                    <div className="field-input-wrap">
                      <input
                        type={showPwd ? 'text' : 'password'}
                        className="field-input ltr"
                        placeholder="6 أحرف على الأقل"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        style={{ paddingLeft: '40px' }}
                        required
                      />
                      <button
                        type="button"
                        className="pwd-toggle"
                        onClick={() => setShowPwd(v => !v)}
                        tabIndex={-1}
                      >
                        {showPwd ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>

                  <div className="field">
                    <label className="field-label">تأكيد كلمة المرور</label>
                    <input
                      type="password"
                      className="field-input ltr"
                      placeholder="أعد كتابة كلمة المرور"
                      value={confirmPwd}
                      onChange={e => setConfirmPwd(e.target.value)}
                      required
                    />
                  </div>

                  {/* ── Manager linking section ── */}
                  {role === 'manager' && (
                    <>
                      <div className="manager-notice">
                        <span className="manager-notice-icon">🔗</span>
                        <div>
                          كمدير عقار، تحتاج للربط بحساب المالك.
                          اختر طريقة الربط أدناه — إذا لم يكن لديك كود الآن يمكنك الربط لاحقاً.
                        </div>
                      </div>

                      {/* Link method tabs */}
                      <div className="link-method-tabs">
                        <button
                          type="button"
                          className={`link-method-btn ${linkMethod === 'code' ? 'active' : ''}`}
                          onClick={() => setLinkMethod('code')}
                        >
                          🔑 كود الربط
                        </button>
                        <button
                          type="button"
                          className={`link-method-btn ${linkMethod === 'email' ? 'active' : ''}`}
                          onClick={() => setLinkMethod('email')}
                        >
                          📧 انتظار دعوة بالإيميل
                        </button>
                      </div>

                      {linkMethod === 'code' && (
                        <div className="field">
                          <label className="field-label">كود الربط</label>
                          <input
                            type="text"
                            className="field-input code-input"
                            placeholder="XXXXXXXX"
                            value={linkCode}
                            onChange={e => setLinkCode(e.target.value.toUpperCase())}
                            maxLength={8}
                            dir="ltr"
                          />
                          <span className="field-hint">
                            الكود مكوّن من 8 أحرف وأرقام — اطلبه من المالك
                          </span>
                        </div>
                      )}

                      {linkMethod === 'email' && (
                        <div style={{
                          background: '#f0fdf4',
                          border: '1.5px solid #bbf7d0',
                          borderRadius: '12px',
                          padding: '12px 14px',
                          marginBottom: '16px',
                          fontSize: '12px',
                          color: '#16a34a',
                          lineHeight: '1.6',
                        }}>
                          ✅ سيتم إنشاء حسابك، وعندما يرسل لك المالك دعوة على بريدك الإلكتروني ستُربط العقارات تلقائياً.
                        </div>
                      )}
                    </>
                  )}

                  <button type="submit" className="btn-primary" disabled={loading}>
                    {loading
                      ? <><span className="spinner" /> جارٍ الإنشاء...</>
                      : role === 'owner' ? 'إنشاء حساب المالك' : 'إنشاء حساب المدير'
                    }
                  </button>
                </form>

                <div className="footer-row">
                  <span className="footer-text">لديك حساب بالفعل؟</span>
                  <button className="link-btn" onClick={() => setTab('login')}>
                    تسجيل الدخول
                  </button>
                </div>
              </div>
            )}

            {/* ════ RESET PASSWORD ════ */}
            {tab === 'reset' && (
              <div className="tab-content">
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px', lineHeight: '1.6' }}>
                  أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.
                </p>
                <form onSubmit={handleReset}>
                  <div className="field">
                    <label className="field-label">البريد الإلكتروني</label>
                    <input
                      type="email"
                      className="field-input ltr"
                      placeholder="example@mail.com"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn-primary" disabled={loading}>
                    {loading
                      ? <><span className="spinner" /> جارٍ الإرسال...</>
                      : 'إرسال رابط الاسترداد'
                    }
                  </button>
                </form>
                <div className="footer-row">
                  <button className="link-btn" onClick={() => setTab('login')}>
                    ← العودة لتسجيل الدخول
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* ── Card Footer ── */}
          <div className="card-footer">
            <div className="brand-line">
              <span>نظام إدارة العقارات المتكامل</span>
              <span className="brand-dot" />
              <span>v2.0</span>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
