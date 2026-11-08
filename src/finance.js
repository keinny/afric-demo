import { BRAND, LATE_PENALTY_PCT, PRODUCTS } from './config';

/** Late penalty still owed on a loan: % of the overdue amount, less penalties already paid. */
export function penaltyOwed(loanId, info, penalties = [], settings) {
  const pct = settings?.penaltyPct ?? LATE_PENALTY_PCT;
  const grace = settings?.graceDays ?? 0;
  if ((info?.daysLate || 0) <= grace) return 0; // still inside the grace period
  const charged = Math.round(((info?.overdueAmt || 0) * pct)) / 100;
  const paid = penalties.filter((p) => p.loanId === loanId).reduce((s, p) => s + p.amount, 0);
  return Math.max(0, Math.round((charged - paid) * 100) / 100);
}

const r2 = (n) => Math.round(n * 100) / 100;

export const money = (n) =>
  `${BRAND.currency} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const moneyShort = (n) =>
  Math.abs(n) >= 1000 ? `${BRAND.currency}${Math.round(n / 1000)}k` : `${BRAND.currency}${Math.round(n)}`;

export const isoToday = () => toIso(new Date());

export function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toIso(d);
}

export function addMonths(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toIso(d);
}

export const fmtDate = (iso) =>
  iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const monthKey = (iso) => iso.slice(0, 7);
export const monthLabel = (key) =>
  new Date(key + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

export const product = (id) => PRODUCTS.find((p) => p.id === id);

/** Repayment schedule. ratePct is monthly. method: 'flat' or 'reducing'. */
export function buildSchedule({ principal, ratePct, months, method, firstDue }) {
  const r = ratePct / 100;
  const rows = [];
  if (method === 'flat') {
    const interest = r2(principal * r);
    const princ = r2(principal / months);
    for (let i = 0; i < months; i++) {
      const p = i === months - 1 ? r2(principal - princ * (months - 1)) : princ;
      rows.push({ no: i + 1, due: addMonths(firstDue, i), principal: p, interest, total: r2(p + interest) });
    }
  } else {
    const emi = r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
    let bal = principal;
    for (let i = 0; i < months; i++) {
      const interest = r2(bal * r);
      let p = r2(emi - interest);
      if (i === months - 1) p = r2(bal);
      bal = r2(bal - p);
      rows.push({ no: i + 1, due: addMonths(firstDue, i), principal: p, interest, total: r2(p + interest) });
    }
  }
  return rows;
}

export function estimateInstallment(productId, amount, months) {
  const p = product(productId);
  if (!p || !amount || !months) return 0;
  const rows = buildSchedule({ principal: +amount, ratePct: p.ratePct, months: +months, method: p.method, firstDue: isoToday() });
  return rows[0]?.total || 0;
}

/** Splits each payment into interest and principal (interest first, instalment by instalment). */
export function allocate(loan, payments) {
  const pays = payments
    .filter((p) => p.loanId === loan.id)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const need = loan.schedule.flatMap((r) => [
    { type: 'interest', amt: r.interest },
    { type: 'principal', amt: r.principal },
  ]);
  let k = 0;
  let left = need[0]?.amt || 0;
  const out = {};
  for (const p of pays) {
    let amt = p.amount;
    let interest = 0;
    let principal = 0;
    while (amt > 0.004 && k < need.length) {
      const take = Math.min(amt, left);
      if (need[k].type === 'interest') interest += take;
      else principal += take;
      amt -= take;
      left -= take;
      if (left <= 0.004) {
        k++;
        left = need[k]?.amt || 0;
      }
    }
    if (amt > 0.004) principal += amt; // overpayment
    out[p.id] = { interest: r2(interest), principal: r2(principal) };
  }
  return out;
}

/** Applies payments to installments in order and works out balances and arrears. */
export function summarize(loan, payments, today = isoToday()) {
  const paid = payments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
  let left = paid;
  let principalPaid = 0;
  let overdueCount = 0;
  let overdueAmt = 0;
  let nextDue = null;
  let totalDue = 0;
  const rows = loan.schedule.map((r) => {
    totalDue += r.total;
    const applied = Math.min(left, r.total);
    left -= applied;
    principalPaid += Math.max(0, applied - r.interest);
    const remaining = r2(r.total - applied);
    let state = 'Due';
    if (remaining < 0.01) state = 'Paid';
    else if (r.due < today) state = 'Overdue';
    else if (applied > 0) state = 'Partial';
    if (state === 'Overdue') {
      overdueCount++;
      overdueAmt += remaining;
    }
    if (remaining >= 0.01 && r.due >= today && !nextDue) nextDue = { ...r, remaining };
    return { ...r, applied: r2(applied), remaining, state };
  });
  const balance = Math.max(0, r2(totalDue - paid));
  const status = balance < 0.01 ? 'Settled' : overdueCount ? 'Overdue' : 'Active';
  const daysLate = overdueCount
    ? Math.round((new Date(today) - new Date(rows.find((r) => r.state === 'Overdue').due)) / 86400000)
    : 0;
  return {
    paid: r2(paid),
    totalDue: r2(totalDue),
    balance,
    principalOutstanding: Math.max(0, r2(loan.principal - principalPaid)),
    overdueCount,
    overdueAmt: r2(overdueAmt),
    daysLate,
    nextDue,
    rows,
    status,
  };
}
