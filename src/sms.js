// Provider-neutral SMS helpers. Messages are kept under 160 characters (one SMS segment)
// where possible, because providers charge per segment.
import { BRAND, CHANNEL_POLICY } from './config';

export const SMS_TEMPLATES = {
  disbursement: 'Dear {first}, your loan {loan} of {amount} has been paid out by {method}. First payment due {due}. {brand}',
  payment: 'Dear {first}, we received {amount} for loan {loan}. Receipt {receipt}. Balance {balance}. Thank you. {brand}',
  upcoming: 'Dear {first}, reminder: {amount} for loan {loan} is due on {due}. Please pay on time to avoid a late fee. {brand}',
  overdue: 'Dear {first}, your payment of {amount} for loan {loan} was due {due} and is overdue. Please pay or call us today. {brand}',
  test: 'Test message from {brand}. If you received this, SMS is working.',
};

export const SMS_RULE_LABELS = {
  disbursement: 'Loan disbursed',
  payment: 'Payment received',
  upcoming: 'Upcoming reminder',
  overdue: 'Overdue notice',
  test: 'Test message',
};

const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
export const smsText = (ruleId, vars) => fill(SMS_TEMPLATES[ruleId] || '{message}', { brand: BRAND.short, ...vars });

/** Number of SMS segments a message uses (GSM 160/153, Unicode 70/67). */
export function segments(text) {
  const unicode = /[^\x00-\x7F£€¥èéùìòÇØøÅå]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

export const smsId = () => `SMS-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

/** SMS may only go out when the SMS channel is allowed. WhatsApp is never used. */
export const smsAllowed = () => CHANNEL_POLICY.SMS?.enabled === true;
