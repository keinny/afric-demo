import { BRAND, CHECKLIST, PAY_METHODS, ROLES } from './config';
import { addDays, addMonths, buildSchedule, isoToday, product } from './finance';

const pad = (n, w = 3) => String(n).padStart(w, '0');
export const ids = {
  customer: (n) => `CUS-${pad(n)}`,
  app: (n) => `${BRAND.prefix}-APP-${pad(n)}`,
  loan: (n) => `${BRAND.prefix}-LN-${pad(n)}`,
  receipt: (n) => `RCP-${pad(n, 4)}`,
};

const CUSTOMERS = [
  ['Chipo Mumba', 'Lusaka', 'Ministry of Health', 'Salaried'],
  ['Daniel Kabwe', 'Ndola', 'Kabwe Hardware', 'Business'],
  ['Esther Phiri', 'Lusaka', 'Zed Schools Trust', 'Salaried'],
  ['Moses Banda', 'Kitwe', 'Copperbelt Mining Services', 'Salaried'],
  ['Naomi Zulu', 'Lusaka', 'Naomi Catering', 'Business'],
  ['Brian Mwale', 'Kabwe', 'Mwale Farms', 'Business'],
  ['Alice Chanda', 'Livingstone', 'Falls Lodge', 'Salaried'],
  ['Samuel Ngoma', 'Chipata', 'Eastern Agro Supplies', 'Business'],
  ['Ruth Musonda', 'Lusaka', 'City Clinic', 'Salaried'],
  ['Victor Simukonda', 'Solwezi', 'North-West Transport', 'Business'],
];

// [customer, product, amount, months, status, daysAgoCreated, missedInstallments]
const APPS = [
  [0, 'SAL', 15000, 6, 'Disbursed', 200, 0],
  [1, 'SME', 60000, 12, 'Disbursed', 185, 0],
  [2, 'SAL', 8000, 4, 'Disbursed', 170, 0],
  [3, 'SAL', 20000, 6, 'Disbursed', 150, 2],
  [4, 'SME', 25000, 9, 'Disbursed', 130, 1],
  [5, 'AST', 120000, 18, 'Disbursed', 110, 0],
  [6, 'SAL', 10000, 5, 'Disbursed', 80, 0],
  [7, 'SME', 40000, 10, 'Disbursed', 45, 0],
  [8, 'SAL', 6000, 3, 'Approved', 6, 0],
  [9, 'AST', 90000, 24, 'In Review', 4, 0],
  [2, 'SAL', 5000, 3, 'Submitted', 2, 0],
  [6, 'SME', 30000, 12, 'Submitted', 1, 0],
  [3, 'SAL', 12000, 6, 'Rejected', 60, 0],
];

