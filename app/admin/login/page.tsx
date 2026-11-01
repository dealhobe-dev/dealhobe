'use client';

import { signIn } from 'next-auth/react';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FiShoppingBag, FiArrowRight } from 'react-icons/fi';

export default function AdminLoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      const locked = /^RATE_LIMITED:(\d+)/.exec(result.error);
      if (locked) {
        const mins = Math.max(1, Math.ceil(Number(locked[1]) / 60));
        setError(`Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
      } else if (result.error === 'UNAVAILABLE') {
        setError('Sign-in is temporarily unavailable. Please try again shortly.');
      } else {
        setError('Invalid email or password. Please try again.');
      }
      setPassword('');
    } else {
      router.replace('/admin');
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="login-logo">
          <span className="logo-emoji"><FiShoppingBag size={32} /></span>
          <h1>DealHobe Admin</h1>
          <p>Sign in to manage your store</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="login-error" role="alert">{error}</div>}

          <div className="login-input-wrap">
            <label className="login-input-label">Email Address</label>
            <input
              id="admin-email"
              type="email"
              className="login-input"
              placeholder="admin@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              maxLength={254}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div className="login-input-wrap">
            <label className="login-input-label">Password</label>
            <input
              id="admin-password"
              type="password"
              className="login-input"
              placeholder="Your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              maxLength={256}
              autoComplete="current-password"
            />
          </div>

          <button
            id="admin-login-btn"
            type="submit"
            className="login-submit"
            disabled={loading}
          >
            {loading ? 'Signing in…' : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                Sign In <FiArrowRight size={15} />
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
