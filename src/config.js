// Change these to rebrand the demo.
export const BRAND = {
  name: 'Afric Demo Lending',
  tagline: 'Loan operations & portfolio overview',
  prefix: 'AFD', // used in application / loan / receipt numbers
  currency: 'K',
};

// Monthly interest rate (%), repayment method and limits per product.
export const PRODUCTS = [
  { id: 'SAL', name: 'Salary Advance', ratePct: 5, method: 'flat', maxMonths: 6, min: 1000, max: 30000 },
  { id: 'SME', name: 'SME Working Capital', ratePct: 4, method: 'reducing', maxMonths: 12, min: 5000, max: 150000 },
  { id: 'AST', name: 'Asset Finance', ratePct: 3, method: 'reducing', maxMonths: 24, min: 10000, max: 250000 },
];

// Who can do what. Switch roles from the top bar to try each one.
export const ROLES = {
  admin: { label: 'Administrator', user: 'Grace Tembo', can: ['*'] },
  officer: { label: 'Loan Officer', user: 'Peter Lungu', can: ['customer', 'apply'] },
  verifier: { label: 'Verification Officer', user: 'Ruth Sakala', can: ['verify'] },
  manager: { label: 'Credit Manager', user: 'Joseph Mbewe', can: ['decide'] },
  finance: { label: 'Finance Officer', user: 'Mary Chirwa', can: ['disburse', 'payment'] },
};

export const can = (role, perm) => {
  const c = ROLES[role]?.can || [];
  return c.includes('*') || c.includes(perm);
};

export const CHECKLIST = [
  { label: 'Identity document checked', hint: 'Original NRC seen and copied' },
  { label: 'Identity details confirmed', hint: 'Name and NRC number match records' },
  { label: 'Address confirmed', hint: 'Utility bill or landlord letter on file' },
  { label: 'Income confirmed', hint: 'Payslips or business records reviewed' },
  { label: 'Bank or mobile money statement', hint: 'Last 3 months reviewed' },
  { label: 'Credit reference check', hint: 'No unpaid arrears with other lenders' },
];

export const PAY_METHODS = ['Mobile Money', 'Bank Transfer', 'Cash'];

// Late penalty charged on an overdue instalment (% of the amount still due).
export const LATE_PENALTY_PCT = 5;

export const COLLECTION_ACTIONS = ['Phone call', 'SMS reminder', 'Field visit', 'Promise to pay', 'Payment collected'];

// One palette for every chart, taken from the sidebar navy and brand teal.
export const CHART = {
  navy: '#0b1f24',
  teal: '#0f766e',
  mid: '#14b8a6',
  light: '#5eead4',
  pale: '#ccfbf1',
  grey: '#cbd5e1',
  axis: '#64748b',
  grid: '#e2e8f0',
};

export const APP_STATUSES = ['Submitted', 'In Review', 'Approved', 'Disbursed', 'Rejected'];
