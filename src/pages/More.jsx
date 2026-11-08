import { useState } from 'react';
import { BRAND, CHECKLIST, PRODUCTS, ROLES, can } from '../config';
import { addDays, estimateInstallment, fmtDate, money, product } from '../finance';
import { useStore } from '../store';
import { Badge, Card, Empty, Field, Modal, Stat } from '../ui';
import { LoanDetail } from './Loans';

/* ---------- Loan Products ---------- */
export function Products() {
  const { state, loanInfo } = useStore();
  return (
    <div className="page">
      <Card title="Loan products" sub="Rates and limits are set in src/config.js">
        <div className="product-grid">
          {PRODUCTS.map((p) => {
            const loans = state.loans.filter((l) => l.productId === p.id);
            const open = loans.filter((l) => loanInfo[l.id].status !== 'Settled');
            const outstanding = open.reduce((s, l) => s + loanInfo[l.id].principalOutstanding, 0);
            return (
              <div key={p.id} className="product">
                <div className="product-head">
                  <h3>{p.name}</h3>
                  <span className="pill">{p.ratePct}% / month</span>
                </div>
                <dl>
                  <dt>Interest method</dt><dd>{p.method === 'flat' ? 'Flat rate' : 'Reducing balance'}</dd>
                  <dt>Amount</dt><dd>{money(p.min)} – {money(p.max)}</dd>
                  <dt>Term</dt><dd>1 – {p.maxMonths} months</dd>
                  <dt>Example</dt><dd>{money(p.min * 2)} over {Math.min(6, p.maxMonths)} mo = {money(estimateInstallment(p.id, p.min * 2, Math.min(6, p.maxMonths)))} / mo</dd>
                  <dt>Loans issued</dt><dd>{loans.length} ({open.length} open)</dd>
                  <dt>Outstanding</dt><dd>{money(outstanding)}</dd>
                </dl>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ---------- Verification ---------- */
export function Verification({ go }) {
  const { state, customerName } = useStore();
  const queue = state.applications.filter((a) => a.status === 'Submitted' || a.status === 'In Review');
  return (
    <div className="page">
      <Card title="Verification queue" sub={`${queue.length} applications waiting for checks · ${CHECKLIST.length}-point checklist`}>
        {queue.length ? (
          <div className="table-wrap">
            <table className="clickable">
              <thead>
                <tr><th>Application</th><th>Customer</th><th>Product</th><th className="num">Amount</th><th>Progress</th><th>Status</th></tr>
              </thead>
              <tbody>
                {queue.map((a) => {
                  const done = a.checklist.filter(Boolean).length;
                  return (
                    <tr key={a.id} onClick={() => go(`applications/${a.id}`)}>
                      <td className="mono">{a.id}</td>
                      <td>{customerName(a.customerId)}</td>
                      <td>{product(a.productId).name}</td>
                      <td className="num">{money(a.amount)}</td>
                      <td>
                        <div className="progress"><span style={{ width: `${(done / CHECKLIST.length) * 100}%` }} /></div>
                        <span className="muted small">{done}/{CHECKLIST.length} checks</span>
                      </td>
                      <td><Badge>{a.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nothing waiting for verification.</Empty>
        )}
      </Card>
    </div>
  );
}

/* ---------- Repayments & EMI ---------- */
export function Emi() {
  const { state, loanInfo, customerName, today } = useStore();
  const [range, setRange] = useState('overdue');
  const [openId, setOpenId] = useState(null);
  const limit = { overdue: today, '7': addDays(today, 7), '30': addDays(today, 30), all: '9999-12-31' }[range];
  const rows = state.loans
    .flatMap((l) => loanInfo[l.id].rows.map((r) => ({ ...r, loan: l })))
    .filter((r) => r.remaining > 0 && (range === 'overdue' ? r.state === 'Overdue' : r.due >= today && r.due <= limit))
    .sort((a, b) => a.due.localeCompare(b.due));
  const total = rows.reduce((s, r) => s + r.remaining, 0);

  return (
    <div className="page">
      <Card title="Repayments & EMI" sub={`${rows.length} instalments · ${money(total)}`}>
        <div className="tabs">
          {[['overdue', 'Overdue'], ['7', 'Due in 7 days'], ['30', 'Due in 30 days'], ['all', 'All upcoming']].map(([k, l]) => (
            <button key={k} className={range === k ? 'active' : ''} onClick={() => setRange(k)}>{l}</button>
          ))}
        </div>
        {rows.length ? (
          <div className="table-wrap">
            <table className="clickable">
              <thead>
                <tr><th>Due date</th><th>Loan</th><th>Customer</th><th>#</th><th className="num">Instalment</th><th className="num">Still due</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.loan.id + r.no} onClick={() => setOpenId(r.loan.id)}>
                    <td>{fmtDate(r.due)}</td>
                    <td className="mono">{r.loan.id}</td>
                    <td>{customerName(r.loan.customerId)}</td>
                    <td>{r.no}/{r.loan.months}</td>
                    <td className="num">{money(r.total)}</td>
                    <td className="num">{money(r.remaining)}</td>
                    <td><Badge>{r.state}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No instalments in this range.</Empty>
        )}
      </Card>
      {openId && <LoanDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/* ---------- Notifications ---------- */
export function Notifications({ go }) {
  const { state, loanInfo, customerName, today } = useStore();
  const items = [];
  state.loans.forEach((l) => {
    const i = loanInfo[l.id];
    if (i.status === 'Overdue')
      items.push({ tone: 'red', title: `${l.id} is ${i.daysLate} days overdue`, text: `${customerName(l.customerId)} owes ${money(i.overdueAmt)} in arrears.`, page: 'loans' });
    else if (i.nextDue && i.nextDue.due <= addDays(today, 7))
      items.push({ tone: 'amber', title: `Instalment due ${fmtDate(i.nextDue.due)}`, text: `${customerName(l.customerId)} – ${money(i.nextDue.remaining)} on ${l.id}.`, page: 'emi' });
  });
  state.applications.forEach((a) => {
    if (a.status === 'Submitted') items.push({ tone: 'blue', title: `New application ${a.id}`, text: `${customerName(a.customerId)} applied for ${money(a.amount)}. Needs verification.`, page: 'verification' });
    if (a.status === 'Approved') items.push({ tone: 'teal', title: `${a.id} ready to disburse`, text: `${money(a.amount)} approved for ${customerName(a.customerId)}.`, page: 'applications' });
  });
  state.tickets.filter((t) => t.status !== 'Resolved').forEach((t) =>
    items.push({ tone: 'gray', title: `Support ticket ${t.id}`, text: `${customerName(t.customerId)}: ${t.subject}`, page: 'support' })
  );

  return (
    <div className="page">
      <Card title="Notifications" sub={`${items.length} items need attention`}>
        {items.length ? (
          <ul className="notes">
            {items.map((n, k) => (
              <li key={k} className={n.tone} onClick={() => go(n.page)}>
                <strong>{n.title}</strong>
                <span className="muted">{n.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>All caught up.</Empty>
        )}
      </Card>
    </div>
  );
}

/* ---------- Customer Support ---------- */
export function Support() {
  const { state, dispatch, customerName } = useStore();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ customerId: state.customers[0]?.id, subject: '', category: 'Enquiry' });
  const next = { Open: 'In Progress', 'In Progress': 'Resolved' };

  return (
    <div className="page">
      <Card title="Customer support" sub={`${state.tickets.filter((t) => t.status !== 'Resolved').length} open tickets`} action={<button className="btn" onClick={() => setAdding(true)}>+ New ticket</button>}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Ticket</th><th>Opened</th><th>Customer</th><th>Category</th><th>Subject</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {state.tickets.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.id}</td>
                  <td>{fmtDate(t.createdAt)}</td>
                  <td>{customerName(t.customerId)}</td>
                  <td>{t.category}</td>
                  <td>{t.subject}</td>
                  <td><Badge>{t.status}</Badge></td>
                  <td>
                    {next[t.status] && (
                      <button className="btn ghost small" onClick={() => dispatch({ type: 'ticketStatus', id: t.id, status: next[t.status] })}>
                        {t.status === 'Open' ? 'Start' : 'Resolve'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {adding && (
        <Modal title="New support ticket" onClose={() => setAdding(false)}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!f.subject.trim()) return;
              dispatch({ type: 'addTicket', ticket: f });
              setF({ ...f, subject: '' });
              setAdding(false);
            }}
          >
            <Field label="Customer">
              <select value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
                {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {['Enquiry', 'Payment', 'Repayment', 'Statement', 'Complaint'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Subject"><input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} autoFocus /></Field>
            <div className="actions">
              <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn" disabled={!f.subject.trim()}>Open ticket</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ---------- Analytics & Reports ---------- */
function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Analytics() {
  const { state, loanInfo, customerName } = useStore();
  const infos = state.loans.map((l) => ({ l, i: loanInfo[l.id] }));
  const open = infos.filter(({ i }) => i.status !== 'Settled');
  const outstanding = open.reduce((s, { i }) => s + i.principalOutstanding, 0);
  const atRisk = open.filter(({ i }) => i.status === 'Overdue').reduce((s, { i }) => s + i.principalOutstanding, 0);
  const interestEarned = infos.reduce((s, { i }) => s + i.rows.reduce((t, r) => t + Math.max(0, Math.min(r.applied, r.interest)), 0), 0);
  const decided = state.applications.filter((a) => ['Approved', 'Disbursed', 'Rejected'].includes(a.status));
  const approvalRate = decided.length ? (decided.filter((a) => a.status !== 'Rejected').length / decided.length) * 100 : 0;
  const avgLoan = state.loans.length ? state.loans.reduce((s, l) => s + l.principal, 0) / state.loans.length : 0;

  const reports = [
    ['Loan book', 'All loan accounts with balances', () =>
      downloadCsv('loan-book.csv', [['Loan', 'Customer', 'Product', 'Principal', 'Disbursed', 'Paid', 'Balance', 'Arrears', 'Status'],
        ...infos.map(({ l, i }) => [l.id, customerName(l.customerId), product(l.productId).name, l.principal, l.disbursedOn, i.paid, i.balance, i.overdueAmt, i.status])])],
    ['Payments', 'Every payment received', () =>
      downloadCsv('payments.csv', [['Receipt', 'Date', 'Loan', 'Customer', 'Method', 'Amount', 'Captured by'],
        ...state.payments.map((p) => { const l = state.loans.find((x) => x.id === p.loanId); return [p.id, p.date, l.id, customerName(l.customerId), p.method, p.amount, p.by]; })])],
    ['Arrears', 'Overdue accounts for follow-up', () =>
      downloadCsv('arrears.csv', [['Loan', 'Customer', 'Arrears', 'Days late', 'Balance'],
        ...infos.filter(({ i }) => i.status === 'Overdue').map(({ l, i }) => [l.id, customerName(l.customerId), i.overdueAmt, i.daysLate, i.balance])])],
    ['Applications', 'Full application pipeline', () =>
      downloadCsv('applications.csv', [['Application', 'Date', 'Customer', 'Product', 'Amount', 'Months', 'Status'],
        ...state.applications.map((a) => [a.id, a.createdAt, customerName(a.customerId), product(a.productId).name, a.amount, a.months, a.status])])],
  ];

  return (
    <div className="page">
      <div className="stats">
        <Stat label="Portfolio at risk" value={`${outstanding ? ((atRisk / outstanding) * 100).toFixed(1) : '0.0'}%`} sub={`${money(atRisk)} in overdue loans`} tone="red" />
        <Stat label="Interest earned" value={money(interestEarned)} sub="From payments received" tone="green" />
        <Stat label="Approval rate" value={`${approvalRate.toFixed(0)}%`} sub={`${decided.length} decisions`} />
        <Stat label="Average loan" value={money(avgLoan)} sub={`${state.loans.length} loans issued`} />
      </div>
      <Card title="Reports" sub="Download as CSV (opens in Excel)">
        <ul className="feed">
          {reports.map(([title, sub, fn]) => (
            <li key={title}>
              <div><strong>{title}</strong><span className="muted small">{sub}</span></div>
              <button className="btn ghost small" onClick={fn}>Download CSV</button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ---------- Employees ---------- */
export function Employees() {
  const { state, dispatch } = useStore();
  const PERMS = { customer: 'Register customers', apply: 'Capture applications', verify: 'Verify documents', decide: 'Approve / reject', disburse: 'Disburse loans', payment: 'Record payments' };
  return (
    <div className="page">
      <Card title="Employees" sub="Staff accounts and what each role can do">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Role</th><th>Permissions</th><th className="num">Actions logged</th><th /></tr>
            </thead>
            <tbody>
              {Object.entries(ROLES).map(([k, r]) => (
                <tr key={k}>
                  <td><strong>{r.user}</strong></td>
                  <td>{r.label}</td>
                  <td className="muted small">{r.can.includes('*') ? 'Everything' : r.can.map((p) => PERMS[p]).join(', ')}</td>
                  <td className="num">{state.audit.filter((a) => a.user === r.user).length}</td>
                  <td>
                    {state.role === k ? <span className="pill">Current</span> : (
                      <button className="btn ghost small" onClick={() => dispatch({ type: 'role', role: k })}>Act as</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Settings ---------- */
export function Settings() {
  const { state, dispatch } = useStore();
  return (
    <div className="page">
      <div className="grid-2">
        <Card title="Company" sub="Edit src/config.js to change these">
          <dl className="kv">
            <dt>Name</dt><dd>{BRAND.name}</dd>
            <dt>Tagline</dt><dd>{BRAND.tagline}</dd>
            <dt>Number prefix</dt><dd>{BRAND.prefix}</dd>
            <dt>Currency</dt><dd>{BRAND.currency} (Zambian Kwacha)</dd>
          </dl>
        </Card>
        <Card title="Demo data" sub="Stored only in this browser">
          <p className="muted">
            {state.customers.length} customers · {state.applications.length} applications · {state.loans.length} loans · {state.payments.length} payments · {state.audit.length} log entries
          </p>
          <div className="actions">
            <button
              className="btn danger"
              disabled={!can(state.role, '*')}
              onClick={() => confirm('Reset all demo data back to the starting sample?') && dispatch({ type: 'reset' })}
            >
              Reset demo data
            </button>
            {!can(state.role, '*') && <span className="muted small">Administrator only</span>}
          </div>
        </Card>
      </div>
    </div>
  );
}
