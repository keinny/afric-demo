import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { APP_STATUSES, BRAND, PRODUCTS } from '../config';
import { addDays, addMonths, fmtDate, money, moneyShort, monthKey, monthLabel, product } from '../finance';
import { useStore } from '../store';
import { Badge, Card, Empty, Kpi } from '../ui';

const STATUS_COLORS = { Submitted: '#3b82f6', 'In Review': '#f59e0b', Approved: '#14b8a6', Disbursed: '#16a34a', Rejected: '#ef4444' };
const tip = { formatter: (v) => money(v), contentStyle: { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 } };

export default function Dashboard({ go }) {
  const { state, loanInfo, customerName, today } = useStore();
  const { customers, applications, loans, payments, audit } = state;

  const infos = loans.map((l) => ({ loan: l, ...loanInfo[l.id] }));
  const open = infos.filter((i) => i.status !== 'Settled');
  const overdue = infos.filter((i) => i.status === 'Overdue');
  const pending = applications.filter((a) => a.status === 'Submitted' || a.status === 'In Review');
  const approved = applications.filter((a) => a.status === 'Approved');
  const in30 = addDays(today, 30);
  const upcoming = infos.flatMap((i) => i.rows).filter((r) => r.remaining > 0 && r.due >= today && r.due <= in30);
  const newCustomers = customers.filter((c) => c.joined >= addDays(today, -45)).length;
  const last30 = customers.filter((c) => c.joined >= addDays(today, -30)).length;
  const prev30 = customers.filter((c) => c.joined >= addDays(today, -60) && c.joined < addDays(today, -30)).length;
  const custTrend = { up: last30 >= prev30, pct: prev30 ? Math.round(((last30 - prev30) / prev30) * 100) : last30 * 100 };
  const overdueEmis = infos.reduce((s, i) => s + i.overdueCount, 0);

  const disbursed = loans.reduce((s, l) => s + l.principal, 0);
  const outstanding = open.reduce((s, i) => s + i.principalOutstanding, 0);
  const collected = payments.reduce((s, p) => s + p.amount, 0);

  // last six months
  const months = Array.from({ length: 6 }, (_, k) => monthKey(addMonths(today.slice(0, 7) + '-01', k - 5)));
  const trend = months.map((m) => ({
    month: monthLabel(m),
    disbursed: loans.filter((l) => monthKey(l.disbursedOn) === m).reduce((s, l) => s + l.principal, 0),
    expected: loans.flatMap((l) => l.schedule).filter((r) => monthKey(r.due) === m).reduce((s, r) => s + r.total, 0),
    collected: payments.filter((p) => monthKey(p.date) === m).reduce((s, p) => s + p.amount, 0),
  }));
  const expDue = infos.flatMap((i) => i.rows).filter((r) => r.due < today);
  const recovery = expDue.length ? (expDue.reduce((s, r) => s + r.applied, 0) / expDue.reduce((s, r) => s + r.total, 0)) * 100 : 100;

  const byStatus = APP_STATUSES.map((s) => ({ name: s, value: applications.filter((a) => a.status === s).length })).filter((d) => d.value);
  const byProduct = PRODUCTS.map((p) => ({
    name: p.name,
    value: open.filter((i) => i.loan.productId === p.id).reduce((s, i) => s + i.principalOutstanding, 0),
  }));

  return (
    <div className="page">
      <section className="hero">
        <div>
          <div className="hero-tag"><span>LIVE DEMO</span> {BRAND.name}</div>
          <h2>Lending Operations at a Glance</h2>
          <p>Every figure below is worked out from the live records, so it changes the moment a loan is captured, approved, paid out or repaid.</p>
        </div>
        <div className="hero-actions">
          <button className="btn" onClick={() => go('applications')}>Process Applications ({pending.length})</button>
          <button className="btn navy" onClick={() => go('repayments')}>Repayments Ledger</button>
        </div>
      </section>

      <div className="kpis">
        <Kpi label="Total customers" value={customers.length} sub="Registered borrowers" icon="users" tone="slate" onClick={() => go('customers')} />
        <Kpi label="New customers" value={newCustomers} sub="Joined in last 45 days" icon="userPlus" tone="teal" trend={custTrend} />
        <Kpi label="Applications" value={applications.length} sub={`${pending.length} awaiting review`} icon="file" tone="blue" onClick={() => go('applications')} />
        <Kpi label="Pending apps" value={pending.length} sub="In verification queue" icon="clock" tone="amber" onClick={() => go('verification')} />
        <Kpi label="Approved apps" value={approved.length} sub="Ready for payout" icon="check" tone="green" />
        <Kpi label="Active loans" value={open.length} sub={`${overdue.length} currently overdue`} icon="bank" tone="purple" onClick={() => go('loans')} />
        <Kpi label="Disbursed principal" value={money(disbursed)} sub="Total capital lent out" icon="coins" tone="cyan" />
        <Kpi label="Outstanding principal" value={money(outstanding)} sub="Still owed on open loans" icon="wallet" tone="slate" />
        <Kpi label="Payments collected" value={money(collected)} sub="Cash received to date" icon="card" tone="green" onClick={() => go('repayments')} />
        <Kpi label="Upcoming EMIs" value={upcoming.length} sub={`Due in next 30 days · ${money(upcoming.reduce((s, r) => s + r.remaining, 0))}`} icon="calendar" tone="blue" onClick={() => go('emi')} />
        <Kpi label="Overdue EMIs" value={overdueEmis} sub={`Needs follow-up · ${money(overdue.reduce((s, i) => s + i.overdueAmt, 0))}`} icon="alert" tone="red" onClick={() => go('emi')} />
      </div>

      <div className="grid-2">
        <Card title="Disbursements" sub="Principal paid out per month">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trend} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={moneyShort} fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip {...tip} />
              <Bar dataKey="disbursed" name="Disbursed" fill="#0f766e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Collections" sub="Expected instalments vs money received" action={<span className="pill">{recovery.toFixed(1)}% recovered</span>}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={moneyShort} fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip {...tip} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="expected" name="Expected" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false} />
              <Line dataKey="collected" name="Collected" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Applications by status" sub="Whole pipeline">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {byStatus.map((d) => (
                  <Cell key={d.name} fill={STATUS_COLORS[d.name]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tip.contentStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Outstanding by product" sub="Principal still owed">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byProduct} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tickFormatter={moneyShort} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" fontSize={12} width={110} tickLine={false} axisLine={false} />
              <Tooltip {...tip} />
              <Bar dataKey="value" name="Outstanding" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Latest applications" action={<button className="link" onClick={() => go('applications')}>View all</button>}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Application</th><th>Customer</th><th>Product</th><th className="num">Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {applications.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{a.id}</td>
                    <td>{customerName(a.customerId)}</td>
                    <td>{product(a.productId).name}</td>
                    <td className="num">{money(a.amount)}</td>
                    <td><Badge>{a.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Overdue accounts" sub="Needs follow-up" action={<button className="link" onClick={() => go('loans')}>Loans</button>}>
          {overdue.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Loan</th><th>Customer</th><th className="num">Arrears</th><th className="num">Days late</th></tr>
                </thead>
                <tbody>
                  {overdue.map((i) => (
                    <tr key={i.loan.id}>
                      <td className="mono">{i.loan.id}</td>
                      <td>{customerName(i.loan.customerId)}</td>
                      <td className="num red-text">{money(i.overdueAmt)}</td>
                      <td className="num">{i.daysLate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No overdue accounts.</Empty>
          )}
        </Card>
        <Card title="Recent payments" action={<button className="link" onClick={() => go('repayments')}>Ledger</button>}>
          <ul className="feed">
            {payments.slice(-6).reverse().map((p) => {
              const loan = loans.find((l) => l.id === p.loanId);
              return (
                <li key={p.id}>
                  <div>
                    <strong>{customerName(loan.customerId)}</strong>
                    <span className="muted small">{p.id} · {loan.id} · {p.method}</span>
                  </div>
                  <div className="right">
                    <strong className="green-text">+{money(p.amount)}</strong>
                    <span className="muted small">{fmtDate(p.date)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Activity log" action={<button className="link" onClick={() => go('audit')}>Full log</button>}>
          <ul className="feed">
            {audit.slice(0, 6).map((a) => (
              <li key={a.id} className="stack">
                <span>{a.text}</span>
                <span className="muted small">{a.user} · {a.role} · {new Date(a.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
