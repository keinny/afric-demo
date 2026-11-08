import { useState } from 'react';
import { BRAND, LATE_PENALTY_PCT, can } from '../config';
import { fmtDate, isoToday, money, penaltyOwed, product } from '../finance';
import { docHead, docTitle, facts, printHtml, table } from '../print';
import { useStore } from '../store';
import { Badge, Card, Empty, Icon, downloadCsv } from '../ui';
import Loans, { Ledger, PaymentForm, ReceiptModal } from './Loans';

/** Loan Accounts menu: the list, or one account's full page when a loan id is in the URL. */
export default function LoansRoute({ go, sub }) {
  if (sub) return <LoanPage id={decodeURIComponent(sub)} go={go} />;
  return <Loans go={go} />;
}

/** Schedule rows with fees (late penalties) and display status. */
function scheduleRows(loan, info, penalties, today) {
  const pens = penalties.filter((p) => p.loanId === loan.id);
  // each penalty belongs to the latest instalment that was due when it was charged
  const ownerOf = (date) => ([...loan.schedule].reverse().find((x) => x.due <= date) || loan.schedule[0]).no;
  const feeFor = (r) => pens.filter((p) => ownerOf(p.date) === r.no).reduce((s, p) => s + p.amount, 0);
  return info.rows.map((r) => {
    const fees = feeFor(r);
    let status = 'Upcoming';
    if (r.state === 'Paid') status = 'Paid';
    else if (r.state === 'Overdue') status = r.applied > 0 ? 'Partially Paid' : 'Overdue';
    else if (r.state === 'Partial') status = 'Partially Paid';
    else if (info.nextDue && info.nextDue.no === r.no) status = 'Due';
    return { ...r, fees, totalDue: r.total + fees, paid: r.applied + fees, status };
  });
}

/** Borrower details + schedule table for one loan, used by every printed statement. */
export function loanStatementHtml(loan, info, cust, penalties, today) {
  const p = product(loan.productId);
  const rows = scheduleRows(loan, info, penalties, today);
  const t = rows.reduce(
    (a, r) => ({ principal: a.principal + r.principal, interest: a.interest + r.interest, fees: a.fees + r.fees, totalDue: a.totalDue + r.totalDue, paid: a.paid + r.paid, remaining: a.remaining + r.remaining }),
    { principal: 0, interest: 0, fees: 0, totalDue: 0, paid: 0, remaining: 0 }
  );
  const maturity = loan.schedule[loan.schedule.length - 1].due;
  return (
    facts([
      ['Borrower', `${cust.name} (${cust.id})`],
      ['NRC Number', cust.nrc],
      ['Account', loan.id],
      ['Facility', p.name],
      ['Principal', money(loan.principal)],
      ['Interest', `${loan.ratePct * 12}% p.a. (${loan.ratePct}% per month, ${loan.method === 'flat' ? 'flat interest' : 'reducing balance'})`],
      ['Disbursed', `${fmtDate(loan.disbursedOn)} · Maturity ${fmtDate(maturity)}`],
      ['Total Repaid', money(t.paid)],
      ['Current Balance', money(t.remaining)],
    ]) +
    table(
      ['#', 'Due Date', { label: 'Principal', num: true }, { label: 'Interest', num: true }, { label: 'Fees', num: true }, { label: 'Total Due', num: true }, { label: 'Paid', num: true }, { label: 'Remaining', num: true }, 'Status'],
      rows.map((r) => [r.no, fmtDate(r.due), money(r.principal), money(r.interest), money(r.fees), money(r.totalDue), money(r.paid), money(r.remaining), r.status]),
      ['', 'Schedule Summary Total:', money(t.principal), money(t.interest), money(t.fees), money(t.totalDue), money(t.paid), money(t.remaining), '']
    )
  );
}

