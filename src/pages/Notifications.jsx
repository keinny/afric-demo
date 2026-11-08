import { useState } from 'react';
import { BRAND, CHANNEL_POLICY, NOTIFY_RULES, channelAllowed } from '../config';
import { addDays, fmtDate, money } from '../finance';
import { useStore } from '../store';
import { Card, Empty, Icon } from '../ui';
import SmsOutbox from './SmsOutbox';
import { SMS_TEMPLATES } from '../sms';
import { Notifications as StaffAlerts } from './More';

const WA = CHANNEL_POLICY.WhatsApp;
const maskPhone = (p = '') => p.replace(/(\+260 \d{2})\d{3}(\d{4})/, '$1 XXX XXXX');
const emailFor = (name = '') => `${name.toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/\s+/, '.')}@example.zm`;
const first = (name = '') => name.split(' ')[0];

// Message templates. {placeholders} are filled from live records.
const TEMPLATES = {
  disbursement: 'Dear {first}, your loan {loan} of {amount} has been paid out by {method}. Your first instalment is due on {due}. – {brand}',
  payment: 'Dear {name}, we have received your payment of {amount} for loan {loan} (Receipt {receipt}). Thank you. – {brand}',
  confirmation: 'Thank you for your payment of {amount} for loan {loan}. Your receipt {receipt} is attached. Remaining balance: {balance}.',
  upcoming: 'Dear {first}, your instalment of {amount} for loan {loan} is due on {due}. Please pay on time to avoid a late penalty. – {brand}',
  overdue: 'Dear {first}, your instalment of {amount} for loan {loan} was due on {due} and is now overdue. Please pay or call us today. – {brand}',
  approved: 'Application {app} for {amount} has been approved and is ready for disbursement.',
  whatsapp: 'Reminder: your instalment of {amount} for loan {loan} is due on {due}.',
};
// SMS rules use the exact wording that the SMS provider sends (src/sms.js).
for (const k of ['disbursement', 'payment', 'upcoming', 'overdue']) TEMPLATES[k] = SMS_TEMPLATES[k];

const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

