import { useState } from 'react';
import { can } from '../config';
import { fmtDate, money } from '../finance';
import { useStore } from '../store';
import { Card, Empty } from '../ui';
import { PaymentForm } from './Loans';

export default function Repayments() {
  const { state, customerName } = useStore();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);

  const rows = state.payments
    .map((p) => ({ p, loan: state.loans.find((l) => l.id === p.loanId) }))
    .filter(({ p, loan }) => `${p.id} ${loan.id} ${customerName(loan.customerId)} ${p.method}`.toLowerCase().includes(q.toLowerCase()))
    .reverse();
  const total = rows.reduce((s, r) => s + r.p.amount, 0);

  return (
    <div className="page">
      <Card
        title="Repayments ledger"
        sub={`${rows.length} payments · ${money(total)}`}
        action={
          <div className="actions tight">
            <input placeholder="Search name, loan, receipt…" value={q} onChange={(e) => setQ(e.target.value)} />
            {can(state.role, 'payment') && <button className="btn" onClick={() => setAdding(true)}>+ Record payment</button>}
          </div>
        }
      >
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Loan</th><th>Method</th><th>Captured by</th><th className="num">Amount</th></tr>
              </thead>
              <tbody>
                {rows.map(({ p, loan }) => (
                  <tr key={p.id}>
                    <td className="mono">{p.id}</td>
                    <td>{fmtDate(p.date)}</td>
                    <td>{customerName(loan.customerId)}</td>
                    <td className="mono">{loan.id}</td>
                    <td>{p.method}</td>
                    <td>{p.by}</td>
                    <td className="num green-text">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No payments match.</Empty>
        )}
      </Card>
      {adding && <PaymentForm onClose={() => setAdding(false)} />}
    </div>
  );
}
