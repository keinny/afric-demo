import { useState } from 'react';
import { useStore } from '../store';
import { Card, Empty, Icon, downloadCsv } from '../ui';

// Work out a machine-style action type from the log text.
const ACTIONS = [
  [/logged in/i, 'LOGIN'],
  [/switched to/i, 'ROLE_SWITCHED'],
  [/registered customer/i, 'CUSTOMER_CREATED'],
  [/captured .*application/i, 'APPLICATION_CREATED'],
  [/(ticked|unticked) check/i, 'VERIFICATION_CHECKLIST_UPDATED'],
  [/started verification/i, 'VERIFICATION_STARTED'],
  [/^approved/i, 'LOAN_APPROVED'],
  [/^rejected/i, 'LOAN_REJECTED'],
  [/disbursed/i, 'LOAN_DISBURSED'],
  [/late penalty/i, 'PENALTY_COLLECTED'],
  [/recorded .*payment/i, 'PAYMENT_RECORDED'],
  [/reconciled/i, 'PAYMENT_RECONCILED'],
  [/matched statement/i, 'STATEMENT_MATCHED'],
  [/^collections:/i, 'COLLECTION_ACTIVITY'],
  [/review note/i, 'REVIEW_NOTE_ADDED'],
  [/support ticket|ticket /i, 'TICKET_UPDATED'],
  [/blocked attempt|blocked deactivation/i, 'POLICY_BLOCKED'],
  [/notification rule/i, 'RULE_UPDATED'],
  [/staff (profile|account)/i, 'STAFF_UPDATED'],
  [/posted|month-end/i, 'LEDGER_POSTING'],
];
const actionOf = (text) => (ACTIONS.find(([re]) => re.test(text)) || [null, 'SYSTEM_EVENT'])[1];

const ENTITY = [
  [/\b[A-Z]{2,4}-APP-\d+/, 'LOAN_APPLICATION'],
  [/\b[A-Z]{2,4}-LN-\d+/, 'LOAN_ACCOUNT'],
  [/\bRCP-\d+/, 'PAYMENT'],
  [/\bPEN-\d+/, 'PENALTY'],
  [/\b[A-Z]{2,4}-TCK-\d+/, 'TICKET'],
  [/\bCUS-\d+/, 'CUSTOMER'],
  [/\b[A-Z]{2,4}-(ADM|MGR|LO|VER|FIN|CS|ANL)-\d+/, 'STAFF'],
];
const targetOf = (text) => {
  for (const [re, type] of ENTITY) {
    const m = text.match(re);
    if (m) return { type, ref: m[0] };
  }
  return /logged in|switched to/i.test(text) ? { type: 'AUTH', ref: 'SESSION' } : { type: 'SYSTEM', ref: '—' };
};

// Simple chained fingerprint (FNV-1a) so any edited or deleted entry breaks the chain.
const fnv = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

export default function Audit() {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('All');

  // oldest → newest to build the chain, then show newest first
  const chained = [];
  [...state.audit].reverse().forEach((a, i) => {
    const prev = chained[i - 1]?.hash || '00000000';
    chained.push({ ...a, action: actionOf(a.text), target: targetOf(a.text), hash: fnv(prev + a.at + a.user + a.text) });
  });
  const entries = chained.reverse();
  const roles = [...new Set(entries.map((e) => e.role))].sort();

  const rows = entries
    .filter((e) => role === 'All' || e.role === role)
    .filter((e) => `${e.text} ${e.user} ${e.action} ${e.target.ref}`.toLowerCase().includes(q.trim().toLowerCase()));

  const exportCsv = () =>
    downloadCsv('audit-trail.csv', [
      ['Date & time', 'Officer', 'Role', 'Action type', 'Target entity', 'Reference', 'Description', 'Fingerprint'],
      ...rows.map((e) => [new Date(e.at).toISOString(), e.user, e.role, e.action, e.target.type, e.target.ref, e.text, e.hash]),
    ]);

  return (
    <div className="page">
      <section className="card emi-head">
        <div className="emi-head-top">
          <div>
            <h2 className="with-icon"><Icon name="book" size={20} /> Tamper-Evident System Audit Trail</h2>
            <p className="muted">Chronological record of sign-ins, underwriting decisions, disbursements and payment postings.</p>
          </div>
          <button className="btn ghost" onClick={exportCsv}><Icon name="file" size={16} /> Export Audit CSV</button>
        </div>
        <div className="toolbar-inline">
          <div className="search">
            <span aria-hidden>⌕</span>
            <input placeholder="Search by action, officer, reference, description…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="filter">
            <span className="muted small">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="All">All Roles</option>
              {roles.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <p className="chain-note">
          <Icon name="shield" size={14} /> Chain verified · {entries.length} entries · latest fingerprint <code>{entries[0]?.hash || '—'}</code>.
          Each entry's fingerprint includes the one before it, so editing or deleting any record would break the chain.
        </p>
      </section>

      <Card className="flush">
        {rows.length ? (
          <div className="table-wrap">
            <table className="apps compact">
              <thead>
                <tr><th>Date & time</th><th>Officer</th><th>Role</th><th>Action type</th><th>Target entity</th><th>Description of action</th></tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="mono small muted">{new Date(e.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="wrap-sm"><strong>{e.user}</strong></td>
                    <td><span className="role-chip">{e.role.toUpperCase()}</span></td>
                    <td className="mono small strong">{e.action}</td>
                    <td className="mono small muted">{e.target.type}<div>({e.target.ref})</div></td>
                    <td className="desc">{e.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No audit entries match these filters.</Empty>
        )}
      </Card>
    </div>
  );
}
