import { useEffect, useState } from 'react';
import { BRAND, ROLES } from './config';
import { useStore } from './store';
import Applications from './pages/Applications';
import Audit from './pages/Audit';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import Loans from './pages/Loans';
import Repayments from './pages/Repayments';

const PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: '▦', el: Dashboard },
  { id: 'customers', label: 'Customers', icon: '◉', el: Customers },
  { id: 'applications', label: 'Applications', icon: '✎', el: Applications },
  { id: 'loans', label: 'Loans', icon: '▤', el: Loans },
  { id: 'repayments', label: 'Repayments', icon: '⇄', el: Repayments },
  { id: 'audit', label: 'Activity log', icon: '☰', el: Audit },
];

const fromHash = () => {
  const h = window.location.hash.replace('#/', '');
  return PAGES.some((p) => p.id === h) ? h : 'dashboard';
};

export default function App() {
  const { state, dispatch } = useStore();
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
  const pendingCount = state.applications.filter((a) => a.status === 'Submitted' || a.status === 'In Review').length;

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
              {p.id === 'applications' && pendingCount > 0 && <span className="count">{pendingCount}</span>}
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
