import { useState } from 'react';
import { PAY_METHODS, can } from '../config';
import { fmtDate, isoToday, money, product } from '../finance';
import { useStore } from '../store';
import { Badge, Card, Empty, Field, Modal } from '../ui';

export default function Loans() {
  const { state, loanInfo, customerName } = useStore();
  const [filter, setFilter] = useState('All');
  const [openId, setOpenId] = useState(null);

  const rows = state.loans.map((l) => ({ l, i: loanInfo[l.id] })).filter(({ i }) => filter === 'All' || i.status === filter);
  const count = (s) => state.loans.filter((l) => loanInfo[l.id].status === s).length;

  return (
    <div className="page">
      <Card title="Loan accounts" sub="Disbursed loans with balances and arrears">
        <div className="tabs">
          {['All', 'Active', 'Overdue', 'Settled'].map((s) => (
            <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>
              {s} <span>{s === 'All' ? state.loans.length : count(s)}</span>
            </button>
          ))}
        </div>
        {rows.length ? (
          <div className="table-wrap">
            <table className="clickable">
              <thead>
                <tr><th>Loan</th><th>Customer</th><th>Product</th><th className="num">Principal</th><th className="num">Paid</th><th className="num">Balance</th><th>Next due</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows.map(({ l, i }) => (
                  <tr key={l.id} onClick={() => setOpenId(l.id)}>
                    <td className="mono">{l.id}</td>
                    <td>{customerName(l.customerId)}</td>
                    <td>{product(l.productId).name}</td>
                    <td className="num">{money(l.principal)}</td>
                    <td className="num">{money(i.paid)}</td>
                    <td className="num">{money(i.balance)}</td>
                    <td>{i.nextDue ? `${fmtDate(i.nextDue.due)} · ${money(i.nextDue.remaining)}` : '—'}</td>
                    <td><Badge>{i.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No loans with this status.</Empty>
        )}
      </Card>
      {openId && <LoanDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

export function LoanDetail({ id, onClose }) {
  const { state, loanInfo, customerName } = useStore();
  const loan = state.loans.find((l) => l.id === id);
  const i = loanInfo[id];
  const [paying, setPaying] = useState(false);
  const pays = state.payments.filter((p) => p.loanId === id);

  return (
    <Modal title={`${loan.id} · ${customerName(loan.customerId)}`} onClose={onClose} wide>
      <div className="detail-grid">
        <div><span className="muted small">Status</span><Badge>{i.status}</Badge></div>
        <div><span className="muted small">Product</span><strong>{product(loan.productId).name}</strong></div>
        <div><span className="muted small">Principal</span><strong>{money(loan.principal)}</strong></div>
        <div><span className="muted small">Total repayable</span><strong>{money(i.totalDue)}</strong></div>
        <div><span className="muted small">Paid</span><strong className="green-text">{money(i.paid)}</strong></div>
        <div><span className="muted small">Balance</span><strong>{money(i.balance)}</strong></div>
        <div><span className="muted small">Arrears</span><strong className={i.overdueAmt ? 'red-text' : ''}>{money(i.overdueAmt)}{i.daysLate ? ` · ${i.daysLate} days` : ''}</strong></div>
        <div><span className="muted small">Disbursed</span><strong>{fmtDate(loan.disbursedOn)} · {loan.disburseMethod}</strong></div>
      </div>

      {i.status !== 'Settled' && can(state.role, 'payment') && (
        <div className="actions"><button className="btn" onClick={() => setPaying(true)}>Record payment</button></div>
      )}
      {i.status !== 'Settled' && !can(state.role, 'payment') && <p className="muted small">Switch to Finance Officer to record payments.</p>}

      <h4>Repayment schedule</h4>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>#</th><th>Due</th><th className="num">Principal</th><th className="num">Interest</th><th className="num">Instalment</th><th className="num">Paid</th><th>Status</th></tr>
          </thead>
          <tbody>
            {i.rows.map((r) => (
              <tr key={r.no}>
                <td>{r.no}</td>
                <td>{fmtDate(r.due)}</td>
                <td className="num">{money(r.principal)}</td>
                <td className="num">{money(r.interest)}</td>
                <td className="num">{money(r.total)}</td>
                <td className="num">{money(r.applied)}</td>
                <td><Badge>{r.state}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4>Payments</h4>
      {pays.length ? (
        <ul className="feed">
          {pays.slice().reverse().map((p) => (
            <li key={p.id}>
              <div><strong>{p.id}</strong><span className="muted small">{p.method} · by {p.by}</span></div>
              <div className="right"><strong className="green-text">+{money(p.amount)}</strong><span className="muted small">{fmtDate(p.date)}</span></div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No payments yet.</Empty>
      )}
      {paying && <PaymentForm loanId={id} onClose={() => setPaying(false)} />}
    </Modal>
  );
}

export function PaymentForm({ loanId, onClose }) {
  const { state, dispatch, loanInfo, customerName } = useStore();
  const openLoans = state.loans.filter((l) => loanInfo[l.id].status !== 'Settled');
  const [lid, setLid] = useState(loanId || openLoans[0]?.id);
  const info = loanInfo[lid];
  const suggested = info ? info.overdueAmt || info.nextDue?.remaining || info.balance : 0;
  const [amount, setAmount] = useState(suggested.toFixed(2));
  const [method, setMethod] = useState(PAY_METHODS[0]);
  const [date, setDate] = useState(isoToday());
  const ok = info && +amount > 0 && +amount <= info.balance + 0.001;

  const changeLoan = (v) => {
    setLid(v);
    const n = loanInfo[v];
    setAmount((n.overdueAmt || n.nextDue?.remaining || n.balance).toFixed(2));
  };

  if (!openLoans.length) return <Modal title="Record payment" onClose={onClose}><Empty>No open loans.</Empty></Modal>;

  return (
    <Modal title="Record payment" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          dispatch({ type: 'payment', loanId: lid, amount: +amount, method, date });
          onClose();
        }}
      >
        <Field label="Loan account">
          <select value={lid} onChange={(e) => changeLoan(e.target.value)} disabled={!!loanId}>
            {openLoans.map((l) => <option key={l.id} value={l.id}>{l.id} – {customerName(l.customerId)}</option>)}
          </select>
        </Field>
        <p className="muted small">Balance {money(info.balance)} · Arrears {money(info.overdueAmt)}</p>
        <div className="row">
          <Field label="Amount">
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={ok ? '' : 'invalid'} />
          </Field>
          <Field label="Date">
            <input type="date" value={date} max={isoToday()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Method">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!ok}>Save payment</button>
        </div>
      </form>
    </Modal>
  );
}
