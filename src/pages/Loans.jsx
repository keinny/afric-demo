import { useState } from 'react';
import { BRAND, PAY_METHODS, can } from '../config';
import { allocate, fmtDate, isoToday, money, penaltyOwed, product } from '../finance';
import { useStore } from '../store';
import { Badge, Card, Empty, Field, Icon, Modal } from '../ui';

export default function Loans({ go }) {
  const { state, loanInfo, customerName } = useStore();
  const [filter, setFilter] = useState('All');
  const [openId, setOpenId] = useState(null);

  const rows = state.loans.map((l) => ({ l, i: loanInfo[l.id] })).filter(({ i }) => filter === 'All' || i.status === filter);
  const count = (s) => state.loans.filter((l) => loanInfo[l.id].status === s).length;

  return (
    <div className="page">
      <Card title="Loan accounts" sub="Disbursed loans with balances and arrears · click a loan to open its account">
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
                  <tr key={l.id} onClick={() => (go ? go(`loans/${l.id}`) : setOpenId(l.id))}>
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

      <h4>Ledger</h4>
      <Ledger loan={loan} />

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

/** Double-entry style ledger: disbursement and interest as debits, payments as credits. */
export function Ledger({ loan }) {
  const { state, today } = useStore();
  const entries = [
    { date: loan.disbursedOn, ref: loan.id, text: `Loan disbursed (${loan.disburseMethod})`, debit: loan.principal, credit: 0, kind: 'disb' },
  ];
  loan.schedule
    .filter((r) => r.due <= today)
    .forEach((r) => entries.push({ date: r.due, ref: `INST-${r.no}`, text: `Interest charged – instalment ${r.no}`, debit: r.interest, credit: 0, kind: 'int' }));
  state.payments
    .filter((p) => p.loanId === loan.id)
    .forEach((p) => entries.push({ date: p.date, ref: p.id, text: `Repayment received – ${p.method}`, debit: 0, credit: p.amount, kind: 'pay' }));
  entries.sort((a, b) => a.date.localeCompare(b.date) || b.debit - a.debit);

  let bal = 0;
  const rows = entries.map((e) => ({ ...e, balance: (bal = Math.round((bal + e.debit - e.credit) * 100) / 100) }));
  const totalDr = entries.reduce((s, e) => s + e.debit, 0);
  const totalCr = entries.reduce((s, e) => s + e.credit, 0);

  return (
    <div className="table-wrap">
      <table className="ledger">
        <thead>
          <tr><th>Date</th><th>Reference</th><th>Description</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={i} className={e.kind}>
              <td className="nowrap">{fmtDate(e.date)}</td>
              <td className="mono">{e.ref}</td>
              <td>{e.text}</td>
              <td className="num">{e.debit ? money(e.debit) : ''}</td>
              <td className="num green-text">{e.credit ? money(e.credit) : ''}</td>
              <td className="num strong">{money(Math.max(0, e.balance))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Totals to date</td>
            <td className="num">{money(totalDr)}</td>
            <td className="num green-text">{money(totalCr)}</td>
            <td className="num">{money(Math.max(0, totalDr - totalCr))}</td>
          </tr>
        </tfoot>
      </table>
      <p className="muted small">Interest is posted on each instalment due date. Balance = amount lent + interest charged so far − payments.</p>
    </div>
  );
}

const METHOD_LABEL = {
  'Mobile Money': 'Mobile Money (Airtel / MTN / Zamtel)',
  'Bank Transfer': 'Bank Transfer / EFT',
  Cash: 'Cash at branch',
};
const newRef = () => `TXN-${Math.floor(100000 + Math.random() * 900000)}`;

/** Payment form body: allocates penalty first, then interest, then principal. */
export function PaymentBody({ loanId, presetAmount, lockLoan, onDone, onCancel }) {
  const { state, dispatch, loanInfo, customerName } = useStore();
  const openLoans = state.loans.filter((l) => loanInfo[l.id].status !== 'Settled');
  const [lid, setLid] = useState(loanId || openLoans[0]?.id);
  const info = loanInfo[lid];
  const loan = state.loans.find((l) => l.id === lid);
  const pen = info ? penaltyOwed(lid, info, state.penalties) : 0;
  const instalment = info ? info.overdueAmt || info.nextDue?.remaining || info.balance : 0;
  const maxPay = info ? info.balance + pen : 0;
  const [amount, setAmount] = useState(String(presetAmount ?? (instalment + pen).toFixed(2)));
  const [method, setMethod] = useState(PAY_METHODS[0]);
  const [date, setDate] = useState(isoToday());
  const [ref, setRef] = useState(newRef);
  const [note, setNote] = useState('Customer monthly repayment');
  const amt = +amount || 0;
  const ok = info && amt > 0 && amt <= maxPay + 0.001 && ref.trim();

  if (!openLoans.length) return <Empty>No open loans to pay.</Empty>;

  // live allocation preview
  const toPenalty = Math.min(amt, pen);
  const toLoan = Math.max(0, Math.round((amt - toPenalty) * 100) / 100);
  const preview = toLoan > 0 ? allocate(loan, [...state.payments, { id: '_preview', loanId: lid, amount: toLoan, date: '9999-12-31' }])._preview : { interest: 0, principal: 0 };

  const changeLoan = (v) => {
    setLid(v);
    const n = loanInfo[v];
    const p = penaltyOwed(v, n, state.penalties);
    setAmount(((n.overdueAmt || n.nextDue?.remaining || n.balance) + p).toFixed(2));
  };

  const submit = (e) => {
    e.preventDefault();
    if (!ok) return;
    if (toPenalty > 0) dispatch({ type: 'penalty', loanId: lid, amount: toPenalty, method, date, ref });
    if (toLoan > 0) dispatch({ type: 'payment', loanId: lid, amount: toLoan, method, date, ref, note });
    onDone?.({ amount: amt, toPenalty, toLoan, method, ref, loanId: lid });
  };

  return (
    <form className="form pay-form" onSubmit={submit}>
      <Field label="Loan account *">
        <select value={lid} onChange={(e) => changeLoan(e.target.value)} disabled={lockLoan}>
          {openLoans.map((l) => (
            <option key={l.id} value={l.id}>{l.id} — {customerName(l.customerId)} ({money(loanInfo[l.id].balance)} balance)</option>
          ))}
        </select>
      </Field>

      <div className="pay-summary">
        <div><span>Borrower</span><strong>{customerName(loan.customerId)}</strong></div>
        <div><span>Current balance</span><strong className="red-text">{money(info.balance)}</strong></div>
        <div><span>{info.overdueAmt ? 'Overdue now' : 'Next instalment'}</span><strong className={info.overdueAmt ? 'red-text' : 'green-text'}>{money(instalment)}</strong></div>
        {pen > 0 && <div><span>Late penalty owed</span><strong className="red-text">{money(pen)}</strong></div>}
      </div>

      <div className="row">
        <div>
          <Field label={`Payment amount (${'K'}) *`}>
            <input className={`big ${ok || !amount ? '' : 'invalid'}`} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="quick">
            <button type="button" onClick={() => setAmount((instalment + pen).toFixed(2))}>Set instalment{pen ? ' + penalty' : ''} ({money(instalment + pen)})</button>
            <button type="button" onClick={() => setAmount(maxPay.toFixed(2))}>Set full balance ({money(maxPay)})</button>
          </div>
        </div>
        <Field label="Payment method *">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m] || m}</option>)}
          </select>
        </Field>
      </div>

      <div className="row">
        <Field label="Transaction reference *"><input value={ref} onChange={(e) => setRef(e.target.value)} className="mono" /></Field>
        <Field label="Payment date"><input type="date" value={date} max={isoToday()} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Remarks"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>

      <div className="alloc">
        <div className="alloc-title">How this payment will be split</div>
        <div className="alloc-rows">
          <div><span>1. Late penalty</span><b>{money(toPenalty)}</b></div>
          <div><span>2. Interest</span><b>{money(preview.interest)}</b></div>
          <div><span>3. Principal</span><b>{money(preview.principal)}</b></div>
        </div>
        <p>Payments always clear any late penalty first, then interest that has built up, and only then reduce the principal balance.</p>
      </div>
      {amt > maxPay + 0.001 && <p className="red-text small">Amount is more than the full balance owed ({money(maxPay)}).</p>}

      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={!ok}>Record & Allocate Payment</button>
      </div>
    </form>
  );
}

