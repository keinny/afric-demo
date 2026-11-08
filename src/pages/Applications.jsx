import { useState } from 'react';
import { APP_STATUSES, CHECKLIST, PAY_METHODS, PRODUCTS, can } from '../config';
import { estimateInstallment, fmtDate, money, product } from '../finance';
import { useStore } from '../store';
import { Badge, Card, Empty, Field, Modal } from '../ui';

export default function Applications() {
  const { state, customerName } = useStore();
  const [filter, setFilter] = useState('All');
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);

  const list = state.applications
    .filter((a) => filter === 'All' || a.status === filter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const count = (s) => state.applications.filter((a) => a.status === s).length;

  return (
    <div className="page">
      <Card
        title="Loan applications"
        sub="Submitted → In Review → Approved → Disbursed"
        action={can(state.role, 'apply') && <button className="btn" onClick={() => setCreating(true)}>+ New application</button>}
      >
        <div className="tabs">
          {['All', ...APP_STATUSES].map((s) => (
            <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>
              {s} <span>{s === 'All' ? state.applications.length : count(s)}</span>
            </button>
          ))}
        </div>
        {list.length ? (
          <div className="table-wrap">
            <table className="clickable">
              <thead>
                <tr><th>Application</th><th>Date</th><th>Customer</th><th>Product</th><th className="num">Amount</th><th className="num">Term</th><th>Checks</th><th>Status</th></tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id} onClick={() => setOpenId(a.id)}>
                    <td className="mono">{a.id}</td>
                    <td>{fmtDate(a.createdAt)}</td>
                    <td>{customerName(a.customerId)}</td>
                    <td>{product(a.productId).name}</td>
                    <td className="num">{money(a.amount)}</td>
                    <td className="num">{a.months} mo</td>
                    <td>{a.checklist.filter(Boolean).length}/6</td>
                    <td><Badge>{a.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No applications with this status.</Empty>
        )}
      </Card>
      {openId && <AppDetail id={openId} onClose={() => setOpenId(null)} />}
      {creating && <NewApplication onClose={() => setCreating(false)} />}
    </div>
  );
}

function AppDetail({ id, onClose }) {
  const { state, dispatch, customerName } = useStore();
  const app = state.applications.find((a) => a.id === id);
  const p = product(app.productId);
  const [method, setMethod] = useState(PAY_METHODS[0]);
  const [note, setNote] = useState('');
  const role = state.role;
  const canCheck = can(role, 'verify') && ['Submitted', 'In Review'].includes(app.status);
  const allChecked = app.checklist.every(Boolean);
  const inst = estimateInstallment(app.productId, app.amount, app.months);

  return (
    <Modal title={`${app.id} · ${customerName(app.customerId)}`} onClose={onClose} wide>
      <div className="detail-grid">
        <div><span className="muted small">Status</span><Badge>{app.status}</Badge></div>
        <div><span className="muted small">Product</span><strong>{p.name}</strong></div>
        <div><span className="muted small">Amount</span><strong>{money(app.amount)}</strong></div>
        <div><span className="muted small">Term</span><strong>{app.months} months</strong></div>
        <div><span className="muted small">Rate</span><strong>{p.ratePct}% / month ({p.method === 'flat' ? 'flat' : 'reducing balance'})</strong></div>
        <div><span className="muted small">First instalment</span><strong>{money(inst)}</strong></div>
        <div><span className="muted small">Purpose</span><strong>{app.purpose || '—'}</strong></div>
        <div><span className="muted small">Captured</span><strong>{fmtDate(app.createdAt)}</strong></div>
      </div>

      <h4>Verification checklist</h4>
      <ul className="checklist">
        {CHECKLIST.map((c, i) => (
          <li key={c}>
            <label>
              <input
                type="checkbox"
                checked={app.checklist[i]}
                disabled={!canCheck}
                onChange={(e) => dispatch({ type: 'check', id: app.id, index: i, value: e.target.checked })}
              />
              {c}
            </label>
          </li>
        ))}
      </ul>
      {!canCheck && ['Submitted', 'In Review'].includes(app.status) && <p className="muted small">Switch to Verification Officer to tick checks.</p>}
      {app.note && <p className="note">Note: {app.note}</p>}

      <div className="actions">
        {app.status === 'Submitted' && can(role, 'verify') && (
          <button className="btn" onClick={() => dispatch({ type: 'status', id: app.id, status: 'In Review' })}>Start review</button>
        )}
        {app.status === 'In Review' && can(role, 'decide') && (
          <>
            <input className="grow" placeholder="Decision note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn danger" onClick={() => dispatch({ type: 'status', id: app.id, status: 'Rejected', note })}>Reject</button>
            <button className="btn" disabled={!allChecked} title={allChecked ? '' : 'All checks must be ticked first'} onClick={() => dispatch({ type: 'status', id: app.id, status: 'Approved', note })}>
              Approve
            </button>
          </>
        )}
        {app.status === 'Approved' && can(role, 'disburse') && (
          <>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
            <button className="btn" onClick={() => { dispatch({ type: 'disburse', id: app.id, method }); onClose(); }}>
              Disburse {money(app.amount)}
            </button>
          </>
        )}
        <NextStepHint app={app} role={role} />
      </div>
    </Modal>
  );
}

function NextStepHint({ app, role }) {
  const need = { Submitted: ['verify', 'Verification Officer'], 'In Review': ['decide', 'Credit Manager'], Approved: ['disburse', 'Finance Officer'] }[app.status];
  if (!need || can(role, need[0])) return null;
  return <p className="muted small">Next step is done by the {need[1]}. Switch role in the top bar.</p>;
}

function NewApplication({ onClose }) {
  const { state, dispatch } = useStore();
  const [f, setF] = useState({ customerId: state.customers[0]?.id, productId: PRODUCTS[0].id, amount: 5000, months: 3, purpose: '' });
  const p = product(f.productId);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const amountOk = +f.amount >= p.min && +f.amount <= p.max;
  const monthsOk = +f.months >= 1 && +f.months <= p.maxMonths;

  const submit = (e) => {
    e.preventDefault();
    if (!amountOk || !monthsOk) return;
    dispatch({ type: 'addApplication', app: { ...f, amount: +f.amount, months: +f.months } });
    onClose();
  };

  return (
    <Modal title="New loan application" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Customer">
          <select value={f.customerId} onChange={set('customerId')}>
            {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
          </select>
        </Field>
        <Field label="Product">
          <select value={f.productId} onChange={set('productId')}>
            {PRODUCTS.map((x) => <option key={x.id} value={x.id}>{x.name} – {x.ratePct}%/mo</option>)}
          </select>
        </Field>
        <div className="row">
          <Field label={`Amount (${money(p.min)} – ${money(p.max)})`}>
            <input type="number" value={f.amount} onChange={set('amount')} className={amountOk ? '' : 'invalid'} />
          </Field>
          <Field label={`Term in months (max ${p.maxMonths})`}>
            <input type="number" value={f.months} onChange={set('months')} className={monthsOk ? '' : 'invalid'} />
          </Field>
        </div>
        <Field label="Purpose">
          <input value={f.purpose} onChange={set('purpose')} placeholder="e.g. School fees" />
        </Field>
        <p className="muted">Estimated monthly instalment: <strong>{amountOk && monthsOk ? money(estimateInstallment(f.productId, f.amount, f.months)) : '—'}</strong></p>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!amountOk || !monthsOk}>Submit application</button>
        </div>
      </form>
    </Modal>
  );
}
