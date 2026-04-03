// app/login/page.tsx
'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface LoginForm {
  email:    string;
  password: string;
}

export default function LoginPage() {
  const { login } = useAuth();
  const router    = useRouter();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      await login(data.email, data.password);
      router.push('/');
    } catch (err: any) {
      const msg =
        err.code === 'auth/invalid-credential' ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة' :
        err.code === 'auth/too-many-requests'   ? 'محاولات كثيرة، يرجى المحاولة لاحقاً' :
        'حدث خطأ، يرجى المحاولة مجدداً';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-[#1B4F72]"
      dir="rtl"
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '30px 30px' }}
      />

      <div className="relative w-full max-w-sm mx-4">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🏢</span>
          </div>
          <h1 className="text-white text-xl font-medium">نظام إدارة العقارات</h1>
          <p className="text-white/50 text-sm mt-1">Property Management System</p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-gray-800 text-lg font-medium mb-6">تسجيل الدخول</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">البريد الإلكتروني</label>
              <input
                type="email"
                {...register('email', { required: 'مطلوب' })}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                placeholder="example@email.com"
                dir="ltr"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">كلمة المرور</label>
              <input
                type="password"
                {...register('password', { required: 'مطلوب', minLength: { value: 6, message: 'يجب أن تكون 6 أحرف على الأقل' } })}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1B4F72] text-white rounded-lg py-2.5 text-sm font-medium
                hover:bg-[#2E86C1] transition-colors disabled:opacity-60 disabled:cursor-not-allowed
                flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  جارٍ الدخول...
                </>
              ) : 'دخول'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            تواصل مع مدير النظام للحصول على حساب
          </p>
        </div>
      </div>
    </div>
  );
}
