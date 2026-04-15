import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { Mail, ArrowLeft } from 'lucide-react';
import ScreenHeader from '@/components/ScreenHeader';
import {
  login as apiLogin,
  signup as apiSignup,
  signInWithSSO,
  API_BASE_URL,
} from '@/services/bibleService';
import { renderGoogleButton } from '@/services/googleAuth';

type Screen = 'providers' | 'email';
type Mode = 'signin' | 'signup';

export default function SignInScreen() {
  const navigate = useNavigate();
  const { dispatch } = useApp();
  const [screen, setScreen] = useState<Screen>('providers');
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    if (screen !== 'providers' || !googleBtnRef.current) return;
    let cancelled = false;
    renderGoogleButton(
      googleBtnRef.current,
      async idToken => {
        if (cancelled) return;
        setError(null);
        setSubmitting(true);
        try {
          const user = await signInWithSSO('google', idToken);
          dispatch({ type: 'SET_SIGNED_IN', value: true, userId: user.id });
          navigate('/read');
        } catch (err: unknown) {
          setError(
            err instanceof Error ? err.message : 'Google sign-in failed on the server'
          );
        } finally {
          setSubmitting(false);
        }
      },
      err => {
        if (cancelled) return;
        setError(err.message);
      }
    ).then(() => !cancelled && setGoogleReady(true));
    return () => {
      cancelled = true;
    };
  }, [screen, dispatch, navigate]);

  const handleAppleSSO = () => {
    window.location.href = `${API_BASE_URL}/auth/sso/apple/redirect`;
  };

  const handleEmailSubmit = async () => {
    setError(null);
    if (!email || !password) {
      setError('Enter your email and password');
      return;
    }
    setSubmitting(true);
    try {
      const user = mode === 'signin' ? await apiLogin(email, password) : await apiSignup(email, password, name);
      dispatch({ type: 'SET_SIGNED_IN', value: true, userId: user.id });
      navigate('/read');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'status' in err
          ? `Sign ${mode === 'signin' ? 'in' : 'up'} failed (${(err as { status: number }).status})`
          : 'Network error — please try again';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (screen === 'email') {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: '#1B1B1B' }}>
        <header
          className="shrink-0 safe-top"
          style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 48px)', backgroundColor: '#1A1A1A' }}
        >
          <div className="relative flex items-center justify-center px-3" style={{ height: 56 }}>
            <button
              onClick={() => setScreen('providers')}
              aria-label="Back"
              className="absolute left-2 w-[44px] h-[44px] flex items-center justify-center"
            >
              <ArrowLeft size={22} color="#fff" strokeWidth={2} />
            </button>
            <h1 className="text-[18px] font-medium" style={{ color: '#ffffff' }}>
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </h1>
          </div>
        </header>

        <div className="flex-1 px-6 pt-4 pb-6" style={{ backgroundColor: '#000000' }}>
          {mode === 'signup' && (
            <div className="mb-3">
              <label className="text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="mt-1.5 w-full h-[52px] px-4 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B09A6D]"
                style={{ backgroundColor: '#323232', border: '1px solid #323232', color: '#E7E7E7' }}
                placeholder="Your name"
              />
            </div>
          )}
          <div className="mb-3">
            <label className="text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1.5 w-full h-[52px] px-4 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B09A6D]"
              style={{ backgroundColor: '#323232', border: '1px solid #323232', color: '#E7E7E7' }}
              placeholder="you@example.com"
            />
          </div>
          <div className="mb-3">
            <label className="text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>Password</label>
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1.5 w-full h-[52px] px-4 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B09A6D]"
              style={{ backgroundColor: '#323232', border: '1px solid #323232', color: '#E7E7E7' }}
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-[13px] text-red-400 mt-1">{error}</p>}

          <button
            onClick={handleEmailSubmit}
            disabled={submitting}
            className="mt-5 w-full h-12 rounded-xl font-medium text-[15px] disabled:opacity-40"
            style={{ backgroundColor: '#B09A6D', color: '#000000' }}
          >
            {submitting
              ? mode === 'signin'
                ? 'Signing in...'
                : 'Creating account...'
              : mode === 'signin'
              ? 'Sign In'
              : 'Create Account'}
          </button>

          <button
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
            }}
            className="w-full mt-4 text-[13px]"
            style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            {mode === 'signin'
              ? "Don't have an account? Create one"
              : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#1B1B1B' }}>
      <ScreenHeader title="Sign In" onBack={() => navigate('/menu')} />

      <div className="flex-1 flex flex-col px-6 pb-6" style={{ backgroundColor: '#000000' }}>
        <div className="mt-4 mb-8 text-center">
          <h2 className="text-[22px] font-bold" style={{ color: '#E7E7E7' }}>Welcome to VerseMate</h2>
          <p className="text-[14px] mt-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Sign in to sync your bookmarks, notes, and highlights across devices.
          </p>
        </div>

        <div className="flex-1 flex flex-col justify-center space-y-3">
          <div
            ref={googleBtnRef}
            className="w-full flex items-center justify-center min-h-[48px]"
          />
          {!googleReady && (
            <a
              href={`${API_BASE_URL}/auth/sso/google/redirect`}
              className="flex items-center justify-center gap-3 w-full h-12 rounded-xl font-medium text-[14px] no-underline"
              style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', color: '#1B1B1B' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-1.74.97-3.28 1.22-5.05 1.22-4.13 0-8.18-2.79-8.18-8.18S7.87 5 12 5c2.18 0 4.04.78 5.52 2.08l-2.24 2.16c-.6-.57-1.65-1.24-3.28-1.24-2.81 0-5.1 2.33-5.1 5.2s2.29 5.2 5.1 5.2c3.26 0 4.49-2.34 4.68-3.55H12v-2.84h7.82c.08.47.13.94.13 1.56 0 3.85-2.57 6.71-6.9 6.71z" />
              </svg>
              Continue with Google
            </a>
          )}
          <button
            onClick={handleAppleSSO}
            disabled={submitting}
            className="flex items-center justify-center gap-3 w-full h-12 rounded-xl font-medium text-[14px] disabled:opacity-60"
            style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', color: '#1B1B1B' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Continue with Apple
          </button>

          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 h-px" style={{ backgroundColor: '#323232' }} />
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>or</span>
            <div className="flex-1 h-px" style={{ backgroundColor: '#323232' }} />
          </div>

          <button
            onClick={() => setScreen('email')}
            className="flex items-center justify-center gap-3 w-full h-12 rounded-xl font-medium text-[14px]"
            style={{ backgroundColor: '#323232', border: '1px solid #323232', color: '#E7E7E7' }}
          >
            <Mail size={18} />
            Continue with Email
          </button>

          {error && (
            <p className="text-[12px] text-red-400 mt-2 text-center">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