export function makeSeed() {
  const today = isoToday();
  const customers = CUSTOMERS.map(([name, town, employer, type], i) => ({
    id: ids.customer(i + 1),
    name,
    phone: `+260 97${pad(1000000 + i * 734521, 7).slice(-7)}`,
    nrc: `${pad(100000 + i * 37719, 6)}/${10 + i}/1`,
    town,
    employer,
    type,
    joined: addDays(today, -(i < 8 ? 260 - i * 25 : 30 - (i - 8) * 20)),
  }));

  const applications = [];
  const loans = [];
  const payments = [];
  let receipt = 1;

  APPS.forEach(([ci, pid, amount, months, status, ago, missed], i) => {
    const created = addDays(today, -ago);
    const done = ['Approved', 'Disbursed', 'Rejected'].includes(status);
    const noteAt = (d, t) => `${addDays(created, d)}T${t}:00`;
    const notes = [];
    if (status === 'In Review')
      notes.push({ by: ROLES.verifier.user, role: ROLES.verifier.label, at: noteAt(1, '10:15'), text: 'Waiting for bank statement and credit reference report.' });
    if (['Approved', 'Disbursed'].includes(status))
      notes.push({ by: ROLES.manager.user, role: ROLES.manager.label, at: noteAt(2, '11:00'), text: 'Approved – income comfortably covers the instalment and all checks passed.' });
    if (status === 'Rejected')
      notes.push({ by: ROLES.manager.user, role: ROLES.manager.label, at: noteAt(2, '15:30'), text: 'Declined – customer has unpaid arrears with another lender.' });

    const app = {
      id: ids.app(i + 1),
      customerId: customers[ci].id,
      productId: pid,
      amount,
      months,
      income: 6000 + Math.round(((ci * 3571) % 20000) / 500) * 500,
      purpose: [
        'School fees and household costs',
        'Restocking shop inventory',
        'Medical bills',
        'Home repairs',
        'Buying catering equipment',
        'Purchase of a delivery truck',
        'Rent deposit for new house',
        'Fertiliser and seed for the season',
        'Emergency travel costs',
        'Second-hand minibus for transport business',
        'Furniture for new home',
        'Expanding market stall',
        'Personal expenses',
      ][i],
      assignedTo: ROLES.officer.user,
      status,
      createdAt: created,
      checklist: CHECKLIST.map((_, k) => done || (status === 'In Review' && k < 4)),
      notes,
    };
    applications.push(app);

    if (status === 'Disbursed') {
      const p = product(pid);
      const disbursedOn = addDays(created, 3);
      const loan = {
        id: ids.loan(loans.length + 1),
        appId: app.id,
        customerId: app.customerId,
        productId: pid,
        principal: amount,
        ratePct: p.ratePct,
        method: p.method,
        months,
        disbursedOn,
        disburseMethod: i % 2 ? 'Bank Transfer' : 'Mobile Money',
        schedule: buildSchedule({ principal: amount, ratePct: p.ratePct, months, method: p.method, firstDue: addMonths(disbursedOn, 1) }),
      };
      loans.push(loan);
      const pastDue = loan.schedule.filter((r) => r.due < today);
      pastDue.forEach((r, k) => {
        if (k >= pastDue.length - missed) return;
        payments.push({
          id: ids.receipt(receipt++),
          loanId: loan.id,
          amount: r.total,
          method: PAY_METHODS[(i + k) % 2],
          date: addDays(r.due, -((i + k) % 3)),
          by: ROLES.finance.user,
        });
      });
    }
  });

  payments.sort((a, b) => a.date.localeCompare(b.date));
  payments.forEach((p, i) => {
    p.id = ids.receipt(i + 1);
    p.ref = `TXN-${100000 + ((i + 1) * 74923) % 900000}`;
    p.at = `${p.date}T${String(8 + (i % 9)).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}:00`;
    p.verified = i < payments.length - 2; // the two newest are still waiting for reconciliation
  });

  // Deposits seen on the bank / mobile money statement that nobody has matched to a loan yet.
  const statement = [
    { id: 'STM-001', channel: 'Mobile Money', ref: 'MP261104.1532.K44817', amount: 2500, date: addDays(today, -4), narration: 'Deposit from 0977 *** 412' },
    { id: 'STM-002', channel: 'Bank Transfer', ref: 'FT26310KZ9Q1', amount: 4500, date: addDays(today, -2), narration: 'EFT credit – "LOAN REPAYMENT"' },
  ];

  const at = (d, t) => `${addDays(today, -d)}T${t}:00`;
  const audit = [
    { at: at(0, '08:05'), who: 'admin', text: 'Logged in to the demo environment.' },
    { at: at(1, '09:20'), who: 'officer', text: `Captured application ${ids.app(12)} for ${customers[6].name}.` },
    { at: at(2, '10:40'), who: 'officer', text: `Captured application ${ids.app(11)} for ${customers[2].name}.` },
    { at: at(3, '14:10'), who: 'verifier', text: `Started verification of ${ids.app(10)}; 4 of 6 checks complete.` },
    { at: at(5, '11:30'), who: 'manager', text: `Approved ${ids.app(9)} for ${customers[8].name}.` },
    { at: at(6, '15:45'), who: 'finance', text: 'Posted month-end collections to the ledger.' },
  ].map((a, i) => ({ id: `seed-${i}`, at: a.at, user: ROLES[a.who].user, role: ROLES[a.who].label, text: a.text }));

  const tickets = [
    [3, 'Request for a 14-day extension on next instalment due to medical bills', 'Repayment', 'In Progress', 'High', 5, 'Customer was hospitalised last month and asks to move the next instalment by two weeks.'],
    [1, 'Official account statement needed for bank application', 'Account Statement', 'Open', 'Medium', 1, 'Needs a stamped statement for loan AFD-LN-002 showing all payments to date.'],
    [0, 'Confirm date of final payment and clearance letter', 'Enquiry', 'Resolved', 'Low', 9, 'Wants to know when the loan will be fully paid and how to get a clearance letter.'],
    [4, 'Mobile money payment not showing on account', 'Payment', 'In Progress', 'High', 3, 'Paid by Airtel Money on Monday but the balance has not changed.'],
    [9, 'Guidance on uploading a clearer NRC scan', 'Loan Application', 'Open', 'Low', 2, 'First NRC photo was blurry; customer asks how to resend it.'],
  ].map(([ci, subject, category, status, priority, ago, description], i) => ({
    id: `${BRAND.prefix}-TCK-${pad(i + 1)}`,
    customerId: customers[ci].id,
    subject,
    category,
    status,
    priority,
    description,
    assignedTo: i % 2 ? ROLES.officer.user : ROLES.finance.user,
    createdAt: addDays(today, -ago),
    replies: status === 'Resolved'
      ? [{ by: ROLES.officer.user, at: `${addDays(today, -8)}T11:20:00`, text: 'Final payment is due next month. Clearance letter will be emailed once it clears.' }]
      : status === 'In Progress'
        ? [{ by: i % 2 ? ROLES.officer.user : ROLES.finance.user, at: `${addDays(today, -ago + 1)}T10:05:00`, text: 'Looking into this and will call the customer back today.' }]
        : [],
  }));

  // A few collection activities on the loans that are behind.
  const collections = [
    [3, 'Phone call', 'Customer says salary was delayed this month.', 6, null],
    [3, 'Promise to pay', 'Will pay one instalment on Friday.', 4, 3],
    [4, 'SMS reminder', 'Automatic reminder sent.', 5, null],
    [4, 'Field visit', 'Visited shop – owner away, left notice.', 2, null],
  ].map(([li, action, note, ago, promiseIn], i) => ({
    id: `COL-${pad(i + 1)}`,
    loanId: loans[li]?.id,
    action,
    note,
    at: `${addDays(today, -ago)}T10:30:00`,
    promiseDate: promiseIn ? addDays(today, promiseIn - ago) : null,
    by: ROLES.finance.user,
  })).filter((c) => c.loanId);

  const rules = { disbursement: true, payment: true, confirmation: true, upcoming: true, overdue: true, approved: true, whatsapp: false };

  const staff = [
    ['admin', 'Executive', 'Managing Director & Super Admin', 640],
    ['manager', 'Operations', 'Head of Credit & Operations', 600],
    ['officer', 'Loan Origination', 'Senior Loan Officer', 500],
    ['verifier', 'Risk & Verification', 'Lead KYC Verification Officer', 480],
    ['finance', 'Finance', 'Senior Finance Officer & Cashier', 540],
    ['support', 'Customer Service', 'Customer Relationship Officer', 420],
    ['analyst', 'Analytics', 'Portfolio & Risk Analyst', 360],
  ].map(([roleKey, department, designation, ago], i) => {
    const name = ROLES[roleKey].user;
    const code = { Executive: 'ADM', Operations: 'MGR', 'Loan Origination': 'LO', 'Risk & Verification': 'VER', Finance: 'FIN', 'Customer Service': 'CS', Analytics: 'ANL' }[department];
    return {
      id: `${BRAND.prefix}-${code}-${String(i + 1).padStart(2, '0')}`,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@africo.demo`,
      phone: `+260 97 100 ${pad(i + 1, 4)}`,
      department,
      designation,
      roleKey,
      joined: addDays(today, -ago),
      active: true,
    };
  });

  const settings = {
    clientName: BRAND.legal,
    representative: 'Titus Katepu',
    developer: 'Pragma Systems OPC Private Limited',
    currencyCode: 'ZMW',
    symbol: 'K',
    country: 'Zambia',
    timezone: 'Africa/Lusaka',
    graceDays: 3,
    penaltyPct: 5,
    smsSender: 'AFRICO',
  };

  return { role: 'admin', customers, applications, loans, payments, audit, tickets, collections, penalties: [], statement, rules, staff, settings, sms: [] };
}
