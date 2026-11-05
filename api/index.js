const crypto = require('node:crypto');
const { configured, configurationIssues, request, rest, rpc, signIn, updatePassword } = require('../lib/supabase');

const COOKIE = 'lf_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;
const allowEvents = new Set(['visit', 'leave', 'cta_click', 'section_view']);

function reply(res, status, data, extra = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [key, value] of Object.entries(extra)) res.setHeader(key, value);
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  if (Number(req.headers['content-length'] || 0) > 16384) throw new Error('Invalid request size');
  const value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 16384) {
    throw new Error('Expected a small JSON object');
  }
  return value;
}

function sameOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const scheme = process.env.VERCEL === '1' || req.headers['x-forwarded-proto'] === 'https' ? 'https:' : 'http:';
    return parsed.host === req.headers.host && parsed.protocol === scheme;
  }
  catch { return false; }
}

function tokenFromCookie(req) {
  const item = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  return item?.slice(COOKIE.length + 1) || '';
}

function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

function cookie(req, token, clear = false) {
  const secure = process.env.VERCEL === '1' || req.headers['x-forwarded-proto'] === 'https';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}

async function session(req) {
  const token = tokenFromCookie(req);
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const query = new URLSearchParams({ token_hash: 'eq.' + tokenHash(token),
    expires_at: 'gt.' + new Date().toISOString(), select: 'token_hash,user_id,csrf_token,expires_at', limit: '1' });
  const { data } = await rest('admin_sessions', query.toString());
  return data?.[0] || null;
}

function csrfValid(req, current) {
  const candidate = String(req.headers['x-csrf-token'] || '');
  const a = Buffer.from(candidate), b = Buffer.from(current);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function rate(req, route, maximum, windowSeconds = 60) {
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const key = crypto.createHash('sha256').update(`${process.env.SUPABASE_SECRET_KEY}:${route}:${ip}`).digest('hex');
  const { data } = await rpc('rate_limit_hit', { p_key_hash: key, p_max: maximum, p_window_seconds: windowSeconds });
  return data === true;
}

async function insert(table, record) {
  return rest(table, '', { method: 'POST', body: record, headers: { Prefer: 'return=minimal' } });
}

async function recordLogin(email, userId, success) {
  await insert('login_events', { email, user_id: userId || null, success });
}

function bounded(value, fallback, maximum) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > maximum) throw new Error('Invalid page parameter');
  return n;
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

async function page(table, limit, offset, columns = '*') {
  const query = new URLSearchParams({ select: columns, order: 'id.desc', limit: String(limit), offset: String(offset) });
  return (await rest(table, query.toString())).data || [];
}

function faq(message) {
  if (/msme|udyam/i.test(message)) return 'We can help check your Udyam details and complete the MSME registration form.';
  if (/fund|grant|loan|scheme|mudra|pmegp/i.test(message)) return 'We can check scheme eligibility and help prepare an application. The authority decides whether funding is approved.';
  if (/website|online|digital/i.test(message)) return 'We can help set up a basic website with your services and contact details.';
  if (/contact|phone|email/i.test(message)) return 'Call +91-9358849638, email info@legalflora.com, or send the consultation form on this site.';
  return 'Tell us whether you need registration, paperwork, a website, or help with a funding application.';
}

