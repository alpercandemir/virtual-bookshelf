import React, { useState } from 'react';
import { BookOpen, KeyRound, Library, Sparkles, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../api/client';

export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [seedSamples, setSeedSamples] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, password, seedSamples);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to sign in right now. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-8 sm:py-10 relative overflow-hidden">
      {/* Warm antique wooden architectural hint behind card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'url("/textures/wood-walnut-v.jpg")',
          backgroundSize: '420px auto',
          maskImage: 'radial-gradient(ellipse 68% 68% at 50% 48%, black 15%, transparent 80%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 68% 68% at 50% 48%, black 15%, transparent 80%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Emblem */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-b from-[#3d2919] to-[#23160d] border border-[#c89d54]/40 shadow-[0_12px_32px_rgba(0,0,0,0.65)] mb-4">
            <Library className="w-7 h-7 text-[#e3bf76]" />
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-wide text-[#f7ecd9]">
            The Virtual Bookshelf
          </h1>
          <p className="mt-2 text-sm text-[#c7b59d]">
            Curate, arrange, and admire your personal wooden library.
          </p>
        </div>

        {/* Auth Card */}
        <div className="rounded-xl border border-[#c9a15c]/25 bg-[#1d1510]/90 backdrop-blur-md shadow-[0_28px_60px_rgba(0,0,0,0.75)] overflow-hidden">
          <div className="grid grid-cols-2 border-b border-[#c9a15c]/15 bg-[#160f0b]/60">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-3.5 text-sm font-medium transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'text-[#f4dca8] bg-[#2a1d15]/80 border-b-2 border-[#d4ac62]'
                  : 'text-[#9d8a72] hover:text-[#dfd0b8]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-3.5 text-sm font-medium transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'text-[#f4dca8] bg-[#2a1d15]/80 border-b-2 border-[#d4ac62]'
                  : 'text-[#9d8a72] hover:text-[#dfd0b8]'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-400/35 bg-red-950/50 px-3.5 py-2.5 text-sm text-red-200"
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="auth-username"
                className="block text-xs uppercase tracking-widest text-[#bca78b] mb-2"
              >
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#988267] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={32}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="librarian"
                  className="w-full rounded-lg bg-[#120d09] border border-[#c9a15c]/25 pl-10 pr-3.5 py-2.5 text-base sm:text-sm text-[#f7eedf] placeholder:text-[#6d5c48] focus:outline-none focus:border-[#d8b168] focus:ring-1 focus:ring-[#d8b168]/60"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs uppercase tracking-widest text-[#bca78b] mb-2"
              >
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-[#988267] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  minLength={mode === 'register' ? 8 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter password'}
                  className="w-full rounded-lg bg-[#120d09] border border-[#c9a15c]/25 pl-10 pr-3.5 py-2.5 text-base sm:text-sm text-[#f7eedf] placeholder:text-[#6d5c48] focus:outline-none focus:border-[#d8b168] focus:ring-1 focus:ring-[#d8b168]/60"
                />
              </div>
            </div>

            {mode === 'register' && (
              <label className="flex items-start gap-3 rounded-lg border border-[#c9a15c]/15 bg-[#150f0b]/70 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={seedSamples}
                  onChange={(e) => setSeedSamples(e.target.checked)}
                  className="mt-0.5 rounded border-[#c9a15c]/40 bg-[#120d09] accent-[#c89d54]"
                />
                <span className="text-xs leading-relaxed text-[#cab89f]">
                  <span className="font-medium text-[#f0dec0] flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#dfb970]" />
                    Stock with classic sample editions
                  </span>
                  Start with a curated shelf of classic books so you can explore arranging and customizing immediately (you can remove them anytime).
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-[#cfa458] to-[#a77a32] hover:from-[#dbb268] hover:to-[#b5873c] active:translate-y-px disabled:opacity-60 text-[#1b1208] font-semibold text-sm py-2.5 px-4 shadow-[0_6px_18px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,244,214,0.5)] transition cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              {submitting
                ? mode === 'login'
                  ? 'Opening your study...'
                  : 'Crafting your bookcase...'
                : mode === 'login'
                  ? 'Enter My Library'
                  : 'Create My Bookshelf'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[#826f5a] mt-5">
          Real physical book proportions &middot; AI shelf photo scanner &middot; Private collection
        </p>
      </div>
    </div>
  );
}
