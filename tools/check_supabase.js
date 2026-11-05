// Read-only setup check. Never prints credentials or database rows.
const fs = require('node:fs');
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line);
  if (match) process.env[match[1]] = match[2];
}
const { configured, rest, request } = require('../lib/supabase');

(async () => {
  if (!configured()) throw new Error('The four required environment variables are incomplete');
  for (const table of ['admin_sessions', 'login_events', 'leads', 'events', 'consent_events', 'chat_config', 'request_limits']) {
    try {
      await rest(table, 'select=*&limit=0');
      console.log(`${table}: ready`);
    } catch (error) {
      console.log(`${table}: unavailable (HTTP ${error.status || 'network error'})`);
      process.exitCode = 1;
    }
  }
  try {
    await request('/rest/v1/leads?select=id&limit=1', { admin: false });
    console.log('public leads read: unexpectedly allowed');
    process.exitCode = 1;
  } catch (error) {
    console.log(`public leads read: ${[401, 403].includes(error.status) ? 'blocked' : 'could not verify'}`);
    if (![401, 403].includes(error.status)) process.exitCode = 1;
  }
  try {
    const { data } = await request('/rest/v1/rpc/dashboard_stats');
    console.log(`dashboard_stats: ${data && typeof data === 'object' ? 'ready' : 'unexpected response'}`);
  } catch (error) {
    console.log(`dashboard_stats: unavailable (HTTP ${error.status || 'network error'})`);
    process.exitCode = 1;
  }
  try {
    const { data } = await request('/auth/v1/admin/users?page=1&per_page=100', { admin: true });
    const users = Array.isArray(data?.users) ? data.users : [];
    const admin = users.find(x => x.email?.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase());
    console.log(`admin Auth user: ${admin ? 'found' : 'not found in first 100 users'}`);
    if (admin) console.log(`admin email confirmed: ${admin.email_confirmed_at ? 'yes' : 'no'}`);
  } catch (error) {
    console.log(`admin Auth user: could not check (HTTP ${error.status || 'network error'})`);
  }
  try {
    const { data } = await request('/auth/v1/settings', { admin: false });
    const enabled = data?.external?.email;
    console.log(`email Auth provider: ${enabled === true ? 'enabled' : enabled === false ? 'disabled' : 'unknown'}`);
    console.log('Visitor consultation form uses no email OTP or SMTP');
  } catch (error) {
    console.log(`email Auth provider: could not check (HTTP ${error.status || 'network error'})`);
  }
})().catch(() => { console.error('Could not connect to Supabase'); process.exitCode = 1; });
