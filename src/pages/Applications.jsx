import { useState } from 'react';
import { APP_STATUSES, CHECKLIST, PAY_METHODS, PRODUCTS, can } from '../config';
import { addMonths, buildSchedule, estimateInstallment, fmtDate, isoToday, money, product } from '../finance';
import { useStore } from '../store';
import { Badge, Card, Empty, Field, Modal } from '../ui';
import { Ledger } from './Loans';

export default function Applications({ go, sub }) {
  if (sub) return <Review id={decodeURIComponent(sub)} go={go} />;
  return <ApplicationList go={go} />;
}

/* ---------------- List ---------------- */
function ApplicationList({ go }) {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const [creating, setCreating] = useState(false);
  const cust = (id) => state.customers.find((c) => c.id === id) || {};

  const list = state.applications
    .filter((a) => status === 'All' || a.status === status)
    .filter((a) => {
      const c = cust(a.customerId);
      return `${a.id} ${c.name} ${c.nrc} ${product(a.productId).name}`.toLowerCase().includes(q.trim().toLowerCase());
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

  return (
    <div className="page">
      <div className="card toolbar">
        <div className="search">
          <span aria-hidden>⌕</span>
          <input placeholder="Search by application #, applicant, NRC, product…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="filter">
          <span className="muted small">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="All">All statuses ({state.applications.length})</option>
            {APP_STATUSES.map((s) => (
              <option key={s} value={s}>{s} ({state.applications.filter((a) => a.status === s).length})</option>
            ))}
          </select>
        </label>
        {can(state.role, 'apply') && <button className="btn" onClick={() => setCreating(true)}>+ New application</button>}
      </div>

      <Card className="flush">
        {list.length ? (
          <div className="table-wrap">
            <table className="apps">
              <thead>
                <tr>
                  <th>Application #</th><th>Applicant</th><th>Product</th><th className="num">Requested principal</th>
                  <th>Tenure</th><th>Status</th><th>Submitted</th><th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => {
                  const c = cust(a.customerId);
                  return (
                    <tr key={a.id}>
                      <td className="mono strong">{a.id}</td>
                      <td><strong>{c.name}</strong><div className="muted small">NRC: {c.nrc}</div></td>
                      <td>{product(a.productId).name}</td>
                      <td className="num amount">{money(a.amount)}</td>
                      <td className="nowrap">{a.months} Mo (Monthly)</td>
                      <td><Badge>{a.status}</Badge></td>
                      <td className="nowrap muted">{fmtDate(a.createdAt)}</td>
                      <td className="right"><button className="btn soft small" onClick={() => go(`applications/${a.id}`)}>Review</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No applications match your search.</Empty>
        )}
      </Card>
      {creating && <NewApplication onClose={() => setCreating(false)} />}
    </div>
  );
}

/* ---------------- Review page ---------------- */
function Review({ id, go }) {
  const { state, dispatch, customerName } = useStore();
  const app = state.applications.find((a) => a.id === id);
  const [method, setMethod] = useState(PAY_METHODS[0]);
  const [decision, setDecision] = useState('');
  const [noteText, setNoteText] = useState('');

  if (!app)
    return (
      <div className="page">
        <Card><Empty>Application {id} was not found. <button className="link" onClick={() => go('applications')}>Back to applications</button></Empty></Card>
      </div>
    );

  const c = state.customers.find((x) => x.id === app.customerId) || {};
  const p = product(app.productId);
  const loan = state.loans.find((l) => l.appId === app.id);
  const role = state.role;
  const canCheck = can(role, 'verify') && ['Submitted', 'In Review'].includes(app.status);
  const passed = app.checklist.filter(Boolean).length;
  const allPassed = passed === CHECKLIST.length;
  const preview = buildSchedule({ principal: app.amount, ratePct: p.ratePct, months: app.months, method: p.method, firstDue: addMonths(isoToday(), 1) });
  const totalRepay = preview.reduce((s, r) => s + r.total, 0);
  const notes = (app.notes || []).slice().reverse();

  return (
    <div className="page">
      <section className="card review-head">
        <div className="review-title">
          <button className="icon-btn back" onClick={() => go('applications')} aria-label="Back to applications">←</button>
          <div>
            <h2>{app.id} <Badge>{app.status}</Badge></h2>
            <p className="muted small">Submitted {fmtDate(app.createdAt)} · Assigned to {app.assignedTo || '—'}</p>
          </div>
        </div>
        <div className="summary">
          <div><span>Applicant</span><strong>{c.name}</strong></div>
          <div><span>Product</span><strong>{p.name}</strong></div>
          <div><span>Requested amount</span><strong className="amount">{money(app.amount)}</strong></div>
          <div><span>Tenure</span><strong>{app.months} Months (Monthly)</strong></div>
        </div>
      </section>

      <div className="review-grid">
        <div className="col">
          <Card title="Application details & purpose">
            <dl className="details">
              <div><dt>NRC number</dt><dd>{c.nrc}</dd></div>
              <div><dt>Phone</dt><dd>{c.phone}</dd></div>
              <div><dt>Declared monthly income</dt><dd>{app.income ? money(app.income) : '—'}</dd></div>
              <div><dt>Interest method</dt><dd>{p.method === 'flat' ? 'Flat rate' : 'Reducing balance'} · {p.ratePct}% / month</dd></div>
              <div><dt>Employer / business</dt><dd>{c.employer} ({c.type})</dd></div>
              <div><dt>Town</dt><dd>{c.town}</dd></div>
              <div className="wide"><dt>Purpose</dt><dd>{app.purpose || '—'}</dd></div>
            </dl>
          </Card>

          <Card title="Risk & KYC checklist" sub={<>Overall status: <strong className={allPassed ? 'green-text' : ''}>{allPassed ? 'PASSED' : `IN PROGRESS (${passed}/${CHECKLIST.length})`}</strong></>}>
            <ul className="checks">
              {CHECKLIST.map((item, i) => {
                const ok = app.checklist[i];
                return (
                  <li key={item.label}>
                    <button
                      className={`check-btn ${ok ? 'ok' : ''}`}
                      disabled={!canCheck}
                      onClick={() => dispatch({ type: 'check', id: app.id, index: i, value: !ok })}
                      aria-label={`${ok ? 'Untick' : 'Tick'} ${item.label}`}
                    >
                      {ok ? '✓' : ''}
                    </button>
                    <div className="grow-1">
                      <strong>{item.label}</strong>
                      <span className="muted small">{item.hint}</span>
                    </div>
                    <span className={`tag ${ok ? 'pass' : 'pending'}`}>{ok ? 'PASSED' : 'PENDING'}</span>
                  </li>
                );
              })}
            </ul>
            {!canCheck && ['Submitted', 'In Review'].includes(app.status) && (
              <p className="muted small">Switch to Verification Officer (top bar) to tick checks.</p>
            )}
          </Card>

          {loan ? (
            <Card title="Loan ledger" sub={`${loan.id} · disbursed ${fmtDate(loan.disbursedOn)}`} action={<button className="link" onClick={() => go('loans')}>Loan accounts</button>}>
              <Ledger loan={loan} />
            </Card>
          ) : (
            <Card title="Repayment estimate" sub="What the customer will pay if disbursed today">
              <div className="mini-stats">
                <div><span>Monthly instalment</span><strong>{money(preview[0]?.total)}</strong></div>
                <div><span>Total interest</span><strong>{money(totalRepay - app.amount)}</strong></div>
                <div><span>Total repayable</span><strong>{money(totalRepay)}</strong></div>
                <div><span>Instalment vs income</span><strong>{app.income ? `${((preview[0]?.total / app.income) * 100).toFixed(0)}%` : '—'}</strong></div>
              </div>
            </Card>
          )}
        </div>

        <div className="col">
          <Card title="Decision">
            <Workflow app={app} role={role} method={method} setMethod={setMethod} decision={decision} setDecision={setDecision} allPassed={allPassed} dispatch={dispatch} />
          </Card>

          <Card title="Internal review notes">
            <textarea placeholder="Add committee notes or officer remarks…" value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} />
            <button
              className="btn dark block"
              disabled={!noteText.trim()}
              onClick={() => {
                dispatch({ type: 'addNote', id: app.id, text: noteText.trim() });
                setNoteText('');
              }}
            >
              Add note
            </button>
            {notes.length ? (
              <ul className="note-list">
                {notes.map((n, k) => (
                  <li key={k}>
                    <div className="note-meta">
                      <strong>{n.by}</strong>
                      <span>{new Date(n.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p>{n.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">No notes yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Workflow({ app, role, method, setMethod, decision, setDecision, allPassed, dispatch }) {
  const need = { Submitted: ['verify', 'Verification Officer'], 'In Review': ['decide', 'Credit Manager'], Approved: ['disburse', 'Finance Officer'] }[app.status];
  const steps = ['Submitted', 'In Review', 'Approved', 'Disbursed'];
  const at = steps.indexOf(app.status);

  return (
    <div className="workflow">
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s} className={app.status === 'Rejected' ? '' : i < at ? 'done' : i === at ? 'now' : ''}>{s}</li>
        ))}
      </ol>
      {app.status === 'Rejected' && <p className="red-text small">This application was rejected.</p>}
      {app.status === 'Disbursed' && <p className="green-text small">Loan disbursed. See the ledger for transactions.</p>}

      {app.status === 'Submitted' && can(role, 'verify') && (
        <button className="btn block" onClick={() => dispatch({ type: 'status', id: app.id, status: 'In Review' })}>Start verification</button>
      )}
      {app.status === 'In Review' && can(role, 'decide') && (
        <>
          <textarea rows={2} placeholder="Decision reason (saved to notes)" value={decision} onChange={(e) => setDecision(e.target.value)} />
          <div className="split">
            <button className="btn danger" onClick={() => { dispatch({ type: 'status', id: app.id, status: 'Rejected', note: decision.trim() }); setDecision(''); }}>Reject</button>
            <button className="btn" disabled={!allPassed} title={allPassed ? '' : 'All checks must pass first'} onClick={() => { dispatch({ type: 'status', id: app.id, status: 'Approved', note: decision.trim() }); setDecision(''); }}>
              Approve
            </button>
          </div>
          {!allPassed && <p className="muted small">Approve unlocks when all 6 checks have passed.</p>}
        </>
      )}
      {app.status === 'Approved' && can(role, 'disburse') && (
        <>
          <Field label="Pay out by">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <button className="btn block" onClick={() => dispatch({ type: 'disburse', id: app.id, method })}>Disburse {money(app.amount)}</button>
        </>
      )}
      {need && !can(role, need[0]) && <p className="muted small">Next step is done by the {need[1]}. Switch role in the top bar.</p>}
    </div>
  );
}

/* ---------------- New application ---------------- */
function NewApplication({ onClose }) {
  const { state, dispatch } = useStore();
  const [f, setF] = useState({ customerId: state.customers[0]?.id, productId: PRODUCTS[0].id, amount: 5000, months: 3, income: 10000, purpose: '' });
  const p = product(f.productId);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const amountOk = +f.amount >= p.min && +f.amount <= p.max;
  const monthsOk = +f.months >= 1 && +f.months <= p.maxMonths;

  const submit = (e) => {
    e.preventDefault();
    if (!amountOk || !monthsOk) return;
    dispatch({ type: 'addApplication', app: { ...f, amount: +f.amount, months: +f.months, income: +f.income || 0 } });
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
        <Field label="Declared monthly income">
          <input type="number" value={f.income} onChange={set('income')} />
        </Field>
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
