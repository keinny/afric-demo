import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { loadAll, online, sendSms, supabase, syncDiff } from './db';
import { smsAllowed, smsId, smsText } from './sms';
import { BRAND, CHANNEL_POLICY, DEPARTMENTS, NOTIFY_RULES, ROLES } from './config';
import { addMonths, allocate, buildSchedule, fmtDate, isoToday, money, product, summarize } from './finance';
import { ids, makeSeed } from './seed';

const KEY = 'afric-demo-v11';
const Ctx = createContext(null);

function load() {
  const seed = makeSeed();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // fill in any section added in a newer version of the demo (e.g. settings, staff)
      for (const k of Object.keys(seed)) if (saved[k] === undefined) saved[k] = seed[k];
      saved.settings = { ...seed.settings, ...saved.settings }; // new settings fields get their defaults
      return saved;
    }
  } catch {}
  return seed;
}

const nextNum = (list) => list.length + 1;
const name = (state, customerId) => state.customers.find((c) => c.id === customerId)?.name || customerId;

// Name recorded on actions: the signed-in staff member (database mode) or the demo role's sample user.
const actorName = (state) => state.actor?.name || ROLES[state.role].user;

/**
 * Adds an SMS to the outbox (provider-neutral). Automatic messages respect the
 * notification rules; `force` is used for manual sends (reminders, test).
 * Database mode: status 'queued' → the send-sms Edge Function delivers it.
 * Demo mode: status 'simulated' – nothing leaves the browser.
 */
function withSms(state, ruleId, { customerId, loanId, phone, vars = {}, message, force = false }) {
  if (!smsAllowed() || ruleId === 'whatsapp') return state;
  if (!force && !state.rules?.[ruleId]) return state;
  const cust = customerId ? state.customers.find((c) => c.id === customerId) : null;
  const to = phone || cust?.phone;
  if (!to) return state;
  const text = message || smsText(ruleId, { first: cust?.name?.split(' ')[0] || 'Customer', ...vars });
  const rec = {
    id: smsId(),
    at: new Date().toISOString(),
    customerId: customerId || null,
    loanId: loanId || null,
    phone: to,
    ruleId,
    message: text.slice(0, 480),
    status: online ? 'queued' : 'simulated',
    provider: online ? null : 'demo',
    providerRef: null,
    error: null,
    sentAt: null,
    by: actorName(state),
  };
  return { ...state, sms: [rec, ...(state.sms || [])].slice(0, 500) };
}

function withLog(state, text) {
  const r = ROLES[state.role];
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), user: actorName(state), role: r.label, text };
  return { ...state, audit: [entry, ...state.audit].slice(0, 500) };
}

