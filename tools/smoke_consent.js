// Integration check against the local preview and the configured Supabase project.
const fs = require('node:fs');
const crypto = require('node:crypto');
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line);
  if (match) process.env[match[1]] = match[2];
}
const { rest } = require('../lib/supabase');
const id = 'smoke' + crypto.randomBytes(10).toString('hex');

(async () => {
  try {
    const response = await fetch('http://127.0.0.1:8766/api/consent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:8766' },
      body: JSON.stringify({ id, accepted: false })
    });
    if (response.status !== 201) throw new Error('Consent API returned HTTP ' + response.status);
    const query = new URLSearchParams({ visitor_id: 'eq.' + id, select: 'accepted', limit: '1' });
    const { data } = await rest('consent_events', query.toString());
    if (data?.length !== 1 || data[0].accepted !== false) throw new Error('Consent record was not saved correctly');
    console.log('consent API write and database read: passed');
  } finally {
    await rest('consent_events', 'visitor_id=eq.' + id, { method: 'DELETE' });
    console.log('temporary consent record: removed');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
