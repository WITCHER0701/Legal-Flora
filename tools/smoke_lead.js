// Optional end-to-end check against the configured Supabase project.
// Creates one synthetic lead through the local API, verifies it, then removes it.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const { rest } = require('../lib/supabase');
const base = process.env.LEGALFLORA_PREVIEW_URL || 'http://127.0.0.1:8767';
const email = `legalflora-smoke-${Date.now()}@example.invalid`;
let inserted = false;

(async () => {
  try {
    const response = await fetch(base + '/api/lead', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Preview Test', email, phone: '9876543210' }),
      signal: AbortSignal.timeout(12000)
    });
    if (response.status !== 201) throw new Error(`Lead API returned HTTP ${response.status}`);
    inserted = true;
    const query = new URLSearchParams({ email: 'eq.' + email, select: 'id', limit: '1' });
    const rows = (await rest('leads', query.toString())).data;
    if (!rows?.[0]?.id) throw new Error('Lead was not found in Supabase');
    console.log('Lead API and Supabase insert: ready');
  } finally {
    if (inserted) {
      await rest('leads', 'email=eq.' + encodeURIComponent(email), { method: 'DELETE' });
      console.log('Synthetic lead removed');
    }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
