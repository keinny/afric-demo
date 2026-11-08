import { useState } from 'react';
import { PAY_METHODS, can } from '../config';
import { fmtDate, money, monthKey, monthLabel, product } from '../finance';
import { useStore } from '../store';
import { Card, Empty, Field, Icon, Kpi, Modal, downloadCsv } from '../ui';
import { docHead, docTitle, printHtml } from '../print';
import { loanStatementHtml } from './LoanPage';
import { Ledger, PaymentForm, ReceiptModal } from './Loans';

export default function Ledgers({ go, sub }) {
  const { state } = useStore();
  const [recording, setRecording] = useState(false);
  const pending = state.payments.filter((p) => !p.verified).length + (state.statement || []).length;
  const TABS = [
    ['payments', `Payments Ledger (${state.payments.length})`, 'book'],
    ['reconciliation', `Bank & MoMo Reconciliation${pending ? ` (${pending})` : ''}`, 'check'],
    ['disbursements', 'Disbursements', 'coins'],
    ['cashbook', 'Cash Book', 'wallet'],
    ['interest', 'Interest Income', 'trend'],
    ['statements', 'Customer Statements', 'users'],
  ];
  const tab = TABS.some((t) => t[0] === sub) ? sub : 'payments';
  const View = { payments: Payments, reconciliation: Reconciliation, disbursements: Disbursements, cashbook: CashBook, interest: Interest, statements: Statements }[tab];

  return (
    <div className="page">
      <section className="card emi-head">
        <div className="emi-head-top">
          <div>
            <h2>Payment Management & Collections</h2>
            <p className="muted">Verified customer repayments, allocation ledgers and statement reconciliation.</p>
          </div>
          <div className="actions tight">
            <button className="btn ghost" onClick={() => exportPayments(state)}><Icon name="file" size={16} /> Export Payments CSV</button>
            {can(state.role, 'payment') && <button className="btn" onClick={() => setRecording(true)}>+ Record Repayment</button>}
          </div>
        </div>
        <div className="pill-tabs dark">
          {TABS.map(([id, label, icon]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => go(`repayments/${id}`)}>
              <Icon name={icon} size={16} /> {label}
            </button>
          ))}
        </div>
      </section>
      <View />
      {recording && <PaymentForm onClose={() => setRecording(false)} />}
    </div>
  );
}

function exportPayments(state) {
  const name = (id) => state.customers.find((c) => c.id === id)?.name || id;
  downloadCsv('payments.csv', [
    ['Receipt', 'Date', 'Customer', 'Loan', 'Channel', 'Reference', 'Amount', 'Status', 'Recorded by'],
    ...state.payments.map((p) => {
      const l = state.loans.find((x) => x.id === p.loanId);
      return [p.id, p.date, name(l.customerId), l.id, p.method, p.ref, p.amount, p.verified ? 'Verified' : 'Pending', p.by];
    }),
  ]);
}

const total = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
const signed = (n) => (n < 0 ? `− ${money(-n)}` : money(n));

