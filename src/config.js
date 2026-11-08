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
  'NRC / ID verified',
  'Proof of income',
  'Bank or mobile money statement',
  'Employer or business confirmed',
  'Credit reference check',
  'Collateral or guarantor confirmed',
];

export const PAY_METHODS = ['Mobile Money', 'Bank Transfer', 'Cash'];

export const APP_STATUSES = ['Submitted', 'In Review', 'Approved', 'Disbursed', 'Rejected'];
