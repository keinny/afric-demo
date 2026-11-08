import { useEffect } from 'react';

export function Modal({ title, sub, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {sub && <p>{sub}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const TONE = {
  Submitted: 'blue',
  'In Review': 'amber',
  Approved: 'teal',
  Disbursed: 'green',
  Rejected: 'red',
  Active: 'green',
  Overdue: 'red',
  Settled: 'gray',
  Paid: 'green',
  Due: 'gray',
  Partial: 'amber',
  Open: 'blue',
  'In Progress': 'amber',
  Resolved: 'gray',
};

export const Badge = ({ children }) => <span className={`badge ${TONE[children] || 'gray'}`}>{children}</span>;

export const Card = ({ title, sub, action, children, className = '' }) => (
  <section className={`card ${className}`}>
    {(title || action) && (
      <div className="card-head">
        <div>
          {title && <h2>{title}</h2>}
          {sub && <p className="muted">{sub}</p>}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);

export const Stat = ({ label, value, sub, tone }) => (
  <div className={`stat ${tone || ''}`}>
    <span className="stat-label">{label}</span>
    <strong className="stat-value">{value}</strong>
    {sub && <span className="muted small">{sub}</span>}
  </div>
);

export const Field = ({ label, children }) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);

export const Empty = ({ children }) => <p className="empty">{children}</p>;

const ICONS = {
  users: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.6 3.5 2.8 3.5 6',
  userPlus: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M19 8v6M16 11h6',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 14l2 2 4-4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6',
  bank: 'M3 10l9-6 9 6M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3 20h18',
  coins: 'M9 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM14.5 9.6A5 5 0 1 1 9.6 14.5',
  wallet: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 12.5h2M3 9h18',
  card: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M7 15h4',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4',
  alert: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5v5.5M12 16.5v.5',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21a2 2 0 0 1 2-2h13v2H6M8 7h7',
};

export const Icon = ({ name, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={ICONS[name]} />
  </svg>
);

/** KPI card: label, big value, sub-text, tinted icon box, optional trend footer. */
export const Kpi = ({ label, value, sub, icon, tone = 'slate', trend, onClick }) => (
  <div className={`kpi ${onClick ? 'link-card' : ''}`} onClick={onClick}>
    <div className="kpi-top">
      <span className="kpi-label">{label}</span>
      <span className={`kpi-icon ${tone}`}><Icon name={icon} /></span>
    </div>
    <strong className="kpi-value">{value}</strong>
    {sub && <span className="kpi-sub">{sub}</span>}
    {trend && (
      <div className={`kpi-trend ${trend.up ? 'up' : 'down'}`}>
        <Icon name="trend" size={14} /> <b>{trend.up ? '+' : ''}{trend.pct}%</b> <span>vs last month</span>
      </div>
    )}
  </div>
);

export function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
