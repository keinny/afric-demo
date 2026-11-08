import { useState } from 'react';
import { BRAND, CHECKLIST, PRODUCTS, ROLES, can } from '../config';
import { addDays, estimateInstallment, fmtDate, money, product } from '../finance';
import { useStore } from '../store';
import { Badge, Card, Empty, Field, Modal, Stat, downloadCsv } from '../ui';
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

