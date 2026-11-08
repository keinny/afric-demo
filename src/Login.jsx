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

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo"><Logo withTagline /></div>
        {boot === 'checking' && <p className="muted center">Connecting…</p>}
        {boot === 'loading' && <p className="muted center">Loading records from the database…</p>}
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