async function chatReply(message) {
  const { data } = await rest('chat_config', 'id=eq.1&select=provider,model,api_key,system_prompt&limit=1');
  const config = data?.[0];
  if (!config) return null;
  const prompt = (config.system_prompt || 'Answer questions about Legal Flora services in plain English. Do not promise approval or funding.').slice(0, 1000);
  let url, headers, body;
  if (config.provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
    headers = { Authorization: 'Bearer ' + config.api_key, 'Content-Type': 'application/json' };
    body = { model: config.model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: message }], max_tokens: 250 };
  } else if (config.provider === 'gemini') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`;
    headers = { 'x-goog-api-key': config.api_key, 'Content-Type': 'application/json' };
    body = { system_instruction: { parts: [{ text: prompt }] }, contents: [{ parts: [{ text: message }] }], generationConfig: { maxOutputTokens: 250 } };
  } else return null;
  try {
    const result = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(4000) });
    if (!result.ok) return null;
    const value = await result.json();
    const answer = config.provider === 'openai' ? value.choices?.[0]?.message?.content : value.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof answer === 'string' ? answer.slice(0, 2000) : null;
  } catch { return null; }
}

async function handle(req, res) {
  const route = String(req.query?.route || new URL(req.url, 'http://local').pathname.replace(/^\/api\//, ''));
  if (!configured()) {
    console.error('Legal Flora API configuration missing or invalid:', configurationIssues().join(', '));
    return reply(res, 503, { error: route.startsWith('admin/')
      ? 'Dashboard is temporarily unavailable.'
      : 'The consultation service is temporarily unavailable. Please call us instead.' });
  }
  if (req.method === 'POST' && !sameOrigin(req)) return reply(res, 403, { error: 'Request verification failed' });
  if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) return reply(res, 415, { error: 'Expected JSON' });
  const body = req.method === 'POST' ? parseBody(req) : null;

  if (req.method === 'POST' && route === 'admin/login') {
    if (!await rate(req, 'login', 5)) return reply(res, 429, { error: 'Too many login attempts' }, { 'Retry-After': '60' });
    const email = String(body.username || body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length > 256) return reply(res, 401, { error: 'Invalid email or password' });
    if (email !== process.env.ADMIN_EMAIL.trim().toLowerCase()) {
      await recordLogin(email, null, false);
      return reply(res, 401, { error: 'Invalid email or password' });
    }
    let auth;
    try { auth = (await signIn(email, password)).data; }
    catch (error) {
      if (error.status !== 400 && error.status !== 401) throw error;
      await recordLogin(email, null, false);
      return reply(res, 401, { error: 'Invalid email or password' });
    }
    if (!auth?.user?.id || auth.user.email?.toLowerCase() !== email) return reply(res, 401, { error: 'Invalid email or password' });
    const token = crypto.randomBytes(32).toString('base64url');
    const csrf = crypto.randomBytes(32).toString('base64url');
    await rest('admin_sessions', 'expires_at=lt.' + encodeURIComponent(new Date().toISOString()), { method: 'DELETE' });
    await insert('admin_sessions', { token_hash: tokenHash(token), user_id: auth.user.id, csrf_token: csrf,
      expires_at: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString() });
    await recordLogin(email, auth.user.id, true);
    return reply(res, 200, { ok: true, csrf_token: csrf }, { 'Set-Cookie': cookie(req, token) });
  }

  if (req.method === 'POST' && route === 'lead') {
    if (!await rate(req, 'lead', 10)) return reply(res, 429, { error: 'Too many requests' });
    if (String(body.website || '').trim()) return reply(res, 201, { ok: true });
    const name = String(body.name || '').trim(), email = String(body.email || '').trim().toLowerCase(), phone = String(body.phone || '').trim();
    const digits = phone.replace(/\D/g, '');
    if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        !/^\+?[\d\s()-]{10,20}$/.test(phone) || digits.length < 10 || digits.length > 13) {
      return reply(res, 400, { error: 'Check your contact details' });
    }
    await insert('leads', { name, email, phone, subject: 'Free consultation', message: '', source: 'website' });
    return reply(res, 201, { ok: true });
  }

  if (req.method === 'POST' && route === 'consent') {
    if (!await rate(req, 'consent', 20)) return reply(res, 429, { error: 'Too many requests' });
    const id = String(body.id || '');
    if (typeof body.accepted !== 'boolean' || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) return reply(res, 400, { error: 'Invalid choice' });
    await insert('consent_events', { visitor_id: id, accepted: body.accepted });
    return reply(res, 201, { ok: true });
  }

  if (req.method === 'POST' && route === 'track') {
    if (body.consent !== true) return reply(res, 400, { error: 'Consent required' });
    if (!await rate(req, 'track', 60)) return reply(res, 429, { error: 'Too many requests' });
    const type = String(body.type || ''), id = String(body.id || '');
    if (!allowEvents.has(type) || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) return reply(res, 400, { error: 'Invalid event' });
    const payload = {};
    for (const key of ['page', 'target', 'w', 'h', 'lang', 'dur']) if (body[key] !== undefined) payload[key] = String(body[key]).slice(0, 100);
    await insert('events', { type, visitor_id: id, payload });
    return reply(res, 201, { ok: true });
  }

  if (req.method === 'POST' && route === 'chat') {
    if (!await rate(req, 'chat', 20)) return reply(res, 429, { error: 'Too many requests' });
    const message = String(body.message || '').trim().slice(0, 500);
    if (!message) return reply(res, 400, { error: 'Message is empty' });
    const answer = await chatReply(message);
    return reply(res, 200, { reply: answer || faq(message), source: answer ? 'ai' : 'kb' });
  }

  if (!route.startsWith('admin/')) return reply(res, 404, { error: 'Route not found' });
  const current = await session(req);
  if (!current) return reply(res, 401, { error: 'Sign in required' });
  if (req.method === 'POST' && !csrfValid(req, current.csrf_token)) return reply(res, 403, { error: 'Request verification failed' });

  if (req.method === 'GET' && route === 'admin/data') {
    if (!await rate(req, 'data', 60)) return reply(res, 429, { error: 'Too many requests' });
    const q = req.query || {};
    const lo = bounded(q.lead_offset, 0, 1000000), eo = bounded(q.event_offset, 0, 1000000);
    const ll = bounded(q.lead_limit, 50, 100), el = bounded(q.event_limit, 50, 100);
    const loginOffset = bounded(q.login_offset, 0, 1000000), consentOffset = bounded(q.consent_offset, 0, 1000000);
    const loginLimit = bounded(q.login_limit, 10, 100), consentLimit = bounded(q.consent_limit, 10, 100);
    const [stats, leads, events, logins, consents] = await Promise.all([
      rpc('dashboard_stats'), page('leads', ll, lo), page('events', el, eo),
      page('login_events', loginLimit, loginOffset, 'id,email,success,occurred_at'),
      page('consent_events', consentLimit, consentOffset, 'id,visitor_id,accepted,received')
    ]);
    return reply(res, 200, { stats: stats.data, leads, logins, consents,
      events: events.map(x => ({ ...(x.payload || {}), type: x.type, id: x.visitor_id, received: x.received })),
      csrf_token: current.csrf_token, page: { lead_offset: lo, event_offset: eo, lead_limit: ll, event_limit: el,
        login_offset: loginOffset, consent_offset: consentOffset, login_limit: loginLimit, consent_limit: consentLimit } });
  }

  if (req.method === 'GET' && route === 'admin/export') {
    if (!await rate(req, 'export', 2)) return reply(res, 429, { error: 'Too many requests' });
    const { data: stats } = await rpc('dashboard_stats');
    if (Number(stats.leads_total) + Number(stats.events_total) + Number(stats.login_events_total) + Number(stats.consent_events_total) > 10000) {
      return reply(res, 413, { error: 'Export exceeds 10,000 rows; use paginated dashboard data' });
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=legalflora-data.csv');
    res.setHeader('Cache-Control', 'private, no-store');
    res.write('\ufefftype,name,email,phone,url,when,visitor_id\r\n');
    for (const table of ['leads', 'events', 'login_events', 'consent_events']) {
      for (let offset = 0; ; offset += 100) {
        const rows = await page(table, 100, offset);
        if (!rows.length) break;
        for (const x of rows) {
          const cells = table === 'leads' ? ['lead', x.name, x.email, x.phone, '', x.received, ''] :
            table === 'events' ? ['event:' + x.type, '', '', '', x.payload?.page || '', x.received, x.visitor_id] :
            table === 'login_events' ? ['login:' + (x.success ? 'success' : 'failed'), '', x.email, '', '', x.occurred_at, ''] :
            ['consent:' + (x.accepted ? 'yes' : 'no'), '', '', '', '', x.received, x.visitor_id];
          res.write(cells.map(csvCell).join(',') + '\r\n');
        }
        if (rows.length < 100) break;
      }
    }
    return res.end();
  }

  if (req.method === 'POST' && route === 'admin/logout') {
    await rest('admin_sessions', 'token_hash=eq.' + current.token_hash, { method: 'DELETE' });
    return reply(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', true) });
  }

  if (req.method === 'POST' && route === 'admin/change-password') {
    const next = String(body.new_password || '');
    if (next.length < 12 || next.length > 128) return reply(res, 400, { error: 'Use a password of 12–128 characters' });
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
    let auth;
    try { auth = (await signIn(email, String(body.current_password || ''))).data; }
    catch (error) {
      if (error.status !== 400 && error.status !== 401) throw error;
      return reply(res, 403, { error: 'Current password is incorrect' });
    }
    if (auth?.user?.id !== current.user_id) return reply(res, 403, { error: 'Current password is incorrect' });
    await updatePassword(current.user_id, next);
    await rest('admin_sessions', `user_id=eq.${encodeURIComponent(current.user_id)}&token_hash=neq.${current.token_hash}`, { method: 'DELETE' });
    return reply(res, 200, { ok: true });
  }

  if (req.method === 'POST' && route === 'admin/clear') {
    await rpc('clear_dashboard_data');
    return reply(res, 200, { ok: true });
  }

  if (req.method === 'POST' && route === 'admin/chat-config') {
    const action = body.action || 'get';
    if (action === 'reset') await rest('chat_config', 'id=eq.1', { method: 'DELETE' });
    else if (action === 'set') {
      const c = body.config || {};
      if (!['openai', 'gemini'].includes(c.provider) || !/^[A-Za-z0-9._-]{1,80}$/.test(c.model || '') ||
          !c.api_key || String(c.api_key).length < 8 || String(c.api_key).length > 512 ||
          String(c.system_prompt || '').length > 1000 || c.base_url) {
        return reply(res, 400, { error: 'Use OpenAI or Gemini, a model and API key. Custom URLs are disabled.' });
      }
      await rest('chat_config', 'on_conflict=id', { method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: { id: 1, provider: c.provider, model: c.model, api_key: c.api_key, system_prompt: String(c.system_prompt || '') } });
    } else if (action !== 'get') return reply(res, 400, { error: 'Unknown action' });
    const { data } = await rest('chat_config', 'id=eq.1&select=provider,model,system_prompt&limit=1');
    return reply(res, 200, { config: data?.[0] || { provider: '', model: '', system_prompt: '' } });
  }

  return reply(res, 404, { error: 'Route not found' });
}

module.exports = async function handler(req, res) {
  try { await handle(req, res); }
  catch (error) {
    if (res.headersSent) { res.end(); return; }
    if (error instanceof SyntaxError || /Invalid request|Expected a small|Invalid page/.test(error.message)) {
      return reply(res, 400, { error: 'Invalid request' });
    }
    console.error('API request failed', error.status || error.name || 'error');
    return reply(res, 503, { error: 'Service temporarily unavailable' });
  }
};