/** Builds the simulated dispatch log from live records, honouring the rules and the channel policy. */
function useDispatchLog() {
  const { state, loanInfo, customerName, today } = useStore();
  const rules = state.rules || {};
  const cust = (id) => state.customers.find((c) => c.id === id) || {};
  const out = [];
  const push = (ruleId, e) => {
    const rule = NOTIFY_RULES.find((r) => r.id === ruleId);
    if (!rule || (!rules[ruleId] && channelAllowed(rule.channel))) return; // paused rule
    const allowed = channelAllowed(rule.channel);
    const c = cust(e.customerId);
    out.push({
      id: `${ruleId}-${e.key}`,
      title: e.title,
      ruleId,
      trigger: rule.name,
      channel: rule.channel,
      recipient: c.name,
      address: rule.channel === 'Email' ? emailFor(c.name) : rule.channel === 'In-App' ? 'Staff dashboard' : maskPhone(c.phone),
      message: allowed
        ? fill(TEMPLATES[ruleId], { ...e.vars, name: c.name, first: first(c.name), brand: BRAND.name })
        : `Outbound WhatsApp message blocked by messaging policy. Re-routed to SMS.`,
      date: e.date,
      status: !allowed ? 'BLOCKED' : e.date > today ? 'SCHEDULED' : 'SENT',
    });
  };

  state.loans.forEach((l) => {
    const info = loanInfo[l.id];
    push('disbursement', {
      key: l.id, customerId: l.customerId, date: l.disbursedOn, title: 'Loan Disbursed',
      vars: { loan: l.id, amount: money(l.principal), method: l.disburseMethod, due: fmtDate(l.schedule[0].due) },
    });
    info.rows.forEach((r) => {
      if (r.remaining > 0 && r.due >= today && r.due <= addDays(today, 10)) {
        const vars = { loan: l.id, amount: money(r.remaining), due: fmtDate(r.due) };
        push('upcoming', { key: `${l.id}-${r.no}`, customerId: l.customerId, date: addDays(r.due, -3), title: 'Upcoming Instalment Reminder', vars });
        push('whatsapp', { key: `${l.id}-${r.no}`, customerId: l.customerId, date: addDays(r.due, -3), title: 'WhatsApp Reminder Attempt', vars });
      }
      if (r.state === 'Overdue') {
        push('overdue', {
          key: `${l.id}-${r.no}`, customerId: l.customerId, date: addDays(r.due, 1), title: 'Overdue Instalment Notice',
          vars: { loan: l.id, amount: money(r.remaining), due: fmtDate(r.due) },
        });
      }
    });
  });
  state.payments.forEach((p) => {
    const l = state.loans.find((x) => x.id === p.loanId);
    const vars = { loan: l.id, amount: money(p.amount), receipt: p.id, balance: money(loanInfo[l.id].balance) };
    push('payment', { key: p.id, customerId: l.customerId, date: p.date, title: 'Payment Received', vars });
    push('confirmation', { key: p.id, customerId: l.customerId, date: p.date, title: `Payment Confirmation: Receipt ${p.id}`, vars });
  });
  state.applications
    .filter((a) => a.status === 'Approved' || a.status === 'Disbursed')
    .forEach((a) => push('approved', { key: a.id, customerId: a.customerId, date: a.createdAt, title: 'Application Approved', vars: { app: a.id, amount: money(a.amount) } }));

  return out.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

export default function Notifications({ go, sub }) {
  const { state } = useStore();
  const log = useDispatchLog();
  const activeRules = NOTIFY_RULES.filter((r) => state.rules?.[r.id] && channelAllowed(r.channel)).length;
  const sent = log.filter((l) => l.status === 'SENT').length;
  const TABS = [
    ['log', `Dispatch Log (${log.length})`],
    ['rules', `Automated Rules (${activeRules})`],
    ['templates', 'Approved Message Templates'],
    ['sms', `SMS Outbox (${(state.sms || []).length})`],
    ['alerts', 'Staff Alerts'],
  ];
  const tab = TABS.some((t) => t[0] === sub) ? sub : 'log';

  return (
    <div className="page">
      <PolicyBanner />

      <section className="card emi-head">
        <div className="emi-head-top">
          <div>
            <h2>Notification & Communication Automation Engine</h2>
            <p className="muted">Simulated multi-channel alerts, automatic due-date triggers and approved message templates.</p>
          </div>
          <span className="pill">{sent} messages sent</span>
        </div>
        <div className="pill-tabs dark">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => go(`notifications/${id}`)}>{label}</button>
          ))}
        </div>
      </section>

      {tab === 'log' && <DispatchLog log={log} />}
      {tab === 'rules' && <Rules />}
      {tab === 'templates' && <Templates />}
      {tab === 'sms' && <SmsOutbox />}
      {tab === 'alerts' && <StaffAlerts go={go} />}
    </div>
  );
}

function PolicyBanner() {
  return (
    <section className="policy">
      <div className="policy-icon"><Icon name="alert" size={22} /></div>
      <div className="policy-body">
        <div className="policy-tags">
          <span className="tag-amber">COMPLIANCE & POLICY RESTRICTION</span>
          <span className="tag-red">{WA.reason}</span>
        </div>
        <h3>WhatsApp Business Messaging Policy Notice</h3>
        <p>
          WhatsApp's business messaging rules restrict lenders from using its API for loan offers, repayment reminders and debt
          collection. To stay compliant, {BRAND.name} does not send any customer messages through WhatsApp.
        </p>
        <div className="policy-rule">
          <div><b>System rule:</b> the WhatsApp channel is locked off in the system settings. No admin toggle or role can switch it on, and any attempt is logged as blocked.</div>
          <div><b>Allowed channels:</b> customer alerts are sent only by <b>SMS</b>, <b>Email</b> and <b>In-App notifications</b>.</div>
        </div>
      </div>
      <div className="policy-side">
        <a className="btn ghost" href={WA.policyUrl} target="_blank" rel="noopener noreferrer">Review Official Policy ↗</a>
        <span className="muted small">🔒 Policy lock active</span>
      </div>
    </section>
  );
}

