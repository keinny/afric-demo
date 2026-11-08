import { useEffect, useState } from 'react';
import { BRAND, ROLES } from './config';
import { useStore } from './store';
import Applications from './pages/Applications';
import Audit from './pages/Audit';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import Loans from './pages/Loans';
import Repayments from './pages/Repayments';
import { Analytics, Emi, Employees, Notifications, Products, Settings, Support, Verification } from './pages/More';

const PAGES = [
  { id: 'dashboard', label: 'Overview', icon: '▦', el: Dashboard },
  { id: 'customers', label: 'Customers', icon: '◉', el: Customers },
  { id: 'products', label: 'Loan Products', icon: '◈', el: Products },
  { id: 'applications', label: 'Applications', icon: '✎', el: Applications },
  { id: 'verification', label: 'Verification', icon: '✓', el: Verification },
  { id: 'loans', label: 'Loan Accounts', icon: '▤', el: Loans },
  { id: 'emi', label: 'Repayments & EMI', icon: '◷', el: Emi },
  { id: 'repayments', label: 'Payments', icon: '⇄', el: Repayments },
  { id: 'notifications', label: 'Notifications', icon: '◔', el: Notifications },
  { id: 'support', label: 'Customer Support', icon: '☏', el: Support },
  { id: 'analytics', label: 'Analytics & Reports', icon: '▥', el: Analytics },
  { id: 'employees', label: 'Employees', icon: '☺', el: Employees },
  { id: 'audit', label: 'Audit Logs', icon: '☰', el: Audit },
  { id: 'settings', label: 'Settings', icon: '⚙', el: Settings },
];

const fromHash = () => {
  const h = window.location.hash.replace('#/', '');
  return PAGES.some((p) => p.id === h) ? h : 'dashboard';
};

export default function App() {
  const { state, dispatch, loanInfo } = useStore();
  const [page, setPage] = useState(fromHash);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const on = () => setPage(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (id) => {
    window.location.hash = `/${id}`;
    setMenu(false);
    window.scrollTo(0, 0);
  };

  const current = PAGES.find((p) => p.id === page);
  const Page = current.el;
  const counts = {
    applications: state.applications.filter((a) => a.status === 'Submitted' || a.status === 'Approved').length,
    verification: state.applications.filter((a) => a.status === 'Submitted' || a.status === 'In Review').length,
    loans: state.loans.filter((l) => loanInfo[l.id].status === 'Overdue').length,
    support: state.tickets.filter((t) => t.status !== 'Resolved').length,
  };

  return (
    <div className="shell">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="brand">
          <div className="logo">{BRAND.name[0]}</div>
          <div>
            <strong>{BRAND.name}</strong>
            <span>Demo system</span>
          </div>
        </div>
        <nav>
          {PAGES.map((p) => (
            <button key={p.id} className={p.id === page ? 'active' : ''} onClick={() => go(p.id)}>
              <span className="ico">{p.icon}</span>
              {p.label}
              {counts[p.id] > 0 && <span className={`count ${p.id === 'loans' ? 'red' : ''}`}>{counts[p.id]}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button
            className="btn ghost small"
            onClick={() => {
              if (confirm('Reset all demo data back to the starting sample?')) dispatch({ type: 'reset' });
            }}
          >
            Reset demo data
          </button>
          <p>Data is stored only in this browser.</p>
        </div>
      </aside>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}

      <main>
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Menu">☰</button>
          <div className="title">
            <h1>{current.label}</h1>
            <p className="muted">{BRAND.tagline}</p>
          </div>
          <label className="role">
            <span className="muted small">Acting as</span>
            <select value={state.role} onChange={(e) => dispatch({ type: 'role', role: e.target.value })}>
              {Object.entries(ROLES).map(([k, r]) => (
                <option key={k} value={k}>{r.label} – {r.user}</option>
              ))}
            </select>
          </label>
        </header>
        <Page go={go} />
      </main>
    </div>
  );
}
