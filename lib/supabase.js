const rawUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
// Accept either the project URL or the REST URL shown in Supabase's API settings.
const BASE = rawUrl.endsWith('/rest/v1') ? rawUrl.slice(0, -'/rest/v1'.length) : rawUrl;

function configurationIssues() {
  const issues = [];
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(BASE)) issues.push('SUPABASE_URL');
  for (const name of ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'ADMIN_EMAIL']) {
    if (!String(process.env[name] || '').trim()) issues.push(name);
  }
  return issues;
}

function configured() {
  return configurationIssues().length === 0;
}

async function request(path, { method = 'GET', body, admin = true, headers = {}, timeout = 10000 } = {}) {
  if (!configured()) throw new Error('Supabase is not configured');
  const key = admin ? process.env.SUPABASE_SECRET_KEY : process.env.SUPABASE_PUBLISHABLE_KEY;
  const attempts = method === 'GET' ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response;
    try {
      response = await fetch(BASE + path, {
        method,
        headers: { apikey: key, 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeout)
      });
    } catch (error) {
      if (attempt + 1 < attempts && ['TypeError', 'TimeoutError'].includes(error.name)) continue;
      throw error;
    }
    const raw = await response.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); } catch { data = raw; }
    }
    if (!response.ok) {
      if (attempt + 1 < attempts && [502, 503, 504].includes(response.status)) continue;
      const error = new Error('Supabase request failed');
      error.status = response.status;
      error.code = typeof data?.code === 'string' ? data.code.slice(0, 80) : '';
      throw error;
    }
    return { data, headers: response.headers };
  }
}

function rest(table, query = '', options = {}) {
  return request(`/rest/v1/${table}${query ? '?' + query : ''}`, options);
}

function rpc(name, body = {}) {
  return rest('rpc/' + name, '', { method: 'POST', body });
}

function signIn(email, password) {
  return request('/auth/v1/token?grant_type=password', {
    method: 'POST', admin: false, body: { email, password }
  });
}

function updatePassword(userId, password) {
  return request('/auth/v1/admin/users/' + encodeURIComponent(userId), {
    method: 'PUT', body: { password }
  });
}

module.exports = { configured, configurationIssues, request, rest, rpc, signIn, updatePassword };