function LoanPage({ id, go }) {
  const { state, loanInfo, split, today } = useStore();
  const [tab, setTab] = useState('schedule');
  const [paying, setPaying] = useState(false);
  const [receiptId, setReceiptId] = useState(null);
  const loan = state.loans.find((l) => l.id === id);

  if (!loan)
    return (
      <div className="page">
        <Card><Empty>Loan {id} was not found. <button className="link" onClick={() => go('loans')}>Back to loan accounts</button></Empty></Card>
      </div>
    );

  const info = loanInfo[loan.id];
  const p = product(loan.productId);
  const cust = state.customers.find((c) => c.id === loan.customerId) || {};
  const pens = (state.penalties || []).filter((x) => x.loanId === loan.id);
  const pays = state.payments.filter((x) => x.loanId === loan.id).sort((a, b) => a.date.localeCompare(b.date));
  const rows = scheduleRows(loan, info, state.penalties || [], today);
  const totals = rows.reduce(
    (t, r) => ({ principal: t.principal + r.principal, interest: t.interest + r.interest, fees: t.fees + r.fees, totalDue: t.totalDue + r.totalDue, paid: t.paid + r.paid, remaining: t.remaining + r.remaining }),
    { principal: 0, interest: 0, fees: 0, totalDue: 0, paid: 0, remaining: 0 }
  );
  const maturity = loan.schedule[loan.schedule.length - 1].due;
  const statusLabel = info.status;
  const rateLabel = `${loan.ratePct * 12}% p.a.`;
  const methodLabel = loan.method === 'flat' ? 'Flat interest' : 'Reducing balance';

  const printStatement = () =>
    printHtml(
      docTitle(),
      docHead('Official Borrower Statement of Account', [`Date: ${fmtDate(isoToday())}`, `Account: ${loan.id}`]) +
        loanStatementHtml(loan, info, cust, state.penalties || [], today)
    );

  const TABS = [
    ['schedule', `Amortization Schedule (${rows.length})`],
    ['ledger', `Payment Ledger (${pays.length})`],
    ['agreement', 'Loan Agreement Preview'],
    ['settlement', 'Early Settlement Calculator'],
  ];

  return (
    <div className="page">
      <section className="card acct-head">
        <div className="acct-top">
          <button className="icon-btn back" onClick={() => go('loans')} aria-label="Back to loan accounts">←</button>
          <div className="acct-icon"><Icon name="bank" size={24} /></div>
          <div className="acct-title">
            <h2>{loan.id} <Badge>{statusLabel}</Badge></h2>
            <p className="muted">
              Borrower: <b className="ink">{cust.name}</b> ({cust.id}) · Disbursed: {fmtDate(loan.disbursedOn)} · Maturity: {fmtDate(maturity)}
            </p>
          </div>
          <div className="actions tight">
            <button className="btn ghost" onClick={printStatement}><Icon name="file" size={16} /> Print Statement</button>
            {can(state.role, 'payment') && info.status !== 'Settled' && (
              <button className="btn" onClick={() => setPaying(true)}><Icon name="card" size={16} /> Record Payment</button>
            )}
          </div>
        </div>

        <div className="acct-stats">
          <div><span>Principal amount</span><strong>{money(loan.principal)}</strong><em>{p.name}</em></div>
          <div><span>Interest method & rate</span><strong>{rateLabel}</strong><em className="brand-text">{methodLabel} · {loan.ratePct}%/month</em></div>
          <div><span>Total repayment due</span><strong>{money(totals.totalDue)}</strong><em>Interest: {money(totals.interest)}{totals.fees ? ` · Fees: ${money(totals.fees)}` : ''}</em></div>
          <div><span>Total amount paid</span><strong className="green-text">{money(totals.paid)}</strong><em>{pays.length + pens.length} recorded payments</em></div>
          <div><span>Outstanding balance</span><strong className={totals.remaining ? 'red-text' : 'green-text'}>{money(totals.remaining)}</strong><em>Principal: {money(info.principalOutstanding)}</em></div>
        </div>

        <div className="underline-tabs">
          {TABS.map(([k, l]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </section>

      {tab === 'schedule' && <Schedule loan={loan} rows={rows} totals={totals} />}
      {tab === 'ledger' && <PaymentsTab loan={loan} pays={pays} pens={pens} split={split} onReceipt={setReceiptId} />}
      {tab === 'agreement' && <Agreement loan={loan} cust={cust} p={p} rows={rows} maturity={maturity} rateLabel={rateLabel} methodLabel={methodLabel} />}
      {tab === 'settlement' && <Settlement loan={loan} info={info} rows={rows} pens={pens} />}

      {paying && <PaymentForm loanId={loan.id} onClose={() => setPaying(false)} />}
      {receiptId && <ReceiptModal paymentId={receiptId} onClose={() => setReceiptId(null)} />}
    </div>
  );
}

/* ---------- Amortization schedule ---------- */
const statusCls = { Paid: 'Paid', Due: 'Due', Upcoming: 'Upcoming', Overdue: 'Overdue', 'Partially Paid': 'Partial' };

function Schedule({ loan, rows, totals }) {
  const exportCsv = () =>
    downloadCsv(`${loan.id}-schedule.csv`, [
      ['#', 'Due date', 'Principal', 'Interest', 'Fees', 'Total due', 'Paid', 'Remaining', 'Status'],
      ...rows.map((r) => [r.no, r.due, r.principal, r.interest, r.fees, r.totalDue, r.paid, r.remaining, r.status]),
    ]);
  return (
    <Card
      title="Contractual instalment schedule"
      sub={`Formula: ${loan.method === 'flat' ? 'flat interest on the original principal each month' : 'reducing-balance interest on the amount still owed'}`}
      action={<button className="btn soft small" onClick={exportCsv}><Icon name="file" size={14} /> Export Schedule CSV</button>}
    >
      <div className="table-wrap">
        <table className="sched">
          <thead>
            <tr><th>#</th><th>Due date</th><th className="num">Principal</th><th className="num">Interest</th><th className="num">Fees</th><th className="num">Total due</th><th className="num">Paid</th><th className="num">Remaining</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.no}>
                <td className="strong">{r.no}</td>
                <td>{fmtDate(r.due)}</td>
                <td className="num">{money(r.principal)}</td>
                <td className="num muted">{money(r.interest)}</td>
                <td className="num muted">{money(r.fees)}</td>
                <td className="num strong">{money(r.totalDue)}</td>
                <td className="num green-text">{money(r.paid)}</td>
                <td className="num strong">{money(r.remaining)}</td>
                <td><Badge>{statusCls[r.status] === 'Partial' ? 'Partial' : r.status}</Badge></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>SCHEDULE SUMMARY TOTAL:</td>
              <td className="num">{money(totals.principal)}</td>
              <td className="num">{money(totals.interest)}</td>
              <td className="num">{money(totals.fees)}</td>
              <td className="num">{money(totals.totalDue)}</td>
              <td className="num green-text">{money(totals.paid)}</td>
              <td className="num">{money(totals.remaining)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

/* ---------- Payment ledger ---------- */
function PaymentsTab({ loan, pays, pens, split, onReceipt }) {
  return (
    <>
      <Card title="Payments received" sub="Every receipt on this account – open a receipt to reprint it">
        {pays.length || pens.length ? (
          <div className="table-wrap">
            <table className="apps">
              <thead>
                <tr><th>Receipt</th><th>Date</th><th>Channel</th><th>Reference</th><th className="num">Principal</th><th className="num">Interest</th><th className="num">Fees</th><th className="num">Amount</th><th>Status</th><th className="right" /></tr>
              </thead>
              <tbody>
                {[...pays.map((x) => ({ ...x, kind: 'pay' })), ...pens.map((x) => ({ ...x, kind: 'pen' }))]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((x) => {
                    const s = x.kind === 'pay' ? split[x.id] || { principal: x.amount, interest: 0 } : { principal: 0, interest: 0 };
                    return (
                      <tr key={x.id}>
                        <td className="mono strong">{x.id}</td>
                        <td>{fmtDate(x.date)}</td>
                        <td className="upper">{x.method}</td>
                        <td className="mono muted">{x.ref || '—'}</td>
                        <td className="num">{money(s.principal)}</td>
                        <td className="num">{money(s.interest)}</td>
                        <td className="num">{money(x.kind === 'pen' ? x.amount : 0)}</td>
                        <td className="num amount">{money(x.amount)}</td>
                        <td>{x.kind === 'pen' ? <span className="status-tag wait">PENALTY</span> : <span className={`status-tag ${x.verified ? 'ok' : 'wait'}`}>{x.verified ? 'VERIFIED' : 'PENDING'}</span>}</td>
                        <td className="right">{x.kind === 'pay' && <button className="btn soft small" onClick={() => onReceipt(x.id)}>Receipt</button>}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No payments yet.</Empty>
        )}
      </Card>
      <Card title="Account ledger" sub="Debits (loan and interest) and credits (payments) with running balance">
        <Ledger loan={loan} />
      </Card>
    </>
  );
}

/* ---------- Loan agreement preview ---------- */
function Agreement({ loan, cust, p, rows, maturity, rateLabel, methodLabel }) {
  const { state } = useStore();
  const LATE = state.settings?.penaltyPct ?? LATE_PENALTY_PCT;
  const GRACE = state.settings?.graceDays ?? 0;
  const totalRepay = rows.reduce((s, r) => s + r.total, 0);
  const sections = [
    ['1. The loan', `${BRAND.legal} ("the Lender") agrees to lend ${cust.name}, NRC ${cust.nrc} ("the Borrower"), the sum of ${money(loan.principal)} under the ${p.name} product. The money was paid out on ${fmtDate(loan.disbursedOn)} by ${loan.disburseMethod}.`],
    ['2. Interest', `Interest is charged at ${loan.ratePct}% per month (${rateLabel}) using the ${methodLabel.toLowerCase()} method. Total interest over the term is ${money(totalRepay - loan.principal)}.`],
    ['3. Repayment', `The Borrower will repay ${money(totalRepay)} in ${loan.months} monthly instalments of about ${money(rows[0].total)}, starting ${fmtDate(rows[0].due)} and ending ${fmtDate(maturity)}, as set out in the schedule.`],
    ['4. Late payment', `If an instalment is still unpaid more than ${GRACE} day${GRACE === 1 ? "" : "s"} after its due date, a late penalty of ${LATE}% of the overdue amount may be charged. Payments clear penalties first, then interest, then principal.`],
    ['5. Early settlement', 'The Borrower may repay the full balance at any time. Interest for instalments not yet due is not charged on early settlement.'],
    ['6. Communication', 'The Lender will contact the Borrower only by SMS, email, phone call or in-app message. WhatsApp is not used for any loan or collection messages.'],
  ];
  const print = () =>
    printHtml(
      docTitle(),
      docHead('Loan Agreement (Preview)', [`Date: ${fmtDate(isoToday())}`, `Account: ${loan.id}`]) +
        sections.map(([h, t]) => `<h2>${h}</h2><p>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('') +
        `<div class="sign"><div>Borrower: ${cust.name}</div><div>For ${BRAND.legal}</div></div>`
    );
  return (
    <Card title="Loan agreement preview" sub="Generated from this account's terms – for demonstration only, not legal advice" action={<button className="btn soft small" onClick={print}><Icon name="file" size={14} /> Print Agreement</button>}>
      <div className="agreement">
        {sections.map(([h, t]) => (
          <div key={h}>
            <h4>{h}</h4>
            <p>{t}</p>
          </div>
        ))}
        <div className="sign-row"><div>Borrower: {cust.name}</div><div>For {BRAND.legal}</div></div>
      </div>
    </Card>
  );
}

/* ---------- Early settlement calculator ---------- */
function Settlement({ loan, info, rows, pens }) {
  const { state } = useStore();
  const [date, setDate] = useState(isoToday());
  const penalty = penaltyOwed(loan.id, info, state.penalties || [], state.settings);
  const principalLeft = info.principalOutstanding;
  // interest on instalments already due by the settlement date that hasn't been paid yet
  const interestDue = rows
    .filter((r) => r.due <= date && r.remaining > 0)
    .reduce((s, r) => s + Math.max(0, r.interest - r.applied), 0); // payments clear interest first
  const payoff = Math.round((principalLeft + interestDue + penalty) * 100) / 100;
  const scheduled = rows.reduce((s, r) => s + r.remaining, 0) + penalty;
  const saving = Math.max(0, Math.round((scheduled - payoff) * 100) / 100);

  if (info.status === 'Settled') return <Card><Empty>This loan is fully settled.</Empty></Card>;

  return (
    <div className="calc">
      <Card title="Settlement date" sub="Work out what the borrower needs to pay to close the loan">
        <div className="form">
          <label className="field"><span>Settle on</span><input type="date" value={date} min={isoToday()} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <div className="calc-result">
          <div><span>Settlement amount</span><strong>{money(payoff)}</strong></div>
          <div><span>If paid as scheduled</span><strong>{money(scheduled)}</strong></div>
          <div><span>Borrower saves</span><strong className="green-text">{money(saving)}</strong></div>
        </div>
      </Card>
      <Card title="How it's worked out">
        <div className="receipt-alloc">
          <div className="line"><span>Principal still owed</span><b>{money(principalLeft)}</b></div>
          <div className="line"><span>Unpaid interest on instalments due by {fmtDate(date)}</span><b>{money(interestDue)}</b></div>
          <div className="line"><span>Late penalty owed</span><b>{money(penalty)}</b></div>
          <div className="line total"><span>Settlement amount</span><b>{money(payoff)}</b></div>
        </div>
        <p className="muted small">Interest on instalments due after the settlement date is waived, which is where the saving comes from.</p>
      </Card>
    </div>
  );
}
