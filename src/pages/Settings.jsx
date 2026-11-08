import { useState } from 'react';
import { CHANNEL_POLICY, can } from '../config';
import { useStore } from '../store';
import { Field, Icon } from '../ui';

const CURRENCIES = [
  ['ZMW', 'ZMW — Zambian Kwacha (K)', 'K'],
  ['USD', 'USD — US Dollar ($)', '$'],
  ['ZAR', 'ZAR — South African Rand (R)', 'R'],
  ['MWK', 'MWK — Malawian Kwacha (MK)', 'MK'],
  ['BWP', 'BWP — Botswana Pula (P)', 'P'],
];
const TIMEZONES = ['Africa/Lusaka', 'Africa/Johannesburg', 'Africa/Harare', 'Africa/Nairobi', 'UTC'];

export default function Settings() {
  const { state, dispatch } = useStore();
  const isAdmin = can(state.role, '*');
  const [f, setF] = useState(state.settings || {});
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => {
    setSaved(false);
    const v = e.target.value;
    if (k === 'currencyCode') {
      const c = CURRENCIES.find((x) => x[0] === v);
      setF({ ...f, currencyCode: v, symbol: c ? c[2] : f.symbol });
    } else setF({ ...f, [k]: v });
  };
  const grace = Number(f.graceDays);
  const pct = Number(f.penaltyPct);
  const valid = f.clientName?.trim() && grace >= 0 && grace <= 60 && pct >= 0 && pct <= 50;
  const dirty = JSON.stringify(f) !== JSON.stringify(state.settings);

  const save = () => {
    if (!valid) return;
    dispatch({ type: 'updateSettings', settings: { ...f, graceDays: grace, penaltyPct: pct } });
    setSaved(true);
  };

  return (
    <div className="page settings">
      <section className="card emi-head">
        <div className="emi-head-top">
          <div>
            <h2>System Configuration & Parameters</h2>
            <p className="muted">Company profile, currency formatting, default lending rules and compliance locks.</p>
          </div>
          {isAdmin && (
            <div className="actions tight">
              {saved && !dirty && <span className="muted small">✓ Saved</span>}
              <button className="btn dark" disabled={!dirty || !valid} onClick={save}>Save changes</button>
            </div>
          )}
        </div>
        {!isAdmin && <p className="muted small mt8">Settings are read-only. Switch to Super Admin to change them.</p>}
      </section>

      <fieldset disabled={!isAdmin} className="plain">
        <section className="card">
          <h3 className="set-title"><Icon name="bank" size={18} /> Company & Developer Profile</h3>
          <div className="form">
            <div className="row">
              <Field label="Client institution name"><input className="strong" value={f.clientName || ''} onChange={set('clientName')} /></Field>
              <Field label="Client representative"><input className="strong" value={f.representative || ''} onChange={set('representative')} /></Field>
            </div>
            <Field label="Development company"><input value={f.developer || ''} onChange={set('developer')} /></Field>
          </div>
        </section>

        <section className="card">
          <h3 className="set-title"><Icon name="search" size={18} /> Currency & Regional Standards</h3>
          <div className="form">
            <div className="row four">
              <Field label="Operating currency">
                <select value={f.currencyCode} onChange={set('currencyCode')}>
                  {CURRENCIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              <Field label="Display symbol"><input value={f.symbol || ''} onChange={set('symbol')} maxLength={4} /></Field>
              <Field label="Country jurisdiction"><input value={f.country || ''} onChange={set('country')} /></Field>
              <Field label="Default timezone">
                <select className="mono" value={f.timezone} onChange={set('timezone')}>
                  {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <p className="muted small">Amounts in this demo are shown in Kwacha; the currency settings here are stored for the institution profile.</p>
          </div>
        </section>

        <section className="card">
          <h3 className="set-title"><Icon name="coins" size={18} /> Default Lending Rules & Penalties</h3>
          <div className="form">
            <div className="row">
              <Field label="Default grace period (days)">
                <input type="number" min="0" max="60" value={f.graceDays} onChange={set('graceDays')} className={grace >= 0 && grace <= 60 ? '' : 'invalid'} />
              </Field>
              <Field label="Default late penalty fee (%)">
                <input type="number" min="0" max="50" step="0.5" value={f.penaltyPct} onChange={set('penaltyPct')} className={pct >= 0 && pct <= 50 ? '' : 'invalid'} />
              </Field>
            </div>
            <p className="muted small">
              A late penalty of {isNaN(pct) ? '—' : pct}% of the overdue amount applies once an instalment is more than {isNaN(grace) ? '—' : grace} day{grace === 1 ? '' : 's'} late.
              This is used by collections, the payment form, the settlement calculator and the loan agreement.
            </p>
          </div>
        </section>
      </fieldset>

      <section className="card">
        <h3 className="set-title"><Icon name="shield" size={18} /> Compliance Locks</h3>
        <div className="lock-list">
          {Object.entries(CHANNEL_POLICY).map(([ch, p]) => (
            <div key={ch}>
              <span><b>{ch}</b> customer messaging</span>
              <span className={`status-tag ${p.enabled ? 'ok' : 'bad'}`}>{p.enabled ? 'ALLOWED' : 'LOCKED OFF'}</span>
            </div>
          ))}
        </div>
        <p className="muted small">Channel locks are fixed in the system configuration and cannot be changed from this screen.</p>
      </section>

      <section className="card">
        <h3 className="set-title"><Icon name="refresh" size={18} /> Demo Data</h3>
        <p className="muted">
          {state.customers.length} customers · {state.applications.length} applications · {state.loans.length} loans · {state.payments.length} payments · {state.audit.length} audit entries. Stored only in this browser.
        </p>
        <button className="btn danger" disabled={!isAdmin} onClick={() => confirm('Reset all demo data back to the starting sample?') && dispatch({ type: 'reset' })}>
          Reset demo data
        </button>
      </section>
    </div>
  );
}
