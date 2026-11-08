import { useEffect } from 'react';

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
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
