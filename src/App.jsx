import { useEffect, useState } from 'react';
import { BRAND, ROLES } from './config';
import { useStore } from './store';
import { Icon, Logo } from './ui';
import TopTools from './TopBar';
import Applications from './pages/Applications';
import Audit from './pages/Audit';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import Loans from './pages/LoanPage';
import Repayments from './pages/Repayments';
import Emi from './pages/Emi';
import Notifications from './pages/Notifications';
import Support from './pages/Support';
import Analytics from './pages/Analytics';
import Staff from './pages/Staff';
import Settings from './pages/Settings';
import { Products, Verification } from './pages/More';

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
  { id: 'employees', label: 'Employees', icon: '☺', el: Staff },
  { id: 'audit', label: 'Audit Logs', icon: '☰', el: Audit },
  { id: 'settings', label: 'Settings', icon: '⚙', el: Settings },
];

const fromHash = () => {
  const [id, sub] = window.location.hash.replace(/^#\/?/, '').split('/');
  return PAGES.some((p) => p.id === id) ? { id, sub } : { id: 'dashboard' };
};

export default function App() {
  const { state, dispatch, loanInfo, online, me } = useStore();
  const [route, setRoute] = useState(fromHash);
  const page = route.id;
  const [menu, setMenu] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [toast, setToast] = useState('');
  const reload = () => {
    setReloads((n) => n + 1);
    setToast('Records refreshed');
    setTimeout(() => setToast(''), 1800);
  };

  useEffect(() => {
    const on = () => setRoute(fromHash());
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
          <div className="logo-tile"><Logo /></div>
          <div className="brand-line">
            <strong>{BRAND.name}</strong>
            <span>LMS · Demo</span>
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
          <button className="wa-tag" onClick={() => go('notifications')} title="WhatsApp is locked off by messaging policy">
            <Icon name="alert" size={14} /> WhatsApp: Restricted
          </button>
          {online ? (
            <p>Connected to the Africo database{me?.name ? ` · ${me.name}` : ''}.</p>
          ) : (
            <>
              <button
                className="btn ghost small"
                onClick={() => {
                  if (confirm('Reset all demo data back to the starting sample?')) dispatch({ type: 'reset' });
                }}
              >
                Reset demo data
              </button>
              <p>Data is stored only in this browser.</p>
            </>
          )}
        </div>
      </aside>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}

      <main>
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Menu">☰</button>
          <div className="title">
            <p className="crumb muted">{BRAND.name} / {current.label}{route.sub ? ` / ${decodeURIComponent(route.sub)}` : ''}</p>
            <h1>
              {page === 'applications'
                ? route.sub ? 'Application Review' : 'Loan Applications Pipeline'
                : page === 'repayments' ? 'Payment Records & Reconciliation'
                : page === 'dashboard' ? 'Executive Overview'
                : page === 'notifications' ? 'Notification & Automation Engine'
                : page === 'support' ? 'Customer Support Helpdesk'
                : page === 'loans' ? 'Loan Accounts & Ledger'
                : page === 'analytics' ? 'Business Intelligence & Reports'
                : page === 'employees' ? 'Staff & Role Management'
                : page === 'audit' ? 'System Audit Trail'
                : page === 'settings' ? 'System Settings'
                : current.label}
            </h1>
          </div>
          <TopTools go={go} onReload={reload} />
        </header>
        {toast && <div className="toast">{toast}</div>}
        <Page key={page + (route.sub || '') + reloads} go={go} sub={route.sub} />
      </main>
    </div>
  );
}
