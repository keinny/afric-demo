// Supabase Edge Function: send-sms
// Sends queued rows from public.sms_outbox through the configured SMS provider
// and records the result. Provider keys live in Supabase secrets, never in the app.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   SMS_PROVIDER = test | twilio | africastalking | http      (default: test – nothing is sent)
//   twilio:          TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, optional TWILIO_FROM
//   africastalking:  AT_USERNAME, AT_API_KEY
//   http (any local provider / Zamtel):
//                    SMS_HTTP_URL, optional SMS_HTTP_METHOD (POST), SMS_HTTP_CONTENT_TYPE
//                    (application/json | application/x-www-form-urlencoded),
//                    SMS_HTTP_HEADERS (JSON object), SMS_HTTP_BODY (template)
//                    Template placeholders: {{to}} (+2609...), {{to_local}} (09...),
//                    {{to_digits}} (2609...), {{message}}, {{sender}}
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const env = (k: string) => Deno.env.get(k) ?? '';

/** Zambian numbers to +260XXXXXXXXX. */
function normalise(phone: string): string {
  let d = phone.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '260' + d.slice(1);
  if (d.length === 9) d = '260' + d;
  if (!/^260\d{9}$/.test(d)) throw new Error(`Not a valid Zambian mobile number: ${phone}`);
  return '+' + d;
}

type Sent = { provider: string; ref: string; test?: boolean };

async function sendSms(to: string, message: string, sender: string): Promise<Sent> {
  const provider = (env('SMS_PROVIDER') || 'test').toLowerCase();

  if (provider === 'test') {
    return { provider: 'test', ref: 'TEST-' + crypto.randomUUID().slice(0, 8), test: true };
  }

  if (provider === 'twilio') {
    const sid = env('TWILIO_ACCOUNT_SID');
    const token = env('TWILIO_AUTH_TOKEN');
    if (!sid || !token) throw new Error('Twilio secrets are missing');
    const body = new URLSearchParams({ To: to, From: env('TWILIO_FROM') || sender, Body: message });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${data.message ?? 'send failed'}`);
    return { provider, ref: data.sid ?? '' };
  }

  if (provider === 'africastalking') {
    const username = env('AT_USERNAME');
    const apiKey = env('AT_API_KEY');
    if (!username || !apiKey) throw new Error("Africa's Talking secrets are missing");
    const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const body = new URLSearchParams({ username, to, message, ...(sender ? { from: sender } : {}) });
    const res = await fetch(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json().catch(() => ({}));
    const r = data?.SMSMessageData?.Recipients?.[0];
    if (!res.ok || !r || !/success/i.test(r.status ?? '')) {
      throw new Error(`Africa's Talking: ${r?.status ?? data?.SMSMessageData?.Message ?? res.status}`);
    }
    return { provider, ref: r.messageId ?? '' };
  }

  if (provider === 'http') {
    const url = env('SMS_HTTP_URL');
    if (!url) throw new Error('SMS_HTTP_URL is missing');
    const type = env('SMS_HTTP_CONTENT_TYPE') || 'application/json';
    const isJson = type.includes('json');
    const local = '0' + to.slice(4);
    const fill = (s: string) =>
      s
        .replaceAll('{{to}}', to)
        .replaceAll('{{to_local}}', local)
        .replaceAll('{{to_digits}}', to.slice(1))
        .replaceAll('{{sender}}', sender)
        .replaceAll('{{message}}', isJson ? JSON.stringify(message).slice(1, -1) : encodeURIComponent(message));
    const tpl = env('SMS_HTTP_BODY') || (isJson ? '{"to":"{{to}}","message":"{{message}}","sender":"{{sender}}"}' : 'to={{to}}&message={{message}}&sender={{sender}}');
    let headers: Record<string, string> = {};
    try {
      headers = JSON.parse(env('SMS_HTTP_HEADERS') || '{}');
    } catch {
      throw new Error('SMS_HTTP_HEADERS is not valid JSON');
    }
    const method = (env('SMS_HTTP_METHOD') || 'POST').toUpperCase();
    const res = await fetch(method === 'GET' ? fill(url) : url, {
      method,
      headers: { 'Content-Type': type, ...headers },
      body: method === 'GET' ? undefined : fill(tpl),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Provider HTTP ${res.status}: ${text.slice(0, 200)}`);
    return { provider: 'http', ref: text.slice(0, 120) };
  }

  throw new Error(`Unknown SMS_PROVIDER "${provider}"`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const url = env('SUPABASE_URL');
  // Only signed-in, active staff may trigger sending.
  const asUser = createClient(url, env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: isStaff, error: authErr } = await asUser.rpc('is_staff');
  if (authErr || !isStaff) return json({ error: 'Not allowed' }, 403);

  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'));
  const { ids } = await req.json().catch(() => ({ ids: [] }));
  if (!Array.isArray(ids) || !ids.length) return json({ results: [] });

  const { data: rows, error } = await admin.from('sms_outbox').select('*').in('id', ids.slice(0, 200)).in('status', ['queued', 'failed']);
  if (error) return json({ error: error.message }, 500);
  const { data: settings } = await admin.from('settings').select('sms_sender').eq('id', 1).maybeSingle();
  const sender = settings?.sms_sender || 'AFRICO';

  const results = [];
  for (const row of rows ?? []) {
    let update: Record<string, unknown>;
    if (row.rule_id === 'whatsapp') {
      update = { status: 'blocked', error: 'WhatsApp is locked by messaging policy' };
    } else {
      try {
        const sent = await sendSms(normalise(row.phone), row.message, sender);
        update = { status: 'sent', provider: sent.provider, provider_ref: sent.ref, error: sent.test ? 'Test mode – not delivered' : null, sent_at: new Date().toISOString() };
      } catch (e) {
        update = { status: 'failed', provider: env('SMS_PROVIDER') || 'test', error: String((e as Error).message ?? e).slice(0, 300) };
      }
    }
    await admin.from('sms_outbox').update(update).eq('id', row.id);
    results.push({ id: row.id, ...update });
  }
  return json({ results });
});
