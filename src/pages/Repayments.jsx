import { useState } from 'react';
import { PAY_METHODS, can } from '../config';
import { fmtDate, money, monthKey, monthLabel, product } from '../finance';
import { useStore } from '../store';
import { Card, Empty, Kpi, downloadCsv } from '../ui';
import { Ledger, PaymentForm } from './Loans';

const TABS = [
  ['repayments', 'Repayments Ledger', 'book'],
  ['disbursements', 'Disbursement Ledger', 'coins'],
  ['cashbook', 'Cash Book', 'wallet'],
  ['interest', 'Interest Income', 'trend'],
  ['statements', 'Customer Statements', 'users'],
];

export default function Ledgers({ go, sub }) {
  const tab = TABS.some((t) => t[0] === sub) ? sub : 'repayments';
  const View = { repayments: Repayments, disbursements: Disbursements, cashbook: CashBook, interest: Interest, statements: Statements }[tab];
  return (
    <div className="page">
      <div className="ledger-tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => go(`repayments/${id}`)}>{label}</button>
        ))}
      </div>
      <View />
    </div>
  );
}

const total = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
const signed = (n) => (n < 0 ? `− ${money(-n)}` : money(n));

/* ---------------- Repayments ledger ---------------- */
function Repayments() {
  const { state, customerName, split } = useStore();
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('All');
  const [month, setMonth] = useState('All');
  const [adding, setAdding] = useState(false);

  const months = [...new Set(state.payments.map((p) => monthKey(p.date)))].sort().reverse();
  let run = 0;
  const all = state.payments
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((p) => {
      const loan = state.loans.find((l) => l.id === p.loanId);
      run += p.amount;
      return { ...p, loan, customer: customerName(loan.customerId), ...(split[p.id] || { interest: 0, principal: p.amount }), cumulative: run };
    });
  const rows = all
    .filter((r) => method === 'All' || r.method === method)
    .filter((r) => month === 'All' || monthKey(r.date) === month)
    .filter((r) => `${r.id} ${r.loan.id} ${r.customer}`.toLowerCase().includes(q.trim().toLowerCase()))
    .reverse();

  const exportCsv = () =>
    downloadCsv('repayments-ledger.csv', [
      ['Date', 'Receipt', 'Customer', 'Loan', 'Method', 'Principal', 'Interest', 'Amount', 'Captured by'],
      ...rows.map((r) => [r.date, r.id, r.customer, r.loan.id, r.method, r.principal, r.interest, r.amount, r.by]),
    ]);

  return (
    <>
      <div className="kpis small">
        <Kpi label="Total collected" value={money(total(rows, 'amount'))} sub={`${rows.length} receipts`} icon="card" tone="green" />
        <Kpi label="Principal recovered" value={money(total(rows, 'principal'))} sub="Reduces loan balances" icon="wallet" tone="slate" />
        <Kpi label="Interest received" value={money(total(rows, 'interest'))} sub="Income earned" icon="trend" tone="teal" />
        <Kpi label="Average receipt" value={money(rows.length ? total(rows, 'amount') / rows.length : 0)} sub="Per payment" icon="coins" tone="blue" />
      </div>
      <Card
        title="Repayments ledger"
        sub="Every payment received, split into principal and interest"
        action={
          <div className="actions tight">
            <button className="btn ghost small" onClick={exportCsv}>Export CSV</button>
            {can(state.role, 'payment') && <button className="btn small" onClick={() => setAdding(true)}>+ Record payment</button>}
          </div>
        }
      >
        <div className="filters">
          <input placeholder="Search receipt, loan, customer…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="All">All methods</option>
            {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="All">All months</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        {rows.length ? (
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr><th>Date</th><th>Receipt</th><th>Customer</th><th>Loan</th><th>Method</th><th className="num">Principal</th><th className="num">Interest</th><th className="num">Amount</th><th className="num">Cumulative</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{fmtDate(r.date)}</td>
                    <td className="mono">{r.id}</td>
                    <td>{r.customer}</td>
                    <td className="mono">{r.loan.id}</td>
                    <td><span className={`chan ${r.method.split(' ')[0].toLowerCase()}`}>{r.method}</span></td>
                    <td className="num">{money(r.principal)}</td>
                    <td className="num">{money(r.interest)}</td>
                    <td className="num green-text strong">{money(r.amount)}</td>
                    <td className="num muted">{money(r.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={5}>Totals ({rows.length})</td><td className="num">{money(total(rows, 'principal'))}</td><td className="num">{money(total(rows, 'interest'))}</td><td className="num green-text">{money(total(rows, 'amount'))}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <Empty>No payments match these filters.</Empty>
        )}
      </Card>
      {adding && <PaymentForm onClose={() => setAdding(false)} />}
    </>
  );
}

/* ---------------- Disbursement ledger ---------------- */
function Disbursements() {
  const { state, loanInfo, customerName } = useStore();
  let run = 0;
  const rows = state.loans
    .slice()
    .sort((a, b) => a.disbursedOn.localeCompare(b.disbursedOn))
    .map((l) => ({ l, i: loanInfo[l.id], cumulative: (run += l.principal) }))
    .reverse();

  return (
    <Card
      title="Disbursement ledger"
      sub="All money paid out to borrowers"
      action={
        <button className="btn ghost small" onClick={() => downloadCsv('disbursement-ledger.csv', [['Date', 'Loan', 'Application', 'Customer', 'Product', 'Method', 'Principal', 'Term'], ...rows.map(({ l }) => [l.disbursedOn, l.id, l.appId, customerName(l.customerId), product(l.productId).name, l.disburseMethod, l.principal, l.months])])}>
          Export CSV
        </button>
      }
    >
      <div className="table-wrap">
        <table className="ledger">
          <thead>
            <tr><th>Date</th><th>Loan</th><th>Application</th><th>Customer</th><th>Product</th><th>Paid via</th><th className="num">Term</th><th className="num">Principal</th><th className="num">Cumulative</th></tr>
          </thead>
          <tbody>
            {rows.map(({ l, cumulative }) => (
              <tr key={l.id}>
                <td className="nowrap">{fmtDate(l.disbursedOn)}</td>
                <td className="mono">{l.id}</td>
                <td className="mono muted">{l.appId}</td>
                <td>{customerName(l.customerId)}</td>
                <td>{product(l.productId).name}</td>
                <td><span className={`chan ${l.disburseMethod.split(' ')[0].toLowerCase()}`}>{l.disburseMethod}</span></td>
                <td className="num">{l.months} mo</td>
                <td className="num strong">{money(l.principal)}</td>
                <td className="num muted">{money(cumulative)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={7}>Total disbursed ({rows.length} loans)</td><td className="num">{money(state.loans.reduce((s, l) => s + l.principal, 0))}</td><td /></tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

/* ---------------- Cash book ---------------- */
function CashBook() {
  const { state, customerName } = useStore();
  const entries = [
    ...state.loans.map((l) => ({ date: l.disbursedOn, ref: l.id, text: `Disbursement to ${customerName(l.customerId)}`, channel: l.disburseMethod, out: l.principal, in: 0 })),
    ...state.payments.map((p) => {
      const l = state.loans.find((x) => x.id === p.loanId);
      return { date: p.date, ref: p.id, text: `Repayment from ${customerName(l.customerId)} (${l.id})`, channel: p.method, in: p.amount, out: 0 };
    }),
    ...(state.penalties || []).map((p) => {
      const l = state.loans.find((x) => x.id === p.loanId);
      return { date: p.date, ref: p.id, text: `Late penalty from ${customerName(l.customerId)} (${l.id})`, channel: p.method, in: p.amount, out: 0 };
    }),
  ].sort((a, b) => a.date.localeCompare(b.date) || b.out - a.out);
  let run = 0;
  const rows = entries.map((e) => ({ ...e, net: (run += e.in - e.out) })).reverse();
  const channels = PAY_METHODS.map((m) => {
    const inn = entries.filter((e) => e.channel === m).reduce((s, e) => s + e.in, 0);
    const out = entries.filter((e) => e.channel === m).reduce((s, e) => s + e.out, 0);
    return { m, inn, out, net: inn - out };
  });

  return (
    <>
      <div className="kpis small">
        {channels.map((c) => (
          <Kpi key={c.m} label={c.m} value={signed(c.net)} sub={`In ${money(c.inn)} · Out ${money(c.out)}`} icon={c.m === 'Cash' ? 'coins' : c.m === 'Bank Transfer' ? 'bank' : 'card'} tone={c.net < 0 ? 'red' : 'green'} />
        ))}
        <Kpi label="Net cash position" value={signed(run)} sub="Collections minus disbursements" icon="wallet" tone={run < 0 ? 'amber' : 'green'} />
      </div>
      <Card
        title="Cash book"
        sub="Money in and out across all channels, with running net position"
        action={<button className="btn ghost small" onClick={() => downloadCsv('cash-book.csv', [['Date', 'Reference', 'Description', 'Channel', 'Cash in', 'Cash out', 'Net position'], ...rows.map((r) => [r.date, r.ref, r.text, r.channel, r.in, r.out, r.net])])}>Export CSV</button>}
      >
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr><th>Date</th><th>Reference</th><th>Description</th><th>Channel</th><th className="num">Cash in</th><th className="num">Cash out</th><th className="num">Net position</th></tr>
            </thead>
            <tbody>
              {rows.map((r, k) => (
                <tr key={k} className={r.out ? 'disb' : ''}>
                  <td className="nowrap">{fmtDate(r.date)}</td>
                  <td className="mono">{r.ref}</td>
                  <td>{r.text}</td>
                  <td><span className={`chan ${r.channel.split(' ')[0].toLowerCase()}`}>{r.channel}</span></td>
                  <td className="num green-text">{r.in ? money(r.in) : ''}</td>
                  <td className="num red-text">{r.out ? money(r.out) : ''}</td>
                  <td className={`num strong ${r.net < 0 ? 'red-text' : ''}`}>{signed(r.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={4}>Totals</td><td className="num green-text">{money(total(entries, 'in'))}</td><td className="num red-text">{money(total(entries, 'out'))}</td><td className="num">{signed(run)}</td></tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ---------------- Interest income ---------------- */
function Interest() {
  const { state, customerName, split, today, loanInfo } = useStore();
  const rows = state.payments
    .map((p) => {
      const l = state.loans.find((x) => x.id === p.loanId);
      return { p, l, interest: split[p.id]?.interest || 0 };
    })
    .filter((r) => r.interest > 0)
    .sort((a, b) => b.p.date.localeCompare(a.p.date));
  const received = total(rows, 'interest');
  const charged = state.loans.reduce((s, l) => s + l.schedule.filter((r) => r.due <= today).reduce((t, r) => t + r.interest, 0), 0);
  const future = state.loans.reduce((s, l) => s + (loanInfo[l.id].status === 'Settled' ? 0 : l.schedule.filter((r) => r.due > today).reduce((t, r) => t + r.interest, 0)), 0);

  return (
    <>
      <div className="kpis small">
        <Kpi label="Interest received" value={money(received)} sub="Cash income earned" icon="trend" tone="green" />
        <Kpi label="Interest charged to date" value={money(charged)} sub="On instalments already due" icon="calendar" tone="blue" />
        <Kpi label="Interest in arrears" value={money(Math.max(0, charged - received))} sub="Charged but not yet paid" icon="alert" tone="red" />
        <Kpi label="Future interest" value={money(future)} sub="Still to fall due on open loans" icon="clock" tone="amber" />
      </div>
      <Card
        title="Interest income ledger"
        sub="Interest portion of each payment received"
        action={<button className="btn ghost small" onClick={() => downloadCsv('interest-income.csv', [['Date', 'Receipt', 'Loan', 'Customer', 'Product', 'Interest'], ...rows.map(({ p, l, interest }) => [p.date, p.id, l.id, customerName(l.customerId), product(l.productId).name, interest])])}>Export CSV</button>}
      >
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr><th>Date</th><th>Receipt</th><th>Loan</th><th>Customer</th><th>Product</th><th className="num">Payment</th><th className="num">Interest earned</th></tr>
            </thead>
            <tbody>
              {rows.map(({ p, l, interest }) => (
                <tr key={p.id}>
                  <td className="nowrap">{fmtDate(p.date)}</td>
                  <td className="mono">{p.id}</td>
                  <td className="mono">{l.id}</td>
                  <td>{customerName(l.customerId)}</td>
                  <td>{product(l.productId).name}</td>
                  <td className="num muted">{money(p.amount)}</td>
                  <td className="num green-text strong">{money(interest)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={6}>Total interest received</td><td className="num green-text">{money(received)}</td></tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ---------------- Customer statements ---------------- */
function Statements() {
  const { state, loanInfo } = useStore();
  const withLoans = state.customers.filter((c) => state.loans.some((l) => l.customerId === c.id));
  const [cid, setCid] = useState(withLoans[0]?.id);
  const c = state.customers.find((x) => x.id === cid);
  const loans = state.loans.filter((l) => l.customerId === cid);
  const lent = loans.reduce((s, l) => s + l.principal, 0);
  const paid = loans.reduce((s, l) => s + loanInfo[l.id].paid, 0);
  const balance = loans.reduce((s, l) => s + loanInfo[l.id].balance, 0);
  const arrears = loans.reduce((s, l) => s + loanInfo[l.id].overdueAmt, 0);

  if (!withLoans.length) return <Card><Empty>No customers have loans yet.</Empty></Card>;

  return (
    <>
      <Card title="Customer statement" sub="Full account history for one borrower" action={
        <div className="actions tight">
          <select value={cid} onChange={(e) => setCid(e.target.value)}>
            {withLoans.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.id})</option>)}
          </select>
          <button className="btn ghost small" onClick={() => window.print()}>Print</button>
        </div>
      }>
        <dl className="details">
          <div><dt>Customer</dt><dd>{c.name} · {c.id}</dd></div>
          <div><dt>NRC</dt><dd>{c.nrc}</dd></div>
          <div><dt>Phone</dt><dd>{c.phone}</dd></div>
          <div><dt>Employer / business</dt><dd>{c.employer}</dd></div>
        </dl>
      </Card>
      <div className="kpis small">
        <Kpi label="Total borrowed" value={money(lent)} sub={`${loans.length} loan${loans.length === 1 ? '' : 's'}`} icon="coins" tone="cyan" />
        <Kpi label="Total paid" value={money(paid)} sub="All receipts" icon="card" tone="green" />
        <Kpi label="Balance owing" value={money(balance)} sub="Principal + interest due" icon="wallet" tone="slate" />
        <Kpi label="Arrears" value={money(arrears)} sub={arrears ? 'Overdue now' : 'Up to date'} icon="alert" tone={arrears ? 'red' : 'green'} />
      </div>
      {loans.map((l) => (
        <Card key={l.id} title={`${l.id} · ${product(l.productId).name}`} sub={`${money(l.principal)} over ${l.months} months · ${loanInfo[l.id].status}`}>
          <Ledger loan={l} />
        </Card>
      ))}
    </>
  );
}
