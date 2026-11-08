import { useState } from 'react';
import { addDays, money, product } from '../finance';
import { useStore } from '../store';
import { Card, Icon, Kpi, downloadCsv } from '../ui';

const PERIODS = [
  ['month', 'This Month'],
  ['quarter', 'Last 3 Months'],
  ['year', 'Last 12 Months'],
  ['all', 'All Time'],
];
const BUCKETS = [
  ['1–30 days', 1, 30, 'Low delinquency'],
  ['31–60 days', 31, 60, 'Watchlist'],
  ['61–90 days', 61, 90, 'Substandard'],
  ['90+ days (NPL)', 91, Infinity, 'Non-performing'],
];
const pct = (a, b) => (b ? (a / b) * 100 : 0);

export default function Analytics() {
  const { state, loanInfo, split, customerName, today } = useStore();
  const [period, setPeriod] = useState('year');

  const from = { month: `${today.slice(0, 7)}-01`, quarter: addDays(today, -90), year: addDays(today, -365), all: '0000-01-01' }[period];
  const inPeriod = (d) => d >= from && d <= today;
  const periodLabel = PERIODS.find((p) => p[0] === period)[1];

  // ---- money ----
  const loansInPeriod = state.loans.filter((l) => inPeriod(l.disbursedOn));
  const capital = loansInPeriod.reduce((s, l) => s + l.principal, 0);
  const paysInPeriod = state.payments.filter((p) => inPeriod(p.date));
  const interestRevenue = paysInPeriod.reduce((s, p) => s + (split[p.id]?.interest || 0), 0);
  const fees = (state.penalties || []).filter((p) => inPeriod(p.date)).reduce((s, p) => s + p.amount, 0);

  // ---- portfolio at risk (always current) ----
  const infos = state.loans.map((l) => ({ l, i: loanInfo[l.id] }));
  const open = infos.filter(({ i }) => i.status !== 'Settled');
  const outstanding = open.reduce((s, { i }) => s + i.principalOutstanding, 0);
  const overdue = open.filter(({ i }) => i.status === 'Overdue');
  const parAmount = overdue.reduce((s, { i }) => s + i.principalOutstanding, 0);
  const totalArrears = overdue.reduce((s, { i }) => s + i.overdueAmt, 0);
  const buckets = BUCKETS.map(([label, lo, hi, note]) => {
    const rows = overdue.filter(({ i }) => i.daysLate >= lo && i.daysLate <= hi);
    return { label, note, count: rows.length, arrears: rows.reduce((s, { i }) => s + i.overdueAmt, 0), principal: rows.reduce((s, { i }) => s + i.principalOutstanding, 0) };
  });

  // ---- borrowers ----
  const appsByCustomer = state.applications.reduce((m, a) => ((m[a.customerId] = (m[a.customerId] || 0) + 1), m), {});
  const repeat = Object.values(appsByCustomer).filter((n) => n > 1).length;
  const decided = state.applications.filter((a) => ['Approved', 'Disbursed', 'Rejected'].includes(a.status));
  const approved = decided.filter((a) => a.status !== 'Rejected').length;
  const rejected = decided.length - approved;
  const newBorrowers = state.customers.filter((c) => inPeriod(c.joined)).length;

  // ---- staff throughput ----
  const decisionDays = decided
    .map((a) => {
      const n = (a.notes || []).find((x) => /^(Approved|Declined|Rejected)/.test(x.text));
      return n ? (new Date(n.at) - new Date(a.createdAt + 'T00:00:00')) / 86400000 : null;
    })
    .filter((d) => d !== null && d >= 0);
  const avgDecision = decisionDays.length ? decisionDays.reduce((s, d) => s + d, 0) / decisionDays.length : 0;
  const pastDue = infos.flatMap(({ i }) => i.rows.filter((r) => r.due < today));
  const onTime = pastDue.filter((r) => r.state === 'Paid').length;
  const reconciled = state.payments.filter((p) => p.verified).length;

  const exportBi = () =>
    downloadCsv(`executive-bi-${period}.csv`, [
      ['Metric', 'Value', 'Period'],
      ['Capital disbursed', capital.toFixed(2), periodLabel],
      ['Loans disbursed', loansInPeriod.length, periodLabel],
      ['Realised interest revenue', interestRevenue.toFixed(2), periodLabel],
      ['Fee / penalty income', fees.toFixed(2), periodLabel],
      ['Total revenue (interest + fees)', (interestRevenue + fees).toFixed(2), periodLabel],
      ['Outstanding principal', outstanding.toFixed(2), 'Current'],
      ['Portfolio at risk (principal)', parAmount.toFixed(2), 'Current'],
      ['PAR %', pct(parAmount, outstanding).toFixed(1), 'Current'],
      ['Total arrears', totalArrears.toFixed(2), 'Current'],
      ...buckets.map((b) => [`Arrears ${b.label}`, b.arrears.toFixed(2), 'Current']),
      ['Total borrowers', state.customers.length, 'Current'],
      ['New borrowers', newBorrowers, periodLabel],
      ['Repeat borrowers', repeat, 'Current'],
      ['Approval rate %', pct(approved, decided.length).toFixed(1), 'All time'],
      ['Rejection rate %', pct(rejected, decided.length).toFixed(1), 'All time'],
      ['Applications processed', decided.length, 'All time'],
      ['Payments reconciled', reconciled, 'All time'],
      ['Avg decision time (days)', avgDecision.toFixed(1), 'All time'],
      ['On-time repayment rate %', pct(onTime, pastDue.length).toFixed(1), 'All time'],
    ]);

  const reports = [
    ['Loan book', 'All loan accounts with balances', () =>
      downloadCsv('loan-book.csv', [['Loan', 'Customer', 'Product', 'Principal', 'Disbursed', 'Paid', 'Balance', 'Arrears', 'Status'],
        ...infos.map(({ l, i }) => [l.id, customerName(l.customerId), product(l.productId).name, l.principal, l.disbursedOn, i.paid, i.balance, i.overdueAmt, i.status])])],
    ['Payments', 'Every payment received', () =>
      downloadCsv('payments.csv', [['Receipt', 'Date', 'Loan', 'Customer', 'Method', 'Amount', 'Captured by'],
        ...state.payments.map((p) => { const l = state.loans.find((x) => x.id === p.loanId); return [p.id, p.date, l.id, customerName(l.customerId), p.method, p.amount, p.by]; })])],
    ['Arrears', 'Overdue accounts for follow-up', () =>
      downloadCsv('arrears.csv', [['Loan', 'Customer', 'Arrears', 'Days late', 'Balance'],
        ...overdue.map(({ l, i }) => [l.id, customerName(l.customerId), i.overdueAmt, i.daysLate, i.balance])])],
    ['Applications', 'Full application pipeline', () =>
      downloadCsv('applications.csv', [['Application', 'Date', 'Customer', 'Product', 'Amount', 'Months', 'Status'],
        ...state.applications.map((a) => [a.id, a.createdAt, customerName(a.customerId), product(a.productId).name, a.amount, a.months, a.status])])],
  ];

  return (
    <div className="page">
      <section className="card emi-head">
        <div className="emi-head-top">
          <div>
            <h2 className="with-icon"><Icon name="trend" size={20} /> Business Intelligence & Financial Analytics</h2>
            <p className="muted">Executive portfolio monitoring, revenue recognition, loan ageing buckets and operations review.</p>
          </div>
          <div className="actions tight">
            <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Reporting period">
              {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button className="btn dark" onClick={exportBi}><Icon name="file" size={16} /> Export Executive BI CSV</button>
          </div>
        </div>
        <div className="info-note">
          <b>Accounting note:</b> money lent out ({money(capital)} in {periodLabel.toLowerCase()}) is capital placed with borrowers, not income.
          Revenue is only what has actually been earned and received: interest {money(interestRevenue)} + fees {money(fees)} = <b>{money(interestRevenue + fees)}</b>.
        </div>
      </section>

      <div className="kpis four">
        <Kpi label="Total portfolio (capital)" value={money(capital)} sub={`${loansInPeriod.length} loans disbursed · ${periodLabel}`} icon="coins" />
        <Kpi label="Realised interest revenue" value={money(interestRevenue)} sub={`Interest received · ${periodLabel}`} icon="trend" />
        <Kpi label="Fee income received" value={money(fees)} sub={`Late penalties collected · ${periodLabel}`} icon="check" />
        <Kpi label="Overdue portfolio (PAR)" value={money(parAmount)} sub={`${pct(parAmount, outstanding).toFixed(1)}% of ${money(outstanding)} outstanding`} icon="shield" />
      </div>

      <Card title="Loan portfolio delinquency ageing (PAR)" sub="Arrears grouped by how many days the oldest missed instalment is late" action={<span className="neutral-pill">Total arrears: {money(totalArrears)}</span>}>
        <div className="bucket-grid">
          {buckets.map((b) => (
            <div key={b.label} className="bucket">
              <span className="bucket-label">{b.label}</span>
              <strong>{money(b.arrears)}</strong>
              <em>{b.note} · {b.count} loan{b.count === 1 ? '' : 's'}</em>
              <small>Principal at risk {money(b.principal)}</small>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Borrower acquisition & retention">
          <div className="metric-grid">
            <div><span>Total borrowers</span><strong>{state.customers.length}</strong></div>
            <div><span>Repeat borrowers</span><strong>{repeat}</strong></div>
            <div><span>Application approval rate</span><strong>{pct(approved, decided.length).toFixed(1)}%</strong></div>
            <div><span>Application rejection rate</span><strong>{pct(rejected, decided.length).toFixed(1)}%</strong></div>
            <div><span>New borrowers · {periodLabel}</span><strong>{newBorrowers}</strong></div>
            <div><span>Average loan size</span><strong>{money(state.loans.length ? state.loans.reduce((s, l) => s + l.principal, 0) / state.loans.length : 0)}</strong></div>
          </div>
        </Card>
        <Card title="Staff operational throughput">
          <div className="metric-grid">
            <div><span>Applications processed</span><strong>{decided.length}</strong></div>
            <div><span>Payments reconciled</span><strong>{reconciled} / {state.payments.length}</strong></div>
            <div><span>Avg decision time</span><strong>{avgDecision.toFixed(1)} days</strong></div>
            <div><span>On-time repayment rate</span><strong>{pct(onTime, pastDue.length).toFixed(1)}%</strong></div>
            <div><span>Collection activities logged</span><strong>{(state.collections || []).length}</strong></div>
            <div><span>Open support tickets</span><strong>{state.tickets.filter((t) => t.status !== 'Resolved').length}</strong></div>
          </div>
        </Card>
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
