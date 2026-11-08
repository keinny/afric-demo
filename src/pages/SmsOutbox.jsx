import { useState } from 'react';
import { useStore } from '../store';
import { SMS_RULE_LABELS, segments } from '../sms';
import { Card, Empty, Kpi } from '../ui';

const STATUS_CLS = { sent: 'ok', simulated: 'ok', queued: 'wait', failed: 'bad', blocked: 'bad' };
const label = (s) =>
  s.status === 'sent' && s.provider === 'test' ? 'TEST · NOT DELIVERED' : s.status === 'simulated' ? 'DEMO · NOT SENT' : s.status.toUpperCase();

/** Real SMS outbox: every message queued for the SMS provider and what happened to it. */
export default function SmsOutbox() {
  const { state, customerName, online, retrySms } = useStore();
  const [status, setStatus] = useState('All');
  const [busy, setBusy] = useState(false);
  const all = state.sms || [];
  const rows = all.filter((s) => status === 'All' || s.status === status);
  const count = (st) => all.filter((s) => s.status === st).length;
  const segs = all.filter((s) => s.status === 'sent' && s.provider !== 'test').reduce((n, s) => n + segments(s.message), 0);
  const retryable = rows.filter((s) => s.status === 'failed' || s.status === 'queued').map((s) => s.id);

  const retry = async (ids) => {
    setBusy(true);
    await retrySms(ids);
    setBusy(false);
  };

  return (
    <>
      <div className="kpis small">
        <Kpi label="Delivered to provider" value={count('sent')} sub={`${segs} billable segment${segs === 1 ? '' : 's'}`} icon="check" />
        <Kpi label="Waiting" value={count('queued')} sub="Queued, not yet sent" icon="clock" />
        <Kpi label="Failed" value={count('failed')} sub="Can be retried" icon="alert" />
        <Kpi label={online ? 'Blocked' : 'Demo (not sent)'} value={online ? count('blocked') : count('simulated')} sub={online ? 'Stopped by messaging policy' : 'Connect Supabase to send for real'} icon="shield" />
      </div>
      <Card
        title="SMS outbox"
        sub={online ? 'Messages sent through the configured SMS provider (send-sms Edge Function).' : 'Demo mode – messages are recorded here but nothing is sent.'}
        action={
          <div className="actions tight">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
              {['All', 'queued', 'sent', 'failed', 'blocked', 'simulated'].map((s) => <option key={s} value={s}>{s === 'All' ? 'All statuses' : s}</option>)}
            </select>
            {online && retryable.length > 0 && (
              <button className="btn small" disabled={busy} onClick={() => retry(retryable)}>{busy ? 'Sending…' : `Retry ${retryable.length}`}</button>
            )}
          </div>
        }
      >
        {rows.length ? (
          <div className="table-wrap">
            <table className="apps compact">
              <thead>
                <tr><th>Queued</th><th>Recipient</th><th>Type</th><th>Message</th><th>Segments</th><th>Status</th><th>Provider / reference</th></tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="mono small muted">{new Date(s.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td><strong>{s.customerId ? customerName(s.customerId) : 'Test'}</strong><div className="mono muted small">{s.phone}</div></td>
                    <td className="small">{SMS_RULE_LABELS[s.ruleId] || s.ruleId}</td>
                    <td className="msg" title={s.message}>{s.message}</td>
                    <td className="num">{segments(s.message)}</td>
                    <td>
                      <span className={`status-tag ${STATUS_CLS[s.status] || 'wait'}`}>{label(s)}</span>
                      {s.error && s.status !== 'sent' && <div className="red-text small wrap-err">{s.error}</div>}
                    </td>
                    <td className="mono small muted">{s.provider || '—'}<div>{s.providerRef ? String(s.providerRef).slice(0, 24) : ''}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No SMS yet. Recording a payment or disbursing a loan queues one automatically (if the rule is on).</Empty>
        )}
      </Card>
    </>
  );
}