function reducer(state, a) {
  switch (a.type) {
    case 'role':
      return withLog({ ...state, role: a.role }, `Switched to ${ROLES[a.role].label} view.`);

    case 'reset':
      return online ? state : makeSeed(); // never wipe the shared database from the app

    case 'hydrate':
      return a.state;

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
        assignedTo: actorName(state),
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
      const note = { by: actorName(state), role: r.label, at: new Date().toISOString(), text: a.text };
      const applications = state.applications.map((x) => (x.id === a.id ? { ...x, notes: [...(x.notes || []), note] } : x));
      return withLog({ ...state, applications }, `Added review note on ${a.id}.`);
    }

    case 'status': {
      const r = ROLES[state.role];
      const note = a.note ? [{ by: actorName(state), role: r.label, at: new Date().toISOString(), text: `${a.status}: ${a.note}` }] : [];
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
      const next = withLog(
        { ...state, applications, loans: [...state.loans, loan] },
        `Disbursed ${money(loan.principal)} to ${name(state, loan.customerId)} by ${a.method}; opened loan ${loan.id}.`
      );
      return withSms(next, 'disbursement', {
        customerId: loan.customerId,
        loanId: loan.id,
        vars: { loan: loan.id, amount: money(loan.principal), method: a.method, due: fmtDate(loan.schedule[0].due) },
      });
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
        by: actorName(state),
        verified: !!a.verified,
      };
      const loan = state.loans.find((l) => l.id === a.loanId);
      const payments = [...state.payments, pay];
      const next = withLog(
        { ...state, payments },
        `Recorded ${a.method} payment of ${money(pay.amount)} on ${loan.id} (${name(state, loan.customerId)}), receipt ${pay.id}.`
      );
      return withSms(next, 'payment', {
        customerId: loan.customerId,
        loanId: loan.id,
        vars: { loan: loan.id, amount: money(pay.amount), receipt: pay.id, balance: money(summarize(loan, payments).balance) },
      });
    }

    case 'queueSms': {
      // a.items: [{ ruleId, customerId?, loanId?, phone?, vars?, message? }]
      let next = state;
      for (const it of a.items) next = withSms(next, it.ruleId, { ...it, force: true });
      const added = next.sms.length - (state.sms || []).length;
      return added ? withLog(next, `Queued ${added} SMS (${a.items[0].ruleId}${a.items.length > 1 ? ' …' : ''}).`) : state;
    }

    case 'smsResult': {
      const byId = Object.fromEntries(a.results.map((r) => [r.id, r]));
      const sms = (state.sms || []).map((s) => (byId[s.id] ? { ...s, ...byId[s.id] } : s));
      return { ...state, sms };
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
        by: actorName(state),
      };
      return withLog(
        { ...state, collections: [entry, ...state.collections] },
        `Collections: ${a.action.toLowerCase()} on ${a.loanId} (${name(state, loan.customerId)})${a.promiseDate ? `, promised ${a.promiseDate}` : ''}.`
      );
    }

    case 'penalty': {
      const pen = { id: `PEN-${String(state.penalties.length + 1).padStart(3, '0')}`, loanId: a.loanId, amount: +a.amount, method: a.method, date: a.date || isoToday(), ref: a.ref || '', at: new Date().toISOString(), by: actorName(state) };
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
        by: actorName(state),
        verified: true,
      };
      return withLog(
        { ...state, payments: [...state.payments, pay], statement: state.statement.filter((s) => s.id !== a.lineId) },
        `Matched statement deposit ${line.ref} (${money(line.amount)}) to ${loan.id} – ${name(state, loan.customerId)}, receipt ${pay.id}.`
      );
    }

    case 'updateSettings': {
      const changed = Object.keys(a.settings).filter((k) => String(a.settings[k]) !== String(state.settings?.[k]));
      if (!changed.length) return state;
      return withLog({ ...state, settings: { ...state.settings, ...a.settings } }, `Updated system settings: ${changed.join(', ')}.`);
    }

    case 'addStaff': {
      const dept = DEPARTMENTS.find((d) => d.name === a.staff.department) || DEPARTMENTS[0];
      const s = {
        ...a.staff,
        id: `${BRAND.prefix}-${dept.code}-${String(state.staff.length + 1).padStart(2, '0')}`,
        joined: isoToday(),
      };
      return withLog({ ...state, staff: [...state.staff, s] }, `Created staff profile ${s.id} for ${s.name} (${ROLES[s.roleKey].label}, ${s.department}).`);
    }

    case 'updateStaff': {
      const staff = state.staff.map((s) => (s.id === a.id ? { ...s, ...a.changes } : s));
      const s = staff.find((x) => x.id === a.id);
      return withLog({ ...state, staff }, `Updated staff profile ${s.id} (${s.name}).`);
    }

    case 'toggleStaff': {
      const target = state.staff.find((s) => s.id === a.id);
      if (target.roleKey === 'admin' && target.active && state.staff.filter((s) => s.roleKey === 'admin' && s.active).length === 1) {
        return withLog(state, `Blocked deactivation of ${target.id} – at least one active Super Admin is required.`);
      }
      const staff = state.staff.map((s) => (s.id === a.id ? { ...s, active: !s.active } : s));
      return withLog({ ...state, staff }, `${target.active ? 'Deactivated' : 'Re-activated'} staff account ${target.id} (${target.name}).`);
    }

    case 'addTicket': {
      const t = {
        priority: 'Medium',
        description: '',
        assignedTo: actorName(state),
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
              replies: a.reply ? [...(t.replies || []), { by: actorName(state), at: new Date().toISOString(), text: a.reply }] : t.replies || [],
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

/** Empty shell used while the database is loading. */
const emptyState = () => {
  const s = makeSeed();
  return { ...s, customers: [], applications: [], loans: [], payments: [], audit: [], tickets: [], collections: [], penalties: [], statement: [], staff: [], rules: {}, sms: [] };
};

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, online ? emptyState : load);
  // boot: 'ready' (demo or loaded) | 'checking' | 'login' | 'loading' | 'nostaff' | 'error'
  const [boot, setBoot] = useState(online ? 'checking' : 'ready');
  const [me, setMe] = useState(null); // signed-in staff record (database mode)
  const [bootError, setBootError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [saving, setSaving] = useState(false);
  const synced = useRef(null); // last state known to be in the database
  const queue = useRef(Promise.resolve());

  // ---- demo mode: keep data in this browser ----
  useEffect(() => {
    if (online) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  // ---- database mode: sign-in, load, then save every change ----
  const loadFor = useCallback(async (session) => {
    setBoot('loading');
    try {
      const data = await loadAll();
      const email = session.user.email?.toLowerCase();
      const staff = data.staff.find((s) => s.email?.toLowerCase() === email && s.active);
      if (!staff) {
        setMe({ email: session.user.email });
        setBoot('nostaff');
        return;
      }
      const base = emptyState();
      const next = { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) }, role: staff.roleKey, actor: { name: staff.name } };
      synced.current = next;
      dispatch({ type: 'hydrate', state: next });
      setMe(staff);
      setBoot('ready');
    } catch (e) {
      setBootError(e.message);
      setBoot('error');
    }
  }, []);

  useEffect(() => {
    if (!online) return;
    supabase.auth.getSession().then(({ data }) => (data.session ? loadFor(data.session) : setBoot('login')));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) loadFor(session);
      if (event === 'SIGNED_OUT') {
        setMe(null);
        synced.current = null;
        dispatch({ type: 'hydrate', state: emptyState() });
        setBoot('login');
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadFor]);

  useEffect(() => {
    if (!online || boot !== 'ready' || !synced.current || synced.current === state) return;
    const prev = synced.current;
    synced.current = state;
    setSaving(true);
    queue.current = queue.current
      .then(() => syncDiff(prev, state))
      .then(async () => {
        setSyncError('');
        // SMS that were just queued and are now saved: ask the Edge Function to send them.
        const before = new Set((prev.sms || []).map((s) => s.id));
        const fresh = (state.sms || []).filter((s) => !before.has(s.id) && s.status === 'queued').map((s) => s.id);
        if (fresh.length) await deliver(fresh);
      })
      .catch((e) => setSyncError(e.message))
      .finally(() => setSaving(false));
  }, [state, boot]);

  // Sends (or re-sends) SMS through the Edge Function and records the results locally.
  const deliver = async (ids) => {
    try {
      const results = await sendSms(ids);
      if (results.length) dispatch({ type: 'smsResult', results });
    } catch (e) {
      const at = new Date().toISOString();
      dispatch({ type: 'smsResult', results: ids.map((id) => ({ id, status: 'failed', error: `Not sent: ${e.message}`, sentAt: null, at })) });
    }
  };
  const retrySms = (ids) => (online ? deliver(ids) : Promise.resolve());

  const signOut = () => online && supabase.auth.signOut();
  const reloadFromDb = async () => {
    if (!online) return;
    const { data } = await supabase.auth.getSession();
    if (data.session) await loadFor(data.session);
  };

  const derived = useMemo(() => {
    const today = isoToday();
    const loanInfo = Object.fromEntries(state.loans.map((l) => [l.id, summarize(l, state.payments, today)]));
    const customerName = (id) => name(state, id);
    const split = Object.assign({}, ...state.loans.map((l) => allocate(l, state.payments)));
    return { loanInfo, customerName, today, split };
  }, [state]);

  const value = { state, dispatch, ...derived, online, me, boot, bootError, saving, syncError, signOut, reloadFromDb, retrySms };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
