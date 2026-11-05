import { build } from 'esbuild';
import { basename, join, resolve } from 'node:path';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

if (process.env.VERCEL === '1') {
  const { configurationIssues } = createRequire(import.meta.url)('./lib/supabase.js');
  const issues = configurationIssues();
  if (issues.length) throw new Error(`Set these Vercel environment variables before deploying: ${issues.join(', ')}`);
}

const root = resolve('.');
const outdir = join(root, 'dist');
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const common = { outdir, entryNames: '[name]-[hash]', minify: true, bundle: false, metafile: true, logLevel: 'info' };
const chat = await build({ ...common, entryPoints: ['chat.js'] });
const chatFile = basename(Object.entries(chat.metafile.outputs).find(([, info]) => info.entryPoint?.endsWith('chat.js'))[0]);
const assets = await build({
  ...common,
  entryPoints: ['script.js', 'styles.css', 'admin.js', 'admin.css'],
  define: { CHAT_ASSET: JSON.stringify(chatFile) }
});
const names = Object.fromEntries(Object.entries(assets.metafile.outputs)
  .filter(([, info]) => info.entryPoint)
  .map(([output, info]) => [basename(info.entryPoint), basename(output)]));

for (const page of ['index.html', 'services.html', 'funding.html', 'incubation.html', 'approach.html', 'process.html', 'contact.html', 'admin.html', 'privacy.html']) {
  let html = await readFile(join(root, page), 'utf8');
  for (const [source, output] of Object.entries(names)) {
    html = html.replaceAll(`href="${source}"`, `href="${output}"`)
      .replaceAll(`src="${source}"`, `src="${output}"`);
  }
  await writeFile(join(outdir, page), html);
}
for (const asset of ['logo.webp', 'favicon.png']) await cp(join(root, asset), join(outdir, asset));
await cp(join(root, 'resources'), join(outdir, 'resources'), { recursive: true });

// Netlify and Cloudflare Pages honor this file. Other hosts need equivalent rules.
await writeFile(join(outdir, '_headers'), `/*.html
  Cache-Control: public, max-age=0, must-revalidate
/
  Cache-Control: public, max-age=0, must-revalidate
/*.js
  Cache-Control: public, max-age=31536000, immutable
/*.css
  Cache-Control: public, max-age=31536000, immutable
/logo.webp
  Cache-Control: public, max-age=86400, must-revalidate
/favicon.png
  Cache-Control: public, max-age=86400, must-revalidate
/resources/*
  Cache-Control: public, max-age=86400, must-revalidate
`);
console.log(`Built ${outdir} with lazy chat asset ${chatFile}`);
