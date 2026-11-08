import { useState } from 'react';
import { can } from '../config';
import { fmtDate, money } from '../finance';
import { useStore } from '../store';
import { Badge, Card, Field, Modal } from '../ui';

export default function Customers() {
  const { state, loanInfo } = useStore();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);

  const rows = state.customers
    .filter((c) => `${c.name} ${c.id} ${c.town} ${c.employer} ${c.phone}`.toLowerCase().includes(q.toLowerCase()))
    .map((c) => {
      const loans = state.loans.filter((l) => l.customerId === c.id);
      const open = loans.filter((l) => loanInfo[l.id].status !== 'Settled');
      const balance = open.reduce((s, l) => s + loanInfo[l.id].balance, 0);
      const overdue = open.some((l) => loanInfo[l.id].status === 'Overdue');
      return { c, loans: loans.length, open: open.length, balance, overdue };
    });

  return (
    <div className="page">
      <Card
        title="Customers"
        sub={`${state.customers.length} registered borrowers`}
        action={
          <div className="actions tight">
            <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            {can(state.role, 'customer') && <button className="btn" onClick={() => setAdding(true)}>+ Add customer</button>}
          </div>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Name</th><th>Phone</th><th>Town</th><th>Employer / business</th><th>Joined</th><th className="num">Loans</th><th className="num">Balance</th><th>Standing</th></tr>
            </thead>
            <tbody>
              {rows.map(({ c, loans, open, balance, overdue }) => (
                <tr key={c.id}>
                  <td className="mono">{c.id}</td>
                  <td><strong>{c.name}</strong><div className="muted small">{c.type}</div></td>
                  <td>{c.phone}</td>
                  <td>{c.town}</td>
                  <td>{c.employer}</td>
                  <td>{fmtDate(c.joined)}</td>
                  <td className="num">{open}/{loans}</td>
                  <td className="num">{money(balance)}</td>
                  <td>{overdue ? <Badge>Overdue</Badge> : open ? <Badge>Active</Badge> : <span className="muted small">No open loans</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {adding && <NewCustomer onClose={() => setAdding(false)} />}
    </div>
  );
}

function NewCustomer({ onClose }) {
  const { dispatch } = useStore();
  const [f, setF] = useState({ name: '', phone: '+260 ', nrc: '', town: 'Lusaka', employer: '', type: 'Salaried' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.name.trim().length > 2 && f.phone.trim().length > 6;

  return (
    <Modal title="Add customer" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          dispatch({ type: 'addCustomer', customer: f });
          onClose();
        }}
      >
        <Field label="Full name"><input value={f.name} onChange={set('name')} autoFocus /></Field>
        <div className="row">
          <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
          <Field label="NRC number"><input value={f.nrc} onChange={set('nrc')} placeholder="123456/10/1" /></Field>
        </div>
        <div className="row">
          <Field label="Town"><input value={f.town} onChange={set('town')} /></Field>
          <Field label="Type">
            <select value={f.type} onChange={set('type')}>
              <option>Salaried</option>
              <option>Business</option>
            </select>
          </Field>
        </div>
        <Field label="Employer / business name"><input value={f.employer} onChange={set('employer')} /></Field>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!ok}>Save customer</button>
        </div>
      </form>
    </Modal>
  );
}
