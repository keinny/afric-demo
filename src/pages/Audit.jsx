import { useState } from 'react';
import { useStore } from '../store';
import { Card } from '../ui';

export default function Audit() {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const rows = state.audit.filter((a) => `${a.text} ${a.user} ${a.role}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <Card title="Activity log" sub="Every action, who did it and when" action={<input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>When</th><th>User</th><th>Role</th><th>Action</th></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap">{new Date(a.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td>{a.user}</td>
                  <td>{a.role}</td>
                  <td>{a.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
