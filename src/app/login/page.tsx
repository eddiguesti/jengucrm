'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReady, setCaptchaReady] = useState(false);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const router = useRouter();

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'; // Test key

  // Allow login after 3 seconds if CAPTCHA doesn't load
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!captchaReady) {
        setCaptchaReady(true);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [captchaReady]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, captchaToken }),
      });

      const data = await res.json();

      if (data.success) {
        router.push('/');
        router.refresh();
      } else {
        setError(data.error || 'Invalid password');
        // Reset captcha on failure
        turnstileRef.current?.reset();
        setCaptchaToken(null);
      }
    } catch {
      setError('Something went wrong');
      turnstileRef.current?.reset();
      setCaptchaToken(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Jengu CRM</h1>
          <p className="text-zinc-400 text-sm">Enter password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
              autoFocus
            />
          </div>

          {/* Cloudflare Turnstile CAPTCHA */}
          <div className="flex justify-center">
            <Turnstile
              ref={turnstileRef}
              siteKey={siteKey}
              onSuccess={(token) => {
                setCaptchaToken(token);
                setCaptchaReady(true);
              }}
              onError={() => {
                setError('Security check failed. Please try again.');
                setCaptchaToken(null);
                setCaptchaReady(true); // Allow fallback
              }}
              onExpire={() => {
                setCaptchaToken(null);
              }}
              options={{
                theme: 'dark',
                size: 'normal',
              }}
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password || (!captchaToken && !captchaReady)}
            className="w-full py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-zinc-600 text-xs text-center mt-6">
          Protected by Cloudflare Turnstile
        </p>
      </div>
    </div>
  );
}
