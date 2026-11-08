import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { BRAND, CHANNEL_POLICY, NOTIFY_RULES, ROLES } from './config';
import { addMonths, allocate, buildSchedule, isoToday, money, product, summarize } from './finance';
import { ids, makeSeed } from './seed';

const KEY = 'afric-demo-v8';
const Ctx = createContext(null);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return makeSeed();
}

const nextNum = (list) => list.length + 1;
const name = (state, customerId) => state.customers.find((c) => c.id === customerId)?.name || customerId;

function withLog(state, text) {
  const r = ROLES[state.role];
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), user: r.user, role: r.label, text };
  return { ...state, audit: [entry, ...state.audit].slice(0, 500) };
}

function reducer(state, a) {
  switch (a.type) {
    case 'role':
      return withLog({ ...state, role: a.role }, `Switched to ${ROLES[a.role].label} view.`);

    case 'reset':
      return makeSeed();

    case 'addCustomer': {
      const c = { ...a.customer, id: ids.customer(nextNum(state.customers)), joined: isoToday() };
      return withLog({ ...state, customers: [...state.customers, c] }, `Registered customer ${c.name} (${c.id}).`);
    }

    case 'addApplication': {
      const app = {
        ...a.app,
        id: ids.app(nextNum(state.applications)),
        status: 'Submitted',
        createdAt: isoToday(),
        checklist: Array(6).fill(false),
        assignedTo: ROLES[state.role].user,
        notes: [],
      };
      return withLog(
        { ...state, applications: [app, ...state.applications] },
        `Captured ${product(app.productId).name} application ${app.id} for ${name(state, app.customerId)} (${money(app.amount)}).`
      );
    }

    case 'check': {
      const applications = state.applications.map((x) =>
        x.id === a.id ? { ...x, checklist: x.checklist.map((v, i) => (i === a.index ? a.value : v)) } : x
      );
      return withLog({ ...state, applications }, `${a.value ? 'Ticked' : 'Unticked'} check ${a.index + 1} on ${a.id}.`);
    }

    case 'addNote': {
      const r = ROLES[state.role];
      const note = { by: r.user, role: r.label, at: new Date().toISOString(), text: a.text };
      const applications = state.applications.map((x) => (x.id === a.id ? { ...x, notes: [...(x.notes || []), note] } : x));
      return withLog({ ...state, applications }, `Added review note on ${a.id}.`);
    }

    case 'status': {
      const r = ROLES[state.role];
      const note = a.note ? [{ by: r.user, role: r.label, at: new Date().toISOString(), text: `${a.status}: ${a.note}` }] : [];
      const applications = state.applications.map((x) => (x.id === a.id ? { ...x, status: a.status, notes: [...(x.notes || []), ...note] } : x));
      const verb = { 'In Review': 'Started verification of', Approved: 'Approved', Rejected: 'Rejected' }[a.status] || 'Updated';
      return withLog({ ...state, applications }, `${verb} application ${a.id}${a.note ? ` – ${a.note}` : ''}.`);
    }

    case 'disburse': {
      const app = state.applications.find((x) => x.id === a.id);
      const p = product(app.productId);
      const disbursedOn = isoToday();
      const loan = {
        id: ids.loan(nextNum(state.loans)),
        appId: app.id,
        customerId: app.customerId,
        productId: app.productId,
        principal: app.amount,
        ratePct: p.ratePct,
        method: p.method,
        months: app.months,
        disbursedOn,
        disburseMethod: a.method,
        schedule: buildSchedule({ principal: app.amount, ratePct: p.ratePct, months: app.months, method: p.method, firstDue: addMonths(disbursedOn, 1) }),
      };
      const applications = state.applications.map((x) => (x.id === a.id ? { ...x, status: 'Disbursed' } : x));
      return withLog(
        { ...state, applications, loans: [...state.loans, loan] },
        `Disbursed ${money(loan.principal)} to ${name(state, loan.customerId)} by ${a.method}; opened loan ${loan.id}.`
      );
    }

    case 'payment': {
      const pay = {
        id: ids.receipt(nextNum(state.payments)),
        loanId: a.loanId,
        amount: +a.amount,
        method: a.method,
        date: a.date || isoToday(),
        ref: a.ref || '',
        note: a.note || '',
        at: new Date().toISOString(),
        by: ROLES[state.role].user,
        verified: !!a.verified,
      };
      const loan = state.loans.find((l) => l.id === a.loanId);
      return withLog(
        { ...state, payments: [...state.payments, pay] },
        `Recorded ${a.method} payment of ${money(pay.amount)} on ${loan.id} (${name(state, loan.customerId)}), receipt ${pay.id}.`
      );
    }

    case 'collectLog': {
      const r = ROLES[state.role];
      const loan = state.loans.find((l) => l.id === a.loanId);
      const entry = {
        id: `COL-${String(state.collections.length + 1).padStart(3, '0')}`,
        loanId: a.loanId,
        action: a.action,
        note: a.note || '',
        promiseDate: a.promiseDate || null,
        at: new Date().toISOString(),
        by: r.user,
      };
      return withLog(
        { ...state, collections: [entry, ...state.collections] },
        `Collections: ${a.action.toLowerCase()} on ${a.loanId} (${name(state, loan.customerId)})${a.promiseDate ? `, promised ${a.promiseDate}` : ''}.`
      );
    }

    case 'penalty': {
      const pen = { id: `PEN-${String(state.penalties.length + 1).padStart(3, '0')}`, loanId: a.loanId, amount: +a.amount, method: a.method, date: a.date || isoToday(), ref: a.ref || '', at: new Date().toISOString(), by: ROLES[state.role].user };
      return withLog({ ...state, penalties: [...state.penalties, pen] }, `Collected late penalty of ${money(pen.amount)} on ${a.loanId} (${pen.id}).`);
    }

    case 'toggleRule': {
      const rule = NOTIFY_RULES.find((r) => r.id === a.id);
      // Policy enforcement: rules on a locked channel can never be switched on.
      if (!rule || CHANNEL_POLICY[rule.channel]?.locked) {
        return withLog(state, `Blocked attempt to enable "${rule?.name || a.id}" – ${rule?.channel} channel is locked by messaging policy.`);
      }
      const on = !state.rules[a.id];
      return withLog({ ...state, rules: { ...state.rules, [a.id]: on } }, `${on ? 'Enabled' : 'Paused'} notification rule "${rule.name}".`);
    }

    case 'verifyPayment': {
      const payments = state.payments.map((p) => (a.ids.includes(p.id) ? { ...p, verified: true } : p));
      return withLog({ ...state, payments }, `Reconciled ${a.ids.length === 1 ? `payment ${a.ids[0]}` : `${a.ids.length} payments`} against the statement.`);
    }

    case 'matchStatement': {
      const line = state.statement.find((s) => s.id === a.lineId);
      const loan = state.loans.find((l) => l.id === a.loanId);
      const pay = {
        id: ids.receipt(nextNum(state.payments)),
        loanId: loan.id,
        amount: line.amount,
        method: line.channel,
        date: line.date,
        ref: line.ref,
        note: `Matched from statement: ${line.narration}`,
        at: new Date().toISOString(),
        by: ROLES[state.role].user,
        verified: true,
      };
      return withLog(
        { ...state, payments: [...state.payments, pay], statement: state.statement.filter((s) => s.id !== a.lineId) },
        `Matched statement deposit ${line.ref} (${money(line.amount)}) to ${loan.id} – ${name(state, loan.customerId)}, receipt ${pay.id}.`
      );
    }

    case 'addTicket': {
      const t = {
        priority: 'Medium',
        description: '',
        assignedTo: ROLES[state.role].user,
        ...a.ticket,
        id: `${BRAND.prefix}-TCK-${String(state.tickets.length + 1).padStart(3, '0')}`,
        status: 'Open',
        createdAt: isoToday(),
        replies: [],
      };
      return withLog({ ...state, tickets: [t, ...state.tickets] }, `Opened support ticket ${t.id} for ${name(state, t.customerId)}: ${t.subject}.`);
    }

    case 'ticketStatus': {
      const tickets = state.tickets.map((t) => (t.id === a.id ? { ...t, status: a.status } : t));
      return withLog({ ...state, tickets }, `Marked ticket ${a.id} as ${a.status}.`);
    }

    case 'ticketUpdate': {
      const r = ROLES[state.role];
      const tickets = state.tickets.map((t) =>
        t.id === a.id
          ? {
              ...t,
              ...a.changes,
              replies: a.reply ? [...(t.replies || []), { by: r.user, at: new Date().toISOString(), text: a.reply }] : t.replies || [],
            }
          : t
      );
      const what = [a.changes?.status && `status ${a.changes.status}`, a.changes?.priority && `priority ${a.changes.priority}`, a.changes?.assignedTo && `assigned to ${a.changes.assignedTo}`, a.reply && 'added a reply']
        .filter(Boolean)
        .join(', ');
      return withLog({ ...state, tickets }, `Updated ticket ${a.id}: ${what || 'no changes'}.`);
    }

    default:
      return state;
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const derived = useMemo(() => {
    const today = isoToday();
    const loanInfo = Object.fromEntries(state.loans.map((l) => [l.id, summarize(l, state.payments, today)]));
    const customerName = (id) => name(state, id);
    const split = Object.assign({}, ...state.loans.map((l) => allocate(l, state.payments)));
    return { loanInfo, customerName, today, split };
  }, [state]);

  return <Ctx.Provider value={{ state, dispatch, ...derived }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