/* ---------------- Payments ledger ---------------- */
function Payments() {
  const { state, customerName, split } = useStore();
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('All');
  const [month, setMonth] = useState('All');
  const [receiptId, setReceiptId] = useState(null);

  const months = [...new Set(state.payments.map((p) => monthKey(p.date)))].sort().reverse();
  const rows = state.payments
    .map((p) => {
      const loan = state.loans.find((l) => l.id === p.loanId);
      return { ...p, loan, customer: customerName(loan.customerId), ...(split[p.id] || { interest: 0, principal: p.amount }) };
    })
    .filter((r) => channel === 'All' || r.method === channel)
    .filter((r) => month === 'All' || monthKey(r.date) === month)
    .filter((r) => `${r.id} ${r.loan.id} ${r.customer} ${r.ref}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  return (
    <>
      <div className="card toolbar">
        <div className="search">
          <span aria-hidden>⌕</span>
          <input placeholder="Search by receipt #, customer, account #, reference…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="filter">
          <span className="muted small">Month</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="All">All months</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
        <label className="filter">
          <span className="muted small">Channel</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="All">All payment channels</option>
            {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
      </div>

      <Card className="flush">
        {rows.length ? (
          <div className="table-wrap">
            <table className="apps">
              <thead>
                <tr>
                  <th>Receipt #</th><th>Customer</th><th>Loan account</th><th className="num">Amount paid</th><th className="num">Principal</th>
                  <th className="num">Interest</th><th>Channel</th><th>Date</th><th>Status</th><th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono strong">{r.id}</td>
                    <td><strong>{r.customer}</strong></td>
                    <td className="mono">{r.loan.id}</td>
                    <td className="num amount">{money(r.amount)}</td>
                    <td className="num">{money(r.principal)}</td>
                    <td className="num">{money(r.interest)}</td>
                    <td className="upper">{r.method}</td>
                    <td className="muted">{fmtDate(r.date)}</td>
                    <td><span className={`status-tag ${r.verified ? 'ok' : 'wait'}`}>{r.verified ? 'VERIFIED' : 'PENDING'}</span></td>
                    <td className="right">
                      <button className="btn soft small" onClick={() => setReceiptId(r.id)}><Icon name="file" size={14} /> Receipt</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Totals ({rows.length} payments)</td>
                  <td className="num amount">{money(total(rows, 'amount'))}</td>
                  <td className="num">{money(total(rows, 'principal'))}</td>
                  <td className="num">{money(total(rows, 'interest'))}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <Empty>No payments match these filters.</Empty>
        )}
      </Card>
      {receiptId && <ReceiptModal paymentId={receiptId} onClose={() => setReceiptId(null)} />}
    </>
  );
}

/* ---------------- Bank & MoMo reconciliation ---------------- */
function Reconciliation() {
  const { state, dispatch, customerName, loanInfo } = useStore();
  const [matching, setMatching] = useState(null);
  const [loanId, setLoanId] = useState('');
  const canRec = can(state.role, 'payment');
  const statement = state.statement || [];
  const pending = state.payments.filter((p) => !p.verified).sort((a, b) => b.date.localeCompare(a.date));
  const openLoans = state.loans.filter((l) => loanInfo[l.id].status !== 'Settled');

  const channels = PAY_METHODS.map((m) => {
    const sys = state.payments.filter((p) => p.method === m);
    const recorded = total(sys, 'amount');
    const verified = total(sys.filter((p) => p.verified), 'amount');
    const unmatched = total(statement.filter((s) => s.channel === m), 'amount');
    return { m, recorded, verified, waiting: recorded - verified, unmatched, onStatement: verified + unmatched };
  });

  return (
    <>
      <div className="kpis small">
        <Kpi label="Payments verified" value={`${state.payments.length - pending.length} / ${state.payments.length}`} sub="Matched to a statement" icon="check" tone="green" />
        <Kpi label="Awaiting verification" value={money(total(pending, 'amount'))} sub={`${pending.length} payments recorded, not yet seen on statement`} icon="clock" tone="amber" />
        <Kpi label="Unidentified deposits" value={money(total(statement, 'amount'))} sub={`${statement.length} statement lines with no loan`} icon="alert" tone="red" />
      </div>

      <Card title="Channel summary" sub="System records compared with the bank and mobile money statements">
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr><th>Channel</th><th className="num">Recorded in system</th><th className="num">Verified</th><th className="num">Awaiting</th><th className="num">On statement</th><th className="num">Unidentified</th><th className="num">Difference</th></tr>
            </thead>
            <tbody>
              {channels.map((c) => {
                const diff = c.onStatement - c.recorded;
                return (
                  <tr key={c.m}>
                    <td><span className={`chan ${c.m.split(' ')[0].toLowerCase()}`}>{c.m}</span></td>
                    <td className="num">{money(c.recorded)}</td>
                    <td className="num green-text">{money(c.verified)}</td>
                    <td className="num">{c.waiting ? money(c.waiting) : '—'}</td>
                    <td className="num">{money(c.onStatement)}</td>
                    <td className="num">{c.unmatched ? money(c.unmatched) : '—'}</td>
                    <td className={`num strong ${Math.abs(diff) < 0.01 ? 'green-text' : 'red-text'}`}>{Math.abs(diff) < 0.01 ? 'Balanced' : signed(diff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid-2">
        <Card
          title="Recorded, awaiting statement"
          sub="Tick off once the money shows on the bank or MoMo statement"
          action={canRec && pending.length > 1 && <button className="btn small" onClick={() => dispatch({ type: 'verifyPayment', ids: pending.map((p) => p.id) })}>Verify all</button>}
        >
          {pending.length ? (
            <ul className="feed">
              {pending.map((p) => {
                const l = state.loans.find((x) => x.id === p.loanId);
                return (
                  <li key={p.id}>
                    <div>
                      <strong>{customerName(l.customerId)} · {money(p.amount)}</strong>
                      <span className="muted small">{p.id} · {p.method} · {p.ref || 'no ref'} · {fmtDate(p.date)}</span>
                    </div>
                    {canRec ? <button className="btn soft small" onClick={() => dispatch({ type: 'verifyPayment', ids: [p.id] })}>Verify</button> : <span className="status-tag wait">PENDING</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>Everything recorded has been verified.</Empty>
          )}
        </Card>

        <Card title="Unidentified statement deposits" sub="Money received with no matching record – match it to a loan">
          {statement.length ? (
            <ul className="feed">
              {statement.map((s) => (
                <li key={s.id}>
                  <div>
                    <strong>{money(s.amount)} · {s.channel}</strong>
                    <span className="muted small">{s.ref} · {fmtDate(s.date)}</span>
                    <span className="muted small">{s.narration}</span>
                  </div>
                  {canRec ? <button className="btn small" onClick={() => { setMatching(s); setLoanId(openLoans[0]?.id || ''); }}>Match to loan</button> : <span className="status-tag bad">UNMATCHED</span>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No unidentified deposits.</Empty>
          )}
          {!canRec && <p className="muted small">Switch to Finance Officer to verify and match payments.</p>}
        </Card>
      </div>

      {matching && (
        <Modal title="Match deposit to loan" sub={`${money(matching.amount)} · ${matching.channel} · ${matching.ref}`} onClose={() => setMatching(null)}>
          <div className="form">
            <p className="muted">{matching.narration} · received {fmtDate(matching.date)}</p>
            <Field label="Loan account">
              <select value={loanId} onChange={(e) => setLoanId(e.target.value)}>
                {openLoans.map((l) => (
                  <option key={l.id} value={l.id}>{l.id} — {customerName(l.customerId)} ({money(loanInfo[l.id].balance)} balance)</option>
                ))}
              </select>
            </Field>
            <p className="muted small">This creates a verified payment on the loan using the statement reference.</p>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setMatching(null)}>Cancel</button>
              <button className="btn" disabled={!loanId} onClick={() => { dispatch({ type: 'matchStatement', lineId: matching.id, loanId }); setMatching(null); }}>Match & post payment</button>
            </div>
          </div>
        </Modal>
      )}
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
  const { state, loanInfo, today } = useStore();
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
          <button className="btn ghost small" onClick={() => printHtml(docTitle(), docHead('Official Borrower Statement of Account', [`Date: ${fmtDate(today)}`, `Customer: ${c.id}`]) + loans.map((l) => loanStatementHtml(l, loanInfo[l.id], c, state.penalties || [], today)).join('<div style="height:22px"></div>'))}>Print Statement</button>
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
