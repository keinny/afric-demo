import { useState } from 'react';
import { BRAND } from './config';
import { supabase } from './db';
import { useStore } from './store';
import { Logo } from './ui';

/** Shows the sign-in screen / loading states in database mode, otherwise the app. */
export default function Gate({ children }) {
  const { boot, bootError, me, signOut, syncError, saving } = useStore();

  if (boot === 'ready')
    return (
      <>
        {children}
        {syncError && (
          <div className="sync-error" role="alert">
            <b>Not saved to the database:</b> {syncError}
          </div>
        )}
        {saving && <div className="sync-saving">Saving…</div>}
      </>
    );

  if (boot === 'checking' || boot === 'loading') return <AppSkeleton label={boot === 'checking' ? 'Connecting…' : 'Loading records…'} />;

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo"><Logo withTagline /></div>
        {boot === 'login' && <LoginForm />}
        {boot === 'nostaff' && (
          <>
            <h2>No staff profile</h2>
            <p className="muted">
              You are signed in as <b>{me?.email}</b>, but no active staff member uses this email. Ask the Super Admin to add you on the
              Employees page (or update the email on your staff record), then sign in again.
            </p>
            <button className="btn block" onClick={signOut}>Sign out</button>
          </>
        )}
        {boot === 'error' && (
          <>
            <h2>Could not load data</h2>
            <p className="muted">{bootError}</p>
            <p className="muted small">Check that schema.sql and seed.sql have been run in Supabase, and that the URL and anon key are correct.</p>
            <button className="btn block" onClick={() => window.location.reload()}>Try again</button>
          </>
        )}
      </div>
      <p className="auth-foot">{BRAND.legal} · Loan Management System</p>
    </div>
  );
}

/** Grey placeholder of the app layout shown while data loads. */
export function AppSkeleton({ label = 'Loading…' }) {
  const bar = (w, h = 12, extra = '') => <span className={`sk ${extra}`} style={{ width: w, height: h }} />;
  return (
    <div className="shell sk-shell" aria-busy="true" aria-label={label}>
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-tile"><Logo /></div>
          <div className="brand-line">{bar('60%', 10, 'dark')}</div>
        </div>
        <nav>
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} className="sk-nav">{bar(18, 18, 'dark')}{bar(`${45 + ((i * 17) % 40)}%`, 11, 'dark')}</div>
          ))}
        </nav>
      </aside>
      <main>
        <header className="topbar">
          <div className="title">{bar(140, 10)}<div style={{ height: 6 }} />{bar(220, 18)}</div>
          <div className="top-tools">{bar(250, 40, 'r10')}{bar(40, 40, 'r10')}{bar(40, 40, 'r10')}{bar(150, 40, 'r10')}{bar(40, 40, 'round')}</div>
        </header>
        <div className="page">
          <div className="sk-hero">{bar(110, 18, 'r99 dark')}{bar('42%', 22, 'dark')}{bar('64%', 12, 'dark')}</div>
          <div className="kpis">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="kpi">
                <div className="kpi-top">{bar('55%', 11)}{bar(42, 42, 'r10')}</div>
                {bar('70%', 24)}
                {bar('50%', 10)}
              </div>
            ))}
          </div>
          <div className="grid-2">
            {[0, 1].map((k) => (
              <div key={k} className="card sk-chart">
                {bar('35%', 14)}
                {bar('55%', 10)}
                <div className="sk-bars">
                  {[60, 90, 40, 75, 55, 30].map((h, i) => <span key={i} className="sk" style={{ height: `${h}%` }} />)}
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            {bar('25%', 14)}
            <div style={{ height: 14 }} />
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="sk-row">{bar('14%')}{bar('22%')}{bar('18%')}{bar('12%')}{bar('10%', 18, 'r99')}</div>
            ))}
          </div>
          <p className="sk-label muted small">{label}</p>
        </div>
      </main>
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError(err.message === 'Invalid login credentials' ? 'Wrong email or password.' : err.message);
    setBusy(false);
  };

  return (
    <form className="form" onSubmit={submit}>
      <h2>Staff sign-in</h2>
      <p className="muted small">Use the email and password your administrator set up for you.</p>
      <label className="field"><span>Work email</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
      <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error && <p className="red-text small">{error}</p>}
      <button className="btn block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
