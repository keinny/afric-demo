import { createClient } from '@supabase/supabase-js';
import { TABLES, fromRow, toRow } from './dbmap';

// Set these in .env.local (local) or as GitHub repository secrets (live site).
// Without them the app runs as a browser-only demo using localStorage.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const online = Boolean(url && anonKey);
export const supabase = online ? createClient(url, anonKey) : null;

/** Reads every table and returns data shaped like the app's state. */
export async function loadAll() {
  const out = {};
  for (const [key, table] of Object.entries(TABLES)) {
    let q = supabase.from(table).select('*');
    q = key === 'audit' || key === 'sms' ? q.order('at', { ascending: false }).limit(500) : q.order('id');
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out[key] = data.map(fromRow);
  }
  const rules = await supabase.from('notification_rules').select('*');
  if (rules.error) throw new Error(`notification_rules: ${rules.error.message}`);
  out.rules = Object.fromEntries(rules.data.map((r) => [r.id, r.enabled]));

  const settings = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
  if (settings.error) throw new Error(`settings: ${settings.error.message}`);
  if (settings.data) {
    const { id, ...rest } = fromRow(settings.data);
    out.settings = rest;
  }
  return out;
}

/**
 * Saves the difference between two app states to the database:
 * new or changed records are upserted, removed records deleted.
 * The audit log is append-only, so only new entries are inserted.
 */
export async function syncDiff(prev, next) {
  for (const [key, table] of Object.entries(TABLES)) {
    const a = prev[key] || [];
    const b = next[key] || [];
    if (a === b) continue;
    const before = new Map(a.map((r) => [r.id, JSON.stringify(r)]));
    const changed = b.filter((r) => before.get(r.id) !== JSON.stringify(r));
    if (changed.length) {
      const { error } =
        key === 'audit' || key === 'sms'
          ? await supabase.from(table).insert(changed.filter((r) => !before.has(r.id)).map(toRow))
          : await supabase.from(table).upsert(changed.map(toRow));
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    if (key !== 'audit' && key !== 'sms') {
      const keep = new Set(b.map((r) => r.id));
      const removed = a.filter((r) => !keep.has(r.id)).map((r) => r.id);
      if (removed.length) {
        const { error } = await supabase.from(table).delete().in('id', removed);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
    }
  }

  if (prev.rules !== next.rules && next.rules) {
    const rows = Object.entries(next.rules)
      .filter(([id, on]) => prev.rules?.[id] !== on)
      .map(([id, enabled]) => ({ id, enabled }));
    if (rows.length) {
      const { error } = await supabase.from('notification_rules').upsert(rows);
      if (error) throw new Error(`notification_rules: ${error.message}`);
    }
  }

  if (prev.settings !== next.settings && next.settings) {
    const { error } = await supabase.from('settings').upsert({ id: 1, ...toRow(next.settings) });
    if (error) throw new Error(`settings: ${error.message}`);
  }
}

/**
 * Asks the send-sms Edge Function to send queued SMS.
 * Returns [{id, status, provider, providerRef, error, sentAt}].
 */
export async function sendSms(ids) {
  const { data, error } = await supabase.functions.invoke('send-sms', { body: { ids } });
  if (error) throw new Error(error.message || 'SMS function not reachable');
  if (data?.error) throw new Error(data.error);
  return (data?.results || []).map(fromRow);
}
