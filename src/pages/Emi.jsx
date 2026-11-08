import { useState } from 'react';
import { COLLECTION_ACTIONS, LATE_PENALTY_PCT, PRODUCTS, can } from '../config';
import { addDays, addMonths, buildSchedule, fmtDate, isoToday, money, penaltyOwed, product } from '../finance';
import { useStore } from '../store';
import { Badge, Empty, Field, Icon, Modal, downloadCsv } from '../ui';
import { LoanDetail, PaymentBody, PaymentForm, ReceiptModal } from './Loans';

const r2 = (n) => Math.round(n * 100) / 100;
const penaltyFor = (remaining, pct = LATE_PENALTY_PCT) => r2((remaining * pct) / 100);
const BUCKETS = [
  ['1–30 days', 1, 30],
  ['31–60 days', 31, 60],
  ['61–90 days', 61, 90],
  ['90+ days', 91, Infinity],
];

export default function Emi({ go, sub }) {
  const { state, loanInfo, customerName, today } = useStore();
  const tab = ['overdue', 'upcoming', 'collections', 'calculator'].includes(sub) ? sub : 'overdue';
  const [collect, setCollect] = useState(null);
  const openAccount = (id) => go(`loans/${id}`);
  const [posting, setPosting] = useState(false);

  const instalments = state.loans.flatMap((l) =>
    loanInfo[l.id].rows
      .filter((r) => r.remaining > 0)
      .map((r) => ({ ...r, loan: l, customer: customerName(l.customerId), days: Math.round((new Date(today) - new Date(r.due)) / 86400000) }))
  );
  const overdue = instalments.filter((r) => r.state === 'Overdue').sort((a, b) => b.days - a.days);
  const upcoming = instalments.filter((r) => r.due >= today && r.due <= addDays(today, 30)).sort((a, b) => a.due.localeCompare(b.due));
  const delinquent = overdue.reduce((s, r) => s + r.remaining, 0);

  const exportOverdue = () =>
    downloadCsv('overdue-instalments.csv', [
      ['Borrower', 'Account', 'Instalment', 'Due date', 'Days overdue', 'Remaining due', 'Late penalty', 'Phone'],
      ...overdue.map((r) => [r.customer, r.loan.id, r.no, r.due, r.days, r.remaining, penaltyFor(r.remaining, state.settings?.penaltyPct), state.customers.find((c) => c.id === r.loan.customerId)?.phone]),
    ]);

  const TABS = [
    ['overdue', `Overdue Instalments (${overdue.length})`, 'alert'],
    ['upcoming', `Upcoming Due EMIs (${upcoming.length})`, 'calendar'],
    ['collections', `Collections Log (${state.collections.length})`, 'book'],
    ['calculator', 'EMI Calculator', 'card'],
  ];

  return (
    <div className="page">
      <section className="card emi-head">
        <div className="emi-head-top">
          <div>
            <h2>Repayments & EMI Schedule</h2>
            <p className="muted">Track instalments, chase late payers by how many days overdue, and work out repayments.</p>
          </div>
          <div className="actions tight">
            <button className="btn outline-red" onClick={exportOverdue} disabled={!overdue.length}><Icon name="file" size={16} /> Export Overdue CSV</button>
            {can(state.role, 'payment') && <button className="btn" onClick={() => setPosting(true)}><Icon name="card" size={16} /> Post Payment</button>}
          </div>
        </div>
        <div className="pill-tabs">
          {TABS.map(([id, label, icon]) => (
            <button key={id} className={`${tab === id ? 'active' : ''} ${id === 'overdue' ? 'danger' : ''}`} onClick={() => go(`emi/${id}`)}>
              <Icon name={icon} size={16} /> {label}
            </button>
          ))}
        </div>
      </section>

      {tab === 'overdue' && (
        <>
          <div className="aging">
            {BUCKETS.map(([label, lo, hi]) => {
              const rows = overdue.filter((r) => r.days >= lo && r.days <= hi);
              return (
                <div key={label} className={rows.length ? 'hot' : ''}>
                  <span>{label}</span>
                  <strong>{money(rows.reduce((s, r) => s + r.remaining, 0))}</strong>
                  <em>{rows.length} instalment{rows.length === 1 ? '' : 's'}</em>
                </div>
              );
            })}
          </div>
          <section className="card flush queue">
            <div className="queue-head">
              <strong>Delinquent collection queue</strong>
              <span>Total delinquent: <b>{money(delinquent)}</b></span>
            </div>
            {overdue.length ? (
              <div className="table-wrap">
                <table className="apps">
                  <thead>
                    <tr><th>Borrower</th><th>Account #</th><th>Instalment</th><th>Due date</th><th>Days overdue</th><th className="num">Remaining due</th><th className="num">Late penalty</th><th>Last action</th><th className="right">Action</th></tr>
                  </thead>
                  <tbody>
                    {overdue.map((r) => {
                      const last = state.collections.find((c) => c.loanId === r.loan.id);
                      return (
                        <tr key={r.loan.id + r.no}>
                          <td><strong>{r.customer}</strong></td>
                          <td className="mono">{r.loan.id}</td>
                          <td>Instalment #{r.no}</td>
                          <td>{fmtDate(r.due)}</td>
                          <td><span className="late">{r.days} days late</span></td>
                          <td className="num red-text strong">{money(r.remaining)}</td>
                          <td className="num muted">
                            {(() => {
                              const owed = Math.min(penaltyFor(r.remaining, state.settings?.penaltyPct), penaltyOwed(r.loan.id, loanInfo[r.loan.id], state.penalties, state.settings));
                              return owed > 0 ? `+${money(owed)}` : <span className="green-text">Paid</span>;
                            })()}
                          </td>
                          <td className="muted small wrap-sm">{last ? <>{last.action}<br />{fmtDate(last.at.slice(0, 10))}</> : 'None yet'}</td>
                          <td className="right">
                            <div className="stack-btns">
                              <button className="btn small" onClick={() => setCollect(r)}>Collect</button>
                              <button className="btn soft small" onClick={() => openAccount(r.loan.id)}>Account</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No overdue instalments. Everyone is up to date.</Empty>
            )}
          </section>
        </>
      )}

      {tab === 'upcoming' && (
        <section className="card flush queue calm">
          <div className="queue-head">
            <strong>Due in the next 30 days</strong>
            <span>Expected: <b>{money(upcoming.reduce((s, r) => s + r.remaining, 0))}</b></span>
          </div>
          {upcoming.length ? (
            <div className="table-wrap">
              <table className="apps">
                <thead>
                  <tr><th>Due date</th><th>Borrower</th><th>Account #</th><th>Instalment</th><th className="num">Principal</th><th className="num">Interest</th><th className="num">Amount due</th><th>Status</th><th className="right">Action</th></tr>
                </thead>
                <tbody>
                  {upcoming.map((r) => (
                    <tr key={r.loan.id + r.no}>
                      <td>{fmtDate(r.due)}<div className="muted small">in {-r.days} day{-r.days === 1 ? '' : 's'}</div></td>
                      <td><strong>{r.customer}</strong></td>
                      <td className="mono">{r.loan.id}</td>
                      <td>#{r.no} of {r.loan.months}</td>
                      <td className="num">{money(r.principal)}</td>
                      <td className="num">{money(r.interest)}</td>
                      <td className="num strong">{money(r.remaining)}</td>
                      <td><Badge>{r.state}</Badge></td>
                      <td className="right">
                        <div className="stack-btns">
                          <button className="btn small" onClick={() => setCollect(r)}>Collect</button>
                          <button className="btn soft small" onClick={() => openAccount(r.loan.id)}>Account</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Nothing due in the next 30 days.</Empty>
          )}
        </section>
      )}

      {tab === 'collections' && <CollectionsLog onAccount={openAccount} />}
      {tab === 'calculator' && <Calculator />}

      {collect && <CollectModal row={collect} onClose={() => setCollect(null)} />}
      {posting && <PaymentForm onClose={() => setPosting(false)} />}
    </div>
  );
}

/* ---------------- Collect modal ---------------- */
function CollectModal({ row, onClose }) {
  const { state, dispatch, loanInfo } = useStore();
  const canPay = can(state.role, 'payment');
  const isLate = row.state === 'Overdue';
  const penalty = isLate ? penaltyOwed(row.loan.id, loanInfo[row.loan.id], state.penalties, state.settings) : 0;
  const [mode, setMode] = useState(canPay ? 'pay' : 'log');
  const [action, setAction] = useState('Phone call');
  const [note, setNote] = useState('');
  const [promise, setPromise] = useState(addDays(isoToday(), 3));
  const cust = state.customers.find((c) => c.id === row.loan.customerId);
  const [receipt, setReceipt] = useState(null);

  const paid = ({ amount, toPenalty, method, ref, loanId }) => {
    dispatch({
      type: 'collectLog',
      loanId: row.loan.id,
      action: 'Payment collected',
      note: `${money(amount)} via ${method} (${ref})${toPenalty ? `, incl. ${money(toPenalty)} penalty` : ''}`,
    });
    setReceipt({ ref, loanId });
  };

  if (receipt) return <ReceiptModal refNo={receipt.ref} loanId={receipt.loanId} onClose={onClose} />;
  const log = () => {
    dispatch({ type: 'collectLog', loanId: row.loan.id, action, note, promiseDate: action === 'Promise to pay' ? promise : null });
    onClose();
  };

  return (
    <Modal title={`Collect · ${row.loan.id}`} sub={`${row.customer} · ${cust?.phone || ''}`} onClose={onClose}>
      <div className="collect-summary">
        <div><span>Instalment #{row.no}</span><strong>{money(row.remaining)}</strong><em>{isLate ? `${row.days} days late` : `Due ${fmtDate(row.due)}`}</em></div>
        {isLate && <div><span>Late penalty ({state.settings?.penaltyPct ?? LATE_PENALTY_PCT}%)</span><strong className="red-text">+{money(penalty)}</strong><em>still owed</em></div>}
      </div>

      <div className="seg">
        <button className={mode === 'pay' ? 'active' : ''} onClick={() => setMode('pay')} disabled={!canPay}>Record payment</button>
        <button className={mode === 'log' ? 'active' : ''} onClick={() => setMode('log')}>Log collection activity</button>
      </div>
      {!canPay && <p className="muted small">Only the Finance Officer can record payments. You can still log calls, visits and promises.</p>}

      {mode === 'pay' ? (
        <PaymentBody loanId={row.loan.id} lockLoan presetAmount={(row.remaining + penalty).toFixed(2)} onDone={paid} onCancel={onClose} />
      ) : (
        <div className="form">
          <Field label="Activity">
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              {COLLECTION_ACTIONS.filter((x) => x !== 'Payment collected').map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          {action === 'Promise to pay' && (
            <Field label="Promised payment date"><input type="date" value={promise} min={isoToday()} onChange={(e) => setPromise(e.target.value)} /></Field>
          )}
          <Field label="Notes"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did the customer say?" /></Field>
          <div className="actions">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={log}>Save activity</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- Collections log ---------------- */
function CollectionsLog({ onAccount }) {
  const { state, customerName, today } = useStore();
  const promises = state.collections.filter((c) => c.promiseDate);
  const penalties = state.penalties.reduce((s, p) => s + p.amount, 0);
  return (
    <>
      <div className="aging">
        <div><span>Activities logged</span><strong>{state.collections.length}</strong><em>calls, SMS, visits, promises</em></div>
        <div className={promises.some((p) => p.promiseDate < today) ? 'hot' : ''}><span>Promises to pay</span><strong>{promises.length}</strong><em>{promises.filter((p) => p.promiseDate < today).length} past their date</em></div>
        <div><span>Payments via collections</span><strong>{state.collections.filter((c) => c.action === 'Payment collected').length}</strong><em>recorded from the queue</em></div>
        <div><span>Penalties collected</span><strong>{money(penalties)}</strong><em>{state.penalties.length} receipts</em></div>
      </div>
      <section className="card flush queue calm">
        <div className="queue-head"><strong>Collections activity</strong><span>Newest first</span></div>
        {state.collections.length ? (
          <div className="table-wrap">
            <table className="apps">
              <thead>
                <tr><th>When</th><th>Account #</th><th>Borrower</th><th>Activity</th><th>Notes</th><th>Promise date</th><th>By</th><th className="right" /></tr>
              </thead>
              <tbody>
                {state.collections.map((c) => {
                  const loan = state.loans.find((l) => l.id === c.loanId);
                  return (
                    <tr key={c.id}>
                      <td>{fmtDate(c.at.slice(0, 10))}</td>
                      <td className="mono">{c.loanId}</td>
                      <td>{customerName(loan?.customerId)}</td>
                      <td><span className={`act ${c.action.split(' ')[0].toLowerCase()}`}>{c.action}</span></td>
                      <td className="wrap">{c.note || '—'}</td>
                      <td>{c.promiseDate ? <span className={c.promiseDate < today ? 'red-text strong' : ''}>{fmtDate(c.promiseDate)}</span> : '—'}</td>
                      <td className="muted">{c.by}</td>
                      <td className="right"><button className="btn soft small" onClick={() => onAccount(c.loanId)}>Account</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No collection activity yet. Use “Collect” on an overdue instalment.</Empty>
        )}
      </section>
    </>
  );
}

/* ---------------- EMI calculator ---------------- */
function Calculator() {
  const [pid, setPid] = useState(PRODUCTS[0].id);
  const p = product(pid);
  const [amount, setAmount] = useState(10000);
  const [months, setMonths] = useState(6);
  const [rate, setRate] = useState(p.ratePct);
  const [method, setMethod] = useState(p.method);
  const [start, setStart] = useState(addMonths(isoToday(), 1));

  const pick = (id) => {
    const np = product(id);
    setPid(id);
    setRate(np.ratePct);
    setMethod(np.method);
    setMonths(Math.min(+months, np.maxMonths));
  };
  const valid = +amount > 0 && +months > 0 && +months <= 60 && +rate >= 0;
  const rows = valid ? buildSchedule({ principal: +amount, ratePct: +rate, months: +months, method, firstDue: start }) : [];
  const totalInt = rows.reduce((s, r) => s + r.interest, 0);
  let bal = +amount;

  return (
    <div className="calc">
      <section className="card">
        <div className="card-head"><div><h2>Loan details</h2><p className="muted">Try different amounts and terms. Nothing is saved.</p></div></div>
        <div className="form">
          <Field label="Product">
            <select value={pid} onChange={(e) => pick(e.target.value)}>{PRODUCTS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </Field>
          <Field label="Loan amount"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <div className="row">
            <Field label="Term (months)"><input type="number" value={months} onChange={(e) => setMonths(e.target.value)} /></Field>
            <Field label="Rate (% per month)"><input type="number" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
          </div>
          <div className="row">
            <Field label="Interest method">
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="reducing">Reducing balance</option>
                <option value="flat">Flat rate</option>
              </select>
            </Field>
            <Field label="First payment"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          </div>
        </div>
        {valid && (
          <div className="calc-result">
            <div><span>Monthly instalment</span><strong>{money(rows[0].total)}</strong></div>
            <div><span>Total interest</span><strong>{money(totalInt)}</strong></div>
            <div><span>Total repayable</span><strong>{money(+amount + totalInt)}</strong></div>
          </div>
        )}
      </section>
      <section className="card">
        <div className="card-head"><div><h2>Amortisation schedule</h2><p className="muted">{valid ? `${rows.length} monthly payments` : 'Enter valid numbers to see the schedule'}</p></div></div>
        {valid && (
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr><th>#</th><th>Due date</th><th className="num">Principal</th><th className="num">Interest</th><th className="num">Instalment</th><th className="num">Balance</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  bal = r2(bal - r.principal);
                  return (
                    <tr key={r.no}>
                      <td>{r.no}</td>
                      <td>{fmtDate(r.due)}</td>
                      <td className="num">{money(r.principal)}</td>
                      <td className="num">{money(r.interest)}</td>
                      <td className="num strong">{money(r.total)}</td>
                      <td className="num muted">{money(Math.max(0, bal))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