export function PaymentForm({ loanId, onClose }) {
  const [receipt, setReceipt] = useState(null);
  if (receipt) return <ReceiptModal refNo={receipt.ref} loanId={receipt.loanId} onClose={onClose} />;
  return (
    <Modal title="Record Customer Loan Payment" sub="Post a repayment to the ledger and update the instalment schedule" onClose={onClose}>
      <PaymentBody loanId={loanId} lockLoan={!!loanId} onDone={(r) => setReceipt(r)} onCancel={onClose} />
    </Modal>
  );
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Opens a plain A4 print document in a new window with a diagonal demo watermark, then prints it. */
export function printDocument(title, items) {
  const body = items
    .map(([kind, label, value]) => {
      if (kind === 'h1') return `<h1>${esc(label)}</h1>`;
      if (kind === 'sub') return `<p class="sub">${esc(label)}</p>`;
      return `<div>${label ? `<span>${esc(label)}:</span> ` : ''}${esc(value)}</div>`;
    })
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 40px 56px; font-size: 14px; line-height: 1.55; }
  h1 { font-size: 20px; font-weight: 800; margin: 0 0 18px; letter-spacing: 0.01em; }
  .sub { margin: 0 0 18px; font-size: 15px; }
  span { color: #334155; }
  .wm { position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 72px; font-weight: 800;
        color: #0f172a; opacity: 0.06; text-align: center; line-height: 1.1; white-space: nowrap; pointer-events: none; z-index: -1; }
</style></head><body>
<div class="wm">${esc(BRAND.name.replace(/ Lending$/, '').toUpperCase())}<br>PROTOTYPE</div>
${body}
<script>window.onload = function () { setTimeout(function () { window.focus(); window.print(); }, 150); };<\/script>
</body></html>`;
  const w = window.open('', '_blank', 'width=820,height=980');
  if (!w) {
    alert('Please allow pop-ups for this site to print receipts.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** Official receipt for a payment. Look it up by transaction reference, or by receipt id. */
export function ReceiptModal({ refNo, paymentId, loanId, onClose }) {
  const { state, loanInfo, split, customerName } = useStore();
  const pay = state.payments.find((p) => (paymentId ? p.id === paymentId : p.ref === refNo && p.loanId === loanId));
  const pen = (state.penalties || []).find((p) => (refNo || pay?.ref) && p.ref === (refNo || pay?.ref) && p.loanId === (loanId || pay?.loanId));
  const rec = pay || pen;

  if (!rec)
    return (
      <Modal title="Official Payment Receipt" onClose={onClose}>
        <Empty>Receipt not found.</Empty>
      </Modal>
    );

  const loan = state.loans.find((l) => l.id === rec.loanId);
  const parts = pay ? split[pay.id] || { principal: pay.amount, interest: 0 } : { principal: 0, interest: 0 };
  const fees = pen?.amount || 0;
  const totalCredited = (pay?.amount || 0) + fees;
  const when = rec.at
    ? new Date(rec.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : fmtDate(rec.date);
  const print = () =>
    printDocument(`${BRAND.name.replace(/ Lending$/, '')} LMS Document`, [
      ['h1', BRAND.name.toUpperCase()],
      ['sub', 'Official Electronic Payment Receipt'],
      ['line', '', pay?.id || pen.id],
      ['line', 'Date & Time', when],
      ['line', 'Payment Method', rec.method.toUpperCase()],
      ['line', 'Customer Name', customerName(loan.customerId)],
      ['line', 'Transaction Reference', rec.ref || '—'],
      ['line', 'Loan Account Number', loan.id],
      ['line', 'Recorded By', rec.by],
      ['line', '', 'Payment Allocation'],
      ['line', 'Principal Repayment', money(parts.principal)],
      ['line', 'Interest Component', money(parts.interest)],
      ['line', 'Fees / Charges', money(fees)],
      ['line', 'Total Amount Credited', money(totalCredited)],
      ['line', 'Remaining Balance', money(loanInfo[loan.id].balance)],
      ['line', '', `Thank you for your payment to ${BRAND.name}. Please keep this receipt as proof of payment.`],
    ]);

  return (
    <Modal title="Official Payment Receipt" onClose={onClose}>
      <div className="receipt-paper">
        <div className="receipt-top">
          <h3>{BRAND.name.toUpperCase()}</h3>
          <p>Official Electronic Payment Receipt</p>
          <span className="receipt-no">{pay?.id || pen.id}</span>
        </div>
        <dl className="receipt-grid">
          <div><dt>Date & time</dt><dd>{when}</dd></div>
          <div><dt>Payment method</dt><dd>{rec.method.toUpperCase()}</dd></div>
          <div><dt>Customer name</dt><dd className="strong">{customerName(loan.customerId)}</dd></div>
          <div><dt>Transaction reference</dt><dd className="mono">{rec.ref || '—'}</dd></div>
          <div><dt>Loan account number</dt><dd className="brand-text strong">{loan.id}</dd></div>
          <div><dt>Recorded by</dt><dd>{rec.by}</dd></div>
        </dl>
        <div className="receipt-alloc">
          <div className="receipt-alloc-title">Payment allocation</div>
          <div className="line"><span>Principal repayment</span><b>{money(parts.principal)}</b></div>
          <div className="line"><span>Interest component</span><b>{money(parts.interest)}</b></div>
          <div className="line"><span>Fees / late penalty</span><b>{money(fees)}</b></div>
          <div className="line total"><span>Total amount credited</span><b>{money(totalCredited)}</b></div>
        </div>
        <div className="receipt-balance"><span>Remaining loan balance</span><b>{money(loanInfo[loan.id].balance)}</b></div>
        <p className="receipt-thanks">Thank you for your payment to {BRAND.name}. Please keep this receipt as proof of payment.</p>
      </div>
      <div className="modal-foot spread">
        <button className="btn dark" onClick={print}><Icon name="file" size={16} /> Print Receipt</button>
        <button className="btn soft" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
