const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://unit-test.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
process.env.ADMIN_EMAIL = 'owner@example.com';
process.env.VERCEL = '1';

const tables = { admin_sessions: [], login_events: [], leads: [], events: [], consent_events: [], chat_config: [] };
const userId = '11111111-1111-4111-8111-111111111111';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const empty = () => new Response(null, { status: 204 });

global.fetch = async (url, options = {}) => {
  const u = new URL(url), method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : {};
  if (u.pathname === '/auth/v1/token') {
    return body.email === 'owner@example.com' && body.password === 'correct-password-123'
      ? json({ user: { id: userId, email: body.email } }) : json({ error: 'invalid' }, 400);
  }
  if (u.pathname.startsWith('/auth/v1/admin/users/')) return json({ user: { id: userId } });
  const name = u.pathname.replace('/rest/v1/', '');
  if (name === 'rpc/rate_limit_hit') return json(true);
  if (name === 'rpc/dashboard_stats') return json({ leads_total: tables.leads.length, events_total: tables.events.length,
    visits_total: tables.events.filter(x => x.type === 'visit').length, cta_clicks: 0, unique_visitors: 1,
    logins_total: tables.login_events.filter(x => x.success).length,
    login_events_total: tables.login_events.length, failed_logins: 0,
    consent_events_total: tables.consent_events.length, consent_accepts: 1, consent_declines: 0 });
  if (name === 'rpc/clear_dashboard_data') {
    for (const key of ['leads', 'events', 'consent_events']) tables[key] = [];
    return empty();
  }
  const table = tables[name];
  if (!table) throw new Error('Unexpected mock route ' + name);
  if (method === 'POST') { table.push({ id: table.length + 1, ...body }); return empty(); }
  if (method === 'DELETE') {
    if (name === 'admin_sessions' && u.searchParams.has('token_hash')) {
      const filter = u.searchParams.get('token_hash');
      tables[name] = table.filter(x => filter.startsWith('neq.') ? x.token_hash === filter.slice(4) : x.token_hash !== filter.slice(3));
    }
    return empty();
  }
  let rows = [...table];
  if (name === 'admin_sessions') rows = rows.filter(x => x.token_hash === u.searchParams.get('token_hash')?.slice(3));
  if (name === 'chat_config') rows = rows.filter(x => x.id === 1);
  rows.sort((a, b) => (b.id || 0) - (a.id || 0));
  const offset = Number(u.searchParams.get('offset') || 0), limit = Number(u.searchParams.get('limit') || rows.length);
  return json(rows.slice(offset, offset + limit));
};

const handler = require('../api/index');

async function call(route, method = 'GET', body = null, cookie = '', csrf = '', bearer = '', origin = 'https://legalflora.test') {
  const headers = { host: 'legalflora.test', origin, cookie,
    ...(method === 'POST' ? { 'content-type': 'application/json', 'x-csrf-token': csrf } : {}),
    ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) };
  const req = { method, headers, body, query: { route }, url: '/api/' + route, socket: { remoteAddress: '127.0.0.1' } };
  const result = { statusCode: 200, headers: {}, chunks: [], headersSent: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    write(chunk) { this.headersSent = true; this.chunks.push(String(chunk)); },
    end(chunk) { if (chunk) this.chunks.push(String(chunk)); this.headersSent = true; } };
  await handler(req, result);
  const raw = result.chunks.join('');
  return { status: result.statusCode, data: raw.startsWith('{') ? JSON.parse(raw) : raw, headers: result.headers };
}

test('Supabase-backed routes preserve auth, consent and dashboard contracts', async () => {
  assert.equal((await call('admin/data')).status, 401);
  assert.equal((await call('admin/export')).status, 401);
  assert.equal((await call('lead', 'POST', { name: 'Asha', email: 'asha@example.com', phone: '9876543210' }, '', '', '', 'https://other.example')).status, 403);
  assert.equal(tables.leads.length, 0);
  assert.equal((await call('admin/login', 'POST', { username: 'owner@example.com', password: 'wrong' })).status, 401);
  const login = await call('admin/login', 'POST', { username: 'owner@example.com', password: 'correct-password-123' });
  assert.equal(login.status, 200);
  assert.match(login.headers['set-cookie'], /HttpOnly; SameSite=Strict/);
  assert.match(login.headers['set-cookie'], /Secure/);
  const cookie = login.headers['set-cookie'].split(';')[0], csrf = login.data.csrf_token;
  assert.equal((await call('admin/clear', 'POST', {}, cookie)).status, 403);
  assert.equal((await call('lead', 'POST', { name: 'Asha', email: 'invalid', phone: '9876543210' })).status, 400);
  assert.equal((await call('lead', 'POST', { name: 'Asha', email: 'asha@example.com', phone: '9876543210', website: 'spam.example' })).status, 201);
  assert.equal(tables.leads.length, 0);
  assert.equal((await call('lead', 'POST', { name: 'Asha', email: 'asha@example.com', phone: '9876543210' })).status, 201);
  assert.equal(tables.leads[0].email, 'asha@example.com');
  assert.equal(tables.leads[0].phone, '9876543210');
  assert.equal(tables.leads[0].subject, 'Free consultation');
  assert.equal((await call('track', 'POST', { type: 'visit', id: 'visitor123' })).status, 400);
  assert.equal((await call('consent', 'POST', { id: 'visitor123', accepted: true })).status, 201);
  assert.equal((await call('track', 'POST', { type: 'visit', id: 'visitor123', consent: true, page: '/' })).status, 201);
  const data = await call('admin/data', 'GET', null, cookie);
  assert.equal(data.status, 200);
  assert.equal(data.data.leads.length, 1);
  assert.equal(data.data.events.length, 1);
  assert.equal(data.data.logins.length, 2);
  assert.equal(data.data.consents.length, 1);
  const exported = await call('admin/export', 'GET', null, cookie);
  assert.equal(exported.status, 200);
  assert.match(exported.data, /consent:yes/);
  assert.match(exported.data, /login:success/);
  assert.equal((await call('admin/clear', 'POST', {}, cookie, csrf)).status, 200);
  assert.equal((await call('admin/logout', 'POST', {}, cookie, csrf)).status, 200);
  assert.equal((await call('admin/data', 'GET', null, cookie)).status, 401);
});
