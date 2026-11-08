// Mapping between the app's records (camelCase) and database rows (snake_case).
// Kept free of browser APIs so the seed script can use it in Node too.

// App state key → database table, in foreign-key order (parents first).
export const TABLES = {
  staff: 'staff',
  customers: 'customers',
  applications: 'applications',
  loans: 'loans',
  payments: 'payments',
  penalties: 'penalties',
  collections: 'collections',
  tickets: 'tickets',
  statement: 'statement_lines',
  audit: 'audit_log',
};

// Field names that are SQL keywords or read better renamed in the database.
const RENAME = { by: 'recorded_by', user: 'actor', text: 'description' };
const UNRENAME = Object.fromEntries(Object.entries(RENAME).map(([a, b]) => [b, a]));

export const toSnake = (k) => RENAME[k] || k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
export const toCamel = (k) => UNRENAME[k] || k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

const mapKeys = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [f(k), v]));

// Numeric columns come back from PostgREST as numbers or numeric strings – normalise to numbers.
const NUMERIC = new Set(['amount', 'income', 'principal', 'ratePct', 'penaltyPct']);

export const toRow = (record) => mapKeys(record, toSnake);
export const fromRow = (row) => {
  const r = mapKeys(row, toCamel);
  for (const k of Object.keys(r)) if (NUMERIC.has(k) && r[k] !== null && r[k] !== undefined) r[k] = Number(r[k]);
  return r;
};