function DispatchLog({ log }) {
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('All');
  const [status, setStatus] = useState('All');
  const rows = log
    .filter((l) => channel === 'All' || l.channel === channel)
    .filter((l) => status === 'All' || l.status === status)
    .filter((l) => `${l.title} ${l.recipient} ${l.message}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <div className="card toolbar">
        <div className="search">
          <span aria-hidden>⌕</span>
          <input placeholder="Search by event, recipient, message…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="filter">
          <span className="muted small">Channel</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="All">All channels</option>
            {Object.keys(CHANNEL_POLICY).map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="filter">
          <span className="muted small">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {['All', 'SENT', 'SCHEDULED', 'BLOCKED'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <Card className="flush">
        {rows.length ? (
          <div className="table-wrap">
            <table className="apps">
              <thead>
                <tr><th>Event</th><th>Recipient</th><th>Channel</th><th>Simulated message</th><th>Trigger</th><th>Date</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 150).map((l) => (
                  <tr key={l.id} className={l.status === 'BLOCKED' ? 'row-blocked' : ''}>
                    <td className="wrap-sm"><strong>{l.title}</strong></td>
                    <td><strong>{l.recipient}</strong><div className="mono muted small">{l.address}</div></td>
                    <td><span className={`chan-tag ${l.channel === 'WhatsApp' ? 'blocked' : ''}`}>{l.channel.toUpperCase()}</span></td>
                    <td className="msg" title={l.message}>{l.message}</td>
                    <td className="upper small">{l.trigger}</td>
                    <td className="muted">{fmtDate(l.date)}</td>
                    <td>
                      <span className={`status-tag ${l.status === 'SENT' ? 'ok' : l.status === 'BLOCKED' ? 'bad' : 'wait'}`}>
                        {l.status === 'SENT' ? 'SENT · SIMULATED' : l.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No messages match these filters.</Empty>
        )}
      </Card>
      {rows.length > 150 && <p className="muted small">Showing the newest 150 of {rows.length} messages.</p>}
    </>
  );
}

function Rules() {
  const { state, dispatch } = useStore();
  return (
    <Card title="Automated rules" sub="Messages are created automatically when these events happen">
      <ul className="rules">
        {NOTIFY_RULES.map((r) => {
          const locked = CHANNEL_POLICY[r.channel]?.locked;
          const on = !locked && state.rules?.[r.id];
          return (
            <li key={r.id} className={locked ? 'locked' : ''}>
              <div className="grow-1">
                <strong>{r.name}</strong>
                <span className="muted small">{r.trigger} · <span className={`chan-tag ${locked ? 'blocked' : ''}`}>{r.channel.toUpperCase()}</span></span>
                {locked && <span className="red-text small">🔒 Locked by messaging policy – cannot be enabled</span>}
              </div>
              <button
                className={`switch ${on ? 'on' : ''}`}
                disabled={locked}
                onClick={() => dispatch({ type: 'toggleRule', id: r.id })}
                aria-label={`${on ? 'Pause' : 'Enable'} ${r.name}`}
              >
                <span />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Templates() {
  return (
    <div className="tpl-grid">
      {NOTIFY_RULES.map((r) => {
        const blocked = !channelAllowed(r.channel);
        return (
          <section key={r.id} className={`card tpl ${blocked ? 'locked' : ''}`}>
            <div className="tpl-head">
              <strong>{r.name}</strong>
              <span className={`status-tag ${blocked ? 'bad' : 'ok'}`}>{blocked ? 'BLOCKED BY POLICY' : 'APPROVED'}</span>
            </div>
            <span className="muted small">{r.channel} · {r.trigger}</span>
            <p className="tpl-body">{TEMPLATES[r.id]}</p>
            <span className="muted small">Placeholders in {'{braces}'} are filled from the customer and loan records.</span>
          </section>
        );
      })}
    </div>
  );
}
