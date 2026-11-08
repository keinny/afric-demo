import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { ROLES } from './config';
import { addMonths, allocate, buildSchedule, isoToday, money, product, summarize } from './finance';
import { ids, makeSeed } from './seed';

const KEY = 'afric-demo-v3';
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
      const pay = { id: ids.receipt(nextNum(state.payments)), loanId: a.loanId, amount: +a.amount, method: a.method, date: a.date || isoToday(), by: ROLES[state.role].user };
      const loan = state.loans.find((l) => l.id === a.loanId);
      return withLog(
        { ...state, payments: [...state.payments, pay] },
        `Recorded ${a.method} payment of ${money(pay.amount)} on ${loan.id} (${name(state, loan.customerId)}), receipt ${pay.id}.`
      );
    }

    case 'addTicket': {
      const t = { ...a.ticket, id: `TCK-${String(state.tickets.length + 1).padStart(3, '0')}`, status: 'Open', createdAt: isoToday() };
      return withLog({ ...state, tickets: [t, ...state.tickets] }, `Opened support ticket ${t.id} for ${name(state, t.customerId)}: ${t.subject}.`);
    }

    case 'ticketStatus': {
      const tickets = state.tickets.map((t) => (t.id === a.id ? { ...t, status: a.status } : t));
      return withLog({ ...state, tickets }, `Marked ticket ${a.id} as ${a.status}.`);
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
