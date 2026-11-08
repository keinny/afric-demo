import { useState } from 'react';
import { ROLES } from '../config';
import { fmtDate } from '../finance';
import { useStore } from '../store';
import { Card, Empty, Field, Icon, Modal } from '../ui';

const STATUSES = ['Open', 'In Progress', 'Resolved'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const CATEGORIES = ['Repayment', 'Payment', 'Account Statement', 'Loan Application', 'Enquiry', 'Complaint'];
const STAFF = [...new Set(Object.values(ROLES).map((r) => r.user))];
const statusCls = { Open: 'open', 'In Progress': 'progress', Resolved: 'done' };

export default function Support() {
  const { state, customerName } = useStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const [priority, setPriority] = useState('All');
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(null);

  const rows = state.tickets
    .filter((t) => status === 'All' || t.status === status)
    .filter((t) => priority === 'All' || t.priority === priority)
    .filter((t) => `${t.id} ${customerName(t.customerId)} ${t.subject}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="page">
      <section className="card emi-head">
        <div className="emi-head-top">
          <div>
            <h2>Customer Support & Case Desk</h2>
            <p className="muted">Borrower enquiries, payment queries, account statements and dispute resolution.</p>
          </div>
          <button className="btn dark" onClick={() => setCreating(true)}>+ New Support Ticket</button>
        </div>
        <div className="toolbar-inline">
          <div className="search">
            <span aria-hidden>⌕</span>
            <input placeholder="Search by ticket #, borrower name, subject…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="actions tight">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
              <option value="All">All statuses</option>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority filter">
              <option value="All">All priorities</option>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </section>

      <Card className="flush">
        {rows.length ? (
          <div className="table-wrap">
            <table className="apps">
              <thead>
                <tr><th>Ticket #</th><th>Customer</th><th>Subject</th><th>Category</th><th>Priority</th><th>Assigned to</th><th>Status</th><th>Created</th><th className="right">Action</th></tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td className="mono strong">{t.id}</td>
                    <td><strong>{customerName(t.customerId)}</strong></td>
                    <td className="subject" title={t.subject}>{t.subject}</td>
                    <td className="upper small muted">{t.category}</td>
                    <td><span className={`prio ${t.priority.toLowerCase()}`}>{t.priority.toUpperCase()}</span></td>
                    <td>{t.assignedTo}</td>
                    <td><span className={`tstatus ${statusCls[t.status]}`}>{t.status.toUpperCase().replace(' ', '_')}</span></td>
                    <td className="muted">{fmtDate(t.createdAt)}</td>
                    <td className="right"><button className="btn soft small" onClick={() => setManaging(t.id)}>Manage</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No tickets match these filters.</Empty>
        )}
      </Card>

      {creating && <NewTicket onClose={() => setCreating(false)} />}
      {managing && <ManageTicket id={managing} onClose={() => setManaging(null)} />}
    </div>
  );
}

function NewTicket({ onClose }) {
  const { state, dispatch } = useStore();
  const [f, setF] = useState({ customerId: state.customers[0]?.id, category: 'Enquiry', priority: 'Medium', assignedTo: ROLES.officer.user, subject: '', description: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.subject.trim().length > 3;
  return (
    <Modal title="New Support Ticket" sub="Log a borrower enquiry, complaint or request" onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (!ok) return; dispatch({ type: 'addTicket', ticket: f }); onClose(); }}>
        <Field label="Customer *">
          <select value={f.customerId} onChange={set('customerId')}>
            {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
          </select>
        </Field>
        <div className="row">
          <Field label="Category"><select value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Priority"><select value={f.priority} onChange={set('priority')}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
        </div>
        <Field label="Assign to"><select value={f.assignedTo} onChange={set('assignedTo')}>{STAFF.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Subject *"><input value={f.subject} onChange={set('subject')} autoFocus placeholder="Short summary of the request" /></Field>
        <Field label="Details"><textarea rows={3} value={f.description} onChange={set('description')} placeholder="What did the customer say?" /></Field>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!ok}>Create ticket</button>
        </div>
      </form>
    </Modal>
  );
}

function ManageTicket({ id, onClose }) {
  const { state, dispatch, customerName } = useStore();
  const t = state.tickets.find((x) => x.id === id);
  const cust = state.customers.find((c) => c.id === t.customerId) || {};
  const [status, setStatus] = useState(t.status);
  const [priority, setPriority] = useState(t.priority);
  const [assignedTo, setAssignedTo] = useState(t.assignedTo);
  const [reply, setReply] = useState('');

  const save = () => {
    const changes = {};
    if (status !== t.status) changes.status = status;
    if (priority !== t.priority) changes.priority = priority;
    if (assignedTo !== t.assignedTo) changes.assignedTo = assignedTo;
    if (Object.keys(changes).length || reply.trim()) dispatch({ type: 'ticketUpdate', id, changes, reply: reply.trim() });
    onClose();
  };

  return (
    <Modal title={`${t.id} · ${t.category}`} sub={`${customerName(t.customerId)} · ${cust.phone || ''} · opened ${fmtDate(t.createdAt)}`} onClose={onClose} wide>
      <div className="ticket-subject">
        <strong>{t.subject}</strong>
        {t.description && <p>{t.description}</p>}
      </div>

      <div className="ticket-grid">
        <div className="form">
          <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Priority"><select value={priority} onChange={(e) => setPriority(e.target.value)}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Assigned to"><select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>{STAFF.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <div>
          <h4 className="mt0">Conversation</h4>
          {(t.replies || []).length ? (
            <ul className="note-list">
              {t.replies.map((r, k) => (
                <li key={k}>
                  <div className="note-meta"><strong>{r.by}</strong><span>{new Date(r.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
                  <p>{r.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No replies yet.</p>
          )}
          <textarea rows={3} className="mt8" placeholder="Write an internal note or reply to the customer…" value={reply} onChange={(e) => setReply(e.target.value)} />
        </div>
      </div>

      <div className="modal-foot">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        {t.status !== 'Resolved' && (
          <button className="btn soft" onClick={() => { dispatch({ type: 'ticketUpdate', id, changes: { status: 'Resolved' }, reply: reply.trim() }); onClose(); }}>
            <Icon name="check" size={16} /> Mark resolved
          </button>
        )}
        <button className="btn" onClick={save}>Save changes</button>
      </div>
    </Modal>
  );
}
