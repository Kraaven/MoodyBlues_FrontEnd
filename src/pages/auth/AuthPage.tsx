import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Play } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { API_BASE_URL, errorText } from '../../api/client';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { DEMO_POSE, demoClock } from '../../stage/DemoScene';
import { StageWindow } from '../../stage/StageWindow';
import type { StageView } from '../../stage/store';
import { useStageView } from '../../stage/useStageView';
import { Button } from '../../ui/Button';
import { Field, FormError, FormNotice } from '../../ui/Field';
import { Brand } from '../../ui/Logo';
import { formatPlayhead } from '../../lib/format';

const DEMO: StageView = { id: 'auth', content: 'demo', pose: DEMO_POSE, drift: true, dim: 1, durationMs: 0 };
const NONE: StageView = { id: 'auth', content: 'none', dim: 0 };

/** The decorative timeline under the demo scene, moving with its clock. */
function DemoTimeline() {
  const time = useRef<HTMLSpanElement>(null);
  const played = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const f = demoClock.time / demoClock.duration;
      if (time.current) time.current.textContent = formatPlayhead(demoClock.time, 3);
      if (played.current) played.current.style.width = `${f * 100}%`;
      if (knob.current) knob.current.style.left = `${f * 100}%`;
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div aria-hidden="true" className="glass flex h-12 items-center gap-5 rounded-[var(--radius-control)] border border-rule-strong/70 px-5">
      <Play className="h-4 w-4 text-accent" strokeWidth={2} />
      <span ref={time} className="tabular w-[92px] font-mono text-[13px] text-accent" />
      <div className="relative mx-3 h-px flex-1 bg-fg-3/50">
        <div ref={played} className="absolute inset-y-0 left-0 h-[2px] -translate-y-[0.5px] bg-accent" />
        <div ref={knob} className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_10px_rgb(245_181_68/0.7)]" />
      </div>
      <span className="tabular font-mono text-[13px] text-fg-2">{formatPlayhead(demoClock.duration, 0)}</span>
    </div>
  );
}

function useAuthForm(submit: (email: string, password: string) => Promise<void>) {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/projects';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await submit(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorText(err, 'Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return { email, setEmail, password, setPassword, error, busy, onSubmit };
}

/** Sign in and create account: the form on the left, the product doing its job on the right. */
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register, expired } = useAuth();
  const form = useAuthForm(mode === 'login' ? login : register);
  const wide = useMediaQuery('(min-width: 1024px)');
  useStageView(wide ? DEMO : NONE);

  useEffect(() => {
    document.title = `${mode === 'login' ? 'Sign in' : 'Create account'} · MoodyBlues`;
  }, [mode]);

  if (user) return <Navigate to="/projects" replace />;
  const login_ = mode === 'login';
  const host = API_BASE_URL.replace(/^https?:\/\//, '');

  return (
    <div className="relative isolate flex min-h-dvh">
      <main id="main" className="flex w-full flex-col px-6 py-8 sm:px-12 lg:w-[40%] lg:min-w-[480px] lg:max-w-[640px] lg:px-14 lg:py-12">
        <div className="space-y-12">
          <Link to="/login" aria-label="MoodyBlues">
            <Brand />
          </Link>
          <p className="eyebrow">Session intelligence for Unity</p>
        </div>

        <div className="flex flex-1 items-center py-14">
          <div className="w-full max-w-[440px] animate-rise lg:ml-12">
            <h1 className="display text-[44px] leading-[50px] text-fg sm:text-[52px] sm:leading-[58px]">{login_ ? 'Welcome back.' : 'Start watching.'}</h1>
            <p className="mt-3 text-[16px] text-fg-2">{login_ ? 'Your next breakthrough is in the replay.' : 'Every play session, again, in 3D. It takes a minute.'}</p>

            <form onSubmit={form.onSubmit} className="mt-12 space-y-7">
              {expired && login_ && <FormNotice>Your session expired. Sign in again.</FormNotice>}
              <Field
                label="Email address"
                type="email"
                autoComplete="email"
                placeholder="you@studio.com"
                required
                autoFocus
                value={form.email}
                onChange={(e) => form.setEmail(e.target.value)}
              />
              <Field
                label="Password"
                type="password"
                autoComplete={login_ ? 'current-password' : 'new-password'}
                placeholder={login_ ? 'Enter your password' : 'At least 8 characters'}
                required
                minLength={login_ ? undefined : 8}
                hint={login_ ? undefined : 'At least 8 characters.'}
                value={form.password}
                onChange={(e) => form.setPassword(e.target.value)}
              />
              <FormError>{form.error}</FormError>
              <Button type="submit" size="lg" className="w-full" loading={form.busy} trailing={<ArrowRight className="h-5 w-5" />}>
                {login_ ? 'Sign in' : 'Create account'}
              </Button>
            </form>

            <p className="mt-10 text-center text-[14px] text-fg-2">
              {login_ ? 'New to MoodyBlues? ' : 'Already have an account? '}
              <Link to={login_ ? '/register' : '/login'} className="text-accent transition-colors hover:text-accent-hover">
                {login_ ? 'Create an account' : 'Sign in'}
              </Link>
            </p>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 text-[13px] text-fg-3">
          <span className="truncate font-mono text-[12px]" title="The server this dashboard talks to">
            {host}
          </span>
          <span className="font-mono text-[12px]">© {new Date().getFullYear()} MoodyBlues</span>
        </footer>
      </main>

      {wide && (
        <section aria-label="What MoodyBlues does" className="relative flex-1 py-6 pr-6">
          <StageWindow interactive={false} className="h-full rounded-[18px]" contentClassName="flex flex-col justify-end">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-t from-[#1c1e22] via-[#1c1e22]/55 via-30% to-transparent to-60%" />
            <div className="absolute right-8 top-6">
              <span className="glass inline-flex h-9 items-center gap-2.5 rounded-full border border-rule-strong/70 px-4 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-2">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                Courtyard / demo
              </span>
            </div>
            <div className="relative space-y-12 px-12 pb-14 xl:px-16">
              <DemoTimeline />
              <div className="animate-rise">
                <p className="display text-[52px] leading-[60px] text-fg xl:text-[64px] xl:leading-[72px]">
                  Hindsight,
                  <br />
                  in three dimensions.
                </p>
                <p className="mt-6 max-w-md text-[17px] leading-7 text-fg-2">
                  Revisit the play. Find the unexpected.
                  <br />
                  See exactly what happened, together.
                </p>
              </div>
            </div>
          </StageWindow>
        </section>
      )}
    </div>
  );
}
