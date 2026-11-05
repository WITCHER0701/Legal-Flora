const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pages = ['index', 'services', 'funding', 'incubation', 'approach', 'process', 'contact'];

test('public navigation uses separate pages and each page has the light consultation form', () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page + '.html'), 'utf8');
    assert.match(html, /<dialog id="consultationDialog"/);
    assert.match(html, /<form id="contactForm"/);
    for (const field of ['name', 'email', 'phone']) assert.match(html, new RegExp(`name="${field}"`));
    assert.doesNotMatch(html, /name="subject"|name="message"|Service of interest|I'm interested in|Send code/);
    assert.match(html, /\+91-9358849638/);
    assert.doesNotMatch(html, /7023149122/);
    assert.match(html, /We help prepare the documents needed for government funding applications from start to finish/);
    assert.doesNotMatch(html, /the government reviews and issues Startup India recognition certificates/);
    assert.doesNotMatch(html, /href="#(?:home|about|services|funding|incubation|approach|process|contact)"/);
    assert.match(html, /href="\/"/);
    for (const target of pages.filter(name => name !== 'index')) {
      assert.match(html, new RegExp(`href="/${target}"`));
    }
    assert.doesNotMatch(html, /href="(?:index|services|funding|incubation|approach|process|contact|privacy)\.html"/);
  }
  const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(home, /About Legal Flora: practical help/);
  assert.match(home, /We deliver Startup India certificates in just 3 hours/);
  assert.match(home, /For government funding applications, we help prepare the required documents from start to finish/);
  const feature = home.match(/<div class="feature-callout"[\s\S]*?<\/div>/)?.[0] || '';
  assert.doesNotMatch(feature, /government reviews and issues/);
  const services = fs.readFileSync(path.join(root, 'services.html'), 'utf8');
  assert.match(services, /DPR \(Detailed Project Report\)/);
  assert.doesNotMatch(services, /Pitch Deck/i);
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(vercel.cleanUrls, true);
  assert.ok(vercel.redirects.every(rule => !rule.destination.endsWith('.html')));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/api/(.*)'));
});
