'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { message } from 'antd';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'STAFF' | 'ADMIN'>('STAFF');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!pin || pin.length < 4) {
      message.error('Please enter a valid PIN (4-6 digits)');
      return;
    }

    setLoading(true);
    const success = await login(pin, role);
    setLoading(false);

    if (success) {
      message.success('Login successful');
      const redirectPath = role === 'ADMIN' ? '/admin/dashboard' : '/staff/dashboard';
      router.push(redirectPath);
    } else {
      message.error('Invalid PIN. Please try again.');
      setPin('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 font-mono">
      <div className="w-full max-w-md">
        <div className="border-2 border-black p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-xl mb-2">════</div>
            <h1 className="text-2xl font-bold mb-1">DON&apos;T MISS THIS SATURDAY</h1>
            <p className="text-sm mb-2">STAFF LOGIN</p>
            <div className="text-xl">════</div>
          </div>

          {/* Role Selection */}
          <div className="mb-6">
            <label className="block text-xs font-bold mb-3">SELECT ROLE</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRole('STAFF')}
                className={`px-6 py-3 border-2 border-black font-bold text-sm transition-colors ${role === 'STAFF' ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'
                  }`}
              >
                [STAFF]
              </button>
              <button
                onClick={() => setRole('ADMIN')}
                className={`px-6 py-3 border-2 border-black font-bold text-sm transition-colors ${role === 'ADMIN' ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'
                  }`}
              >
                [ADMIN]
              </button>
            </div>
          </div>

          {/* PIN Input */}
          <div className="mb-6">
            <label className="block text-xs font-bold mb-3">ENTER PIN (4-6 DIGITS)</label>
            <input
              type="password"
              inputMode="numeric"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyPress={handleKeyPress}
              maxLength={6}
              className="w-full px-6 py-4 border-2 border-black text-center text-3xl tracking-widest focus:outline-none focus:ring-0"
            />
          </div>

          {/* Login Button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full px-6 py-4 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 mb-4"
          >
            {loading ? '[LOGGING IN...]' : '[LOGIN]'}
          </button>
        </div>
      </div>
    </div>
  );
}
