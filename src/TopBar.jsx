import { useEffect, useRef, useState } from 'react';
import { ROLES, SIGNED_IN } from './config';
import { money } from './finance';
import { useStore } from './store';
import { Icon } from './ui';

/** Search, reload, notifications, demo role switcher and signed-in avatar. */
export default function TopTools({ go, onReload }) {
  const { state, dispatch } = useStore();
  return (
    <div className="top-tools">
      <GlobalSearch go={go} />
      <button className="tool-btn" onClick={onReload} title="Reload data" aria-label="Reload data">
        <Icon name="refresh" size={18} />
      </button>
      <Bell go={go} />
      <span className="tool-sep" />
      <label className="role-pill" title="Switch demo role">
        <Icon name="shield" size={16} />
        <span className="role-text">
          <small>DEMO ROLE</small>
          <b>{ROLES[state.role].label.toUpperCase()}</b>
        </span>
        <span className="chev">▾</span>
        <select value={state.role} onChange={(e) => dispatch({ type: 'role', role: e.target.value })} aria-label="Demo role">
          {Object.entries(ROLES).map(([k, r]) => (
            <option key={k} value={k}>{r.label} – {r.user}</option>
          ))}
        </select>
      </label>
      <div className="avatar" title={`Signed in as ${SIGNED_IN.name}`}>{SIGNED_IN.initials}</div>
    </div>
  );
}

function useClickAway(ref, onAway) {
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && onAway();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onAway]);
}

function GlobalSearch({ go }) {
  const { state, customerName } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const input = useRef(null);
  useClickAway(box, () => setOpen(false));

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const term = q.trim().toLowerCase();
  const results = !term
    ? []
    : [
        ...state.customers.filter((c) => `${c.name} ${c.id} ${c.nrc} ${c.phone}`.toLowerCase().includes(term)).map((c) => ({ kind: 'Customer', title: c.name, sub: `${c.id} · ${c.phone}`, to: 'customers' })),
        ...state.applications.filter((a) => `${a.id} ${customerName(a.customerId)}`.toLowerCase().includes(term)).map((a) => ({ kind: 'Application', title: a.id, sub: `${customerName(a.customerId)} · ${money(a.amount)} · ${a.status}`, to: `applications/${a.id}` })),
        ...state.loans.filter((l) => `${l.id} ${customerName(l.customerId)}`.toLowerCase().includes(term)).map((l) => ({ kind: 'Loan', title: l.id, sub: `${customerName(l.customerId)} · ${money(l.principal)}`, to: 'loans' })),
        ...state.payments.filter((p) => `${p.id} ${p.ref}`.toLowerCase().includes(term)).map((p) => ({ kind: 'Payment', title: p.id, sub: `${money(p.amount)} · ${p.ref || ''}`, to: 'repayments/payments' })),
        ...state.tickets.filter((t) => `${t.id} ${t.subject} ${customerName(t.customerId)}`.toLowerCase().includes(term)).map((t) => ({ kind: 'Ticket', title: t.id, sub: `${customerName(t.customerId)} · ${t.subject}`, to: 'support' })),
      ].slice(0, 8);

  const pick = (r) => {
    go(r.to);
    setQ('');
    setOpen(false);
  };

  return (
    <div className="gsearch" ref={box}>
      <Icon name="search" size={16} />
      <input
        ref={input}
        placeholder="Search records…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) pick(results[0]); if (e.key === 'Escape') setOpen(false); }}
      />
      <kbd>Ctrl K</kbd>
      {open && term && (
        <div className="drop">
          {results.length ? (
            results.map((r, k) => (
              <button key={k} className="drop-item" onClick={() => pick(r)}>
                <span className="drop-kind">{r.kind}</span>
                <span className="drop-text"><b>{r.title}</b><small>{r.sub}</small></span>
              </button>
            ))
          ) : (
            <p className="drop-empty">No records match “{q}”.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Bell({ go }) {
  const { state, loanInfo, customerName } = useStore();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useClickAway(box, () => setOpen(false));

  const items = [
    ...state.loans
      .filter((l) => loanInfo[l.id].status === 'Overdue')
      .map((l) => ({ tone: 'red', title: `${l.id} overdue ${loanInfo[l.id].daysLate} days`, sub: `${customerName(l.customerId)} · ${money(loanInfo[l.id].overdueAmt)}`, to: 'emi/overdue' })),
    ...state.applications
      .filter((a) => a.status === 'Submitted' || a.status === 'In Review')
      .map((a) => ({ tone: 'blue', title: `${a.id} needs ${a.status === 'Submitted' ? 'verification' : 'a decision'}`, sub: `${customerName(a.customerId)} · ${money(a.amount)}`, to: `applications/${a.id}` })),
    ...state.applications
      .filter((a) => a.status === 'Approved')
      .map((a) => ({ tone: 'teal', title: `${a.id} ready to disburse`, sub: customerName(a.customerId), to: `applications/${a.id}` })),
    ...state.tickets
      .filter((t) => t.status !== 'Resolved')
      .map((t) => ({ tone: 'amber', title: `Ticket ${t.id}`, sub: `${customerName(t.customerId)} · ${t.subject}`, to: 'support' })),
  ];

  return (
    <div className="bell" ref={box}>
      <button className="tool-btn" onClick={() => setOpen(!open)} aria-label={`${items.length} notifications`}>
        <Icon name="bell" size={18} />
        {items.length > 0 && <span className="dot" />}
      </button>
      {open && (
        <div className="drop right">
          <div className="drop-head"><b>Notifications</b><span>{items.length} need attention</span></div>
          {items.slice(0, 7).map((n, k) => (
            <button key={k} className={`drop-item note-${n.tone}`} onClick={() => { go(n.to); setOpen(false); }}>
              <span className="drop-text"><b>{n.title}</b><small>{n.sub}</small></span>
            </button>
          ))}
          <button className="drop-all" onClick={() => { go('notifications/alerts'); setOpen(false); }}>View all notifications →</button>
        </div>
      )}
    </div>
  );
}
