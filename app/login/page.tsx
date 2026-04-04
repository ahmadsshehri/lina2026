'use client';
import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router    = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push('/');
    } catch (err: any) {
      console.error(err.code, err.message);
      const msgs: Record<string, string> = {
        'auth/invalid-credential':     'البريد أو كلمة المرور غير صحيحة',
        'auth/wrong-password':         'كلمة المرور غير صحيحة',
        'auth/user-not-found':         'المستخدم غير موجود',
        'auth/invalid-email':          'البريد الإلكتروني غير صحيح',
        'auth/too-many-requests':      'محاولات كثيرة، انتظر قليلاً',
        'auth/network-request-failed': 'مشكلة في الاتصال',
      };
      setError(msgs[err.code] || `خطأ: ${err.code}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1B4F72]" dir="rtl">
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🏢</span>
          </div>
          <h1 className="text-white text-xl font-medium">نظام إدارة العقارات</h1>
          <p className="text-white/50 text-sm mt-1">Property Management System</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-gray-800 text-lg font-medium mb-6">تسجيل الدخول</h2>
          <form onSubmit={handleLogin} className="space-y-4">

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">البريد الإلكتروني</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="example@email.com"
                dir="ltr"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">كلمة المرور</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1B4F72] text-white rounded-lg py-2.5 text-sm font-medium hover:bg-[#2E86C1] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                  جارٍ الدخول...
                </>
              ) : 'دخول'}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}
